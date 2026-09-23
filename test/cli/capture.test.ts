import { expect, test } from "bun:test";
import { join } from "node:path";
import { openDb } from "../../src/core/db";
import { getItem } from "../../src/core/items";
import { makeRepo, nudgyHome, tempDir } from "./helpers";

test("nudgy <text> saves a note tagged with the repo and branch", () => {
  const { home, nudgy } = nudgyHome();
  const repo = makeRepo("feature-x");
  const result = nudgy(["check the migration landed"], { cwd: repo });
  expect(result.stderr).toBe("");
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("#1");
  const item = getItem(openDb(join(home, "nudgy.db")), 1);
  expect(item).toMatchObject({
    body: "check the migration landed",
    repo,
    branch: "feature-x",
  });
});

test("outside a repo the note has no repo or branch", () => {
  const { home, nudgy } = nudgyHome();
  expect(nudgy(["loose thought"], { cwd: tempDir() }).code).toBe(0);
  expect(getItem(openDb(join(home, "nudgy.db")), 1)).toMatchObject({
    repo: null,
    branch: null,
  });
});

test("unquoted words are joined into one note", () => {
  const { home, nudgy } = nudgyHome();
  expect(nudgy(["check", "the", "logs"]).code).toBe(0);
  expect(getItem(openDb(join(home, "nudgy.db")), 1)?.body).toBe(
    "check the logs",
  );
});

test("nudgy add and nudgy -- capture reserved words literally", () => {
  const { home, nudgy } = nudgyHome();
  expect(nudgy(["add", "today"]).code).toBe(0);
  expect(nudgy(["--", "ls"]).code).toBe(0);
  const db = openDb(join(home, "nudgy.db"));
  expect([getItem(db, 1)?.body, getItem(db, 2)?.body]).toEqual(["today", "ls"]);
});

test("an empty capture is a usage error and saves nothing", () => {
  const { home, nudgy } = nudgyHome();
  const result = nudgy(["add"]);
  expect(result.code).toBe(2);
  expect(result.stderr).toContain("nothing to capture");
  expect(getItem(openDb(join(home, "nudgy.db")), 1)).toBeNull();
});

test("an unknown flag exits 2 with a hint", () => {
  const { nudgy } = nudgyHome();
  const result = nudgy(["use", "--force"]);
  expect(result.code).toBe(2);
  expect(result.stderr).toContain("nudgy --");
});

test("--help prints usage listing the commands", () => {
  const { nudgy } = nudgyHome();
  const result = nudgy(["--help"]);
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("nudgy search <query>");
  expect(result.stdout).not.toContain("--within");
});

test("bare nudgy without a terminal refuses to start the TUI", () => {
  const result = nudgyHome().nudgy([]);
  expect(result.code).toBe(2);
  expect(result.stderr).toContain("needs a terminal");
});
