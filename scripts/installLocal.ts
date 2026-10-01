import {
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";

const binDir = join(homedir(), ".local", "bin");
const target = join(binDir, "nudgy");
const tmp = join(binDir, ".nudgy.tmp");
const service = `gui/${process.getuid?.()}/io.github.avianate.nudgy.daemon`;

mkdirSync(binDir, { recursive: true });
await $`cp dist/nudgy ${tmp}`;
// Replace via rename, never cp over the live binary: overwriting a signed binary in place invalidates its signature for the running inode
renameSync(tmp, target);
console.log(`installed ${target}`);

// ndg is a short alias; a relative symlink keeps following the binary across reinstalls
const alias = join(binDir, "ndg");
const aliasTmp = join(binDir, ".ndg.tmp");
rmSync(aliasTmp, { force: true });
symlinkSync("nudgy", aliasTmp);
renameSync(aliasTmp, alias);
console.log(`installed ${alias} -> nudgy`);

const nudgyDir = join(homedir(), ".nudgy");
const app = join(nudgyDir, "Nudgy Notifier.app");
const appTmp = join(nudgyDir, ".Nudgy Notifier.app.tmp");
const appOld = join(nudgyDir, ".Nudgy Notifier.app.old");
mkdirSync(nudgyDir, { recursive: true });
rmSync(appTmp, { recursive: true, force: true });
rmSync(appOld, { recursive: true, force: true });
await $`cp -R ${"dist/Nudgy Notifier.app"} ${appTmp}`;
if (existsSync(app)) renameSync(app, appOld);
renameSync(appTmp, app);
rmSync(appOld, { recursive: true, force: true });
// Unregistered bundles are refused by Notification Center without a prompt
await $`/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f ${app}`;
console.log(`installed ${app}`);

const loaded = await $`launchctl print ${service}`.quiet().nothrow();
if (loaded.exitCode === 0) {
  await $`launchctl kickstart -k ${service}`;
  console.log("restarted io.github.avianate.nudgy.daemon");
}
