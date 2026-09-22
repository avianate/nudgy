import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitContext, parseRevParse } from "./git";

function tempDir() {
  return realpathSync(mkdtempSync(join(tmpdir(), "jot-git-")));
}

function git(cwd: string, ...args: string[]) {
  Bun.spawnSync(["git", "-c", "user.name=t", "-c", "user.email=t@t", ...args], {
    cwd,
  });
}

test("inside a repo, repo is the top level and branch is the current branch", () => {
  const repo = tempDir();
  git(repo, "init", "-q", "-b", "feature-x");
  git(repo, "commit", "-q", "--allow-empty", "-m", "init");
  mkdirSync(join(repo, "sub"));
  expect(gitContext(join(repo, "sub"))).toEqual({ repo, branch: "feature-x" });
});

test("outside a repo, both are null", () => {
  expect(gitContext(tempDir())).toEqual({ repo: null, branch: null });
});

test("a repo with no commits yet still records the repo", () => {
  const repo = tempDir();
  git(repo, "init", "-q");
  expect(gitContext(repo)).toEqual({ repo, branch: null });
});

test("a detached HEAD records no branch", () => {
  expect(parseRevParse("/src/jot\nHEAD\n")).toEqual({
    repo: "/src/jot",
    branch: null,
  });
});

test("git error output is not mistaken for a repo", () => {
  expect(parseRevParse("")).toEqual({ repo: null, branch: null });
});
