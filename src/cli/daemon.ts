import { runLoop, type TickDeps, tick } from "../daemon/loop";
import { notifierFromEnv } from "../daemon/notifier";
import type { Parsed } from "./args";
import type { Context } from "./context";
import { UsageError } from "./errors";

export async function run(parsed: Parsed, ctx: Context): Promise<number> {
  const [sub] = parsed.positionals;
  if (sub === "run") return runDaemon(parsed, ctx);
  throw new UsageError("jot daemon run | install | uninstall | status");
}

async function runDaemon({ flags }: Parsed, ctx: Context): Promise<number> {
  const deps: TickDeps = {
    db: ctx.db,
    clock: ctx.clock,
    notifier: notifierFromEnv(ctx.env),
    paths: ctx.paths,
    log: (message) => ctx.err(`${new Date().toISOString()} ${message}`),
  };
  if (flags.once) {
    await tick(deps);
    return 0;
  }
  const controller = new AbortController();
  for (const signal of ["SIGTERM", "SIGINT"] as const)
    process.on(signal, () => controller.abort());
  deps.log(`daemon started (pid ${process.pid})`);
  await runLoop(deps, controller.signal);
  deps.log("daemon stopped");
  return 0;
}
