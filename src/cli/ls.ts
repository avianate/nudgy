import { listItems } from "../core/items";
import type { Parsed } from "./args";
import { currentRepo, printItems } from "./common";
import type { Context } from "./context";

export function run({ flags }: Parsed, ctx: Context): number {
  const items = listItems(ctx.db(), {
    repo: flags.here ? currentRepo(ctx) : undefined,
    done: flags.done === true,
    remindersOnly: flags.reminders === true,
  });
  printItems(ctx, items, flags.json === true);
  return 0;
}
