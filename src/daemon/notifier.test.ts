import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileNotifier, notifierFromEnv, osascriptArgv } from "./notifier";

test("notification text goes to osascript as separate argv entries, unescaped", () => {
  const argv = osascriptArgv({
    title: 'say "hi"',
    subtitle: "back\\slash",
    body: "line one\nline two",
    sound: "Glass",
  });
  expect(argv[0]).toBe("/usr/bin/osascript");
  expect(argv.slice(3)).toEqual([
    'say "hi"',
    "back\\slash",
    "line one\nline two",
    "Glass",
  ]);
  expect(argv[2]).not.toContain("hi");
});

test("the script reads every field from argv", () => {
  const script = osascriptArgv({
    title: "t",
    subtitle: "s",
    body: "b",
    sound: "Glass",
  })[2];
  expect(script).toContain("item 1 of argv");
  expect(script).toContain("item 4 of argv");
});

test("the file notifier appends one JSON line per notification", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "jot-notify-")), "notes.jsonl");
  const notifier = fileNotifier(path);
  await notifier.notify({
    title: "a",
    subtitle: "",
    body: "b",
    sound: "Glass",
  });
  await notifier.notify({
    title: "c",
    subtitle: "s",
    body: "d",
    sound: "Ping",
  });
  const lines = readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  expect(lines).toEqual([
    { title: "a", subtitle: "", body: "b", sound: "Glass" },
    { title: "c", subtitle: "s", body: "d", sound: "Ping" },
  ]);
});

test("JOT_NOTIFIER=file:<path> selects the file notifier; otherwise osascript", () => {
  expect(notifierFromEnv({ JOT_NOTIFIER: "file:/tmp/x" }).kind).toBe("file");
  expect(notifierFromEnv({}).kind).toBe("osascript");
});

test("an unknown JOT_NOTIFIER is rejected rather than silently showing real banners", () => {
  expect(() => notifierFromEnv({ JOT_NOTIFIER: "fake" })).toThrow(
    /JOT_NOTIFIER/,
  );
});
