import { dueItems } from "../core/items";
import type { Parsed } from "./args";
import { printItems } from "./common";
import type { Context } from "./context";
import { UsageError } from "./errors";

const HOUR = 3_600_000;

export function run({ flags }: Parsed, ctx: Context): number {
  const hours = flags.within === undefined ? 24 : Number(flags.within);
  if (!(hours > 0))
    throw new UsageError("--within takes a positive number of hours");
  const items = dueItems(ctx.db(), ctx.clock.now() + hours * HOUR);
  // Empty stdout when nothing is due, so the shell hook stays silent
  if (items.length === 0 && !flags.json) {
    ctx.err("nothing due");
    return 0;
  }
  printItems(ctx, items, flags.json === true);
  return 0;
}
