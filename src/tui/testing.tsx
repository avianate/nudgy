import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { openDb } from "../core/db";
import { createItem } from "../core/items";
import { App, type AppProps } from "./app";
import { createStore } from "./store";

// Tue 2026-09-22 10:00 in America/New_York
export const NOW = Date.parse("2026-09-22T14:00:00Z");
export const H = 3_600_000;

export function seededDb() {
  const db = openDb(":memory:");
  createItem(
    db,
    {
      body: "overdue thing\n\nsome **detail** here",
      repo: "/src/nudgy",
      branch: "main",
      remindAt: NOW - H,
    },
    NOW - 72 * H,
  );
  createItem(
    db,
    {
      body: "soon thing",
      repo: "/src/other",
      branch: null,
      remindAt: NOW + 2 * H,
    },
    NOW - 72 * H,
  );
  createItem(
    db,
    { body: "plain note", repo: "/src/nudgy", branch: "main" },
    NOW - 48 * H,
  );
  createItem(
    db,
    { body: "finished thing", repo: null, branch: null },
    NOW - 96 * H,
  );
  db.run("UPDATE items SET done_at = ? WHERE id = 4", [NOW - H]);
  return db;
}

export async function renderApp(
  overrides: Partial<AppProps> = {},
  db = seededDb(),
) {
  let quit = false;
  const store = createStore(
    db,
    { now: () => NOW },
    { origin: { repo: "/src/nudgy", branch: "main" } },
  );
  const t = await testRender(
    <App
      store={store}
      repo="/src/nudgy"
      refreshMs={60_000}
      onQuit={() => (quit = true)}
      {...overrides}
    />,
    { width: 100, height: 24 },
  );
  const step = async (fn: () => unknown) => {
    await act(async () => {
      await fn();
    });
    await t.renderOnce();
  };
  await step(() => {});
  const keys = t.mockInput;
  // The test renderer has no terminal to show a pointer shape, so record what the app asks for
  const pointers: string[] = [];
  const setPointer = t.renderer.setMousePointer.bind(t.renderer);
  t.renderer.setMousePointer = (style) => {
    pointers.push(style);
    setPointer(style);
  };
  return {
    db,
    store,
    frame: () => t.captureCharFrame(),
    // Markdown highlighting is async, so the detail body appears a few frames after selection
    waitForText: async (text: string) => {
      for (let i = 0; i < 100 && !t.captureCharFrame().includes(text); i++) {
        await step(() => Bun.sleep(10));
      }
      if (!t.captureCharFrame().includes(text))
        throw new Error(`"${text}" never appeared:\n${t.captureCharFrame()}`);
    },
    press: (key: string, modifiers?: { shift?: boolean; ctrl?: boolean }) =>
      step(() => keys.pressKey(key, modifiers)),
    arrow: (dir: "up" | "down") => step(() => keys.pressArrow(dir)),
    tab: (shift = false) => step(() => keys.pressTab({ shift })),
    type: (text: string) => step(() => keys.typeText(text)),
    enter: () => step(() => keys.pressEnter()),
    drag: (fromX: number, toX: number, y = 5) =>
      step(() => t.mockMouse.drag(fromX, y, toX, y)),
    pointer: () => pointers.at(-1) ?? "default",
    mouse: (fn: (mouse: typeof t.mockMouse) => Promise<void>) =>
      step(() => fn(t.mockMouse)),
    // ESC followed at once by a key is how terminals spell Alt+key; a real press has a gap
    escape: async () => {
      await step(() => keys.pressEscape());
      await step(() => Bun.sleep(60));
    },
    step,
    quit: () => quit,
    destroy: () => act(async () => t.renderer.destroy()),
  };
}

export function selectedLine(frame: string): string {
  return frame.split("\n").find((l) => l.includes("›")) ?? "";
}
