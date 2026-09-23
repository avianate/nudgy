import { expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolvePaths } from "../core/paths";
import {
  fileNotifier,
  helperNotifier,
  type Notification,
  type Notifier,
  notifierFromEnv,
  osascriptArgv,
  withFallback,
} from "./notifier";

test("notification text goes to osascript as separate argv entries, unescaped", () => {
  const argv = osascriptArgv({
    title: 'say "hi"',
    subtitle: "back\\slash",
    body: "line one\nline two",
    sound: "Glass",
    id: "x",
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
    id: "x",
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
    id: "one",
  });
  await notifier.notify({
    title: "c",
    subtitle: "s",
    body: "d",
    sound: "Ping",
    id: "two",
  });
  const lines = readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  expect(lines).toEqual([
    { title: "a", subtitle: "", body: "b", sound: "Glass", id: "one" },
    { title: "c", subtitle: "s", body: "d", sound: "Ping", id: "two" },
  ]);
});

test("JOT_NOTIFIER=file:<path> selects the file notifier; otherwise osascript", () => {
  const paths = resolvePaths({ HOME: tempHome() });
  expect(notifierFromEnv({ JOT_NOTIFIER: "file:/tmp/x" }, paths).kind).toBe(
    "file",
  );
  expect(notifierFromEnv({}, paths).kind).toBe("osascript");
});

test("an unknown JOT_NOTIFIER is rejected rather than silently showing real banners", () => {
  expect(() =>
    notifierFromEnv({ JOT_NOTIFIER: "fake" }, resolvePaths({})),
  ).toThrow(/JOT_NOTIFIER/);
});

function tempHome() {
  return mkdtempSync(join(tmpdir(), "jot-notifier-"));
}

function fakeHelper(home: string, exitCode = 0) {
  const exe = join(
    home,
    ".jot",
    "Jot Notifier.app",
    "Contents",
    "MacOS",
    "jot-notify",
  );
  mkdirSync(join(exe, ".."), { recursive: true });
  const log = join(home, "argv.json");
  writeFileSync(
    exe,
    `#!/bin/sh\nprintf '%s\\0' "$@" > '${log}'\n[ ${exitCode} = 3 ] && echo "not authorized: off" >&2\nexit ${exitCode}\n`,
  );
  chmodSync(exe, 0o755);
  return { exe, log };
}

const note: Notification = {
  title: 'say "hi"',
  subtitle: "back\\slash",
  body: "one\ntwo",
  sound: "Glass",
  id: "jot-item-7",
};

test("the helper gets one JSON payload with the text, and for an item, how to act on it", async () => {
  const home = tempHome();
  const { exe, log } = fakeHelper(home);
  await helperNotifier(exe, {
    jotBin: "/u/.local/bin/jot",
    jotHome: "/u/.jot",
  }).notify({
    ...note,
    itemId: 7,
    snooze: "10m",
  });
  const argv = readFileSync(log, "utf8").split("\0");
  expect(argv[0]).toBe("--json");
  expect(JSON.parse(argv[1] as string)).toEqual({
    title: note.title,
    subtitle: note.subtitle,
    body: note.body,
    sound: "Glass",
    id: "jot-item-7",
    item: {
      id: 7,
      snooze: "10m",
      jotBin: "/u/.local/bin/jot",
      jotHome: "/u/.jot",
    },
  });
});

test("a notification without an item carries no actions", async () => {
  const { exe, log } = fakeHelper(tempHome());
  await helperNotifier(exe, { jotBin: "/b", jotHome: "/h" }).notify(note);
  expect(
    JSON.parse(readFileSync(log, "utf8").split("\0")[1] as string).item,
  ).toBeUndefined();
});

test("a helper that is not authorized fails with the settings to fix", async () => {
  const { exe } = fakeHelper(tempHome(), 3);
  await expect(
    helperNotifier(exe, { jotBin: "/b", jotHome: "/h" }).notify(note),
  ).rejects.toThrow(/Notifications → Jot/);
});

test("the fallback notifier is used, and the failure logged, when the primary fails", async () => {
  const sent: Notification[] = [];
  const logs: string[] = [];
  const broken: Notifier = {
    kind: "helper",
    notify: async () => {
      throw new Error("boom");
    },
  };
  const backup: Notifier = {
    kind: "osascript",
    notify: async (n) => {
      sent.push(n);
    },
  };
  await withFallback(broken, backup, (m) => logs.push(m)).notify(note);
  expect(sent).toEqual([note]);
  expect(logs.join()).toContain("boom");
});

test("the installed helper is preferred, with osascript behind it", () => {
  const home = tempHome();
  fakeHelper(home);
  expect(notifierFromEnv({}, resolvePaths({ HOME: home })).kind).toBe(
    "helper+osascript",
  );
});

test("JOT_NOTIFIER=osascript forces the fallback", () => {
  const home = tempHome();
  fakeHelper(home);
  expect(
    notifierFromEnv({ JOT_NOTIFIER: "osascript" }, resolvePaths({ HOME: home }))
      .kind,
  ).toBe("osascript");
});
