import { type Item, repoLabel, title } from "./items";

export type AlertPlan = { kind: "none" | "single" | "summary"; items: Item[] };

// id is stable per reminder (and for the summary) so Notification Center keeps one entry per reminder, not one per re-alert
export type Banner = {
  title: string;
  subtitle: string;
  body: string;
  id: string;
  // Set only for a single reminder: the helper offers Done / Snooze / Remind later on it
  itemId?: number;
};

const MAX_BODY = 240;

function alertBody(item: Item): string {
  const rest = item.body
    .split("\n")
    .slice(1)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (rest)
    return rest.length > MAX_BODY
      ? `${rest.slice(0, MAX_BODY - 1).trimEnd()}…`
      : rest;
  if (item.remindAt === null) return "";
  const d = new Date(item.remindAt);
  return `due ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

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
      body: alertBody(first),
      id: `nudgy-item-${first.id}`,
      itemId: first.id,
    };
  }
  return {
    title: "nudgy",
    subtitle: "",
    body: `${plan.items.length} reminders due — nudgy due`,
    id: "nudgy-summary",
  };
}
