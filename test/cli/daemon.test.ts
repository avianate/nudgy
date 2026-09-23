import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openDb } from "../../src/core/db";
import { createItem } from "../../src/core/items";
import { nudgyHome } from "./helpers";

const NOW = Date.parse("2026-09-22T14:00:00Z");
const MIN = 60_000;

test("daemon run --once sends due banners through the notifier seam and writes status", () => {
  const { home, nudgy } = nudgyHome();
  const db = openDb(join(home, "nudgy.db"));
  createItem(
    db,
    { body: "ship it", repo: null, branch: null, remindAt: NOW - MIN },
    0,
  );
  db.close();
  const sink = join(home, "banners.jsonl");
  const env = { NUDGY_NOW: String(NOW), NUDGY_NOTIFIER: `file:${sink}` };
  const result = nudgy(["daemon", "run", "--once"], { env });
  expect(result.code).toBe(0);
  expect(JSON.parse(readFileSync(sink, "utf8"))).toMatchObject({
    title: "ship it",
    sound: "Glass",
  });
  expect(readFileSync(join(home, "status"), "utf8")).toBe("1\n");
  nudgy(["daemon", "run", "--once"], { env });
  expect(readFileSync(sink, "utf8").trim().split("\n")).toHaveLength(1);
});

test("daemon with no subcommand is a usage error", () => {
  expect(nudgyHome().nudgy(["daemon"]).code).toBe(2);
});

describe("install, status, uninstall", () => {
  function setup(withBinary = true) {
    const { home, nudgy } = nudgyHome();
    const userHome = join(home, "user");
    if (withBinary) {
      mkdirSync(join(userHome, ".local", "bin"), { recursive: true });
      writeFileSync(join(userHome, ".local", "bin", "nudgy"), "");
    }
    const launchctl = join(home, "launchctl.json");
    const env = { HOME: userHome, NUDGY_LAUNCHCTL: `file:${launchctl}` };
    const plist = join(
      userHome,
      "Library",
      "LaunchAgents",
      "io.github.avianate.nudgy.daemon.plist",
    );
    const calls = () =>
      existsSync(launchctl)
        ? JSON.parse(readFileSync(launchctl, "utf8")).calls
        : [];
    return { home, nudgy, env, plist, calls };
  }

  test("install writes the plist and bootstraps it", () => {
    const { nudgy, env, plist, calls } = setup();
    const result = nudgy(["daemon", "install"], { env });
    expect(result.code).toBe(0);
    expect(readFileSync(plist, "utf8")).toContain(
      "io.github.avianate.nudgy.daemon",
    );
    expect(calls()).toEqual([["bootstrap", plist]]);
  });

  test("installing twice boots out the old agent first and succeeds both times", () => {
    const { nudgy, env, plist, calls } = setup();
    expect(nudgy(["daemon", "install"], { env }).code).toBe(0);
    expect(nudgy(["daemon", "install"], { env }).code).toBe(0);
    expect(calls()).toEqual([
      ["bootstrap", plist],
      ["bootout"],
      ["bootstrap", plist],
    ]);
  });

  test("install refuses when the canonical binary is missing", () => {
    const { nudgy, env, plist } = setup(false);
    const result = nudgy(["daemon", "install"], { env });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("install:local");
    expect(existsSync(plist)).toBe(false);
  });

  test("status reports loaded state, pid and the last tick", () => {
    const { home, nudgy, env } = setup();
    expect(nudgy(["daemon", "status"], { env }).stdout).toContain("not loaded");
    nudgy(["daemon", "install"], { env });
    writeFileSync(join(home, "tick"), "");
    const out = nudgy(["daemon", "status"], { env }).stdout;
    expect(out).toContain("running (pid 4242)");
    expect(out).toMatch(/last tick\s+now/);
  });

  test("status says when the daemon has never ticked", () => {
    const { nudgy, env } = setup();
    nudgy(["daemon", "install"], { env });
    expect(nudgy(["daemon", "status"], { env }).stdout).toContain("never");
  });

  test("uninstall boots out and removes the plist, and is idempotent", () => {
    const { nudgy, env, plist, calls } = setup();
    nudgy(["daemon", "install"], { env });
    expect(nudgy(["daemon", "uninstall"], { env }).code).toBe(0);
    expect(existsSync(plist)).toBe(false);
    expect(nudgy(["daemon", "uninstall"], { env }).code).toBe(0);
    expect(calls()).toEqual([["bootstrap", plist], ["bootout"]]);
  });
});
