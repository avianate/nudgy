import { $ } from "bun";

const outfile = "dist/jot";

const result = await Bun.build({
  entrypoints: ["src/main.ts"],
  compile: { outfile },
  minify: true,
  // Without splitting, the TUI's modules are parsed on every launch and add ~40ms to capture
  splitting: true,
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

// An unsigned or stale-signed binary is SIGKILLed on launch on Apple Silicon
await $`codesign -s - -f ${outfile}`;
