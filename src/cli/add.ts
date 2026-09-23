import { basename } from "node:path";
import { createItem } from "../core/items";
import type { Parsed } from "./args";
import type { Context } from "./context";
import { UsageError } from "./errors";
import { absolute, relative } from "./format";

export async function run(parsed: Parsed, ctx: Context): Promise<number> {
  const body = parsed.positionals.join(" ").trim();
  if (!body) throw new UsageError('nothing to capture: nudgy "<text>"');
  const now = ctx.clock.now();
  const when = parsed.flags.remind;
  // Loaded only with -r so chrono stays off the plain capture path
  const reminder =
    typeof when === "string"
      ? (await import("./reminder")).parseReminder(when, now)
      : null;
  const { repo, branch } = ctx.git(ctx.cwd);
  const item = createItem(ctx.db(), { body, repo, branch, ...reminder }, now);
  const where = repo ? ` [${basename(repo)}${branch ? `@${branch}` : ""}]` : "";
  const remind =
    item.remindAt !== null
      ? ` · ${absolute(item.remindAt)} (${relative(item.remindAt, now)})`
      : "";
  ctx.out(`saved #${item.id}${where}${remind}`);
  return 0;
}
