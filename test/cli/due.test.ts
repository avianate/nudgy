import { expect, test } from "bun:test";
import { join } from "node:path";
import { openDb } from "../../src/core/db";
import { createItem } from "../../src/core/items";
import { nudgyHome } from "./helpers";

// Tue 2026-09-22 10:00 in America/New_York
const NOW = Date.parse("2026-09-22T14:00:00Z");
const H = 3_600_000;
const env = { NUDGY_NOW: String(NOW) };

function seed() {
  const ctx = nudgyHome();
  const db = openDb(join(ctx.home, "nudgy.db"));
  createItem(
    db,
    { body: "overdue", repo: null, branch: null, remindAt: NOW - 2 * H },
    NOW - 72 * H,
  );
  createItem(
    db,
    { body: "in three hours", repo: null, branch: null, remindAt: NOW + 3 * H },
    NOW - 72 * H,
  );
  createItem(
    db,
    {
      body: "in twenty hours",
      repo: null,
      branch: null,
      remindAt: NOW + 20 * H,
    },
    NOW - 72 * H,
  );
  createItem(
    db,
    { body: "in two days", repo: null, branch: null, remindAt: NOW + 48 * H },
    NOW - 72 * H,
  );
  createItem(
    db,
    { body: "created yesterday", repo: null, branch: null },
    NOW - 24 * H,
  );
  createItem(db, { body: "created today", repo: null, branch: null }, NOW - H);
  db.close();
  return ctx;
}

const titles = (stdout: string) =>
  (JSON.parse(stdout) as { title: string }[]).map((i) => i.title);

test("due lists overdue and the next 24h, overdue first", () => {
  const { nudgy } = seed();
  expect(titles(nudgy(["due", "--json"], { env }).stdout)).toEqual([
    "overdue",
    "in three hours",
    "in twenty hours",
  ]);
});

test("the hidden --within narrows the upcoming window", () => {
  const { nudgy } = seed();
  expect(
    titles(nudgy(["due", "--within", "4", "--json"], { env }).stdout),
  ).toEqual(["overdue", "in three hours"]);
});

test("--within must be a positive number", () => {
  expect(seed().nudgy(["due", "--within", "soon"], { env }).code).toBe(2);
});

test("with nothing due, stdout is empty and the note goes to stderr", () => {
  const { nudgy } = nudgyHome();
  const result = nudgy(["due"], { env });
  expect(result.code).toBe(0);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("nothing due");
});

test("today lists items created today and reminders due today, in time order", () => {
  const { nudgy } = seed();
  expect(titles(nudgy(["today", "--json"], { env }).stdout)).toEqual([
    "overdue",
    "created today",
    "in three hours",
  ]);
});

test("yesterday and tomorrow use local day boundaries", () => {
  const { nudgy } = seed();
  expect(titles(nudgy(["yesterday", "--json"], { env }).stdout)).toEqual([
    "created yesterday",
  ]);
  expect(titles(nudgy(["tomorrow", "--json"], { env }).stdout)).toEqual([
    "in twenty hours",
  ]);
});

test("day boundaries hold on a DST change day", () => {
  const { home, nudgy } = nudgyHome();
  // Sun 2026-11-01 is 25 hours long in New York
  const dstNoon = new Date("2026-11-01T12:00:00").getTime();
  const db = openDb(join(home, "nudgy.db"));
  createItem(
    db,
    { body: "just after midnight", repo: null, branch: null },
    new Date("2026-11-01T00:30:00").getTime(),
  );
  createItem(
    db,
    { body: "late evening", repo: null, branch: null },
    new Date("2026-11-01T23:30:00").getTime(),
  );
  createItem(
    db,
    { body: "next day", repo: null, branch: null },
    new Date("2026-11-02T00:30:00").getTime(),
  );
  db.close();
  expect(
    titles(
      nudgy(["today", "--json"], { env: { NUDGY_NOW: String(dstNoon) } })
        .stdout,
    ),
  ).toEqual(["just after midnight", "late evening"]);
});
