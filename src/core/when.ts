import * as chrono from "chrono-node";
import { InputError } from "./errors";

const UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};
const DEFAULT_HOUR = 9;

export function parseDuration(input: string): number | null {
  const text = input.trim();
  if (!/^(\d+[smhdw])+$/.test(text)) return null;
  let total = 0;
  for (const [, n, unit] of text.matchAll(/(\d+)([smhdw])/g))
    total += Number(n) * (UNIT_MS[unit as string] as number);
  return total > 0 ? total : null;
}

export function parseWhen(input: string, now: number): number {
  const text = input.trim();
  const duration = parseDuration(text);
  if (duration !== null) return now + duration;

  const [result] = chrono.parse(text, new Date(now), { forwardDate: true });
  // chrono matches dates inside free text; demanding the whole input keeps "next blursday 9am" from becoming "9am"
  if (result?.index !== 0 || result.text.length !== text.length) {
    throw new InputError(
      `can't understand "${input}" as a time (try "in 2 hours", "tomorrow 9am", "friday 4pm")`,
    );
  }
  const date = result.start.date();
  if (!/^in\s/i.test(text) && !result.start.isCertain("hour"))
    date.setHours(DEFAULT_HOUR, 0, 0, 0);
  const ms = date.getTime();
  if (ms < now - 60_000) throw new InputError(`"${input}" is in the past`);
  return ms;
}
