import { searchItems } from "../core/items";
import type { Parsed } from "./args";
import { currentRepo, printItems } from "./common";
import type { Context } from "./context";
import { UsageError } from "./errors";

export function run({ positionals, flags }: Parsed, ctx: Context): number {
  const query = positionals.join(" ").trim();
  if (!query) throw new UsageError("search needs a query: jot search <query>");
  const items = searchItems(ctx.db(), query, {
    repo: flags.here ? currentRepo(ctx) : undefined,
  });
  printItems(ctx, items, flags.json === true);
  return 0;
}
