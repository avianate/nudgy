import { InputError } from "../core/errors";
import type { Reminder } from "../core/items";
import { parseWhen } from "../core/when";

export function parseReminder(text: string, now: number): Reminder {
  if (/^every\b/i.test(text.trim()))
    throw new InputError("recurring reminders are not supported yet");
  return { remindAt: parseWhen(text, now) };
}
