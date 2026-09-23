import { afterEach, expect, test } from "bun:test";
import { openDb } from "../core/db";
import { renderApp, selectedLine } from "./testing";

let cleanup: (() => Promise<unknown>) | null = null;
afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

async function app(...args: Parameters<typeof renderApp>) {
  const a = await renderApp(...args);
  cleanup = a.destroy;
  return a;
}

test("opens on the Due tab with the first item selected and its detail shown", async () => {
  const a = await app();
  const frame = a.frame();
  expect(frame).toContain("[Due]");
  expect(selectedLine(frame)).toContain("overdue thing");
  expect(frame).toContain("nudgy@main");
  expect(frame).toContain("detail");
  expect(frame).not.toContain("plain note");
});

test("j/k and the arrows move the selection and clamp at the ends", async () => {
  const a = await app();
  await a.press("j");
  expect(selectedLine(a.frame())).toContain("soon thing");
  await a.press("j");
  expect(selectedLine(a.frame())).toContain("soon thing");
  await a.arrow("up");
  expect(selectedLine(a.frame())).toContain("overdue thing");
  await a.press("k");
  expect(selectedLine(a.frame())).toContain("overdue thing");
  await a.arrow("down");
  expect(selectedLine(a.frame())).toContain("soon thing");
});

test("the detail pane follows the selection", async () => {
  const a = await app();
  await a.waitForText("detail here");
  await a.press("j");
  await a.waitForText("in 2h)");
  expect(a.frame()).not.toContain("detail here");
  expect(a.frame()).toContain("other");
});

test("tab cycles Due → Today → All → Done and shift-tab goes back", async () => {
  const a = await app();
  await a.tab();
  expect(a.frame()).toContain("[Today]");
  await a.tab();
  expect(a.frame()).toContain("[All]");
  expect(a.frame()).toContain("plain note");
  await a.tab();
  expect(a.frame()).toContain("[Done]");
  expect(selectedLine(a.frame())).toContain("finished thing");
  await a.tab();
  expect(a.frame()).toContain("[Due]");
  await a.tab(true);
  expect(a.frame()).toContain("[Done]");
});

test("an empty tab says so", async () => {
  const a = await app({}, openDb(":memory:"));
  expect(a.frame()).toContain("nothing here");
  expect(a.frame()).toContain("no item selected");
});

test("selection sticks to the same item when the list changes underneath", async () => {
  const a = await app({ refreshMs: 20 });
  await a.tab();
  await a.tab();
  await a.press("j");
  expect(selectedLine(a.frame())).toContain("soon thing");
  a.db.run("DELETE FROM items WHERE id = 3");
  await a.step(() => Bun.sleep(60));
  expect(selectedLine(a.frame())).toContain("soon thing");
});

test("q quits", async () => {
  const a = await app();
  await a.press("q");
  expect(a.quit()).toBe(true);
});
