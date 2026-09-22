import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
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

const jotDir = join(homedir(), ".jot");
const app = join(jotDir, "Jot Notifier.app");
const appTmp = join(jotDir, ".Jot Notifier.app.tmp");
const appOld = join(jotDir, ".Jot Notifier.app.old");
mkdirSync(jotDir, { recursive: true });
rmSync(appTmp, { recursive: true, force: true });
rmSync(appOld, { recursive: true, force: true });
await $`cp -R ${"dist/Jot Notifier.app"} ${appTmp}`;
if (existsSync(app)) renameSync(app, appOld);
renameSync(appTmp, app);
rmSync(appOld, { recursive: true, force: true });
// Unregistered bundles are refused by Notification Center without a prompt
await $`/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f ${app}`;
console.log(`installed ${app}`);

const loaded = await $`launchctl print ${service}`.quiet().nothrow();
if (loaded.exitCode === 0) {
  await $`launchctl kickstart -k ${service}`;
  console.log("restarted dev.jot.daemon");
}
