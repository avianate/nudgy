import { rescheduleItem } from "../core/items";
import { parseWhen } from "../core/when";
import type { Parsed } from "./args";
import { requireItem } from "./common";
import type { Context } from "./context";
import { NudgyError } from "./errors";
import { absolute, relative } from "./format";

export function run({ positionals }: Parsed, ctx: Context): number {
  const item = requireItem(ctx, positionals[0]);
  if (item.doneAt !== null)
    throw new NudgyError(`#${item.id} is done; nudgy reopen ${item.id} first`);
  const now = ctx.clock.now();
  const when =
    positionals.slice(1).join(" ").trim() || ctx.config().defaultSnooze;
  const remindAt = parseWhen(when, now);
  rescheduleItem(ctx.db(), item.id, remindAt, now);
  ctx.out(
    `#${item.id} snoozed until ${absolute(remindAt)} (${relative(remindAt, now)})`,
  );
  return 0;
}
