import * as chrono from "chrono-node";
import { InputError } from "./errors";

export type Rule =
  | { kind: "weekly"; days: number[]; time: string }
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
