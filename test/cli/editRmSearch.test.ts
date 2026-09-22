import { expect, test } from "bun:test";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { jotHome, makeRepo, tempDir } from "./helpers";

function fakeEditor(content: string, exitCode = 0) {
  const path = join(tempDir(), "editor.sh");
  // Writes to its last argument, so EDITOR may carry flags before the file
  writeFileSync(
    path,
    `#!/bin/sh\nfor f; do :; done\ncat > "$f" <<'JOT_EOF'\n${content}\nJOT_EOF\nexit ${exitCode}\n`,
  );
  chmodSync(path, 0o755);
  return path;
}

function searchIds(jot: ReturnType<typeof jotHome>["jot"], query: string) {
  return (
    JSON.parse(jot(["search", query, "--json"]).stdout) as { id: number }[]
  ).map((i) => i.id);
}

test("edit replaces the body with what the editor saved", () => {
  const { jot } = jotHome();
  jot(["check the migration landed"]);
  const result = jot(["edit", "1"], {
    env: { EDITOR: fakeEditor("check the deploy\n\nand the logs") },
  });
  expect(result.code).toBe(0);
  expect(JSON.parse(jot(["show", "1", "--json"]).stdout).body).toBe(
    "check the deploy\n\nand the logs",
  );
});

test("edit passes EDITOR through the shell so it may carry arguments", () => {
  const { jot } = jotHome();
  jot(["original"]);
  const editor = `${fakeEditor("changed")} --wait`;
  expect(jot(["edit", "1"], { env: { EDITOR: editor } }).code).toBe(0);
  expect(JSON.parse(jot(["show", "1", "--json"]).stdout).body).toBe("changed");
});

test("an editor that fails leaves the body unchanged", () => {
  const { jot } = jotHome();
  jot(["original"]);
  const result = jot(["edit", "1"], {
    env: { EDITOR: fakeEditor("changed", 1) },
  });
  expect(result.code).toBe(1);
  expect(JSON.parse(jot(["show", "1", "--json"]).stdout).body).toBe("original");
});

test("an edit that empties the body is rejected", () => {
  const { jot } = jotHome();
  jot(["original"]);
  expect(jot(["edit", "1"], { env: { EDITOR: fakeEditor("") } }).code).toBe(1);
  expect(JSON.parse(jot(["show", "1", "--json"]).stdout).body).toBe("original");
});

test("search finds by word prefix and follows edits", () => {
  const { jot } = jotHome();
  jot(["check the migration landed"]);
  jot(["re-run the flaky suite"]);
  expect(searchIds(jot, "migr")).toEqual([1]);
  jot(["edit", "1"], { env: { EDITOR: fakeEditor("check the deploy") } });
  expect(searchIds(jot, "migr")).toEqual([]);
  expect(searchIds(jot, "depl")).toEqual([1]);
});

test("search --here limits to the current repo", () => {
  const { jot } = jotHome();
  const repo = makeRepo();
  jot(["flaky in repo"], { cwd: repo });
  jot(["flaky elsewhere"], { cwd: tempDir() });
  const result = jot(["search", "flaky", "--here", "--json"], { cwd: repo });
  expect(
    (JSON.parse(result.stdout) as { id: number }[]).map((i) => i.id),
  ).toEqual([1]);
});

test("search with raw FTS syntax does not error", () => {
  const { jot } = jotHome();
  jot(["hello"]);
  const result = jot(["search", '"unbalanced (NEAR *']);
  expect(result.code).toBe(0);
  expect(result.stdout).toBe("no items\n");
});

test("search without a query is a usage error", () => {
  expect(jotHome().jot(["search"]).code).toBe(2);
});

test("rm -y deletes without asking and removes it from search", () => {
  const { jot } = jotHome();
  jot(["doomed note"]);
  expect(jot(["rm", "1", "-y"]).code).toBe(0);
  expect(jot(["show", "1"]).code).toBe(1);
  expect(searchIds(jot, "doomed")).toEqual([]);
});

test("rm asks for confirmation and deletes on y", () => {
  const { jot } = jotHome();
  jot(["doomed note"]);
  const result = jot(["rm", "1"], { stdin: "y\n" });
  expect(result.stderr).toContain("[y/N]");
  expect(result.code).toBe(0);
  expect(jot(["show", "1"]).code).toBe(1);
});

test.each([["n\n"], [""], ["yes please\n"]])(
  "rm with answer %p deletes nothing",
  (answer) => {
    const { jot } = jotHome();
    jot(["keep me"]);
    expect(jot(["rm", "1"], { stdin: answer }).code).toBe(1);
    expect(jot(["show", "1"]).code).toBe(0);
  },
);

test("rm with no stdin at all deletes nothing", () => {
  const { jot } = jotHome();
  jot(["keep me"]);
  expect(jot(["rm", "1"]).code).toBe(1);
  expect(jot(["show", "1"]).code).toBe(0);
});
