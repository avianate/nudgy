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
