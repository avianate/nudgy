import { expect, test } from "bun:test";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeRepo, nudgyHome, tempDir } from "./helpers";

function fakeEditor(content: string, exitCode = 0) {
  const path = join(tempDir(), "editor.sh");
  // Writes to its last argument, so EDITOR may carry flags before the file
  writeFileSync(
    path,
    `#!/bin/sh\nfor f; do :; done\ncat > "$f" <<'NUDGY_EOF'\n${content}\nNUDGY_EOF\nexit ${exitCode}\n`,
  );
  chmodSync(path, 0o755);
  return path;
}

function searchIds(
  nudgy: ReturnType<typeof nudgyHome>["nudgy"],
  query: string,
) {
  return (
    JSON.parse(nudgy(["search", query, "--json"]).stdout) as { id: number }[]
  ).map((i) => i.id);
}

test("edit replaces the body with what the editor saved", () => {
  const { nudgy } = nudgyHome();
  nudgy(["check the migration landed"]);
  const result = nudgy(["edit", "1"], {
    env: { EDITOR: fakeEditor("check the deploy\n\nand the logs") },
  });
  expect(result.code).toBe(0);
  expect(JSON.parse(nudgy(["show", "1", "--json"]).stdout).body).toBe(
    "check the deploy\n\nand the logs",
  );
});

test("edit passes EDITOR through the shell so it may carry arguments", () => {
  const { nudgy } = nudgyHome();
  nudgy(["original"]);
  const editor = `${fakeEditor("changed")} --wait`;
  expect(nudgy(["edit", "1"], { env: { EDITOR: editor } }).code).toBe(0);
  expect(JSON.parse(nudgy(["show", "1", "--json"]).stdout).body).toBe(
    "changed",
  );
});

test("an editor that fails leaves the body unchanged", () => {
  const { nudgy } = nudgyHome();
  nudgy(["original"]);
  const result = nudgy(["edit", "1"], {
    env: { EDITOR: fakeEditor("changed", 1) },
  });
  expect(result.code).toBe(1);
  expect(JSON.parse(nudgy(["show", "1", "--json"]).stdout).body).toBe(
    "original",
  );
});

test("an edit that empties the body is rejected", () => {
  const { nudgy } = nudgyHome();
  nudgy(["original"]);
  expect(nudgy(["edit", "1"], { env: { EDITOR: fakeEditor("") } }).code).toBe(
    1,
  );
  expect(JSON.parse(nudgy(["show", "1", "--json"]).stdout).body).toBe(
    "original",
  );
});

test("search finds by word prefix and follows edits", () => {
  const { nudgy } = nudgyHome();
  nudgy(["check the migration landed"]);
  nudgy(["re-run the flaky suite"]);
  expect(searchIds(nudgy, "migr")).toEqual([1]);
  nudgy(["edit", "1"], { env: { EDITOR: fakeEditor("check the deploy") } });
  expect(searchIds(nudgy, "migr")).toEqual([]);
  expect(searchIds(nudgy, "depl")).toEqual([1]);
});

test("search --here limits to the current repo", () => {
  const { nudgy } = nudgyHome();
  const repo = makeRepo();
  nudgy(["flaky in repo"], { cwd: repo });
  nudgy(["flaky elsewhere"], { cwd: tempDir() });
  const result = nudgy(["search", "flaky", "--here", "--json"], { cwd: repo });
  expect(
    (JSON.parse(result.stdout) as { id: number }[]).map((i) => i.id),
  ).toEqual([1]);
});

test("search with raw FTS syntax does not error", () => {
  const { nudgy } = nudgyHome();
  nudgy(["hello"]);
  const result = nudgy(["search", '"unbalanced (NEAR *']);
  expect(result.code).toBe(0);
  expect(result.stdout).toBe("no items\n");
});

test("search without a query is a usage error", () => {
  expect(nudgyHome().nudgy(["search"]).code).toBe(2);
});

test("rm -y deletes without asking and removes it from search", () => {
  const { nudgy } = nudgyHome();
  nudgy(["doomed note"]);
  expect(nudgy(["rm", "1", "-y"]).code).toBe(0);
  expect(nudgy(["show", "1"]).code).toBe(1);
  expect(searchIds(nudgy, "doomed")).toEqual([]);
});

test("rm asks for confirmation and deletes on y", () => {
  const { nudgy } = nudgyHome();
  nudgy(["doomed note"]);
  const result = nudgy(["rm", "1"], { stdin: "y\n" });
  expect(result.stderr).toContain("[y/N]");
  expect(result.code).toBe(0);
  expect(nudgy(["show", "1"]).code).toBe(1);
});

test.each([["n\n"], [""], ["yes please\n"]])(
  "rm with answer %p deletes nothing",
  (answer) => {
    const { nudgy } = nudgyHome();
    nudgy(["keep me"]);
    expect(nudgy(["rm", "1"], { stdin: answer }).code).toBe(1);
    expect(nudgy(["show", "1"]).code).toBe(0);
  },
);

test("rm with no stdin at all deletes nothing", () => {
  const { nudgy } = nudgyHome();
  nudgy(["keep me"]);
  expect(nudgy(["rm", "1"]).code).toBe(1);
  expect(nudgy(["show", "1"]).code).toBe(0);
});
