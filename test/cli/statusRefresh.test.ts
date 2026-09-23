import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { openDb } from "../../src/core/db";
import { createItem } from "../../src/core/items";
import { nudgyHome } from "./helpers";

const NOW = Date.parse("2026-09-22T14:00:00Z");
const env = { NUDGY_NOW: String(NOW) };

function withOverdue(count: number) {
  const ctx = nudgyHome();
  const db = openDb(join(ctx.home, "nudgy.db"));
  for (let i = 0; i < count; i++) {
    createItem(
      db,
      {
        body: `overdue ${i}`,
        repo: null,
        branch: null,
        remindAt: NOW - 60_000,
      },
      0,
    );
  }
  db.close();
  const status = () => readFileSync(join(ctx.home, "status"), "utf8");
  return { ...ctx, status };
}

test.each([
  ["done", ["done", "1"]],
  ["snooze", ["snooze", "1"]],
  ["remind", ["remind", "1", "in 2 hours"]],
  ["rm", ["rm", "1", "-y"]],
])(
  "%s updates the prompt count at once, without waiting for the daemon",
  (_, args) => {
    const { nudgy, status } = withOverdue(2);
    expect(nudgy(args, { env }).code).toBe(0);
    expect(status()).toBe("1\n");
  },
);

test("reopen brings a done overdue item back into the count", () => {
  const { nudgy, status } = withOverdue(1);
  nudgy(["done", "1"], { env });
  expect(status()).toBe("0\n");
  nudgy(["reopen", "1"], { env });
  expect(status()).toBe("1\n");
});

test("capturing refreshes the count too", () => {
  const { nudgy, status } = withOverdue(1);
  nudgy(["new note"], { env });
  expect(status()).toBe("1\n");
});

test("read-only commands leave the status file alone", () => {
  const { home, nudgy } = withOverdue(1);
  nudgy(["ls"], { env });
  nudgy(["due"], { env });
  expect(existsSync(join(home, "status"))).toBe(false);
});

test("a failed command does not touch the status file", () => {
  const { home, nudgy } = withOverdue(1);
  expect(nudgy(["snooze", "99"], { env }).code).toBe(1);
  expect(existsSync(join(home, "status"))).toBe(false);
});
