import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSplit, MIN_PANE, saveSplit, splitColumns } from "./split";
import { renderApp } from "./testing";

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

// The column of the left pane's right border, on the top line where it meets the right pane's
const seam = (frame: string) => (frame.split("\n")[0] ?? "").indexOf("┐┌");

test("the panes split evenly by default", async () => {
  const a = await app();
  expect(seam(a.frame())).toBe(49);
});

test("dragging the divider resizes the panes and reports the ratio once", async () => {
  const calls: number[] = [];
  const a = await app({ onSplit: (r) => calls.push(r) });
  await a.drag(49, 29);
  expect(seam(a.frame())).toBe(29);
  expect(calls).toEqual([0.3]);
});

test("either border column of the divider starts a drag", async () => {
  const a = await app();
  await a.drag(50, 69);
  expect(seam(a.frame())).toBe(69);
});

test("a drag past the edge stops at the minimum pane width", async () => {
  const calls: number[] = [];
  const a = await app({ onSplit: (r) => calls.push(r) });
  await a.drag(49, 2);
  expect(seam(a.frame())).toBe(MIN_PANE - 1);
  await a.drag(MIN_PANE - 1, 99);
  expect(seam(a.frame())).toBe(100 - MIN_PANE - 1);
  expect(calls).toEqual([MIN_PANE / 100, (100 - MIN_PANE) / 100]);
});

test("a drag that starts away from the divider changes nothing", async () => {
  const calls: number[] = [];
  const a = await app({ onSplit: (r) => calls.push(r) });
  await a.drag(10, 30);
  expect(seam(a.frame())).toBe(49);
  expect(calls).toEqual([]);
});

test("a drag whose release was lost settles on the next press", async () => {
  const calls: number[] = [];
  const a = await app({ onSplit: (r) => calls.push(r) });
  await a.mouse(async (m) => {
    await m.pressDown(49, 5);
    await m.emitMouseEvent("drag", 39, 5);
  });
  expect(seam(a.frame())).toBe(39);
  await a.mouse((m) => m.pressDown(10, 5));
  expect(calls).toEqual([0.4]);
  await a.mouse(async (m) => {
    await m.emitMouseEvent("drag", 60, 5);
    await m.release(60, 5);
  });
  expect(seam(a.frame())).toBe(39);
  expect(calls).toEqual([0.4]);
});

test("hovering the divider shows a resize pointer, and leaving it restores the default", async () => {
  const a = await app();
  await a.mouse((m) => m.moveTo(49, 5));
  expect(a.pointer()).toBe("col-resize");
  await a.mouse((m) => m.moveTo(50, 5));
  expect(a.pointer()).toBe("col-resize");
  await a.mouse((m) => m.moveTo(60, 5));
  expect(a.pointer()).toBe("default");
  await a.mouse((m) => m.moveTo(49, 5));
  await a.mouse((m) => m.moveTo(49, 23));
  expect(a.pointer()).toBe("default");
});

test("the resize pointer holds through a drag and follows the divider", async () => {
  const a = await app();
  await a.mouse((m) => m.moveTo(49, 5));
  await a.mouse(async (m) => {
    await m.pressDown(49, 5);
    await m.emitMouseEvent("drag", 40, 8);
    await m.emitMouseEvent("drag", 29, 23);
  });
  expect(a.pointer()).toBe("col-resize");
  await a.mouse((m) => m.release(29, 5));
  expect(seam(a.frame())).toBe(29);
  expect(a.pointer()).toBe("col-resize");
  await a.mouse((m) => m.moveTo(10, 5));
  expect(a.pointer()).toBe("default");
});

test("the TUI opens at the split it is given", async () => {
  const a = await app({ split: 0.3 });
  expect(seam(a.frame())).toBe(29);
});

test("a saved split loads back", () => {
  const path = join(mkdtempSync(join(tmpdir(), "nudgy-split-")), "tui.json");
  saveSplit(path, 0.31234);
  expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ split: 0.312 });
  expect(loadSplit(path)).toBe(0.312);
});

test("a missing, corrupt or out-of-range file loads the default", () => {
  const dir = mkdtempSync(join(tmpdir(), "nudgy-split-"));
  expect(loadSplit(join(dir, "missing.json"))).toBe(0.5);
  for (const [name, text] of [
    ["corrupt.json", "{nope"],
    ["range.json", '{"split": 1.5}'],
    ["type.json", '{"split": "wide"}'],
  ] as const) {
    writeFileSync(join(dir, name), text);
    expect(loadSplit(join(dir, name))).toBe(0.5);
  }
});

test("a save that cannot write is ignored", () => {
  expect(() => saveSplit("/dev/null/tui.json", 0.4)).not.toThrow();
});

test("a terminal too narrow for two minimum panes splits evenly", () => {
  expect(splitColumns(0.1, 40)).toBe(20);
  expect(splitColumns(0.1, 100)).toBe(MIN_PANE);
});
