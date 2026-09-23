import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const MAIN = resolve(import.meta.dir, "../../src/main.ts");

// NUDGY_E2E_BIN=dist/nudgy runs the suite against the compiled binary instead of the source
const BIN = process.env.NUDGY_E2E_BIN
  ? resolve(process.env.NUDGY_E2E_BIN)
  : null;

export function tempDir(prefix = "nudgy-e2e-") {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

export function makeRepo(branch = "main") {
  const repo = tempDir("nudgy-repo-");
  const git = (...args: string[]) =>
    Bun.spawnSync(
      ["git", "-c", "user.name=t", "-c", "user.email=t@t", ...args],
      { cwd: repo },
    );
  git("init", "-q", "-b", branch);
  git("commit", "-q", "--allow-empty", "-m", "init");
  return repo;
}

export type RunResult = { code: number; stdout: string; stderr: string };

export type Nudgy = (
  args: string[],
  opts?: { cwd?: string; env?: Record<string, string>; stdin?: string },
) => RunResult;

export function nudgyHome(): { home: string; nudgy: Nudgy } {
  const home = tempDir("nudgy-home-");
  const nudgy: Nudgy = (args, opts = {}) => {
    // `bun <file>` swallows the first `--`; the compiled binary does not, so pass one for bun to eat
    const cmd = BIN ? [BIN, ...args] : [process.execPath, MAIN, "--", ...args];
    const proc = Bun.spawnSync(cmd, {
      cwd: opts.cwd ?? home,
      env: {
        ...process.env,
        // A TZ assigned at runtime in the preload does not reach child processes
        TZ: "America/New_York",
        NUDGY_HOME: home,
        EDITOR: "false",
        // Defaults that keep every test away from real banners, launchd and ~/Library
        HOME: join(home, "user"),
        NUDGY_NOTIFIER: `file:${join(home, "banners.jsonl")}`,
        NUDGY_LAUNCHCTL: `file:${join(home, "launchctl.json")}`,
        ...opts.env,
      },
      stdin: opts.stdin === undefined ? "ignore" : Buffer.from(opts.stdin),
      stdout: "pipe",
      stderr: "pipe",
    });
    return {
      code: proc.exitCode ?? -1,
      stdout: proc.stdout.toString(),
      stderr: proc.stderr.toString(),
    };
  };
  return { home, nudgy };
}
