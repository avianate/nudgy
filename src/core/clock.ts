import type { Env } from "./paths";

export type Clock = { now(): number };

export const systemClock: Clock = { now: () => Date.now() };

export function fixedClock(ms: number): Clock {
  return { now: () => ms };
}

export function clockFromEnv(env: Env): Clock {
  if (env.NUDGY_NOW === undefined) return systemClock;
  const ms = Number(env.NUDGY_NOW);
  if (!Number.isInteger(ms))
    throw new Error(
      `NUDGY_NOW must be epoch milliseconds, got "${env.NUDGY_NOW}"`,
    );
  return fixedClock(ms);
}
