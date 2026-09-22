import { expect, test } from "bun:test";

test("tests run in America/New_York so DST cases are deterministic", () => {
  expect(new Date("2026-03-09T12:00:00Z").getTimezoneOffset()).toBe(240);
  expect(new Date("2026-01-15T12:00:00Z").getTimezoneOffset()).toBe(300);
});
