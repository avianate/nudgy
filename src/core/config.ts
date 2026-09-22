import { existsSync, readFileSync } from "node:fs";
import { ConfigError } from "./errors";

export type Config = {
  realertMinutes: number;
  defaultSnooze: string;
  hookWindowHours: number;
  sound: string;
};

export const DEFAULT_CONFIG: Config = {
  realertMinutes: 15,
  defaultSnooze: "10m",
  hookWindowHours: 4,
  sound: "Glass",
};

const KINDS: Record<keyof Config, "positive" | "string"> = {
  realertMinutes: "positive",
  defaultSnooze: "string",
  hookWindowHours: "positive",
  sound: "string",
};

export function loadConfig(path: string): Config {
  if (!existsSync(path)) return { ...DEFAULT_CONFIG };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new ConfigError(`${path}: invalid JSON (${(e as Error).message})`);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ConfigError(`${path}: expected a JSON object`);
  }
  const config = { ...DEFAULT_CONFIG };
  for (const key of Object.keys(KINDS) as (keyof Config)[]) {
    const value = (raw as Record<string, unknown>)[key];
    if (value === undefined) continue;
    const ok =
      KINDS[key] === "positive"
        ? typeof value === "number" && value > 0
        : typeof value === "string" && value.trim() !== "";
    if (!ok)
      throw new ConfigError(
        `${path}: "${key}" must be ${KINDS[key] === "positive" ? "a positive number" : "a non-empty string"}`,
      );
    (config as Record<string, unknown>)[key] = value;
  }
  return config;
}
