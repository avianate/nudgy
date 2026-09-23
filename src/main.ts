import pkg from "../package.json";
import { type Parsed, parseArgs, type Reserved } from "./cli/args";
import type { Context } from "./cli/context";
import { NudgyError, UsageError } from "./cli/errors";
import { ConfigError, InputError } from "./core/errors";

type Command = { run(parsed: Parsed, ctx: Context): number | Promise<number> };

const COMMANDS: Partial<Record<Reserved, () => Promise<Command>>> = {
  add: () => import("./cli/add"),
  ls: () => import("./cli/ls"),
  show: () => import("./cli/show"),
  edit: () => import("./cli/edit"),
  rm: () => import("./cli/rm"),
  search: () => import("./cli/search"),
  remind: () => import("./cli/remind"),
  done: () => import("./cli/done"),
  reopen: () => import("./cli/reopen"),
  snooze: () => import("./cli/snooze"),
  due: () => import("./cli/due"),
  today: () => import("./cli/day"),
  yesterday: () => import("./cli/day"),
  tomorrow: () => import("./cli/day"),
  daemon: () => import("./cli/daemon"),
  hook: () => import("./cli/hook"),
  doctor: () => import("./cli/doctor"),
  config: () => import("./cli/config"),
};

const CHANGES_DUE = new Set<Parsed["command"]>([
  "add",
  "remind",
  "snooze",
  "done",
  "reopen",
  "rm",
]);

async function main(argv: string[]): Promise<number> {
  try {
    const parsed = parseArgs(argv);
    if (parsed.command === "version") {
      console.log(pkg.version);
      return 0;
    }
    if (parsed.command === "tui") {
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new UsageError(
          'the TUI needs a terminal; to capture, use nudgy "<text>" (see nudgy --help)',
        );
      }
      const { createContext } = await import("./cli/context");
      const { runTui } = await import("./tui/run");
      return await runTui(createContext(process.env, process.cwd()));
    }
    if (parsed.command === "help") {
      const { USAGE } = await import("./cli/help");
      console.log(USAGE);
      return 0;
    }
    const load = COMMANDS[parsed.command];
    if (!load)
      throw new UsageError(`nudgy ${parsed.command}: not implemented yet`);
    const { createContext } = await import("./cli/context");
    const command = await load();
    const ctx = createContext(process.env, process.cwd());
    const code = await command.run(parsed, ctx);
    if (code === 0 && CHANGES_DUE.has(parsed.command)) {
      // Refresh the prompt count now rather than on the daemon's next tick, up to 30s later
      const { refreshStatus } = await import("./core/status");
      try {
        refreshStatus(ctx.db(), ctx.paths.status, ctx.clock.now());
      } catch {}
    }
    return code;
  } catch (e) {
    if (e instanceof UsageError || e instanceof InputError) {
      console.error(`nudgy: ${e.message}`);
      return 2;
    }
    if (e instanceof NudgyError || e instanceof ConfigError) {
      console.error(`nudgy: ${e.message}`);
      return 1;
    }
    throw e;
  }
}

process.exitCode = await main(process.argv.slice(2));
