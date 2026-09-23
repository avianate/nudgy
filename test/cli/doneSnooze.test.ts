import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { nudgyHome } from "./helpers";

// Tue 2026-09-22 10:00 in America/New_York
const NOW = Date.parse("2026-09-22T14:00:00Z");
const MIN = 60_000;
const env = { NUDGY_NOW: String(NOW) };
const iso = (ms: number) => new Date(ms).toISOString();

function show(nudgy: ReturnType<typeof nudgyHome>["nudgy"], id: number) {
  return JSON.parse(nudgy(["show", String(id), "--json"], { env }).stdout);
}

test("done hides an item from ls; ls --done shows it; reopen brings it back", () => {
  const { nudgy } = nudgyHome();
  nudgy(["ship it", "-r", "in 1 hour"], { env });
  expect(nudgy(["done", "1"], { env }).code).toBe(0);
  expect(show(nudgy, 1).doneAt).toBe(iso(NOW));
  expect(nudgy(["ls", "--json"], { env }).stdout).toBe("[]\n");
  expect(
    JSON.parse(nudgy(["ls", "--done", "--json"], { env }).stdout),
  ).toHaveLength(1);
  expect(nudgy(["reopen", "1"], { env }).code).toBe(0);
  expect(show(nudgy, 1).doneAt).toBeNull();
});

test("done works on a plain note", () => {
  const { nudgy } = nudgyHome();
  nudgy(["plain note"], { env });
  expect(nudgy(["done", "1"], { env }).code).toBe(0);
  expect(show(nudgy, 1).doneAt).toBe(iso(NOW));
});

test("done twice and reopen on an open item are harmless", () => {
  const { nudgy } = nudgyHome();
  nudgy(["x"], { env });
  expect(nudgy(["reopen", "1"], { env }).stdout).toContain("not done");
  nudgy(["done", "1"], { env });
  expect(nudgy(["done", "1"], { env }).stdout).toContain("already done");
});

test("snooze defaults to defaultSnooze from config", () => {
  const { home, nudgy } = nudgyHome();
  nudgy(["x", "-r", "in 1 minute"], { env });
  expect(nudgy(["snooze", "1"], { env }).code).toBe(0);
  expect(show(nudgy, 1).remindAt).toBe(iso(NOW + 10 * MIN));
  writeFileSync(join(home, "config.json"), '{"defaultSnooze": "25m"}');
  nudgy(["snooze", "1"], { env });
  expect(show(nudgy, 1).remindAt).toBe(iso(NOW + 25 * MIN));
});

test("snooze takes a duration or an absolute time", () => {
  const { nudgy } = nudgyHome();
  nudgy(["x", "-r", "in 1 minute"], { env });
  nudgy(["snooze", "1", "1h"], { env });
  expect(show(nudgy, 1).remindAt).toBe(iso(NOW + 60 * MIN));
  nudgy(["snooze", "1", "tomorrow", "9am"], { env });
  expect(show(nudgy, 1).remindAt).toBe(
    new Date("2026-09-23T09:00:00").toISOString(),
  );
});

test("snooze on a done item is refused", () => {
  const { nudgy } = nudgyHome();
  nudgy(["x", "-r", "in 1 minute"], { env });
  nudgy(["done", "1"], { env });
  const result = nudgy(["snooze", "1"], { env });
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("reopen");
});

test("an invalid config is reported and the command fails", () => {
  const { home, nudgy } = nudgyHome();
  nudgy(["x", "-r", "in 1 minute"], { env });
  writeFileSync(join(home, "config.json"), "{broken");
  const result = nudgy(["snooze", "1"], { env });
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("config.json");
});
