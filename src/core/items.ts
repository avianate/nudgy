import type { Database } from "bun:sqlite";
import { basename } from "node:path";

export type Item = {
  id: number;
  body: string;
  repo: string | null;
  branch: string | null;
  createdAt: number;
  updatedAt: number;
  remindAt: number | null;
  recurrence: string | null;
  recurrenceText: string | null;
  lastAlertedAt: number | null;
  doneAt: number | null;
};

export function title(body: string): string {
  return (body.split("\n")[0] ?? "").trim();
}

export function repoLabel(item: Pick<Item, "repo" | "branch">): string {
  if (!item.repo) return "";
  return item.branch
    ? `${basename(item.repo)}@${item.branch}`
    : basename(item.repo);
}

export type NewItem = {
  body: string;
  repo: string | null;
  branch: string | null;
  remindAt?: number | null;
  recurrence?: string | null;
  recurrenceText?: string | null;
};

const COLUMNS = `id, body, repo, branch, created_at AS createdAt, updated_at AS updatedAt,
  remind_at AS remindAt, recurrence, recurrence_text AS recurrenceText,
  last_alerted_at AS lastAlertedAt, done_at AS doneAt`;

export function createItem(db: Database, item: NewItem, now: number): Item {
  return db
    .query(
      `INSERT INTO items (body, repo, branch, created_at, updated_at, remind_at, recurrence, recurrence_text)
       VALUES ($body, $repo, $branch, $now, $now, $remindAt, $recurrence, $recurrenceText)
       RETURNING ${COLUMNS}`,
    )
    .get({
      body: item.body,
      repo: item.repo,
      branch: item.branch,
      now,
      remindAt: item.remindAt ?? null,
      recurrence: item.recurrence ?? null,
      recurrenceText: item.recurrenceText ?? null,
    }) as Item;
}

export function getItem(db: Database, id: number): Item | null {
  return db
    .query(`SELECT ${COLUMNS} FROM items WHERE id = $id`)
    .get({ id }) as Item | null;
}

export type ListFilter = {
  repo?: string;
  done?: boolean;
  remindersOnly?: boolean;
};

export function listItems(db: Database, filter: ListFilter = {}): Item[] {
  return db
    .query(
      `SELECT ${COLUMNS} FROM items
       WHERE (done_at IS NOT NULL) = $done
         AND ($repo IS NULL OR repo = $repo)
         AND ($remindersOnly = 0 OR remind_at IS NOT NULL)
       ORDER BY created_at DESC, id DESC`,
    )
    .all({
      done: filter.done ? 1 : 0,
      repo: filter.repo ?? null,
      remindersOnly: filter.remindersOnly ? 1 : 0,
    }) as Item[];
}

export function updateBody(
  db: Database,
  id: number,
  body: string,
  now: number,
): Item | null {
  return db
    .query(
      `UPDATE items SET body = $body, updated_at = $now WHERE id = $id RETURNING ${COLUMNS}`,
    )
    .get({ id, body, now }) as Item | null;
}

export function deleteItem(db: Database, id: number): boolean {
  return db.query("DELETE FROM items WHERE id = $id").run({ id }).changes > 0;
}

// Only word tokens reach FTS5, each quoted and prefix-matched, so user input can never be FTS syntax
export function ftsQuery(input: string): string | null {
  const words = input.match(/[\p{L}\p{N}_]+/gu);
  return words ? words.map((w) => `"${w}"*`).join(" ") : null;
}

export function searchItems(
  db: Database,
  query: string,
  filter: { repo?: string } = {},
): Item[] {
  const match = ftsQuery(query);
  if (!match) return [];
  return db
    .query(
      `SELECT ${COLUMNS} FROM items
       WHERE id IN (SELECT rowid FROM items_fts WHERE items_fts MATCH $match)
         AND ($repo IS NULL OR repo = $repo)
       ORDER BY created_at DESC, id DESC`,
    )
    .all({ match, repo: filter.repo ?? null }) as Item[];
}

export type Reminder = {
  remindAt: number;
  recurrence?: string | null;
  recurrenceText?: string | null;
};

export function setReminder(
  db: Database,
  id: number,
  reminder: Reminder,
  now: number,
): Item | null {
  return db
    .query(
      `UPDATE items SET remind_at = $remindAt, recurrence = $recurrence, recurrence_text = $recurrenceText,
         last_alerted_at = NULL, done_at = NULL, updated_at = $now
       WHERE id = $id RETURNING ${COLUMNS}`,
    )
    .get({
      id,
      now,
      remindAt: reminder.remindAt,
      recurrence: reminder.recurrence ?? null,
      recurrenceText: reminder.recurrenceText ?? null,
    }) as Item | null;
}

export function clearReminder(
  db: Database,
  id: number,
  now: number,
): Item | null {
  return db
    .query(
      `UPDATE items SET remind_at = NULL, recurrence = NULL, recurrence_text = NULL,
         last_alerted_at = NULL, updated_at = $now
       WHERE id = $id RETURNING ${COLUMNS}`,
    )
    .get({ id, now }) as Item | null;
}

export function markDone(db: Database, id: number, now: number): Item | null {
  return db
    .query(
      `UPDATE items SET done_at = $now, updated_at = $now WHERE id = $id RETURNING ${COLUMNS}`,
    )
    .get({ id, now }) as Item | null;
}

export function reopenItem(db: Database, id: number, now: number): Item | null {
  return db
    .query(
      `UPDATE items SET done_at = NULL, last_alerted_at = NULL, updated_at = $now WHERE id = $id RETURNING ${COLUMNS}`,
    )
    .get({ id, now }) as Item | null;
}

export function rescheduleItem(
  db: Database,
  id: number,
  remindAt: number,
  now: number,
): Item | null {
  return db
    .query(
      `UPDATE items SET remind_at = $remindAt, last_alerted_at = NULL, updated_at = $now
       WHERE id = $id RETURNING ${COLUMNS}`,
    )
    .get({ id, remindAt, now }) as Item | null;
}

export function dueItems(db: Database, until: number): Item[] {
  return db
    .query(
      `SELECT ${COLUMNS} FROM items
       WHERE done_at IS NULL AND remind_at IS NOT NULL AND remind_at <= $until
       ORDER BY remind_at, id`,
    )
    .all({ until }) as Item[];
}

export function dayItems(
  db: Database,
  window: { start: number; end: number; repo?: string },
): Item[] {
  return db
    .query(
      `SELECT ${COLUMNS} FROM items
       WHERE ((created_at >= $start AND created_at < $end) OR (remind_at >= $start AND remind_at < $end))
         AND ($repo IS NULL OR repo = $repo)
       ORDER BY CASE WHEN remind_at >= $start AND remind_at < $end THEN remind_at ELSE created_at END, id`,
    )
    .all({
      start: window.start,
      end: window.end,
      repo: window.repo ?? null,
    }) as Item[];
}

export function markAlerted(db: Database, ids: number[], now: number): void {
  db.query(
    "UPDATE items SET last_alerted_at = $now WHERE id IN (SELECT value FROM json_each($ids))",
  ).run({
    now,
    ids: JSON.stringify(ids),
  });
}
