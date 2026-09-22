import pkg from "../package.json";
import { type Parsed, parseArgs, type Reserved } from "./cli/args";
import type { Context } from "./cli/context";
import { JotError, UsageError } from "./cli/errors";
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
};

async function main(argv: string[]): Promise<number> {
  try {
    const parsed = parseArgs(argv);
    if (parsed.command === "version") {
      console.log(pkg.version);
      return 0;
    }
    if (parsed.command === "help" || parsed.command === "tui") {
      const { USAGE } = await import("./cli/help");
      console.log(USAGE);
      return 0;
    }
    const load = COMMANDS[parsed.command];
    if (!load)
      throw new UsageError(`jot ${parsed.command}: not implemented yet`);
    const { createContext } = await import("./cli/context");
    const command = await load();
    return await command.run(parsed, createContext(process.env, process.cwd()));
  } catch (e) {
    if (e instanceof UsageError || e instanceof InputError) {
      console.error(`jot: ${e.message}`);
      return 2;
    }
    if (e instanceof JotError || e instanceof ConfigError) {
      console.error(`jot: ${e.message}`);
      return 1;
    }
    throw e;
  }
}

process.exitCode = await main(process.argv.slice(2));
