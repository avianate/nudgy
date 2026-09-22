import { expect, test } from "bun:test";
import { openDb } from "./db";
import { createItem, getItem } from "./items";
import { completeItem, rollForwardDue } from "./lifecycle";

const local = (s: string) => new Date(s).getTime();

function first(db: ReturnType<typeof openDb>) {
  const item = getItem(db, 1);
  if (!item) throw new Error("item 1 missing");
  return item;
}
const WEEKDAY_9 = JSON.stringify({
  kind: "weekly",
  days: [1, 2, 3, 4, 5],
  time: "09:00",
});

function recurring(remindAt: number) {
  const db = openDb(":memory:");
  createItem(
    db,
    {
      body: "standup",
      repo: null,
      branch: null,
      remindAt,
      recurrence: WEEKDAY_9,
      recurrenceText: "every weekday 9am",
    },
    0,
  );
  db.run("UPDATE items SET last_alerted_at = ? WHERE id = 1", [remindAt]);
  return db;
}

test("completing a one-shot item marks it done", () => {
  const db = openDb(":memory:");
  createItem(db, { body: "x", repo: null, branch: null, remindAt: 5 }, 0);
  const done = completeItem(db, first(db), 100);
  expect(done).toMatchObject({ doneAt: 100, remindAt: 5 });
});

test("completing a recurring item advances to the next occurrence strictly after now", () => {
  const db = recurring(local("2026-09-22T09:00:00"));
  const now = local("2026-09-22T09:30:00");
  expect(completeItem(db, first(db), now)).toMatchObject({
    doneAt: null,
    lastAlertedAt: null,
    remindAt: local("2026-09-23T09:00:00"),
  });
});

test("completing a recurring item late skips the missed occurrences", () => {
  const db = recurring(local("2026-09-21T09:00:00"));
  const now = local("2026-09-24T12:00:00");
  expect(completeItem(db, first(db), now)?.remindAt).toBe(
    local("2026-09-25T09:00:00"),
  );
});

test("rollForwardDue moves an unacknowledged recurring reminder to the latest occurrence and clears its alert", () => {
  const db = recurring(local("2026-09-21T09:00:00"));
  rollForwardDue(db, local("2026-09-23T10:00:00"));
  expect(getItem(db, 1)).toMatchObject({
    remindAt: local("2026-09-23T09:00:00"),
    lastAlertedAt: null,
  });
});

test("rollForwardDue leaves one-shots and not-yet-due recurrences alone", () => {
  const db = recurring(local("2026-09-23T09:00:00"));
  createItem(
    db,
    {
      body: "one-shot",
      repo: null,
      branch: null,
      remindAt: local("2026-09-21T09:00:00"),
    },
    0,
  );
  rollForwardDue(db, local("2026-09-23T10:00:00"));
  expect(getItem(db, 1)?.lastAlertedAt).toBe(local("2026-09-23T09:00:00"));
  expect(getItem(db, 2)?.remindAt).toBe(local("2026-09-21T09:00:00"));
});
