import { afterEach, expect, test } from "bun:test";
import type { Item } from "../core/items";
import { getItem } from "../core/items";
import { renderApp, selectedLine } from "./testing";

let cleanup: (() => Promise<unknown>) | null = null;
afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

async function app(onEdit: (item: Item) => string | null) {
  const edited: number[] = [];
  const a = await renderApp({
    onEdit: async (item) => {
      edited.push(item.id);
      return onEdit(item);
    },
  });
  cleanup = a.destroy;
  return { ...a, edited };
}

test("e saves what the editor returns and keeps the same item selected", async () => {
  const a = await app(() => "soon thing, revised\n\nwith notes");
  await a.press("j");
  await a.press("e");
  expect(a.edited).toEqual([2]);
  expect(getItem(a.db, 2)?.body).toBe("soon thing, revised\n\nwith notes");
  expect(selectedLine(a.frame())).toContain("soon thing, revised");
  expect(a.frame()).toContain("saved #2");
  await a.waitForText("with notes");
});

test("an editor that fails changes nothing", async () => {
  const a = await app(() => null);
  await a.press("e");
  expect(getItem(a.db, 1)?.body).toBe("overdue thing\n\nsome **detail** here");
  expect(a.frame()).toContain("nothing saved");
});

test("an unchanged or emptied body changes nothing", async () => {
  const unchanged = await app((item) => `${item.body}\n`);
  await unchanged.press("e");
  expect(unchanged.frame()).toContain("#1 unchanged");
  await unchanged.destroy();
  const emptied = await app(() => "   \n");
  await emptied.press("e");
  expect(getItem(emptied.db, 1)?.body).toBe(
    "overdue thing\n\nsome **detail** here",
  );
  expect(emptied.frame()).toContain("empty body");
});

test("e with nothing selected does nothing", async () => {
  const a = await app(() => "x");
  await a.tab();
  await a.tab();
  await a.tab();
  await a.press("x");
  await a.press("y");
  await a.press("e");
  expect(a.edited).toEqual([]);
});
