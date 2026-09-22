import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { jotHome } from "./helpers";

// Tue 2026-09-22 10:00 in America/New_York
const NOW = Date.parse("2026-09-22T14:00:00Z");
const MIN = 60_000;
const env = { JOT_NOW: String(NOW) };
const iso = (ms: number) => new Date(ms).toISOString();

function show(jot: ReturnType<typeof jotHome>["jot"], id: number) {
  return JSON.parse(jot(["show", String(id), "--json"], { env }).stdout);
}

test("done hides an item from ls; ls --done shows it; reopen brings it back", () => {
  const { jot } = jotHome();
  jot(["ship it", "-r", "in 1 hour"], { env });
  expect(jot(["done", "1"], { env }).code).toBe(0);
  expect(show(jot, 1).doneAt).toBe(iso(NOW));
  expect(jot(["ls", "--json"], { env }).stdout).toBe("[]\n");
  expect(
    JSON.parse(jot(["ls", "--done", "--json"], { env }).stdout),
  ).toHaveLength(1);
  expect(jot(["reopen", "1"], { env }).code).toBe(0);
  expect(show(jot, 1).doneAt).toBeNull();
});

test("done works on a plain note", () => {
  const { jot } = jotHome();
  jot(["plain note"], { env });
  expect(jot(["done", "1"], { env }).code).toBe(0);
  expect(show(jot, 1).doneAt).toBe(iso(NOW));
});

test("done twice and reopen on an open item are harmless", () => {
  const { jot } = jotHome();
  jot(["x"], { env });
  expect(jot(["reopen", "1"], { env }).stdout).toContain("not done");
  jot(["done", "1"], { env });
  expect(jot(["done", "1"], { env }).stdout).toContain("already done");
});

test("snooze defaults to defaultSnooze from config", () => {
  const { home, jot } = jotHome();
  jot(["x", "-r", "in 1 minute"], { env });
  expect(jot(["snooze", "1"], { env }).code).toBe(0);
  expect(show(jot, 1).remindAt).toBe(iso(NOW + 10 * MIN));
  writeFileSync(join(home, "config.json"), '{"defaultSnooze": "25m"}');
  jot(["snooze", "1"], { env });
  expect(show(jot, 1).remindAt).toBe(iso(NOW + 25 * MIN));
});

test("snooze takes a duration or an absolute time", () => {
  const { jot } = jotHome();
  jot(["x", "-r", "in 1 minute"], { env });
  jot(["snooze", "1", "1h"], { env });
  expect(show(jot, 1).remindAt).toBe(iso(NOW + 60 * MIN));
  jot(["snooze", "1", "tomorrow", "9am"], { env });
  expect(show(jot, 1).remindAt).toBe(
    new Date("2026-09-23T09:00:00").toISOString(),
  );
});

test("snooze on a done item is refused", () => {
  const { jot } = jotHome();
  jot(["x", "-r", "in 1 minute"], { env });
  jot(["done", "1"], { env });
  const result = jot(["snooze", "1"], { env });
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("reopen");
});

test("an invalid config is reported and the command fails", () => {
  const { home, jot } = jotHome();
  jot(["x", "-r", "in 1 minute"], { env });
  writeFileSync(join(home, "config.json"), "{broken");
  const result = jot(["snooze", "1"], { env });
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("config.json");
});
