import { expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "./db";
import { createItem } from "./items";
import { refreshStatus } from "./status";

const NOW = 1_000_000_000;

test("refreshStatus writes the overdue count, ignoring upcoming and done items", () => {
  const dir = mkdtempSync(join(tmpdir(), "nudgy-status-"));
  const db = openDb(":memory:");
  createItem(
    db,
    { body: "overdue", repo: null, branch: null, remindAt: NOW - 1 },
    0,
  );
  createItem(
    db,
    { body: "due now", repo: null, branch: null, remindAt: NOW },
    0,
  );
  createItem(
    db,
    { body: "upcoming", repo: null, branch: null, remindAt: NOW + 1 },
    0,
  );
  createItem(
    db,
    { body: "done", repo: null, branch: null, remindAt: NOW - 1 },
    0,
  );
  db.run("UPDATE items SET done_at = 1 WHERE id = 4");
  expect(refreshStatus(db, join(dir, "status"), NOW)).toBe(2);
  expect(readFileSync(join(dir, "status"), "utf8")).toBe("2\n");
  expect(readdirSync(dir)).toEqual(["status"]);
});
