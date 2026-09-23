import { describe, expect, test } from "bun:test";
import { notificationFor, planAlerts } from "./alerts";
import type { Item } from "./items";

const NOW = 1_000_000_000;
const MIN = 60_000;
const config = { realertMinutes: 15 };

function item(overrides: Partial<Item>): Item {
  return {
    id: 1,
    body: "re-run the flaky suite\nmore detail",
    repo: "/src/nudgy",
    branch: "main",
    createdAt: 0,
    updatedAt: 0,
    remindAt: NOW - MIN,
    recurrence: null,
    recurrenceText: null,
    lastAlertedAt: null,
    doneAt: null,
    ...overrides,
  };
}

describe("planAlerts", () => {
  test("nothing due means nothing to send", () => {
    expect(planAlerts([], NOW, config)).toEqual({ kind: "none", items: [] });
  });

  test("a due reminder that was never alerted gets its own banner", () => {
    expect(planAlerts([item({})], NOW, config)).toMatchObject({
      kind: "single",
      items: [{ id: 1 }],
    });
  });

  test("a recently alerted reminder waits for the re-alert interval", () => {
    expect(
      planAlerts([item({ lastAlertedAt: NOW - 14 * MIN })], NOW, config).kind,
    ).toBe("none");
  });

  test("once the re-alert interval has passed it alerts again", () => {
    expect(
      planAlerts([item({ lastAlertedAt: NOW - 15 * MIN })], NOW, config).kind,
    ).toBe("single");
  });

  test("the re-alert interval comes from config", () => {
    expect(
      planAlerts([item({ lastAlertedAt: NOW - MIN })], NOW, {
        realertMinutes: 1,
      }).kind,
    ).toBe("single");
  });

  test("several reminders needing an alert in one tick are batched into a summary", () => {
    const plan = planAlerts(
      [item({ id: 1 }), item({ id: 2 }), item({ id: 3 })],
      NOW,
      config,
    );
    expect(plan.kind).toBe("summary");
    expect(plan.items.map((i) => i.id)).toEqual([1, 2, 3]);
  });

  test("only reminders needing an alert count toward batching", () => {
    const plan = planAlerts(
      [item({ id: 1 }), item({ id: 2, lastAlertedAt: NOW - MIN })],
      NOW,
      config,
    );
    expect(plan).toMatchObject({ kind: "single", items: [{ id: 1 }] });
  });

  test("done, future and reminder-less items never alert", () => {
    const items = [
      item({ id: 1, doneAt: NOW - MIN }),
      item({ id: 2, remindAt: NOW + MIN }),
      item({ id: 3, remindAt: null }),
    ];
    expect(planAlerts(items, NOW, config).kind).toBe("none");
  });
});

describe("notificationFor", () => {
  test("a single alert carries the title, repo and the rest of the note, and names its item", () => {
    expect(
      notificationFor({ kind: "single", items: [item({ id: 7 })] }),
    ).toEqual({
      title: "re-run the flaky suite",
      subtitle: "nudgy@main",
      body: "more detail",
      id: "nudgy-item-7",
      itemId: 7,
    });
  });

  test("a one-line note shows its due time as the body", () => {
    const remindAt = new Date("2026-09-23T09:05:00").getTime();
    expect(
      notificationFor({
        kind: "single",
        items: [item({ body: "standup", remindAt })],
      }).body,
    ).toBe("due 09:05");
  });

  test("long note text is trimmed to fit an alert", () => {
    const body = notificationFor({
      kind: "single",
      items: [item({ body: `title\n\n${"word ".repeat(100)}` })],
    }).body;
    expect(body.length).toBeLessThanOrEqual(240);
    expect(body.endsWith("…")).toBe(true);
    expect(body.startsWith("word word")).toBe(true);
  });

  test("a summary banner points at nudgy due", () => {
    expect(
      notificationFor({
        kind: "summary",
        items: [item({}), item({}), item({})],
      }),
    ).toEqual({
      title: "nudgy",
      subtitle: "",
      body: "3 reminders due — nudgy due",
      id: "nudgy-summary",
    });
    expect(
      "itemId" in
        notificationFor({ kind: "summary", items: [item({}), item({})] }),
    ).toBe(false);
  });

  test("re-alerts reuse the same id so they replace rather than stack", () => {
    const first = notificationFor({ kind: "single", items: [item({ id: 7 })] });
    const again = notificationFor({
      kind: "single",
      items: [item({ id: 7, lastAlertedAt: NOW })],
    });
    expect(again.id).toBe(first.id);
    expect(
      notificationFor({ kind: "single", items: [item({ id: 8 })] }).id,
    ).not.toBe(first.id);
  });
});
