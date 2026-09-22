import * as chrono from "chrono-node";
import { InputError } from "./errors";

export type Rule =
  | { kind: "weekly"; days: readonly number[]; time: string }
  | { kind: "days"; every: number; time: string; start: string }
  | { kind: "interval"; hours: number; anchor: number };

export const GRAMMAR = `recurrence must be one of:
  every day [at <time>]
  every weekday [at <time>]
  every <dayname>[,<dayname>...] [at <time>]
  every week [at <time>]
  every <N> hours
  every <N> days [at <time>]`;

const DAY_NAMES: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

const DEFAULT_TIME = "09:00";

function reject(input: string, why?: string): never {
  throw new InputError(
    `can't understand "${input.trim()}"${why ? ` (${why})` : ""}; ${GRAMMAR}`,
  );
}

function parseTime(text: string, input: string): string {
  const t = text.trim().replace(/^at\s+/, "");
  if (!t) return DEFAULT_TIME;
  const [r] = chrono.parse(t, new Date(0));
  if (
    r?.index !== 0 ||
    r.text.length !== t.length ||
    !r.start.isCertain("hour") ||
    r.start.isCertain("day")
  ) {
    reject(input, `"${t}" is not a time of day`);
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(r.start.get("hour") ?? 0)}:${pad(r.start.get("minute") ?? 0)}`;
}

export function atTime(dayMs: number, time: string): Date {
  const d = new Date(dayMs);
  const [h, m] = time.split(":").map(Number);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);
}

export function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isRecurrence(text: string): boolean {
  return /^\s*every\b/i.test(text);
}

export function parseRecurrence(input: string, now: number): Rule {
  const text = input.trim().toLowerCase().replace(/\s+/g, " ");
  const m = text.match(/^every (.*)$/);
  if (!m?.[1]) reject(input);
  const rest = m[1];

  const hours = rest.match(/^(\d+) hours?(.*)$/);
  if (hours) {
    const n = Number(hours[1]);
    if (n < 1) reject(input, "N must be at least 1");
    if (hours[2]?.trim()) reject(input, "hour intervals take no time of day");
    return { kind: "interval", hours: n, anchor: now };
  }

  const days = rest.match(/^(\d+) days?(.*)$/);
  if (days) {
    const n = Number(days[1]);
    if (n < 1) reject(input, "N must be at least 1");
    const time = parseTime(days[2] ?? "", input);
    const today = atTime(now, time);
    const first =
      today.getTime() > now
        ? today
        : atTime(new Date(today).setDate(today.getDate() + 1), time);
    return { kind: "days", every: n, time, start: localDate(first) };
  }

  const head = rest.match(
    /^(day|weekdays?|week|[a-z]+(?: ?, ?[a-z]+)*)\b(.*)$/,
  );
  if (!head?.[1]) reject(input);
  const time = parseTime(head[2] ?? "", input);
  if (head[1] === "day")
    return { kind: "weekly", days: [0, 1, 2, 3, 4, 5, 6], time };
  if (head[1].startsWith("weekday"))
    return { kind: "weekly", days: [1, 2, 3, 4, 5], time };
  if (head[1] === "week")
    return { kind: "weekly", days: [new Date(now).getDay()], time };
  const names = head[1].split(",").map((s) => s.trim());
  const nums = names.map(
    (n) => DAY_NAMES[n] ?? reject(input, `"${n}" is not a day`),
  );
  return { kind: "weekly", days: [...new Set(nums)].sort(), time };
}

const HOUR = 3_600_000;

function addDays(ms: number, n: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
}

function midnight(ms: number): number {
  return addDays(ms, 0);
}

function parseLocalDate(s: string): number {
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d).getTime();
}

// Calendar days between two local midnights; rounding absorbs 23/25-hour DST days
function daysBetween(fromMidnight: number, toMidnight: number): number {
  return Math.round((toMidnight - fromMidnight) / (24 * HOUR));
}

export function nextOccurrence(rule: Rule, after: number): number {
  switch (rule.kind) {
    case "weekly": {
      for (let i = 0; i <= 7; i++) {
        const day = addDays(after, i);
        const t = atTime(day, rule.time).getTime();
        if (rule.days.includes(new Date(day).getDay()) && t > after) return t;
      }
      throw new Error(`weekly rule with no days: ${JSON.stringify(rule)}`);
    }
    case "days": {
      const start = parseLocalDate(rule.start);
      const k = Math.max(
        0,
        Math.floor(daysBetween(start, midnight(after)) / rule.every),
      );
      for (let j = k; ; j++) {
        const t = atTime(addDays(start, j * rule.every), rule.time).getTime();
        if (t > after) return t;
      }
    }
    case "interval": {
      const step = rule.hours * HOUR;
      const k = Math.max(1, Math.floor((after - rule.anchor) / step) + 1);
      return rule.anchor + k * step;
    }
  }
}

export function previousOccurrence(
  rule: Rule,
  atOrBefore: number,
): number | null {
  switch (rule.kind) {
    case "weekly": {
      for (let i = 0; i <= 7; i++) {
        const day = addDays(atOrBefore, -i);
        const t = atTime(day, rule.time).getTime();
        if (rule.days.includes(new Date(day).getDay()) && t <= atOrBefore)
          return t;
      }
      return null;
    }
    case "days": {
      const start = parseLocalDate(rule.start);
      const diff = daysBetween(start, midnight(atOrBefore));
      for (let j = Math.floor(diff / rule.every); j >= 0; j--) {
        const t = atTime(addDays(start, j * rule.every), rule.time).getTime();
        if (t <= atOrBefore) return t;
      }
      return null;
    }
    case "interval": {
      const step = rule.hours * HOUR;
      const k = Math.floor((atOrBefore - rule.anchor) / step);
      return k >= 1 ? rule.anchor + k * step : null;
    }
  }
}

// One outstanding instance: an unacknowledged reminder jumps to the latest occurrence, never stacks
export function rollForward(rule: Rule, remindAt: number, now: number): number {
  const latest = previousOccurrence(rule, now);
  return latest !== null && latest > remindAt ? latest : remindAt;
}
