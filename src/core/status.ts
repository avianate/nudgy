import type { Database } from "bun:sqlite";
import { renameSync, writeFileSync } from "node:fs";
import { dueItems } from "./items";

// Written via rename so the prompt segment never reads a half-written file
export function writeStatus(path: string, count: number): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${count}\n`);
  renameSync(tmp, path);
}

// The prompt count is overdue reminders: due at or before now and not done
export function refreshStatus(db: Database, path: string, now: number): number {
  const count = dueItems(db, now).length;
  writeStatus(path, count);
  return count;
}
