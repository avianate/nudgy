import { completeItem } from "../core/lifecycle";
import type { Parsed } from "./args";
import { requireItem } from "./common";
import type { Context } from "./context";
import { absolute, relative } from "./format";

export function run({ positionals }: Parsed, ctx: Context): number {
  const item = requireItem(ctx, positionals[0]);
  if (item.doneAt !== null) {
    ctx.out(`#${item.id} is already done`);
    return 0;
  }
  const now = ctx.clock.now();
  const updated = completeItem(ctx.db(), item, now);
  if (updated?.doneAt === null && updated.remindAt !== null) {
    ctx.out(
      `#${item.id} next: ${absolute(updated.remindAt)} (${relative(updated.remindAt, now)})`,
    );
  } else {
    ctx.out(`done #${item.id}`);
  }
  return 0;
}
