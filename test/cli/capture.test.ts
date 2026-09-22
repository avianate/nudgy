import { expect, test } from "bun:test";
import { join } from "node:path";
import { openDb } from "../../src/core/db";
import { getItem } from "../../src/core/items";
import { jotHome, makeRepo, tempDir } from "./helpers";

test("jot <text> saves a note tagged with the repo and branch", () => {
  const { home, jot } = jotHome();
  const repo = makeRepo("feature-x");
  const result = jot(["check the migration landed"], { cwd: repo });
  expect(result.stderr).toBe("");
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("#1");
  const item = getItem(openDb(join(home, "jot.db")), 1);
  expect(item).toMatchObject({
    body: "check the migration landed",
    repo,
    branch: "feature-x",
  });
});

test("outside a repo the note has no repo or branch", () => {
  const { home, jot } = jotHome();
  expect(jot(["loose thought"], { cwd: tempDir() }).code).toBe(0);
  expect(getItem(openDb(join(home, "jot.db")), 1)).toMatchObject({
    repo: null,
    branch: null,
  });
});

test("unquoted words are joined into one note", () => {
  const { home, jot } = jotHome();
  expect(jot(["check", "the", "logs"]).code).toBe(0);
  expect(getItem(openDb(join(home, "jot.db")), 1)?.body).toBe("check the logs");
});

test("jot add and jot -- capture reserved words literally", () => {
  const { home, jot } = jotHome();
  expect(jot(["add", "today"]).code).toBe(0);
  expect(jot(["--", "ls"]).code).toBe(0);
  const db = openDb(join(home, "jot.db"));
  expect([getItem(db, 1)?.body, getItem(db, 2)?.body]).toEqual(["today", "ls"]);
});

test("an empty capture is a usage error and saves nothing", () => {
  const { home, jot } = jotHome();
  const result = jot(["add"]);
  expect(result.code).toBe(2);
  expect(result.stderr).toContain("nothing to capture");
  expect(getItem(openDb(join(home, "jot.db")), 1)).toBeNull();
});

test("an unknown flag exits 2 with a hint", () => {
  const { jot } = jotHome();
  const result = jot(["use", "--force"]);
  expect(result.code).toBe(2);
  expect(result.stderr).toContain("jot --");
});

test("--help prints usage listing the commands", () => {
  const { jot } = jotHome();
  const result = jot(["--help"]);
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("jot search <query>");
  expect(result.stdout).not.toContain("--within");
});
