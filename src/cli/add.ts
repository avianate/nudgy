import { basename } from "node:path";
import { createItem } from "../core/items";
import type { Parsed } from "./args";
import type { Context } from "./context";
import { UsageError } from "./errors";

export function run(parsed: Parsed, ctx: Context): number {
  const body = parsed.positionals.join(" ").trim();
  if (!body) throw new UsageError('nothing to capture: jot "<text>"');
  if (parsed.flags.remind !== undefined)
    throw new UsageError("reminders are not supported yet");
  const { repo, branch } = ctx.git(ctx.cwd);
  const item = createItem(ctx.db(), { body, repo, branch }, ctx.clock.now());
  const where = repo ? ` [${basename(repo)}${branch ? `@${branch}` : ""}]` : "";
  ctx.out(`saved #${item.id}${where}`);
  return 0;
}
