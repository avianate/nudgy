import type { Database } from "bun:sqlite";
import { writeFileSync } from "node:fs";
import { notificationFor, planAlerts } from "../core/alerts";
import type { Clock } from "../core/clock";
import { type Config, DEFAULT_CONFIG, loadConfig } from "../core/config";
import { dueItems, markAlerted } from "../core/items";
import { rollForwardDue } from "../core/lifecycle";
import type { Paths } from "../core/paths";
import { writeStatus } from "../core/status";
import type { Notifier } from "./notifier";

export type TickDeps = {
  db: () => Database;
  clock: Clock;
  notifier: Notifier;
  paths: Paths;
  log: (message: string) => void;
};

export const TICK_MS = 30_000;

// Never throws: under launchd KeepAlive an escaped error becomes a crash loop
export async function tick(deps: TickDeps): Promise<void> {
  try {
    const config = readConfig(deps);
    const db = deps.db();
    const now = deps.clock.now();
    rollForwardDue(db, now);
    const due = dueItems(db, now);
    const plan = planAlerts(due, now, config);
    if (plan.kind !== "none") {
      try {
        await deps.notifier.notify({
          ...notificationFor(plan),
          sound: config.sound,
          snooze: config.defaultSnooze,
        });
        markAlerted(
          db,
          plan.items.map((i) => i.id),
          now,
        );
      } catch (e) {
        deps.log(`notify failed, will retry: ${(e as Error).message}`);
      }
    }
    writeStatus(deps.paths.status, due.length);
    // The CLI also rewrites status, so liveness gets its own file that only the daemon touches
    writeFileSync(deps.paths.tick, `${new Date(now).toISOString()}\n`);
  } catch (e) {
    deps.log(`tick failed: ${(e as Error).message}`);
  }
}

function readConfig(deps: TickDeps): Config {
  try {
    return loadConfig(deps.paths.config);
  } catch (e) {
    deps.log(`${(e as Error).message}; using defaults`);
    return DEFAULT_CONFIG;
  }
}

export async function runLoop(
  deps: TickDeps,
  signal: AbortSignal,
  intervalMs = TICK_MS,
): Promise<void> {
  while (!signal.aborted) {
    await tick(deps);
    await new Promise<void>((resolve) => {
      const wake = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", wake);
        resolve();
      };
      const timer = setTimeout(wake, intervalMs);
      signal.addEventListener("abort", wake);
    });
  }
}
