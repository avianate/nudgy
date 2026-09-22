import { describe, expect, test } from "bun:test";
import { openDb } from "./db";
import {
  clearReminder,
  createItem,
  deleteItem,
  getItem,
  listItems,
  searchItems,
  setReminder,
  updateBody,
} from "./items";

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

describe("search", () => {
  function seeded() {
    const db = openDb(":memory:");
    createItem(
      db,
      { body: "check the migration landed", repo: "/a", branch: null },
      1,
    );
    createItem(
      db,
      { body: "re-run the flaky suite", repo: "/b", branch: null },
      2,
    );
    createItem(
      db,
      { body: 'quote "this" (maybe) NEAR done*', repo: "/a", branch: null },
      3,
    );
    return db;
  }
  const ids = (items: { id: number }[]) => items.map((i) => i.id);

  test("matches word prefixes", () => {
    expect(ids(searchItems(seeded(), "migr"))).toEqual([1]);
    expect(ids(searchItems(seeded(), "fla sui"))).toEqual([2]);
  });

  test("all terms must match", () => {
    expect(ids(searchItems(seeded(), "flaky migration"))).toEqual([]);
  });

  test.each([
    "re-run",
    '"',
    "*",
    "(",
    "NEAR",
    "AND OR NOT",
    'quote "this',
    "done*",
    "^col:x",
  ])("raw FTS syntax %p never throws", (query) => {
    expect(() => searchItems(seeded(), query)).not.toThrow();
  });

  test("hyphenated input matches its words", () => {
    expect(ids(searchItems(seeded(), "re-run"))).toEqual([2]);
  });

  test("a query with no words matches nothing", () => {
    expect(searchItems(seeded(), '"*"')).toEqual([]);
  });

  test("filters by repo", () => {
    expect(ids(searchItems(seeded(), "the", { repo: "/a" }))).toEqual([1]);
  });

  test("reflects body edits and deletes", () => {
    const db = seeded();
    updateBody(db, 1, "check the deploy", 10);
    expect(ids(searchItems(db, "migration"))).toEqual([]);
    expect(ids(searchItems(db, "deploy"))).toEqual([1]);
    deleteItem(db, 1);
    expect(ids(searchItems(db, "deploy"))).toEqual([]);
  });
});

test("updateBody bumps updatedAt", () => {
  const db = openDb(":memory:");
  createItem(db, { body: "a", repo: null, branch: null }, 1);
  expect(updateBody(db, 1, "b", 5)).toMatchObject({
    body: "b",
    createdAt: 1,
    updatedAt: 5,
  });
});

test("deleteItem reports whether anything was deleted", () => {
  const db = openDb(":memory:");
  createItem(db, { body: "a", repo: null, branch: null }, 1);
  expect(deleteItem(db, 1)).toBe(true);
  expect(deleteItem(db, 1)).toBe(false);
});

describe("listItems", () => {
  function seeded() {
    const db = openDb(":memory:");
    createItem(db, { body: "old note", repo: "/a", branch: null }, 1);
    createItem(
      db,
      { body: "reminder", repo: "/b", branch: null, remindAt: 50 },
      2,
    );
    createItem(db, { body: "new note", repo: "/a", branch: null }, 3);
    db.run("UPDATE items SET done_at = 9 WHERE id = 1");
    return db;
  }
  const ids = (items: { id: number }[]) => items.map((i) => i.id);

  test("lists open items newest first by default", () => {
    expect(ids(listItems(seeded()))).toEqual([3, 2]);
  });

  test("done lists only completed items", () => {
    expect(ids(listItems(seeded(), { done: true }))).toEqual([1]);
  });

  test("remindersOnly keeps items with a reminder", () => {
    expect(ids(listItems(seeded(), { remindersOnly: true }))).toEqual([2]);
  });

  test("repo filters to one repo", () => {
    expect(ids(listItems(seeded(), { repo: "/a" }))).toEqual([3]);
  });
});

describe("reminders", () => {
  function withAlertedDoneItem() {
    const db = openDb(":memory:");
    createItem(db, { body: "x", repo: null, branch: null, remindAt: 10 }, 1);
    db.run("UPDATE items SET last_alerted_at = 11, done_at = 12 WHERE id = 1");
    return db;
  }

  test("setReminder replaces the time, clears alert state and reopens the item", () => {
    const item = setReminder(withAlertedDoneItem(), 1, { remindAt: 500 }, 20);
    expect(item).toMatchObject({
      remindAt: 500,
      recurrence: null,
      recurrenceText: null,
      lastAlertedAt: null,
      doneAt: null,
      updatedAt: 20,
    });
  });

  test("setReminder stores a recurrence rule", () => {
    const item = setReminder(
      withAlertedDoneItem(),
      1,
      {
        remindAt: 500,
        recurrence: '{"kind":"daily","time":"09:00"}',
        recurrenceText: "every day",
      },
      20,
    );
    expect(item).toMatchObject({
      recurrence: '{"kind":"daily","time":"09:00"}',
      recurrenceText: "every day",
    });
  });

  test("clearReminder removes the reminder but leaves done state alone", () => {
    const item = clearReminder(withAlertedDoneItem(), 1, 20);
    expect(item).toMatchObject({
      remindAt: null,
      recurrence: null,
      recurrenceText: null,
      lastAlertedAt: null,
      doneAt: 12,
    });
  });
});
