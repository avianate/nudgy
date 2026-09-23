import {
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import {
  LABEL,
  launchctlFromEnv,
  plistXml,
  waitUntilUnloaded,
} from "../daemon/launchd";
import { runLoop, type TickDeps, tick } from "../daemon/loop";
import { notifierFromEnv } from "../daemon/notifier";
import type { Parsed } from "./args";
import type { Context } from "./context";
import { NudgyError, UsageError } from "./errors";
import { absolute, relative } from "./format";

export async function run(parsed: Parsed, ctx: Context): Promise<number> {
  const [sub] = parsed.positionals;
  if (sub === "run") return runDaemon(parsed, ctx);
  if (sub === "install") return install(ctx);
  if (sub === "uninstall") return uninstall(ctx);
  if (sub === "status") return status(ctx);
  throw new UsageError("nudgy daemon run | install | uninstall | status");
}

async function runDaemon({ flags }: Parsed, ctx: Context): Promise<number> {
  const log = (message: string) =>
    ctx.err(`${new Date().toISOString()} ${message}`);
  const deps: TickDeps = {
    db: ctx.db,
    clock: ctx.clock,
    notifier: notifierFromEnv(ctx.env, ctx.paths, log),
    paths: ctx.paths,
    log,
  };
  if (flags.once) {
    await tick(deps);
    return 0;
  }
  const controller = new AbortController();
  for (const signal of ["SIGTERM", "SIGINT"] as const)
    process.on(signal, () => controller.abort());
  deps.log(
    `daemon started (pid ${process.pid}, notifier ${deps.notifier.kind})`,
  );
  await runLoop(deps, controller.signal);
  deps.log("daemon stopped");
  return 0;
}

async function install(ctx: Context): Promise<number> {
  const { paths } = ctx;
  if (!existsSync(paths.bin)) {
    throw new NudgyError(
      `${paths.bin} not found; run \`bun run install:local\` first`,
    );
  }
  const launchctl = launchctlFromEnv(ctx.env);
  if ((await launchctl.print()).loaded) {
    await launchctl.bootout();
    if (!(await waitUntilUnloaded(launchctl)))
      throw new NudgyError(`${LABEL} did not unload; try again`);
  }
  mkdirSync(dirname(paths.launchAgent), { recursive: true });
  mkdirSync(paths.home, { recursive: true });
  writeFileSync(paths.launchAgent, plistXml(paths));
  await launchctl.bootstrap(paths.launchAgent);
  ctx.out(`installed ${LABEL} (${paths.launchAgent})`);
  return 0;
}

async function uninstall(ctx: Context): Promise<number> {
  const launchctl = launchctlFromEnv(ctx.env);
  const wasLoaded = (await launchctl.print()).loaded;
  if (wasLoaded) await launchctl.bootout();
  const hadPlist = existsSync(ctx.paths.launchAgent);
  rmSync(ctx.paths.launchAgent, { force: true });
  ctx.out(
    wasLoaded || hadPlist
      ? `uninstalled ${LABEL}`
      : `${LABEL} was not installed`,
  );
  return 0;
}

async function status(ctx: Context): Promise<number> {
  const { loaded, pid } = await launchctlFromEnv(ctx.env).print();
  const state = !loaded
    ? "not loaded"
    : pid
      ? `running (pid ${pid})`
      : "loaded, not running";
  const lastTick = existsSync(ctx.paths.status)
    ? statSync(ctx.paths.status).mtimeMs
    : null;
  const now = ctx.clock.now();
  ctx.out(`daemon     ${state}`);
  ctx.out(
    `last tick  ${lastTick === null ? "never" : `${relative(lastTick, now)} (${absolute(lastTick)})`}`,
  );
  ctx.out(
    `plist      ${existsSync(ctx.paths.launchAgent) ? ctx.paths.launchAgent : "not installed"}`,
  );
  return 0;
}
