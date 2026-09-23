import { expect, test } from "bun:test";
import { clockFromEnv } from "./clock";

test("NUDGY_NOW pins the clock", () => {
  expect(clockFromEnv({ NUDGY_NOW: "1700000000000" }).now()).toBe(
    1_700_000_000_000,
  );
});

test("without NUDGY_NOW the clock follows the system time", () => {
  const before = Date.now();
  const now = clockFromEnv({}).now();
  expect(now).toBeGreaterThanOrEqual(before);
  expect(now).toBeLessThanOrEqual(Date.now());
});

test("an unparseable NUDGY_NOW is rejected", () => {
  expect(() => clockFromEnv({ NUDGY_NOW: "soon" })).toThrow(/NUDGY_NOW/);
});
