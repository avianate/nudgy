import { describe, expect, test } from "bun:test";
import { parseDuration, parseWhen } from "./when";

// Tue 2026-09-22 10:00 in America/New_York
const NOW = Date.parse("2026-09-22T14:00:00Z");
const local = (iso: string) => new Date(iso).getTime();

describe("parseWhen", () => {
  test.each([
    ["in 2 hours", "2026-09-22T12:00:00"],
    ["in 2 minutes", "2026-09-22T10:02:00"],
    ["10m", "2026-09-22T10:10:00"],
    ["1h30m", "2026-09-22T11:30:00"],
    ["at 4pm", "2026-09-22T16:00:00"],
    ["16:30", "2026-09-22T16:30:00"],
    ["tomorrow 9am", "2026-09-23T09:00:00"],
    ["friday at 4pm", "2026-09-25T16:00:00"],
  ])("%p → %p local", (input, expected) => {
    expect(parseWhen(input, NOW)).toBe(local(expected));
  });

  test("a time already past today means tomorrow, not an instantly-due reminder", () => {
    expect(parseWhen("9am", NOW)).toBe(local("2026-09-23T09:00:00"));
  });

  test("a date without a time defaults to 09:00", () => {
    expect(parseWhen("tomorrow", NOW)).toBe(local("2026-09-23T09:00:00"));
    expect(parseWhen("next friday", NOW)).toBe(local("2026-10-02T09:00:00"));
  });

  test("a day-granular duration keeps the current time of day", () => {
    expect(parseWhen("2d", NOW)).toBe(local("2026-09-24T10:00:00"));
    expect(parseWhen("in 3 days", NOW)).toBe(local("2026-09-25T10:00:00"));
  });

  test("the reference time comes from the caller, not the system clock", () => {
    const later = Date.parse("2030-01-01T15:00:00Z");
    expect(parseWhen("in 1 hour", later)).toBe(later + 3_600_000);
  });

  test.each(["banana", "", "   ", "next blursday 9am", "9am please maybe"])(
    "%p is rejected",
    (input) => {
      expect(() => parseWhen(input, NOW)).toThrow(/can't understand/);
    },
  );

  test("a time in the past is rejected", () => {
    expect(() => parseWhen("yesterday", NOW)).toThrow(/in the past/);
  });
});

describe("parseDuration", () => {
  test.each([
    ["10m", 600_000],
    ["1h", 3_600_000],
    ["90s", 90_000],
    ["1h30m", 5_400_000],
    ["2d", 172_800_000],
    ["1w", 604_800_000],
    [" 15m ", 900_000],
  ])("%p is %p ms", (input, ms) => {
    expect(parseDuration(input)).toBe(ms);
  });

  test.each(["10", "m", "tomorrow", "1h x", "0m"])(
    "%p is not a duration",
    (input) => {
      expect(parseDuration(input)).toBeNull();
    },
  );
});
