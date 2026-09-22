import { afterEach, expect, test } from "bun:test";
import { createItem, getItem, listItems } from "../core/items";
import { H, NOW, renderApp, seededDb, selectedLine } from "./testing";

let cleanup: (() => Promise<unknown>) | null = null;
afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

async function app(db = seededDb()) {
  const a = await renderApp({}, db);
  cleanup = a.destroy;
  return a;
}

test("d completes a one-shot item, which leaves the Due tab", async () => {
  const a = await app();
  await a.press("d");
  expect(getItem(a.db, 1)?.doneAt).toBe(NOW);
  expect(a.frame()).toContain("done #1");
  expect(a.frame()).not.toContain("overdue thing");
  expect(selectedLine(a.frame())).toContain("soon thing");
});

test("d on a recurring item schedules the next occurrence instead", async () => {
  const db = seededDb();
  createItem(
    db,
    {
      body: "standup",
      repo: null,
      branch: null,
      remindAt: NOW - 2 * H,
      recurrence: JSON.stringify({
        kind: "weekly",
        days: [1, 2, 3, 4, 5],
        time: "08:00",
      }),
      recurrenceText: "every weekday 8am",
    },
    0,
  );
  const a = await app(db);
  expect(selectedLine(a.frame())).toContain("standup");
  await a.press("d");
  expect(getItem(db, 5)).toMatchObject({
    doneAt: null,
    remindAt: new Date("2026-09-23T08:00:00").getTime(),
  });
  expect(a.frame()).toContain("next");
});

test("s snoozes by the default duration", async () => {
  const a = await app();
  await a.press("s");
  expect(getItem(a.db, 1)?.remindAt).toBe(NOW + 10 * 60_000);
  expect(a.frame()).toContain("snoozed #1");
});

test("x asks first, and y deletes", async () => {
  const a = await app();
  await a.press("x");
  expect(a.frame()).toContain("Delete #1");
  await a.press("y");
  expect(getItem(a.db, 1)).toBeNull();
});

test("x then anything but y keeps the item", async () => {
  const a = await app();
  await a.press("x");
  await a.press("n");
  expect(getItem(a.db, 1)).not.toBeNull();
  await a.press("x");
  await a.escape();
  expect(getItem(a.db, 1)).not.toBeNull();
  expect(a.quit()).toBe(false);
});

test("r sets a reminder from a prompt", async () => {
  const a = await app();
  await a.press("j");
  await a.press("r");
  expect(a.frame()).toContain("Remind #2");
  await a.type("every weekday 9am");
  await a.enter();
  expect(getItem(a.db, 2)).toMatchObject({
    recurrenceText: "every weekday 9am",
  });
});

test("an invalid reminder shows an error and changes nothing", async () => {
  const a = await app();
  const before = getItem(a.db, 1)?.remindAt;
  await a.press("r");
  await a.type("banana");
  await a.enter();
  expect(a.frame()).toContain("can't understand");
  expect(getItem(a.db, 1)?.remindAt).toBe(before);
  expect(a.quit()).toBe(false);
});

test("typing into the add prompt never triggers shortcuts", async () => {
  const a = await app();
  await a.press("a");
  await a.type("quid");
  await a.enter();
  expect(a.quit()).toBe(false);
  expect(getItem(a.db, 1)?.doneAt).toBeNull();
  const added = listItems(a.db).find((i) => i.body === "quid");
  expect(added).toMatchObject({ repo: "/src/jot", branch: "main" });
  expect(a.frame()).toContain("added #5");
});

test("escape cancels a prompt without acting", async () => {
  const a = await app();
  await a.press("a");
  await a.type("nope");
  await a.escape();
  expect(listItems(a.db).some((i) => i.body === "nope")).toBe(false);
  await a.press("j");
  expect(selectedLine(a.frame())).toContain("soon thing");
});

test("actions on an empty list do nothing", async () => {
  const { openDb } = await import("../core/db");
  const a = await app(openDb(":memory:"));
  for (const key of ["d", "s", "x", "r"]) await a.press(key);
  expect(a.quit()).toBe(false);
  expect(a.frame()).toContain("nothing here");
});
