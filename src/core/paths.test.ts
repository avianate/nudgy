import { expect, test } from "bun:test";
import { homedir } from "node:os";
import { resolvePaths } from "./paths";

test("JOT_HOME overrides the data directory", () => {
  expect(resolvePaths({ JOT_HOME: "/tmp/jh", HOME: "/Users/dev" })).toEqual({
    home: "/tmp/jh",
    db: "/tmp/jh/jot.db",
    config: "/tmp/jh/config.json",
    log: "/tmp/jh/daemon.log",
    status: "/tmp/jh/status",
    bin: "/Users/dev/.local/bin/jot",
    launchAgent: "/Users/dev/Library/LaunchAgents/dev.jot.daemon.plist",
    notifierApp: "/Users/dev/.jot/Jot Notifier.app",
    notifier: "/Users/dev/.jot/Jot Notifier.app/Contents/MacOS/jot-notify",
  });
});

test("HOME places the data directory, binary and LaunchAgent", () => {
  const paths = resolvePaths({ HOME: "/Users/dev" });
  expect([paths.home, paths.bin]).toEqual([
    "/Users/dev/.jot",
    "/Users/dev/.local/bin/jot",
  ]);
});

test("the data directory defaults to ~/.jot", () => {
  expect(resolvePaths({}).db).toBe(`${homedir()}/.jot/jot.db`);
});

test("a relative JOT_HOME resolves against the working directory", () => {
  expect(resolvePaths({ JOT_HOME: "./.jot-dev" }).home).toBe(
    `${process.cwd()}/.jot-dev`,
  );
});
