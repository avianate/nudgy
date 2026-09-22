import { getItem, type Item } from "../core/items";
import type { Context } from "./context";
import { JotError, UsageError } from "./errors";
import { listLine, toJson } from "./format";

export function parseId(raw: string | undefined): number {
  const id = Number(raw);
  if (raw === undefined || !Number.isInteger(id) || id <= 0)
    throw new UsageError(`expected an item id, got "${raw ?? ""}"`);
  return id;
}

export function requireItem(ctx: Context, raw: string | undefined): Item {
  const id = parseId(raw);
  const item = getItem(ctx.db(), id);
  if (!item) throw new JotError(`no item #${id}`);
  return item;
}

export function currentRepo(ctx: Context): string {
  const { repo } = ctx.git(ctx.cwd);
  if (!repo) throw new JotError("--here: not inside a git repo");
  return repo;
}

export function printItems(ctx: Context, items: Item[], json: boolean) {
  if (json) {
    ctx.out(JSON.stringify(items.map(toJson), null, 2));
    return;
  }
  if (items.length === 0) {
    ctx.out("no items");
    return;
  }
  const now = ctx.clock.now();
  for (const item of items) ctx.out(listLine(item, now));
}
