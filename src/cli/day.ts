import { dayItems } from "../core/items";
import type { Parsed } from "./args";
import { currentRepo, printItems } from "./common";
import type { Context } from "./context";

const OFFSET: Record<string, number> = { yesterday: -1, today: 0, tomorrow: 1 };

export function run({ command, flags }: Parsed, ctx: Context): number {
  const now = new Date(ctx.clock.now());
  const offset = OFFSET[command] ?? 0;
  // Built from calendar fields so a 23- or 25-hour DST day still spans midnight to midnight
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + offset,
  ).getTime();
  const end = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + offset + 1,
  ).getTime();
  const items = dayItems(ctx.db(), {
    start,
    end,
    repo: flags.here ? currentRepo(ctx) : undefined,
  });
  printItems(ctx, items, flags.json === true);
  return 0;
}
