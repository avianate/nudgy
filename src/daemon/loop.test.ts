import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../core/db";
import { createItem, getItem } from "../core/items";
import { resolvePaths } from "../core/paths";
import { runLoop, type TickDeps, tick } from "./loop";
import type { Notification, Notifier } from "./notifier";

const NOW = Date.parse("2026-09-22T14:00:00Z");
const MIN = 60_000;

function setup(options: { failNotify?: boolean } = {}) {
  const home = mkdtempSync(join(tmpdir(), "jot-loop-"));
  const paths = resolvePaths({ JOT_HOME: home });
  const db = openDb(":memory:");
  const sent: Notification[] = [];
  const logs: string[] = [];
  const notifier: Notifier = {
    kind: "memory",
    async notify(n) {
      if (options.failNotify) throw new Error("osascript exploded");
      sent.push(n);
    },
  };
  let now = NOW;
  const deps: TickDeps = {
    db: () => db,
    clock: { now: () => now },
    notifier,
    paths,
    log: (m) => logs.push(m),
  };
  return {
    db,
    deps,
    sent,
    logs,
    paths,
    advance: (ms: number) => (now += ms),
    home,
  };
}

describe("tick", () => {
  test("a due reminder is alerted once and marked", async () => {
    const { db, deps, sent } = setup();
    createItem(
      db,
      { body: "ship it", repo: null, branch: null, remindAt: NOW - MIN },
      0,
    );
    await tick(deps);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ title: "ship it", sound: "Glass" });
    expect(getItem(db, 1)).toMatchObject({
      lastAlertedAt: NOW,
      remindAt: NOW - MIN,
    });
  });

  test("it re-alerts only after realertMinutes", async () => {
    const { db, deps, sent, advance } = setup();
    createItem(
      db,
      { body: "ship it", repo: null, branch: null, remindAt: NOW - MIN },
      0,
    );
    await tick(deps);
    advance(14 * MIN);
    await tick(deps);
    expect(sent).toHaveLength(1);
    advance(MIN);
    await tick(deps);
    expect(sent).toHaveLength(2);
  });

  test("config is re-read every tick", async () => {
    const { db, deps, sent, advance, paths } = setup();
    createItem(
      db,
      { body: "ship it", repo: null, branch: null, remindAt: NOW - MIN },
      0,
    );
    await tick(deps);
    writeFileSync(paths.config, '{"realertMinutes": 1, "sound": "Ping"}');
    advance(MIN);
    await tick(deps);
    expect(sent.map((n) => n.sound)).toEqual(["Glass", "Ping"]);
  });

  test("several due reminders produce one summary banner", async () => {
    const { db, deps, sent } = setup();
    for (const body of ["a", "b", "c"])
      createItem(
        db,
        { body, repo: null, branch: null, remindAt: NOW - MIN },
        0,
      );
    await tick(deps);
    expect(sent).toEqual([
      {
        title: "jot",
        subtitle: "",
        body: "3 reminders due — jot due",
        id: "jot-summary",
        sound: "Glass",
      },
    ]);
    expect([1, 2, 3].map((id) => getItem(db, id)?.lastAlertedAt)).toEqual([
      NOW,
      NOW,
      NOW,
    ]);
  });

  test("the status file holds the due count and is rewritten every tick", async () => {
    const { db, deps, paths, home } = setup();
    await tick(deps);
    expect(readFileSync(paths.status, "utf8")).toBe("0\n");
    createItem(
      db,
      { body: "a", repo: null, branch: null, remindAt: NOW - MIN },
      0,
    );
    createItem(
      db,
      { body: "b", repo: null, branch: null, remindAt: NOW + 60 * MIN },
      0,
    );
    await tick(deps);
    expect(readFileSync(paths.status, "utf8")).toBe("1\n");
    expect(readdirSync(home).filter((f) => f.startsWith("status."))).toEqual(
      [],
    );
  });

  test("a failed notification is logged and retried next tick", async () => {
    const { db, deps, logs } = setup({ failNotify: true });
    createItem(
      db,
      { body: "a", repo: null, branch: null, remindAt: NOW - MIN },
      0,
    );
    await tick(deps);
    expect(logs.join("\n")).toContain("osascript exploded");
    expect(getItem(db, 1)?.lastAlertedAt).toBeNull();
  });

  test("an invalid config is logged and defaults are used", async () => {
    const { db, deps, sent, logs, paths } = setup();
    writeFileSync(paths.config, "{broken");
    createItem(
      db,
      { body: "a", repo: null, branch: null, remindAt: NOW - MIN },
      0,
    );
    await tick(deps);
    expect(logs.join("\n")).toContain("config.json");
    expect(sent).toHaveLength(1);
  });

  test("a database that fails to open is logged and does not throw", async () => {
    const { deps, logs, paths } = setup();
    await tick({
      ...deps,
      db: () => {
        throw new Error("database is locked");
      },
    });
    expect(logs.join("\n")).toContain("database is locked");
    expect(existsSync(paths.status)).toBe(false);
  });
});

test("runLoop ticks until aborted", async () => {
  const { deps, paths } = setup();
  const controller = new AbortController();
  const done = runLoop(deps, controller.signal, 5);
  await Bun.sleep(30);
  controller.abort();
  await done;
  expect(existsSync(paths.status)).toBe(true);
});
