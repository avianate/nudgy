import { mkdirSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";

const binDir = join(homedir(), ".local", "bin");
const target = join(binDir, "jot");
const tmp = join(binDir, ".jot.tmp");
const service = `gui/${process.getuid?.()}/dev.jot.daemon`;

mkdirSync(binDir, { recursive: true });
await $`cp dist/jot ${tmp}`;
// Replace via rename, never cp over the live binary: overwriting a signed binary in place invalidates its signature for the running inode
renameSync(tmp, target);
console.log(`installed ${target}`);

const loaded = await $`launchctl print ${service}`.quiet().nothrow();
if (loaded.exitCode === 0) {
  await $`launchctl kickstart -k ${service}`;
  console.log("restarted dev.jot.daemon");
}
