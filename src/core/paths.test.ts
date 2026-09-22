import { expect, test } from "bun:test";
import { homedir } from "node:os";
import { resolvePaths } from "./paths";

test("JOT_HOME overrides the data directory", () => {
  expect(resolvePaths({ JOT_HOME: "/tmp/jh" })).toEqual({
    home: "/tmp/jh",
    db: "/tmp/jh/jot.db",
    config: "/tmp/jh/config.json",
    log: "/tmp/jh/daemon.log",
    status: "/tmp/jh/status",
  });
});

test("the data directory defaults to ~/.jot", () => {
  expect(resolvePaths({}).db).toBe(`${homedir()}/.jot/jot.db`);
});

test("a relative JOT_HOME resolves against the working directory", () => {
  expect(resolvePaths({ JOT_HOME: "./.jot-dev" }).home).toBe(
    `${process.cwd()}/.jot-dev`,
  );
});
