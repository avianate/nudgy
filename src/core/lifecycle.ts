import type { Database } from "bun:sqlite";
import { dueItems, type Item, markDone, rescheduleItem } from "./items";
import { nextOccurrence, type Rule, rollForward } from "./recurrence";

export function ruleOf(item: Item): Rule | null {
  return item.recurrence === null
    ? null
    : (JSON.parse(item.recurrence) as Rule);
}

// Done on a recurring item means "this occurrence is handled": schedule the next one strictly after now
export function completeItem(
  db: Database,
  item: Item,
  now: number,
): Item | null {
  const rule = ruleOf(item);
  if (!rule) return markDone(db, item.id, now);
  return rescheduleItem(db, item.id, nextOccurrence(rule, now), now);
}

export function rollForwardDue(db: Database, now: number): void {
  for (const item of dueItems(db, now)) {
    const rule = ruleOf(item);
    if (!rule || item.remindAt === null) continue;
    const next = rollForward(rule, item.remindAt, now);
    if (next !== item.remindAt) rescheduleItem(db, item.id, next, now);
  }
}
