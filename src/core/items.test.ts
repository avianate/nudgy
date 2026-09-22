import { expect, test } from "bun:test";
import { openDb } from "./db";
import { createItem, getItem } from "./items";

test("createItem stores the body, git context and timestamps", () => {
  const db = openDb(":memory:");
  const item = createItem(
    db,
    { body: "check the migration landed", repo: "/src/jot", branch: "main" },
    1_000,
  );
  expect(item).toEqual({
    id: 1,
    body: "check the migration landed",
    repo: "/src/jot",
    branch: "main",
    createdAt: 1_000,
    updatedAt: 1_000,
    remindAt: null,
    recurrence: null,
    recurrenceText: null,
    lastAlertedAt: null,
    doneAt: null,
  });
  expect(getItem(db, 1)).toEqual(item);
});

test("createItem accepts a reminder and recurrence", () => {
  const db = openDb(":memory:");
  const item = createItem(
    db,
    {
      body: "standup",
      repo: null,
      branch: null,
      remindAt: 5_000,
      recurrence: '{"kind":"weekdays","time":"09:00"}',
      recurrenceText: "every weekday 9am",
    },
    1_000,
  );
  expect(item.remindAt).toBe(5_000);
  expect(item.recurrence).toBe('{"kind":"weekdays","time":"09:00"}');
  expect(item.recurrenceText).toBe("every weekday 9am");
});

test("ids are sequential small integers", () => {
  const db = openDb(":memory:");
  const a = createItem(db, { body: "a", repo: null, branch: null }, 1);
  const b = createItem(db, { body: "b", repo: null, branch: null }, 2);
  expect([a.id, b.id]).toEqual([1, 2]);
});

test("getItem returns null for a missing id", () => {
  expect(getItem(openDb(":memory:"), 42)).toBeNull();
});
