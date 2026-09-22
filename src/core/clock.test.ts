import { expect, test } from "bun:test";
import { clockFromEnv } from "./clock";

test("JOT_NOW pins the clock", () => {
  expect(clockFromEnv({ JOT_NOW: "1700000000000" }).now()).toBe(
    1_700_000_000_000,
  );
});

test("without JOT_NOW the clock follows the system time", () => {
  const before = Date.now();
  const now = clockFromEnv({}).now();
  expect(now).toBeGreaterThanOrEqual(before);
  expect(now).toBeLessThanOrEqual(Date.now());
});

test("an unparseable JOT_NOW is rejected", () => {
  expect(() => clockFromEnv({ JOT_NOW: "soon" })).toThrow(/JOT_NOW/);
});
