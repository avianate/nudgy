import { expect, test } from "bun:test";
import pkg from "../../package.json";

test("nudgy --version prints the package version", async () => {
  const proc = Bun.spawn(["bun", "src/main.ts", "--version"], {
    stdout: "pipe",
  });
  const out = await new Response(proc.stdout).text();
  expect(await proc.exited).toBe(0);
  expect(out.trim()).toBe(pkg.version);
});
