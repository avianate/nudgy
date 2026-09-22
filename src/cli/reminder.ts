import type { Reminder } from "../core/items";
import {
  isRecurrence,
  nextOccurrence,
  parseRecurrence,
} from "../core/recurrence";
import { parseWhen } from "../core/when";

export function parseReminder(text: string, now: number): Reminder {
  if (!isRecurrence(text)) return { remindAt: parseWhen(text, now) };
  const rule = parseRecurrence(text, now);
  return {
    remindAt: nextOccurrence(rule, now),
    recurrence: JSON.stringify(rule),
    recurrenceText: text.trim().replace(/\s+/g, " "),
  };
}
