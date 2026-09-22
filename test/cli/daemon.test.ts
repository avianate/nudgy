import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { openDb } from "../../src/core/db";
import { createItem } from "../../src/core/items";
import { jotHome } from "./helpers";

const NOW = Date.parse("2026-09-22T14:00:00Z");
const MIN = 60_000;

test("daemon run --once sends due banners through the notifier seam and writes status", () => {
  const { home, jot } = jotHome();
  const db = openDb(join(home, "jot.db"));
  createItem(
    db,
    { body: "ship it", repo: null, branch: null, remindAt: NOW - MIN },
    0,
  );
  db.close();
  const sink = join(home, "banners.jsonl");
  const env = { JOT_NOW: String(NOW), JOT_NOTIFIER: `file:${sink}` };
  const result = jot(["daemon", "run", "--once"], { env });
  expect(result.code).toBe(0);
  expect(JSON.parse(readFileSync(sink, "utf8"))).toMatchObject({
    title: "ship it",
    sound: "Glass",
  });
  expect(readFileSync(join(home, "status"), "utf8")).toBe("1\n");
  jot(["daemon", "run", "--once"], { env });
  expect(readFileSync(sink, "utf8").trim().split("\n")).toHaveLength(1);
});

test("daemon with no subcommand is a usage error", () => {
  expect(jotHome().jot(["daemon"]).code).toBe(2);
});
