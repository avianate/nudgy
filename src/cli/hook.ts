import template from "../shell/hook.zsh" with { type: "text" };
import type { Parsed } from "./args";
import type { Context } from "./context";
import { UsageError } from "./errors";

const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

export function run({ positionals }: Parsed, ctx: Context): number {
  if (positionals[0] !== "zsh")
    throw new UsageError("only zsh is supported: nudgy hook zsh");
  const script = template
    .replaceAll("__NUDGY_WINDOW__", String(ctx.config().hookWindowHours))
    .replaceAll("__NUDGY_STATUS__", shellQuote(ctx.paths.status));
  process.stdout.write(script);
  return 0;
}
