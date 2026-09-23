import { expect, test } from "bun:test";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { openDb } from "../../src/core/db";
import { createItem } from "../../src/core/items";
import { nudgyHome } from "./helpers";

const MAIN = resolve(import.meta.dir, "../../src/main.ts");
const NOW = Date.parse("2026-09-22T14:00:00Z");
const H = 3_600_000;

function setup() {
  const ctx = nudgyHome();
  const bin = join(ctx.home, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "nudgy"), `#!/bin/sh\nexec bun ${MAIN} -- "$@"\n`);
  chmodSync(join(bin, "nudgy"), 0o755);
  const env = {
    ...process.env,
    TZ: "America/New_York",
    NUDGY_HOME: ctx.home,
    NUDGY_NOW: String(NOW),
    PATH: `${bin}:${process.env.PATH}`,
  };
  const zsh = (
    script: string,
    opts: { interactive?: boolean; path?: string } = {},
  ) => {
    const proc = Bun.spawnSync(
      ["/bin/zsh", "-f", ...(opts.interactive ? ["-i"] : []), "-c", script],
      {
        env: {
          ...env,
          ...(opts.path !== undefined ? { PATH: opts.path } : {}),
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    return {
      code: proc.exitCode,
      stdout: proc.stdout.toString(),
      stderr: proc.stderr.toString(),
    };
  };
  const hookFile = join(ctx.home, "hook.zsh");
  writeFileSync(hookFile, ctx.nudgy(["hook", "zsh"]).stdout);
  return { ...ctx, zsh, hookFile };
}

test("a new interactive shell shows overdue and upcoming items", () => {
  const { home, zsh, hookFile } = setup();
  const db = openDb(join(home, "nudgy.db"));
  createItem(
    db,
    { body: "overdue thing", repo: null, branch: null, remindAt: NOW - H },
    0,
  );
  createItem(
    db,
    { body: "soon thing", repo: null, branch: null, remindAt: NOW + 2 * H },
    0,
  );
  createItem(
    db,
    { body: "far thing", repo: null, branch: null, remindAt: NOW + 10 * H },
    0,
  );
  db.close();
  const result = zsh(`source ${hookFile}`, { interactive: true });
  expect(result.stdout).toContain("overdue thing");
  expect(result.stdout).toContain("soon thing");
  expect(result.stdout).not.toContain("far thing");
});

test("the window follows hookWindowHours from config", () => {
  const { home, nudgy, zsh } = setup();
  writeFileSync(join(home, "config.json"), '{"hookWindowHours": 12}');
  const hookFile = join(home, "hook12.zsh");
  writeFileSync(hookFile, nudgy(["hook", "zsh"]).stdout);
  const db = openDb(join(home, "nudgy.db"));
  createItem(
    db,
    { body: "far thing", repo: null, branch: null, remindAt: NOW + 10 * H },
    0,
  );
  db.close();
  expect(zsh(`source ${hookFile}`, { interactive: true }).stdout).toContain(
    "far thing",
  );
});

test("with nothing due the new shell prints nothing at all", () => {
  const { zsh, hookFile } = setup();
  const result = zsh(`source ${hookFile}`, { interactive: true });
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe("");
});

test("a non-interactive shell never runs nudgy", () => {
  const { home, zsh, hookFile } = setup();
  const db = openDb(join(home, "nudgy.db"));
  createItem(
    db,
    { body: "overdue thing", repo: null, branch: null, remindAt: NOW - H },
    0,
  );
  db.close();
  expect(zsh(`source ${hookFile}`).stdout).toBe("");
});

test("nudgy_prompt_segment shows the due count using builtins only", () => {
  const { home, zsh, hookFile } = setup();
  writeFileSync(join(home, "status"), "3\n");
  // An empty PATH makes any spawned command fail, so a clean result proves no process was started
  const result = zsh(`source ${hookFile}; nudgy_prompt_segment`, { path: "" });
  expect(result.stderr).toBe("");
  expect(result.stdout).toBe("⏰3");
});

test("nudgy_prompt_segment is silent at zero or with no status file", () => {
  const { home, zsh, hookFile } = setup();
  expect(
    zsh(`source ${hookFile}; nudgy_prompt_segment`, { path: "" }).stdout,
  ).toBe("");
  writeFileSync(join(home, "status"), "0\n");
  expect(
    zsh(`source ${hookFile}; nudgy_prompt_segment`, { path: "" }).stdout,
  ).toBe("");
});

test("nudgy hook for another shell is a usage error", () => {
  expect(nudgyHome().nudgy(["hook", "bash"]).code).toBe(2);
});
