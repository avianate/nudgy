import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, SCHEMA_VERSION } from "./db";

function tempDbPath() {
  return join(mkdtempSync(join(tmpdir(), "jot-db-")), "nested", "jot.db");
}

test("opening a fresh database runs migrations to the current version", () => {
  const db = openDb(tempDbPath());
  expect(db.query("PRAGMA user_version").get()).toEqual({
    user_version: SCHEMA_VERSION,
  });
  const names = db
    .query(
      "SELECT name FROM sqlite_master WHERE type IN ('table','index','trigger') ORDER BY name",
    )
    .all()
    .map((r) => (r as { name: string }).name);
  expect(names).toEqual(
    expect.arrayContaining([
      "items",
      "items_due",
      "items_repo",
      "items_fts",
      "items_ai",
      "items_ad",
      "items_au",
    ]),
  );
});

test("reopening an existing database is a no-op", () => {
  const path = tempDbPath();
  const first = openDb(path);
  first.run(
    "INSERT INTO items (body, created_at, updated_at) VALUES ('keep me', 1, 1)",
  );
  first.close();
  const second = openDb(path);
  expect(second.query("SELECT body FROM items").all()).toEqual([
    { body: "keep me" },
  ]);
  expect(second.query("PRAGMA user_version").get()).toEqual({
    user_version: SCHEMA_VERSION,
  });
});

test("file databases use WAL and a busy timeout", () => {
  const db = openDb(tempDbPath());
  expect(db.query("PRAGMA journal_mode").get()).toEqual({
    journal_mode: "wal",
  });
  expect(db.query("PRAGMA busy_timeout").get()).toEqual({ timeout: 5000 });
});

test("the FTS index follows inserts, body updates and deletes", () => {
  const db = openDb(":memory:");
  const match = (q: string) =>
    db
      .query("SELECT rowid FROM items_fts WHERE items_fts MATCH ?")
      .all(q)
      .map((r) => (r as { rowid: number }).rowid);
  db.run(
    "INSERT INTO items (id, body, created_at, updated_at) VALUES (1, 'migration landed', 1, 1)",
  );
  expect(match("migration")).toEqual([1]);
  db.run("UPDATE items SET body = 'flaky suite' WHERE id = 1");
  expect(match("migration")).toEqual([]);
  expect(match("flaky")).toEqual([1]);
  db.run("DELETE FROM items WHERE id = 1");
  expect(match("flaky")).toEqual([]);
});

test("the database refuses to open a schema newer than this binary knows", () => {
  const path = tempDbPath();
  openDb(path).run(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
  expect(() => openDb(path)).toThrow(/newer/);
});
