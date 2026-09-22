import { describe, expect, test } from "bun:test";
import { title } from "../core/items";
import { absolute, relative } from "./format";

const NOW = Date.parse("2026-09-22T18:00:00Z");
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("relative", () => {
  test.each([
    [NOW, "now"],
    [NOW + 30_000, "now"],
    [NOW + 5 * MIN, "in 5m"],
    [NOW - 5 * MIN, "5m ago"],
    [NOW + 2 * HOUR, "in 2h"],
    [NOW + 2 * HOUR + 40 * MIN, "in 2h"],
    [NOW - 3 * DAY, "3d ago"],
    [NOW + 45 * DAY, "in 45d"],
  ])("%p is %p", (ms, expected) => {
    expect(relative(ms, NOW)).toBe(expected);
  });
});

test("absolute renders local wall-clock time with the weekday", () => {
  expect(absolute(NOW)).toBe("Tue 2026-09-22 14:00");
});

test("the title is the first line of the body", () => {
  expect(title("first line\n\nmore *markdown*")).toBe("first line");
  expect(title("  padded  ")).toBe("padded");
});
