import { appendFileSync } from "node:fs";
import type { Banner } from "../core/alerts";
import type { Env } from "../core/paths";

export type Notification = Banner & { sound: string };

export type Notifier = { kind: string; notify(n: Notification): Promise<void> };

// Text goes in via argv, never interpolated into the script — a quote in a note would otherwise inject AppleScript
const SCRIPT = `on run argv
  display notification (item 3 of argv) with title (item 1 of argv) subtitle (item 2 of argv) sound name (item 4 of argv)
end run`;

export function osascriptArgv({
  title,
  subtitle,
  body,
  sound,
}: Notification): string[] {
  return ["/usr/bin/osascript", "-e", SCRIPT, title, subtitle, body, sound];
}

export const osascriptNotifier: Notifier = {
  kind: "osascript",
  async notify(n) {
    const proc = Bun.spawn(osascriptArgv(n), {
      stdout: "ignore",
      stderr: "pipe",
    });
    const code = await proc.exited;
    if (code !== 0)
      throw new Error(
        `osascript exited ${code}: ${await new Response(proc.stderr).text()}`,
      );
  },
};

export function fileNotifier(path: string): Notifier {
  return {
    kind: "file",
    async notify(n) {
      appendFileSync(path, `${JSON.stringify(n)}\n`);
    },
  };
}

export function notifierFromEnv(env: Env): Notifier {
  const spec = env.JOT_NOTIFIER;
  if (spec === undefined) return osascriptNotifier;
  if (spec.startsWith("file:") && spec.length > 5)
    return fileNotifier(spec.slice(5));
  throw new Error(`JOT_NOTIFIER must be file:<path>, got "${spec}"`);
}
