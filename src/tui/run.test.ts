import { expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { installGuards } from "./run";

function fakeTarget() {
  const calls: string[] = [];
  return {
    calls,
    target: {
      destroy: () => calls.push("destroy"),
      exit: (code: number) => calls.push(`exit ${code}`),
      write: (text: string) => calls.push(`write ${text.split("\n")[0]}`),
    },
  };
}

test("an uncaught error restores the terminal before reporting and exiting", () => {
  const proc = new EventEmitter();
  const { calls, target } = fakeTarget();
  installGuards(target, proc);
  proc.emit("uncaughtException", new Error("boom"));
  expect(calls).toEqual(["destroy", "write jot: Error: boom", "exit 1"]);
});

test("an unhandled rejection is treated the same way", () => {
  const proc = new EventEmitter();
  const { calls, target } = fakeTarget();
  installGuards(target, proc);
  proc.emit("unhandledRejection", "nope");
  expect(calls).toEqual(["destroy", "write jot: nope", "exit 1"]);
});

test("SIGTERM restores the terminal and exits 143", () => {
  const proc = new EventEmitter();
  const { calls, target } = fakeTarget();
  installGuards(target, proc);
  proc.emit("SIGTERM");
  expect(calls).toEqual(["destroy", "exit 143"]);
});

test("removing the guards detaches every listener", () => {
  const proc = new EventEmitter();
  const { target } = fakeTarget();
  installGuards(target, proc)();
  expect(proc.eventNames()).toEqual([]);
});
