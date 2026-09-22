import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Env } from "../core/paths";

// Returns the saved text, or null if the editor exited non-zero
export function editText(
  initial: string,
  env: Env,
  name = "jot.md",
): string | null {
  const dir = mkdtempSync(join(tmpdir(), "jot-edit-"));
  const file = join(dir, name);
  try {
    writeFileSync(file, initial);
    return runEditor(file, env) ? readFileSync(file, "utf8") : null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function runEditor(file: string, env: Env): boolean {
  const editor = env.EDITOR || "vi";
  // Through sh so EDITOR can carry arguments, e.g. "code --wait"
  const proc = Bun.spawnSync(["/bin/sh", "-c", `${editor} "$1"`, "sh", file], {
    stdio: ["inherit", "inherit", "inherit"],
    env: env as Record<string, string>,
  });
  return proc.exitCode === 0;
}
