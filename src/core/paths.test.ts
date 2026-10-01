import { expect, test } from "bun:test";
import { homedir } from "node:os";
import { resolvePaths } from "./paths";

test("NUDGY_HOME overrides the data directory", () => {
  expect(resolvePaths({ NUDGY_HOME: "/tmp/jh", HOME: "/Users/dev" })).toEqual({
    home: "/tmp/jh",
    db: "/tmp/jh/nudgy.db",
    config: "/tmp/jh/config.json",
    log: "/tmp/jh/daemon.log",
    status: "/tmp/jh/status",
    tick: "/tmp/jh/tick",
    tui: "/tmp/jh/tui.json",
    bin: "/Users/dev/.local/bin/nudgy",
    launchAgent:
      "/Users/dev/Library/LaunchAgents/io.github.avianate.nudgy.daemon.plist",
    notifierApp: "/Users/dev/.nudgy/Nudgy Notifier.app",
    notifier:
      "/Users/dev/.nudgy/Nudgy Notifier.app/Contents/MacOS/nudgy-notify",
  });
});

test("HOME places the data directory, binary and LaunchAgent", () => {
  const paths = resolvePaths({ HOME: "/Users/dev" });
  expect([paths.home, paths.bin]).toEqual([
    "/Users/dev/.nudgy",
    "/Users/dev/.local/bin/nudgy",
  ]);
});

test("the data directory defaults to ~/.nudgy", () => {
  expect(resolvePaths({}).db).toBe(`${homedir()}/.nudgy/nudgy.db`);
});

test("a relative NUDGY_HOME resolves against the working directory", () => {
  expect(resolvePaths({ NUDGY_HOME: "./.nudgy-dev" }).home).toBe(
    `${process.cwd()}/.nudgy-dev`,
  );
});
