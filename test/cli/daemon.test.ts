import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openDb } from "../../src/core/db";
import { createItem } from "../../src/core/items";
import { jotHome } from "./helpers";

const NOW = Date.parse("2026-09-22T14:00:00Z");
const MIN = 60_000;

test("daemon run --once sends due banners through the notifier seam and writes status", () => {
  const { home, jot } = jotHome();
  const db = openDb(join(home, "jot.db"));
  createItem(
    db,
    { body: "ship it", repo: null, branch: null, remindAt: NOW - MIN },
    0,
  );
  db.close();
  const sink = join(home, "banners.jsonl");
  const env = { JOT_NOW: String(NOW), JOT_NOTIFIER: `file:${sink}` };
  const result = jot(["daemon", "run", "--once"], { env });
  expect(result.code).toBe(0);
  expect(JSON.parse(readFileSync(sink, "utf8"))).toMatchObject({
    title: "ship it",
    sound: "Glass",
  });
  expect(readFileSync(join(home, "status"), "utf8")).toBe("1\n");
  jot(["daemon", "run", "--once"], { env });
  expect(readFileSync(sink, "utf8").trim().split("\n")).toHaveLength(1);
});

test("daemon with no subcommand is a usage error", () => {
  expect(jotHome().jot(["daemon"]).code).toBe(2);
});

describe("install, status, uninstall", () => {
  function setup(withBinary = true) {
    const { home, jot } = jotHome();
    const userHome = join(home, "user");
    if (withBinary) {
      mkdirSync(join(userHome, ".local", "bin"), { recursive: true });
      writeFileSync(join(userHome, ".local", "bin", "jot"), "");
    }
    const launchctl = join(home, "launchctl.json");
    const env = { HOME: userHome, JOT_LAUNCHCTL: `file:${launchctl}` };
    const plist = join(
      userHome,
      "Library",
      "LaunchAgents",
      "dev.jot.daemon.plist",
    );
    const calls = () =>
      existsSync(launchctl)
        ? JSON.parse(readFileSync(launchctl, "utf8")).calls
        : [];
    return { home, jot, env, plist, calls };
  }

  test("install writes the plist and bootstraps it", () => {
    const { jot, env, plist, calls } = setup();
    const result = jot(["daemon", "install"], { env });
    expect(result.code).toBe(0);
    expect(readFileSync(plist, "utf8")).toContain("dev.jot.daemon");
    expect(calls()).toEqual([["bootstrap", plist]]);
  });

  test("installing twice boots out the old agent first and succeeds both times", () => {
    const { jot, env, plist, calls } = setup();
    expect(jot(["daemon", "install"], { env }).code).toBe(0);
    expect(jot(["daemon", "install"], { env }).code).toBe(0);
    expect(calls()).toEqual([
      ["bootstrap", plist],
      ["bootout"],
      ["bootstrap", plist],
    ]);
  });

  test("install refuses when the canonical binary is missing", () => {
    const { jot, env, plist } = setup(false);
    const result = jot(["daemon", "install"], { env });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("install:local");
    expect(existsSync(plist)).toBe(false);
  });

  test("status reports loaded state, pid and the last tick", () => {
    const { home, jot, env } = setup();
    expect(jot(["daemon", "status"], { env }).stdout).toContain("not loaded");
    jot(["daemon", "install"], { env });
    writeFileSync(join(home, "status"), "0\n");
    const out = jot(["daemon", "status"], { env }).stdout;
    expect(out).toContain("running (pid 4242)");
    expect(out).toMatch(/last tick\s+now/);
  });

  test("status says when the daemon has never ticked", () => {
    const { jot, env } = setup();
    jot(["daemon", "install"], { env });
    expect(jot(["daemon", "status"], { env }).stdout).toContain("never");
  });

  test("uninstall boots out and removes the plist, and is idempotent", () => {
    const { jot, env, plist, calls } = setup();
    jot(["daemon", "install"], { env });
    expect(jot(["daemon", "uninstall"], { env }).code).toBe(0);
    expect(existsSync(plist)).toBe(false);
    expect(jot(["daemon", "uninstall"], { env }).code).toBe(0);
    expect(calls()).toEqual([["bootstrap", plist], ["bootout"]]);
  });
});
