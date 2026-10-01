import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const DEFAULT_SPLIT = 0.5;
// Narrow enough to drag well aside, wide enough to keep the title and a row readable
export const MIN_PANE = 24;

// Stored as a ratio, not columns, so the split survives a terminal resize
export function splitColumns(ratio: number, width: number): number {
  if (width < 2 * MIN_PANE) return Math.floor(width / 2);
  return Math.max(
    MIN_PANE,
    Math.min(width - MIN_PANE, Math.round(ratio * width)),
  );
}

// A missing or corrupt file means the default; the TUI must open regardless
export function loadSplit(path: string): number {
  try {
    const { split } = JSON.parse(readFileSync(path, "utf8"));
    return typeof split === "number" && split > 0 && split < 1
      ? split
      : DEFAULT_SPLIT;
  } catch {
    return DEFAULT_SPLIT;
  }
}

export function saveSplit(path: string, ratio: number): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(
      tmp,
      `${JSON.stringify({ split: Number(ratio.toFixed(3)) })}\n`,
    );
    renameSync(tmp, path);
  } catch {}
}
