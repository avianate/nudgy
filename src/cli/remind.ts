import { clearReminder, setReminder } from "../core/items";
import type { Parsed } from "./args";
import { requireItem } from "./common";
import type { Context } from "./context";
import { UsageError } from "./errors";
import { absolute, relative } from "./format";
import { parseReminder } from "./reminder";

export function run({ positionals, flags }: Parsed, ctx: Context): number {
  const item = requireItem(ctx, positionals[0]);
  const now = ctx.clock.now();
  if (flags.clear) {
    clearReminder(ctx.db(), item.id, now);
    ctx.out(`cleared reminder on #${item.id}`);
    return 0;
  }
  const when = positionals.slice(1).join(" ").trim();
  if (!when) throw new UsageError("jot remind <id> <when> (or --clear)");
  const updated = setReminder(ctx.db(), item.id, parseReminder(when, now), now);
  const at = updated?.remindAt ?? now;
  ctx.out(`#${item.id} reminds ${absolute(at)} (${relative(at, now)})`);
  return 0;
}
