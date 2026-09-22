import { type Item, repoLabel, title } from "./items";

export type AlertPlan = { kind: "none" | "single" | "summary"; items: Item[] };

export type Banner = { title: string; subtitle: string; body: string };

const MIN = 60_000;

export function planAlerts(
  due: Item[],
  now: number,
  config: { realertMinutes: number },
): AlertPlan {
  const items = due.filter(
    (item) =>
      item.doneAt === null &&
      item.remindAt !== null &&
      item.remindAt <= now &&
      (item.lastAlertedAt === null ||
        now - item.lastAlertedAt >= config.realertMinutes * MIN),
  );
  const kind =
    items.length === 0 ? "none" : items.length === 1 ? "single" : "summary";
  return { kind, items };
}

export function notificationFor(plan: AlertPlan): Banner {
  const [first] = plan.items;
  if (plan.kind === "single" && first) {
    return {
      title: title(first.body),
      subtitle: repoLabel(first),
      body: `#${first.id} · jot done ${first.id} · jot snooze ${first.id}`,
    };
  }
  return {
    title: "jot",
    subtitle: "",
    body: `${plan.items.length} reminders due — jot due`,
  };
}
