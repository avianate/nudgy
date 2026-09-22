import { describe, expect, test } from "bun:test";
import { InputError } from "./errors";
import { parseRecurrence } from "./recurrence";

// Tue 2026-09-22 10:00 in America/New_York
const NOW = Date.parse("2026-09-22T14:00:00Z");

describe("parseRecurrence", () => {
  test.each([
    [
      "every day",
      { kind: "weekly", days: [0, 1, 2, 3, 4, 5, 6], time: "09:00" },
    ],
    [
      "every day at 7:30am",
      { kind: "weekly", days: [0, 1, 2, 3, 4, 5, 6], time: "07:30" },
    ],
    ["every weekday", { kind: "weekly", days: [1, 2, 3, 4, 5], time: "09:00" }],
    [
      "every weekday 9am",
      { kind: "weekly", days: [1, 2, 3, 4, 5], time: "09:00" },
    ],
    [
      "every weekday at noon",
      { kind: "weekly", days: [1, 2, 3, 4, 5], time: "12:00" },
    ],
    ["every mon,thu at 4pm", { kind: "weekly", days: [1, 4], time: "16:00" }],
    [
      "every Monday, Thursday at 16:30",
      { kind: "weekly", days: [1, 4], time: "16:30" },
    ],
    ["every fri", { kind: "weekly", days: [5], time: "09:00" }],
    ["every sun,sat", { kind: "weekly", days: [0, 6], time: "09:00" }],
    ["every week", { kind: "weekly", days: [2], time: "09:00" }],
    ["every week at 3pm", { kind: "weekly", days: [2], time: "15:00" }],
    ["every 3 hours", { kind: "interval", hours: 3, anchor: NOW }],
    ["every 1 hour", { kind: "interval", hours: 1, anchor: NOW }],
    [
      "every 2 days at 16:30",
      { kind: "days", every: 2, time: "16:30", start: "2026-09-22" },
    ],
    [
      "every 2 days",
      { kind: "days", every: 2, time: "09:00", start: "2026-09-23" },
    ],
    [
      "  EVERY   Weekday   AT  9AM ",
      { kind: "weekly", days: [1, 2, 3, 4, 5], time: "09:00" },
    ],
  ])("%p", (input, rule) => {
    expect(parseRecurrence(input, NOW)).toEqual(rule as never);
  });

  test.each([
    "every",
    "every blursday",
    "every mon,blursday",
    "every 0 hours",
    "every 0 days",
    "every -2 days",
    "every day at nonsense",
    "every day at tomorrow 9am",
    "every 3 hours at 9am",
    "every 2.5 hours",
    "daily",
  ])("%p is rejected with the grammar", (input) => {
    expect(() => parseRecurrence(input, NOW)).toThrow(InputError);
    expect(() => parseRecurrence(input, NOW)).toThrow(/every weekday/);
  });
});
