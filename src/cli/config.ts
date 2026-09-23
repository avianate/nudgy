import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { DEFAULT_CONFIG, loadConfig } from "../core/config";
import type { Parsed } from "./args";
import type { Context } from "./context";
import { runEditor } from "./editor";
import { NudgyError } from "./errors";

export function run(_: Parsed, ctx: Context): number {
  const { config } = ctx.paths;
  if (!existsSync(config)) {
    mkdirSync(ctx.paths.home, { recursive: true });
    writeFileSync(config, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
  }
  if (!runEditor(config, ctx.env))
    throw new NudgyError("editor exited with an error");
  loadConfig(config);
  ctx.out(`config ok: ${config}`);
  return 0;
}
