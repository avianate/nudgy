import { describe, expect, test } from "bun:test";
import { parseArgs, RESERVED } from "./args";
import { UsageError } from "./errors";

describe("dispatch", () => {
  test("no arguments opens the TUI", () => {
    expect(parseArgs([]).command).toBe("tui");
  });

  test("--version and --help are global", () => {
    expect(parseArgs(["--version"]).command).toBe("version");
    expect(parseArgs(["--help"]).command).toBe("help");
    expect(parseArgs(["-h"]).command).toBe("help");
  });

  test("a bare non-reserved first argument is a capture", () => {
    const parsed = parseArgs(["check the migration landed"]);
    expect(parsed).toMatchObject({
      command: "add",
      positionals: ["check the migration landed"],
    });
  });

  test("unquoted words are captured together", () => {
    expect(parseArgs(["check", "the", "migration"]).positionals).toEqual([
      "check",
      "the",
      "migration",
    ]);
  });

  test.each([...RESERVED])(
    "reserved word %s dispatches to its subcommand",
    (word) => {
      expect(parseArgs([word]).command).toBe(word);
    },
  );

  test("nudgy add <reserved> captures the literal word", () => {
    expect(parseArgs(["add", "today"])).toMatchObject({
      command: "add",
      positionals: ["today"],
    });
  });

  test("nudgy -- <text> captures literally, including things that look like flags", () => {
    expect(parseArgs(["--", "today", "-r", "x"])).toMatchObject({
      command: "add",
      positionals: ["today", "-r", "x"],
      flags: {},
    });
  });

  test("-r on a capture takes the reminder text", () => {
    expect(
      parseArgs(["re-run the suite", "-r", "in 2 hours"]).flags.remind,
    ).toBe("in 2 hours");
    expect(parseArgs(["-r", "in 2 hours", "re-run"]).flags.remind).toBe(
      "in 2 hours",
    );
    expect(parseArgs(["add", "x", "--remind", "tomorrow"]).flags.remind).toBe(
      "tomorrow",
    );
  });

  test("--help after a subcommand shows help", () => {
    expect(parseArgs(["ls", "--help"]).command).toBe("help");
  });
});

describe("flags", () => {
  test("ls takes its boolean filters", () => {
    expect(
      parseArgs(["ls", "--here", "--done", "--reminders", "--json"]).flags,
    ).toEqual({
      here: true,
      done: true,
      reminders: true,
      json: true,
    });
  });

  test("rm accepts -y", () => {
    expect(parseArgs(["rm", "3", "-y"])).toMatchObject({
      positionals: ["3"],
      flags: { yes: true },
    });
  });

  test("due accepts the hidden --within", () => {
    expect(parseArgs(["due", "--within", "4"]).flags.within).toBe("4");
  });

  test("an unknown flag is a usage error that suggests the literal form", () => {
    expect(() => parseArgs(["ls", "--bogus"])).toThrow(UsageError);
    expect(() => parseArgs(["use", "--force"])).toThrow(/nudgy --/);
  });

  test("-r without a value is a usage error", () => {
    expect(() => parseArgs(["x", "-r"])).toThrow(UsageError);
  });
});
