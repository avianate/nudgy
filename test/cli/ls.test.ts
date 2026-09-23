import { expect, test } from "bun:test";
import { join } from "node:path";
import { openDb } from "../../src/core/db";
import { createItem } from "../../src/core/items";
import { makeRepo, nudgyHome, tempDir } from "./helpers";

const NOW = Date.parse("2026-09-22T18:00:00Z");
const HOUR = 3_600_000;
const env = { NUDGY_NOW: String(NOW) };

function seed() {
  const ctx = nudgyHome();
  const repoA = makeRepo("main");
  const repoB = makeRepo("dev");
  const db = openDb(join(ctx.home, "nudgy.db"));
  createItem(
    db,
    { body: "note in A\nwith details", repo: repoA, branch: "main" },
    NOW - 3 * HOUR,
  );
  createItem(
    db,
    { body: "note in B", repo: repoB, branch: "dev" },
    NOW - 2 * HOUR,
  );
  createItem(
    db,
    {
      body: "reminder in A",
      repo: repoA,
      branch: "main",
      remindAt: NOW + 2 * HOUR,
    },
    NOW - HOUR,
  );
  const done = createItem(
    db,
    { body: "finished", repo: null, branch: null },
    NOW - HOUR,
  );
  db.run("UPDATE items SET done_at = ? WHERE id = ?", [NOW, done.id]);
  db.close();
  return { ...ctx, repoA, repoB };
}

function ids(stdout: string) {
  return (JSON.parse(stdout) as { id: number }[]).map((i) => i.id);
}

test("ls lists open items newest first, hiding done ones", () => {
  const { nudgy } = seed();
  const result = nudgy(["ls"], { env });
  expect(result.code).toBe(0);
  const lines = result.stdout.trimEnd().split("\n");
  expect(lines).toHaveLength(3);
  expect(lines[0]).toContain("reminder in A");
  expect(lines[0]).toContain("in 2h");
  expect(lines[2]).toContain("note in A");
  expect(lines[2]).toContain("3h ago");
  expect(lines[2]).not.toContain("with details");
});

test("ls --done lists only completed items", () => {
  const { nudgy } = seed();
  expect(ids(nudgy(["ls", "--done", "--json"], { env }).stdout)).toEqual([4]);
});

test("ls --reminders lists only items with a reminder", () => {
  const { nudgy } = seed();
  expect(ids(nudgy(["ls", "--reminders", "--json"], { env }).stdout)).toEqual([
    3,
  ]);
});

test("ls --here lists only items from the current repo", () => {
  const { nudgy, repoA, repoB } = seed();
  expect(
    ids(nudgy(["ls", "--here", "--json"], { env, cwd: join(repoA) }).stdout),
  ).toEqual([3, 1]);
  expect(
    ids(nudgy(["ls", "--here", "--json"], { env, cwd: repoB }).stdout),
  ).toEqual([2]);
});

test("ls --here outside a repo is an error", () => {
  const { nudgy } = seed();
  const result = nudgy(["ls", "--here"], { env, cwd: tempDir() });
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("not inside a git repo");
});

test("ls --json has a stable shape", () => {
  const { nudgy, repoA } = seed();
  const items = JSON.parse(
    nudgy(["ls", "--reminders", "--json"], { env }).stdout,
  );
  expect(items).toEqual([
    {
      id: 3,
      title: "reminder in A",
      body: "reminder in A",
      repo: repoA,
      branch: "main",
      createdAt: "2026-09-22T17:00:00.000Z",
      updatedAt: "2026-09-22T17:00:00.000Z",
      remindAt: "2026-09-22T20:00:00.000Z",
      recurrence: null,
      recurrenceText: null,
      lastAlertedAt: null,
      doneAt: null,
    },
  ]);
});

test("ls with nothing to show says so", () => {
  const { nudgy } = nudgyHome();
  const result = nudgy(["ls"]);
  expect(result.code).toBe(0);
  expect(result.stdout).toBe("no items\n");
  expect(nudgy(["ls", "--json"]).stdout).toBe("[]\n");
});

test("show prints absolute times and the full body", () => {
  const { nudgy, repoA } = seed();
  const result = nudgy(["show", "1"], { env });
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("#1  note in A");
  expect(result.stdout).toContain(repoA);
  expect(result.stdout).toContain("Tue 2026-09-22 11:00");
  expect(result.stdout).toContain("with details");
});

test("show includes the reminder in absolute and relative form", () => {
  const { nudgy } = seed();
  expect(nudgy(["show", "3"], { env }).stdout).toContain(
    "Tue 2026-09-22 16:00 (in 2h)",
  );
});

test("show --json prints one item", () => {
  const { nudgy } = seed();
  expect(
    JSON.parse(nudgy(["show", "2", "--json"], { env }).stdout),
  ).toMatchObject({ id: 2, title: "note in B" });
});

test("show on a missing id exits 1", () => {
  const { nudgy } = seed();
  const result = nudgy(["show", "99"], { env });
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("no item #99");
});

test("show without a numeric id is a usage error", () => {
  const { nudgy } = seed();
  expect(nudgy(["show"], { env }).code).toBe(2);
  expect(nudgy(["show", "abc"], { env }).code).toBe(2);
});
