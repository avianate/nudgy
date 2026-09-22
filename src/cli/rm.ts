import { deleteItem, title } from "../core/items";
import type { Parsed } from "./args";
import { requireItem } from "./common";
import type { Context } from "./context";
import { confirm } from "./prompt";

export async function run(
  { positionals, flags }: Parsed,
  ctx: Context,
): Promise<number> {
  const item = requireItem(ctx, positionals[0]);
  if (
    !flags.yes &&
    !(await confirm(`delete #${item.id} "${title(item.body)}"?`))
  ) {
    ctx.err("not deleted");
    return 1;
  }
  deleteItem(ctx.db(), item.id);
  ctx.out(`deleted #${item.id}`);
  return 0;
}
