import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG, loadConfig } from "./config";
import { ConfigError } from "./errors";

function configFile(content?: string) {
  const path = join(mkdtempSync(join(tmpdir(), "jot-config-")), "config.json");
  if (content !== undefined) writeFileSync(path, content);
  return path;
}

test("a missing config file gives the defaults", () => {
  expect(loadConfig(configFile())).toEqual({
    realertMinutes: 15,
    defaultSnooze: "10m",
    hookWindowHours: 4,
    sound: "Glass",
  });
});

test("given keys override the defaults and missing keys fall back", () => {
  expect(
    loadConfig(configFile('{"realertMinutes": 1, "sound": "Ping"}')),
  ).toEqual({
    ...DEFAULT_CONFIG,
    realertMinutes: 1,
    sound: "Ping",
  });
});

test("unknown keys are ignored", () => {
  expect(loadConfig(configFile('{"future": true}'))).toEqual(DEFAULT_CONFIG);
});

test.each([
  ["not json", "{nope"],
  ["a non-object", "[1,2]"],
  ["a wrong type", '{"realertMinutes": "15"}'],
  ["a non-positive number", '{"hookWindowHours": 0}'],
  ["an empty string", '{"defaultSnooze": ""}'],
])("%s is reported with the file path", (_, content) => {
  const path = configFile(content);
  expect(() => loadConfig(path)).toThrow(ConfigError);
  expect(() => loadConfig(path)).toThrow(path);
});

test("an invalid file is never overwritten", () => {
  const path = configFile("{nope");
  expect(() => loadConfig(path)).toThrow();
  expect(readFileSync(path, "utf8")).toBe("{nope");
});
