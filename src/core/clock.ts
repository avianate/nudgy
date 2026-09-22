import type { Env } from "./paths";

export type Clock = { now(): number };

export const systemClock: Clock = { now: () => Date.now() };

export function fixedClock(ms: number): Clock {
  return { now: () => ms };
}

export function clockFromEnv(env: Env): Clock {
  if (env.JOT_NOW === undefined) return systemClock;
  const ms = Number(env.JOT_NOW);
  if (!Number.isInteger(ms))
    throw new Error(`JOT_NOW must be epoch milliseconds, got "${env.JOT_NOW}"`);
  return fixedClock(ms);
}
