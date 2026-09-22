import { expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { jotHome } from "./helpers";

function setup() {
  const ctx = jotHome();
  const userHome = join(ctx.home, "user");
  const bin = join(userHome, ".local", "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "jot"), "#!/bin/sh\n");
  chmodSync(join(bin, "jot"), 0o755);
  return { ...ctx, bin, userHome };
}

test("doctor reports each check and sends a test banner through the notifier", () => {
  const { home, jot, bin } = setup();
  const result = jot(["doctor"], {
    env: { PATH: `${bin}:/usr/bin:/bin`, EDITOR: "vi" },
    stdin: "y\n",
  });
  for (const label of [
    "binary",
    "on PATH",
    "signature",
    "notifier",
    "daemon",
    "database",
    "config",
    "$EDITOR",
  ]) {
    expect(result.stdout).toContain(label);
  }
  expect(result.stdout).toMatch(/✓ database\s+schema v1/);
  expect(result.stderr).toContain("Did a banner appear");
  expect(
    JSON.parse(readFileSync(join(home, "banners.jsonl"), "utf8")),
  ).toMatchObject({ title: "jot doctor" });
});

test("doctor fails, with reasons, when things are missing", () => {
  const { jot } = jotHome();
  const result = jot(["doctor"], { env: { EDITOR: "" }, stdin: "y\n" });
  expect(result.code).toBe(1);
  expect(result.stdout).toMatch(/✗ binary\s+.*not found/);
  expect(result.stdout).toMatch(/✗ daemon\s+not loaded/);
  expect(result.stdout).toMatch(/! \$EDITOR\s+not set/);
});

test("an unset $EDITOR is only a warning", () => {
  const { jot } = setup();
  const result = jot(["doctor"], { env: { EDITOR: "" }, stdin: "y\n" });
  expect(result.stdout).toMatch(/! \$EDITOR/);
  expect(result.stdout).not.toMatch(/✗ \$EDITOR/);
});

test("answering no to the banner prints the notification settings fix", () => {
  const { jot } = setup();
  const result = jot(["doctor"], { stdin: "n\n" });
  expect(result.code).toBe(1);
  expect(result.stdout).toContain(
    "System Settings → Notifications → Jot → Allow notifications",
  );
  expect(result.stdout).toContain("Script Editor → Allow");
  expect(result.stdout).toContain("Notification Center");
});

test("doctor reports a missing notifier helper as falling back to osascript", () => {
  const { jot } = setup();
  expect(jot(["doctor"], { stdin: "y\n" }).stdout).toMatch(
    /✗ notifier\s+.*fall back to osascript/,
  );
});

test("an invalid config is reported by doctor", () => {
  const { home, jot } = setup();
  writeFileSync(join(home, "config.json"), "{nope");
  expect(jot(["doctor"], { stdin: "y\n" }).stdout).toMatch(
    /✗ config\s+.*invalid JSON/,
  );
});

test("jot config creates the file with defaults and opens it in $EDITOR", () => {
  const { home, jot } = jotHome();
  const result = jot(["config"], { env: { EDITOR: "true" } });
  expect(result.code).toBe(0);
  expect(JSON.parse(readFileSync(join(home, "config.json"), "utf8"))).toEqual({
    realertMinutes: 15,
    defaultSnooze: "10m",
    hookWindowHours: 4,
    sound: "Glass",
  });
});

test("jot config never overwrites an existing file and reports if the edit left it invalid", () => {
  const { home, jot } = jotHome();
  writeFileSync(join(home, "config.json"), "{nope");
  const result = jot(["config"], { env: { EDITOR: "true" } });
  expect(readFileSync(join(home, "config.json"), "utf8")).toBe("{nope");
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("invalid JSON");
  expect(existsSync(join(home, "config.json"))).toBe(true);
});
