import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const BUDGET_MS = 100;
const RUNS = 10;

const bin = resolve("dist/jot");
// Never the real ~/.jot: this writes a note per run
const home = realpathSync(mkdtempSync(join(tmpdir(), "jot-bench-")));
const repo = join(home, "repo");
const git = (...args: string[]) =>
  Bun.spawnSync(["git", "-c", "user.name=b", "-c", "user.email=b@b", ...args], {
    cwd: repo,
  });
Bun.spawnSync(["mkdir", repo]);
git("init", "-q", "-b", "main");
git("commit", "-q", "--allow-empty", "-m", "init");

const env = { ...process.env, JOT_HOME: home };
const capture = () =>
  Bun.spawnSync([bin, "bench note"], { cwd: repo, env, stdout: "ignore" });

for (let i = 0; i < 3; i++) capture();
const times: number[] = [];
for (let i = 0; i < RUNS; i++) {
  const start = performance.now();
  const proc = capture();
  times.push(performance.now() - start);
  if (proc.exitCode !== 0) {
    console.error(`capture exited ${proc.exitCode}: ${proc.stderr.toString()}`);
    process.exit(1);
  }
}
times.sort((a, b) => a - b);
const median =
  ((times[RUNS / 2 - 1] as number) + (times[RUNS / 2] as number)) / 2;
console.log(
  `capture median ${median.toFixed(1)}ms over ${RUNS} runs (min ${times[0]?.toFixed(1)}, max ${times.at(-1)?.toFixed(1)}), budget ${BUDGET_MS}ms`,
);
if (median >= BUDGET_MS) process.exit(1);
