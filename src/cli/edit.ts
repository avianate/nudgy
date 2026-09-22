import { updateBody } from "../core/items";
import type { Parsed } from "./args";
import { requireItem } from "./common";
import type { Context } from "./context";
import { editText } from "./editor";
import { JotError } from "./errors";

export function run({ positionals }: Parsed, ctx: Context): number {
  const item = requireItem(ctx, positionals[0]);
  const edited = editText(item.body, ctx.env, `jot-${item.id}.md`);
  if (edited === null)
    throw new JotError("editor exited with an error; nothing saved");
  const body = edited.trimEnd();
  if (!body.trim()) throw new JotError("empty body; nothing saved");
  if (body === item.body) {
    ctx.out(`#${item.id} unchanged`);
    return 0;
  }
  updateBody(ctx.db(), item.id, body, ctx.clock.now());
  ctx.out(`saved #${item.id}`);
  return 0;
}
