import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { openDb } from "../../src/core/db";
import { nudgyHome } from "./helpers";

const local = (s: string) => new Date(s).getTime();
const at = (s: string) => ({ NUDGY_NOW: String(local(s)) });
const iso = (s: string) => new Date(s).toISOString();

function show(nudgy: ReturnType<typeof nudgyHome>["nudgy"], id = 1) {
  return JSON.parse(nudgy(["show", String(id), "--json"]).stdout);
}

test("-r every weekday 9am schedules the next weekday 9am and keeps the text", () => {
  const { nudgy } = nudgyHome();
  const result = nudgy(["standup notes", "-r", "every weekday 9am"], {
    env: at("2026-09-22T10:00:00"),
  });
  expect(result.code).toBe(0);
  expect(show(nudgy)).toMatchObject({
    remindAt: iso("2026-09-23T09:00:00"),
    recurrence: { kind: "weekly", days: [1, 2, 3, 4, 5], time: "09:00" },
    recurrenceText: "every weekday 9am",
  });
});

test("done on a recurring item schedules the next occurrence instead of completing it", () => {
  const { nudgy } = nudgyHome();
  nudgy(["standup notes", "-r", "every weekday 9am"], {
    env: at("2026-09-25T08:00:00"),
  });
  const result = nudgy(["done", "1"], { env: at("2026-09-25T09:10:00") });
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("Mon 2026-09-28 09:00");
  expect(show(nudgy)).toMatchObject({
    doneAt: null,
    remindAt: iso("2026-09-28T09:00:00"),
  });
});

test("an unparseable rule is rejected with the grammar and saves nothing", () => {
  const { nudgy } = nudgyHome();
  const result = nudgy(["x", "-r", "every blursday"], {
    env: at("2026-09-22T10:00:00"),
  });
  expect(result.code).toBe(2);
  expect(result.stderr).toContain("every <N> hours");
  expect(nudgy(["ls", "--json"]).stdout).toBe("[]\n");
});

test("remind sets and clears a recurrence on an existing item", () => {
  const { nudgy } = nudgyHome();
  nudgy(["check the queue"], { env: at("2026-09-22T10:00:00") });
  nudgy(["remind", "1", "every", "3", "hours"], {
    env: at("2026-09-22T10:00:00"),
  });
  expect(show(nudgy)).toMatchObject({
    remindAt: iso("2026-09-22T13:00:00"),
    recurrence: { kind: "interval", hours: 3 },
    recurrenceText: "every 3 hours",
  });
  nudgy(["remind", "1", "--clear"]);
  expect(show(nudgy)).toMatchObject({
    remindAt: null,
    recurrence: null,
    recurrenceText: null,
  });
});

test("ls marks recurring items and show prints the rule", () => {
  const { nudgy } = nudgyHome();
  nudgy(["standup", "-r", "every mon,thu at 4pm"], {
    env: at("2026-09-22T10:00:00"),
  });
  expect(nudgy(["ls"], { env: at("2026-09-22T10:00:00") }).stdout).toContain(
    "↻",
  );
  expect(
    nudgy(["show", "1"], { env: at("2026-09-22T10:00:00") }).stdout,
  ).toContain("repeats  every mon,thu at 4pm");
});

test("the daemon rolls a missed recurring reminder forward and alerts once", () => {
  const { home, nudgy } = nudgyHome();
  nudgy(["standup", "-r", "every weekday 9am"], {
    env: at("2026-09-20T10:00:00"),
  });
  const db = openDb(join(home, "nudgy.db"));
  db.run("UPDATE items SET last_alerted_at = remind_at WHERE id = 1");
  db.close();
  nudgy(["daemon", "run", "--once"], { env: at("2026-09-23T10:00:00") });
  expect(show(nudgy).remindAt).toBe(iso("2026-09-23T09:00:00"));
  const banners = readFileSync(join(home, "banners.jsonl"), "utf8")
    .trim()
    .split("\n");
  expect(banners).toHaveLength(1);
  expect(JSON.parse(banners[0] as string).title).toBe("standup");
});
