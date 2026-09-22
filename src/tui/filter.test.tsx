import { afterEach, expect, test } from "bun:test";
import { createItem } from "../core/items";
import { NOW, renderApp, seededDb, selectedLine } from "./testing";

let cleanup: (() => Promise<unknown>) | null = null;
afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

async function app(
  overrides: Parameters<typeof renderApp>[0] = {},
  db = seededDb(),
) {
  const a = await renderApp(overrides, db);
  cleanup = a.destroy;
  return a;
}

test("/ filters the list as you type and enter keeps the filter", async () => {
  const a = await app();
  await a.tab();
  await a.tab();
  await a.press("/");
  await a.type("plai");
  expect(a.frame()).toContain("plain note");
  expect(a.frame()).not.toContain("soon thing");
  await a.enter();
  expect(a.frame()).toContain("/plai");
  await a.press("j");
  expect(selectedLine(a.frame())).toContain("plain note");
});

test("search matches the same way jot search does", async () => {
  const a = await app();
  await a.tab();
  await a.tab();
  await a.press("/");
  await a.type('"(thi');
  await a.enter();
  expect(a.frame()).toContain("overdue thing");
  expect(a.frame()).toContain("soon thing");
  expect(a.frame()).not.toContain("plain note");
});

test("escape clears an active search", async () => {
  const a = await app();
  await a.press("/");
  await a.type("soon");
  await a.enter();
  expect(a.frame()).not.toContain("overdue thing");
  await a.escape();
  expect(a.frame()).toContain("overdue thing");
  expect(a.frame()).not.toContain("/soon");
});

test("h toggles the current-repo filter and shows that it is on", async () => {
  const a = await app();
  await a.tab();
  await a.tab();
  await a.press("h");
  expect(a.frame()).toContain("here: jot");
  expect(a.frame()).toContain("plain note");
  expect(a.frame()).not.toContain("soon thing");
  await a.press("h");
  expect(a.frame()).not.toContain("here: jot");
  expect(a.frame()).toContain("soon thing");
});

test("h outside a repo explains why nothing changed", async () => {
  const a = await app({ repo: null });
  await a.press("h");
  expect(a.frame()).toContain("not inside a git repo");
  expect(a.frame()).toContain("soon thing");
});

test("? shows the key help and any key closes it", async () => {
  const a = await app();
  await a.press("?");
  expect(a.frame()).toContain("toggle current-repo filter");
  await a.press("q");
  expect(a.quit()).toBe(false);
  expect(a.frame()).not.toContain("toggle current-repo filter");
});

test("changes made outside the TUI appear after a refresh", async () => {
  const db = seededDb();
  const a = await app({ refreshMs: 20 }, db);
  createItem(
    db,
    { body: "from the CLI", repo: null, branch: null, remindAt: NOW + 60_000 },
    NOW,
  );
  await a.waitForText("from the CLI");
});
