import { expect, test } from "bun:test";
import { openDb } from "../core/db";
import { createItem, getItem } from "../core/items";
import { createStore } from "./store";

// Tue 2026-09-22 10:00 in America/New_York
const NOW = Date.parse("2026-09-22T14:00:00Z");
const H = 3_600_000;

function seeded() {
  const db = openDb(":memory:");
  createItem(
    db,
    { body: "overdue", repo: "/a", branch: null, remindAt: NOW - H },
    NOW - 72 * H,
  );
  createItem(
    db,
    { body: "tomorrow-ish", repo: "/b", branch: null, remindAt: NOW + 20 * H },
    NOW - 72 * H,
  );
  createItem(db, { body: "plain today", repo: "/a", branch: null }, NOW - H);
  createItem(db, { body: "old note", repo: null, branch: null }, NOW - 72 * H);
  createItem(db, { body: "finished", repo: null, branch: null }, NOW - 72 * H);
  db.run("UPDATE items SET done_at = ? WHERE id = 5", [NOW - H]);
  return { db, store: createStore(db, { now: () => NOW }) };
}
const ids = (items: { id: number }[]) => items.map((i) => i.id);

test("each tab loads its own slice", () => {
  const { store } = seeded();
  expect(ids(store.load("due", {}))).toEqual([1, 2]);
  expect(ids(store.load("today", {}))).toEqual([1, 3]);
  expect(ids(store.load("all", {}))).toEqual([3, 4, 2, 1]);
  expect(ids(store.load("done", {}))).toEqual([5]);
});

test("the repo filter and search query narrow any tab", () => {
  const { store } = seeded();
  expect(ids(store.load("all", { repo: "/a" }))).toEqual([3, 1]);
  expect(ids(store.load("all", { query: "note" }))).toEqual([4]);
  expect(ids(store.load("due", { query: "tomorrow" }))).toEqual([2]);
  expect(ids(store.load("all", { query: '"(' }))).toEqual([]);
});

test("actions go through the same core logic as the CLI", () => {
  const { db, store } = seeded();
  store.complete(1);
  expect(getItem(db, 1)?.doneAt).toBe(NOW);
  store.snooze(2);
  expect(getItem(db, 2)?.remindAt).toBe(NOW + 10 * 60_000);
  store.remind(4, "every weekday 9am");
  expect(getItem(db, 4)).toMatchObject({
    recurrenceText: "every weekday 9am",
    remindAt: new Date("2026-09-23T09:00:00").getTime(),
  });
  store.remind(4, "clear");
  expect(getItem(db, 4)?.remindAt).toBeNull();
  expect(store.add("fresh thought").id).toBe(6);
  store.remove(6);
  expect(getItem(db, 6)).toBeNull();
});

test("a bad reminder throws a readable error and changes nothing", () => {
  const { db, store } = seeded();
  expect(() => store.remind(4, "banana")).toThrow(/can't understand/);
  expect(getItem(db, 4)?.remindAt).toBeNull();
});

test("every change notifies onChange so the prompt count can refresh", () => {
  const db = openDb(":memory:");
  createItem(db, { body: "a", repo: null, branch: null, remindAt: NOW - H }, 0);
  let changes = 0;
  const store = createStore(
    db,
    { now: () => NOW },
    { onChange: () => changes++ },
  );
  store.load("due", {});
  store.get(1);
  expect(changes).toBe(0);
  store.snooze(1);
  store.remind(1, "in 2 hours");
  store.complete(1);
  const added = store.add("b");
  store.setBody(added.id, "c");
  store.remove(added.id);
  expect(changes).toBe(6);
});
