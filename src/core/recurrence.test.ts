import { describe, expect, test } from "bun:test";
import { InputError } from "./errors";
import {
  localDate,
  nextOccurrence,
  parseRecurrence,
  previousOccurrence,
  rollForward,
} from "./recurrence";

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

const local = (s: string) => new Date(s).getTime();
const show = (ms: number | null) =>
  ms === null ? null : new Date(ms).toString().slice(0, 21);
const weekday9 = {
  kind: "weekly",
  days: [1, 2, 3, 4, 5],
  time: "09:00",
} as const;

describe("nextOccurrence", () => {
  test("is strictly after the given time", () => {
    expect(show(nextOccurrence(weekday9, local("2026-09-22T09:00:00")))).toBe(
      "Wed Sep 23 2026 09:00",
    );
    expect(show(nextOccurrence(weekday9, local("2026-09-22T08:59:59")))).toBe(
      "Tue Sep 22 2026 09:00",
    );
  });

  test("every weekday 9am skips the weekend", () => {
    expect(show(nextOccurrence(weekday9, local("2026-09-25T10:00:00")))).toBe(
      "Mon Sep 28 2026 09:00",
    );
  });

  test.each([
    [
      "spring forward (Sun Mar 8)",
      "2026-03-06T10:00:00",
      "Mon Mar 09 2026 09:00",
    ],
    ["fall back (Sun Nov 1)", "2026-10-30T10:00:00", "Mon Nov 02 2026 09:00"],
  ])("every weekday 9am stays 09:00 local across %s", (_, from, expected) => {
    expect(show(nextOccurrence(weekday9, local(from)))).toBe(expected);
  });

  test("three weeks of weekday occurrences across a DST change are all 09:00 on Mon–Fri", () => {
    let t = local("2026-10-24T00:00:00");
    const seen: string[] = [];
    for (let i = 0; i < 15; i++) {
      t = nextOccurrence(weekday9, t);
      const d = new Date(t);
      expect([d.getHours(), d.getMinutes()]).toEqual([9, 0]);
      expect(d.getDay()).toBeGreaterThanOrEqual(1);
      expect(d.getDay()).toBeLessThanOrEqual(5);
      seen.push(localDate(d));
    }
    expect(new Set(seen).size).toBe(15);
    expect(seen.at(-1)).toBe("2026-11-13");
  });

  test("every mon,thu", () => {
    const rule = { kind: "weekly", days: [1, 4], time: "16:00" } as const;
    expect(show(nextOccurrence(rule, local("2026-09-22T10:00:00")))).toBe(
      "Thu Sep 24 2026 16:00",
    );
    expect(show(nextOccurrence(rule, local("2026-09-24T16:00:00")))).toBe(
      "Mon Sep 28 2026 16:00",
    );
  });

  test("daily crosses month and year ends", () => {
    const daily = {
      kind: "weekly",
      days: [0, 1, 2, 3, 4, 5, 6],
      time: "09:00",
    } as const;
    expect(show(nextOccurrence(daily, local("2026-01-31T22:00:00")))).toBe(
      "Sun Feb 01 2026 09:00",
    );
    expect(show(nextOccurrence(daily, local("2026-12-31T22:00:00")))).toBe(
      "Fri Jan 01 2027 09:00",
    );
  });

  test("every N days stays on its grid from the start date", () => {
    const rule = {
      kind: "days",
      every: 2,
      time: "09:00",
      start: "2026-01-30",
    } as const;
    expect(show(nextOccurrence(rule, local("2026-01-29T12:00:00")))).toBe(
      "Fri Jan 30 2026 09:00",
    );
    expect(show(nextOccurrence(rule, local("2026-01-30T09:00:00")))).toBe(
      "Sun Feb 01 2026 09:00",
    );
    expect(show(nextOccurrence(rule, local("2026-02-02T08:00:00")))).toBe(
      "Tue Feb 03 2026 09:00",
    );
  });

  test("every N days keeps local time across DST", () => {
    const rule = {
      kind: "days",
      every: 2,
      time: "09:00",
      start: "2026-10-30",
    } as const;
    expect(show(nextOccurrence(rule, local("2026-10-30T10:00:00")))).toBe(
      "Sun Nov 01 2026 09:00",
    );
    expect(show(nextOccurrence(rule, local("2026-11-01T10:00:00")))).toBe(
      "Tue Nov 03 2026 09:00",
    );
  });

  test("every N hours is absolute time from its anchor, even across DST", () => {
    const anchor = local("2026-11-01T00:00:00");
    const rule = { kind: "interval", hours: 3, anchor } as const;
    expect(nextOccurrence(rule, anchor)).toBe(anchor + 3 * 3_600_000);
    expect(nextOccurrence(rule, anchor + 3 * 3_600_000)).toBe(
      anchor + 6 * 3_600_000,
    );
    expect(nextOccurrence(rule, anchor - 10)).toBe(anchor + 3 * 3_600_000);
    expect(new Date(anchor + 3 * 3_600_000).getHours()).toBe(2);
  });

  test("every week falls on the stored weekday", () => {
    const rule = parseRecurrence("every week", local("2026-09-22T10:00:00"));
    expect(show(nextOccurrence(rule, local("2026-09-22T10:00:00")))).toBe(
      "Tue Sep 29 2026 09:00",
    );
    const early = parseRecurrence("every week", local("2026-09-22T08:00:00"));
    expect(show(nextOccurrence(early, local("2026-09-22T08:00:00")))).toBe(
      "Tue Sep 22 2026 09:00",
    );
  });
});

describe("previousOccurrence and rollForward", () => {
  test("previousOccurrence is the latest occurrence at or before the time", () => {
    expect(
      show(previousOccurrence(weekday9, local("2026-09-22T09:00:00"))),
    ).toBe("Tue Sep 22 2026 09:00");
    expect(
      show(previousOccurrence(weekday9, local("2026-09-28T08:00:00"))),
    ).toBe("Fri Sep 25 2026 09:00");
  });

  test("there is no previous occurrence before a rule starts", () => {
    expect(
      previousOccurrence(
        { kind: "interval", hours: 3, anchor: 1_000 },
        1_000 + 3_600_000,
      ),
    ).toBeNull();
    expect(
      previousOccurrence(
        { kind: "days", every: 2, time: "09:00", start: "2026-09-23" },
        local("2026-09-23T08:00:00"),
      ),
    ).toBeNull();
  });

  test("previousOccurrence for N-day and interval rules", () => {
    expect(
      show(
        previousOccurrence(
          { kind: "days", every: 3, time: "09:00", start: "2026-09-01" },
          local("2026-09-05T12:00:00"),
        ),
      ),
    ).toBe("Fri Sep 04 2026 09:00");
    expect(
      previousOccurrence(
        { kind: "interval", hours: 2, anchor: 0 },
        5 * 3_600_000,
      ),
    ).toBe(4 * 3_600_000);
  });

  test("an unacknowledged reminder rolls forward to the latest missed occurrence, skipping the rest", () => {
    const remindAt = local("2026-09-21T09:00:00");
    expect(
      show(rollForward(weekday9, remindAt, local("2026-09-23T10:00:00"))),
    ).toBe("Wed Sep 23 2026 09:00");
  });

  test("a reminder whose next occurrence has not arrived stays put", () => {
    const remindAt = local("2026-09-22T09:00:00");
    expect(rollForward(weekday9, remindAt, local("2026-09-22T18:00:00"))).toBe(
      remindAt,
    );
  });

  test("a snoozed reminder later than the latest occurrence stays put", () => {
    const snoozed = local("2026-09-22T09:40:00");
    expect(rollForward(weekday9, snoozed, local("2026-09-22T09:45:00"))).toBe(
      snoozed,
    );
  });
});
