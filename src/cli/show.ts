import type { Parsed } from "./args";
import { requireItem } from "./common";
import type { Context } from "./context";
import { detail, toJson } from "./format";

export function run({ positionals, flags }: Parsed, ctx: Context): number {
  const item = requireItem(ctx, positionals[0]);
  ctx.out(
    flags.json
      ? JSON.stringify(toJson(item), null, 2)
      : detail(item, ctx.clock.now()),
  );
  return 0;
}
