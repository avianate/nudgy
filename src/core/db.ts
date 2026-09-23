import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const MIGRATIONS = [
  `CREATE TABLE items (
    id              INTEGER PRIMARY KEY,
    body            TEXT    NOT NULL,
    repo            TEXT,
    branch          TEXT,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    remind_at       INTEGER,
    recurrence      TEXT,
    recurrence_text TEXT,
    last_alerted_at INTEGER,
    done_at         INTEGER
  );
  CREATE INDEX items_due  ON items (remind_at) WHERE done_at IS NULL;
  CREATE INDEX items_repo ON items (repo);
  CREATE VIRTUAL TABLE items_fts USING fts5 (body, content='items', content_rowid='id');
  CREATE TRIGGER items_ai AFTER INSERT ON items BEGIN
    INSERT INTO items_fts (rowid, body) VALUES (new.id, new.body);
  END;
  CREATE TRIGGER items_ad AFTER DELETE ON items BEGIN
    INSERT INTO items_fts (items_fts, rowid, body) VALUES ('delete', old.id, old.body);
  END;
  CREATE TRIGGER items_au AFTER UPDATE OF body ON items BEGIN
    INSERT INTO items_fts (items_fts, rowid, body) VALUES ('delete', old.id, old.body);
    INSERT INTO items_fts (rowid, body) VALUES (new.id, new.body);
  END;`,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export function openDb(path: string): Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true, strict: true });
  db.run("PRAGMA busy_timeout = 5000");
  if (path !== ":memory:") db.run("PRAGMA journal_mode = WAL");
  migrate(db);
  return db;
}

function migrate(db: Database) {
  const { user_version: current } = db.query("PRAGMA user_version").get() as {
    user_version: number;
  };
  if (current > SCHEMA_VERSION) {
    throw new Error(
      `database schema v${current} is newer than this nudgy (v${SCHEMA_VERSION}); upgrade nudgy`,
    );
  }
  for (let v = current; v < SCHEMA_VERSION; v++) {
    db.transaction(() => {
      db.run(MIGRATIONS[v] as string);
      db.run(`PRAGMA user_version = ${v + 1}`);
    })();
  }
}
