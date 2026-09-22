import { markDone } from "../core/items";
import type { Parsed } from "./args";
import { requireItem } from "./common";
import type { Context } from "./context";

export function run({ positionals }: Parsed, ctx: Context): number {
  const item = requireItem(ctx, positionals[0]);
  if (item.doneAt !== null) {
    ctx.out(`#${item.id} is already done`);
    return 0;
  }
  markDone(ctx.db(), item.id, ctx.clock.now());
  ctx.out(`done #${item.id}`);
  return 0;
}
