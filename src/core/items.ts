import type { Database } from "bun:sqlite";

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
