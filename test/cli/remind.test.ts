import { expect, test } from "bun:test";
import { join } from "node:path";
import { openDb } from "../../src/core/db";
import { jotHome } from "./helpers";

// Tue 2026-09-22 10:00 in America/New_York
const NOW = Date.parse("2026-09-22T14:00:00Z");
const HOUR = 3_600_000;
const env = { JOT_NOW: String(NOW) };

function show(jot: ReturnType<typeof jotHome>["jot"], id: number) {
  return JSON.parse(jot(["show", String(id), "--json"], { env }).stdout);
}

test("-r on capture sets a one-shot reminder", () => {
  const { jot } = jotHome();
  const result = jot(["re-run the flaky suite", "-r", "in 2 hours"], { env });
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("in 2h");
  expect(show(jot, 1).remindAt).toBe(new Date(NOW + 2 * HOUR).toISOString());
});

test("an unparseable -r saves nothing and exits 2", () => {
  const { jot } = jotHome();
  const result = jot(["x", "-r", "banana"], { env });
  expect(result.code).toBe(2);
  expect(result.stderr).toContain("can't understand");
  expect(jot(["ls", "--json"], { env }).stdout).toBe("[]\n");
});

test("remind sets and replaces a reminder, clearing alert state", () => {
  const { home, jot } = jotHome();
  jot(["x", "-r", "in 1 hour"], { env });
  const db = openDb(join(home, "jot.db"));
  db.run("UPDATE items SET last_alerted_at = ? WHERE id = 1", [NOW]);
  db.close();
  const result = jot(["remind", "1", "tomorrow", "9am"], { env });
  expect(result.code).toBe(0);
  expect(show(jot, 1)).toMatchObject({
    remindAt: new Date("2026-09-23T09:00:00").toISOString(),
    lastAlertedAt: null,
  });
});

test("remind on a done item reopens it", () => {
  const { home, jot } = jotHome();
  jot(["x"], { env });
  const db = openDb(join(home, "jot.db"));
  db.run("UPDATE items SET done_at = ? WHERE id = 1", [NOW]);
  db.close();
  jot(["remind", "1", "in 1 hour"], { env });
  expect(show(jot, 1).doneAt).toBeNull();
});

test("remind --clear removes the reminder", () => {
  const { jot } = jotHome();
  jot(["x", "-r", "in 1 hour"], { env });
  expect(jot(["remind", "1", "--clear"], { env }).code).toBe(0);
  expect(show(jot, 1)).toMatchObject({
    remindAt: null,
    recurrence: null,
    recurrenceText: null,
  });
});

test("remind without a time is a usage error", () => {
  const { jot } = jotHome();
  jot(["x"], { env });
  expect(jot(["remind", "1"], { env }).code).toBe(2);
});

test("remind on a missing item exits 1", () => {
  expect(jotHome().jot(["remind", "9", "in 1 hour"], { env }).code).toBe(1);
});
