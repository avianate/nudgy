import { basename } from "node:path";
import type { Item } from "../core/items";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export function title(body: string): string {
  return (body.split("\n")[0] ?? "").trim();
}

export function relative(ms: number, now: number): string {
  const diff = ms - now;
  const abs = Math.abs(diff);
  if (abs < MIN) return "now";
  const amount =
    abs < HOUR
      ? `${Math.floor(abs / MIN)}m`
      : abs < DAY
        ? `${Math.floor(abs / HOUR)}h`
        : `${Math.floor(abs / DAY)}d`;
  return diff > 0 ? `in ${amount}` : `${amount} ago`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function absolute(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${WEEKDAYS[d.getDay()]} ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function repoLabel(item: Pick<Item, "repo" | "branch">): string {
  if (!item.repo) return "";
  return item.branch
    ? `${basename(item.repo)}@${item.branch}`
    : basename(item.repo);
}

export function listLine(item: Item, now: number): string {
  const when =
    item.remindAt !== null
      ? `⏰ ${relative(item.remindAt, now)}`
      : relative(item.createdAt, now);
  const repo = repoLabel(item);
  const recurring = item.recurrenceText ? " ↻" : "";
  const done = item.doneAt !== null ? "✓ " : "";
  return `${String(item.id).padStart(4)}  ${done}${truncate(title(item.body), 60)}${repo ? `  [${repo}]` : ""}  ${when}${recurring}`;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function detail(item: Item, now: number): string {
  const lines = [`#${item.id}  ${title(item.body)}`, ""];
  if (item.repo)
    lines.push(
      `repo     ${item.repo}${item.branch ? ` @ ${item.branch}` : ""}`,
    );
  lines.push(`created  ${absolute(item.createdAt)}`);
  if (item.remindAt !== null)
    lines.push(
      `remind   ${absolute(item.remindAt)} (${relative(item.remindAt, now)})`,
    );
  if (item.recurrenceText) lines.push(`repeats  ${item.recurrenceText}`);
  if (item.doneAt !== null) lines.push(`done     ${absolute(item.doneAt)}`);
  const rest = item.body.split("\n").slice(1).join("\n").trim();
  if (rest) lines.push("", rest);
  return lines.join("\n");
}

const iso = (ms: number | null) =>
  ms === null ? null : new Date(ms).toISOString();

export function toJson(item: Item) {
  return {
    id: item.id,
    title: title(item.body),
    body: item.body,
    repo: item.repo,
    branch: item.branch,
    createdAt: iso(item.createdAt),
    updatedAt: iso(item.updatedAt),
    remindAt: iso(item.remindAt),
    recurrence: item.recurrence === null ? null : JSON.parse(item.recurrence),
    recurrenceText: item.recurrenceText,
    lastAlertedAt: iso(item.lastAlertedAt),
    doneAt: iso(item.doneAt),
  };
}
