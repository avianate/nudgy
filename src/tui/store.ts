import type { Database } from "bun:sqlite";
import { parseReminder } from "../cli/reminder";
import type { Clock } from "../core/clock";
import { type Config, DEFAULT_CONFIG } from "../core/config";
import type { GitContext } from "../core/git";
import {
  clearReminder,
  createItem,
  dayItems,
  deleteItem,
  dueItems,
  getItem,
  type Item,
  listItems,
  rescheduleItem,
  searchItems,
  setReminder,
  updateBody,
} from "../core/items";
import { completeItem } from "../core/lifecycle";
import { parseWhen } from "../core/when";

export type Tab = "due" | "today" | "all" | "done";
export const TABS: Tab[] = ["due", "today", "all", "done"];

export type Filter = { repo?: string; query?: string };

export type Store = {
  now(): number;
  load(tab: Tab, filter: Filter): Item[];
  get(id: number): Item | null;
  complete(id: number): Item | null;
  snooze(id: number): Item | null;
  remind(id: number, text: string): Item | null;
  remove(id: number): void;
  add(body: string): Item;
  setBody(id: number, body: string): Item | null;
};

const DAY = 24 * 3_600_000;

export function createStore(
  db: Database,
  clock: Clock,
  options: {
    config?: () => Config;
    origin?: GitContext;
    onChange?: () => void;
  } = {},
): Store {
  const config = options.config ?? (() => DEFAULT_CONFIG);
  const origin = options.origin ?? { repo: null, branch: null };
  // Runs after every change so the shell prompt's overdue count follows the TUI immediately
  const changed = <T>(result: T): T => {
    options.onChange?.();
    return result;
  };

  const slice = (tab: Tab, now: number): Item[] => {
    if (tab === "due") return dueItems(db, now + DAY);
    if (tab === "done") return listItems(db, { done: true });
    if (tab === "all") return listItems(db);
    const d = new Date(now);
    const start = new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
    ).getTime();
    const end = new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate() + 1,
    ).getTime();
    return dayItems(db, { start, end });
  };

  return {
    now: () => clock.now(),
    load(tab, filter) {
      let items = slice(tab, clock.now());
      if (filter.repo) items = items.filter((i) => i.repo === filter.repo);
      if (filter.query?.trim()) {
        const hits = new Set(searchItems(db, filter.query).map((i) => i.id));
        items = items.filter((i) => hits.has(i.id));
      }
      return items;
    },
    get: (id) => getItem(db, id),
    complete(id) {
      const item = getItem(db, id);
      return changed(item ? completeItem(db, item, clock.now()) : null);
    },
    snooze(id) {
      const now = clock.now();
      return changed(
        rescheduleItem(db, id, parseWhen(config().defaultSnooze, now), now),
      );
    },
    remind(id, text) {
      const now = clock.now();
      if (text.trim().toLowerCase() === "clear")
        return changed(clearReminder(db, id, now));
      return changed(setReminder(db, id, parseReminder(text, now), now));
    },
    remove: (id) => {
      changed(deleteItem(db, id));
    },
    add: (body) => changed(createItem(db, { body, ...origin }, clock.now())),
    setBody: (id, body) => changed(updateBody(db, id, body, clock.now())),
  };
}
