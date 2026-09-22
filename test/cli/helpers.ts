import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const MAIN = resolve(import.meta.dir, "../../src/main.ts");

export function tempDir(prefix = "jot-e2e-") {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

export function makeRepo(branch = "main") {
  const repo = tempDir("jot-repo-");
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

export type Jot = (
  args: string[],
  opts?: { cwd?: string; env?: Record<string, string>; stdin?: string },
) => RunResult;

export function jotHome(): { home: string; jot: Jot } {
  const home = tempDir("jot-home-");
  const jot: Jot = (args, opts = {}) => {
    // `bun <file>` swallows the first `--`; the compiled binary does not, so pass one for bun to eat
    const proc = Bun.spawnSync(["bun", MAIN, "--", ...args], {
      cwd: opts.cwd ?? home,
      env: { ...process.env, JOT_HOME: home, EDITOR: "false", ...opts.env },
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
  return { home, jot };
}
