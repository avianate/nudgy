import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The capture path must never load the TUI: follow only static imports from the entry chunk
test("nothing statically reachable from main pulls in OpenTUI", async () => {
  const outdir = mkdtempSync(join(tmpdir(), "jot-build-"));
  const result = await Bun.build({
    entrypoints: ["src/main.ts"],
    outdir,
    splitting: true,
    target: "bun",
    // Other platforms' prebuilt packages aren't installed; --compile skips them the same way
    external: ["@opentui/core-*"],
  });
  expect(result.success).toBe(true);
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const code = readFileSync(join(outdir, file), "utf8");
    for (const m of code.matchAll(
      /(?:import|export)\s[^;]*?from\s*"\.\/([^"]+)"|import\s*"\.\/([^"]+)"/g,
    )) {
      visit((m[1] ?? m[2]) as string);
    }
  };
  visit("main.js");
  const reachable = [...seen].map((f) => readFileSync(join(outdir, f), "utf8"));
  expect(reachable.some((code) => code.includes("node_modules/@opentui"))).toBe(
    false,
  );
  expect(
    reachable.some((code) => code.includes("node_modules/chrono-node")),
  ).toBe(false);
  const all = result.outputs.map((o) => readFileSync(o.path, "utf8"));
  expect(all.some((code) => code.includes("node_modules/@opentui"))).toBe(true);
}, 60_000);
