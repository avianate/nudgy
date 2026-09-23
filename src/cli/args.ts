import { parseArgs as nodeParseArgs, type ParseArgsConfig } from "node:util";
import { UsageError } from "./errors";

export const RESERVED = [
  "add",
  "ls",
  "today",
  "yesterday",
  "tomorrow",
  "due",
  "search",
  "show",
  "edit",
  "remind",
  "snooze",
  "done",
  "reopen",
  "rm",
  "daemon",
  "hook",
  "doctor",
  "config",
  "help",
] as const;

export type Reserved = (typeof RESERVED)[number];

export type Parsed = {
  command: Reserved | "tui" | "version";
  positionals: string[];
  flags: Record<string, string | boolean | undefined>;
};

type Options = NonNullable<ParseArgsConfig["options"]>;

const bool = { type: "boolean" } as const;
const dayFlags: Options = { here: bool, json: bool };

const OPTIONS: Record<Reserved, Options> = {
  add: { remind: { type: "string", short: "r" } },
  ls: { here: bool, done: bool, reminders: bool, json: bool },
  today: dayFlags,
  yesterday: dayFlags,
  tomorrow: dayFlags,
  due: { json: bool, within: { type: "string" } },
  search: { here: bool, json: bool },
  show: { json: bool },
  edit: {},
  remind: { clear: bool },
  snooze: {},
  done: {},
  reopen: {},
  rm: { yes: { type: "boolean", short: "y" } },
  daemon: { once: bool },
  hook: {},
  doctor: {},
  config: {},
  help: {},
};

function isReserved(word: string): word is Reserved {
  return (RESERVED as readonly string[]).includes(word);
}

export function parseArgs(argv: string[]): Parsed {
  const [first, ...rest] = argv;
  if (first === undefined)
    return { command: "tui", positionals: [], flags: {} };
  if (first === "--version")
    return { command: "version", positionals: [], flags: {} };
  if (first === "--help" || first === "-h")
    return { command: "help", positionals: [], flags: {} };
  if (isReserved(first)) return parseCommand(first, rest);
  return parseCommand("add", argv);
}

function parseCommand(command: Reserved, args: string[]): Parsed {
  try {
    const { values, positionals } = nodeParseArgs({
      args,
      options: { ...OPTIONS[command], help: { type: "boolean", short: "h" } },
      allowPositionals: true,
      strict: true,
    });
    if (values.help) return { command: "help", positionals: [], flags: {} };
    return { command, positionals, flags: values };
  } catch (e) {
    const hint =
      command === "add" ? ' (to capture it literally: nudgy -- "<text>")' : "";
    throw new UsageError(`${(e as Error).message}${hint}`);
  }
}
