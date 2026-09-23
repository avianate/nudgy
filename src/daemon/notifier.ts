import { appendFileSync, existsSync } from "node:fs";
import type { Banner } from "../core/alerts";
import type { Env, Paths } from "../core/paths";

export type Notification = Banner & { sound: string; snooze?: string };

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

export const HELPER_NOT_AUTHORIZED = 3;

// A clicked action relaunches the helper with no daemon around, so the payload says how to reach nudgy
export type HelperTarget = { nudgyBin: string; nudgyHome: string };

export function helperNotifier(
  executable: string,
  target: HelperTarget,
): Notifier {
  return {
    kind: "helper",
    async notify({ title, subtitle, body, sound, id, itemId, snooze }) {
      const payload = {
        title,
        subtitle,
        body,
        sound,
        id,
        ...(itemId === undefined
          ? {}
          : { item: { id: itemId, snooze: snooze ?? "", ...target } }),
      };
      const proc = Bun.spawn([executable, "--json", JSON.stringify(payload)], {
        stdout: "ignore",
        stderr: "pipe",
      });
      const code = await proc.exited;
      if (code === 0) return;
      const detail = (await new Response(proc.stderr).text()).trim();
      if (code === HELPER_NOT_AUTHORIZED) {
        throw new Error(
          `Nudgy is not allowed to notify (System Settings → Notifications → Nudgy): ${detail}`,
        );
      }
      throw new Error(`nudgy-notify exited ${code}: ${detail}`);
    },
  };
}

// Reminders must never go silent: if the helper is broken or refused, fall back and say why
export function withFallback(
  primary: Notifier,
  fallback: Notifier,
  log: (message: string) => void,
): Notifier {
  return {
    kind: `${primary.kind}+${fallback.kind}`,
    async notify(n) {
      try {
        await primary.notify(n);
      } catch (e) {
        log(
          `${primary.kind} notifier failed, using ${fallback.kind}: ${(e as Error).message}`,
        );
        await fallback.notify(n);
      }
    },
  };
}

export function notifierFromEnv(
  env: Env,
  paths: Paths,
  log: (message: string) => void = () => {},
): Notifier {
  const spec = env.NUDGY_NOTIFIER;
  if (spec?.startsWith("file:") && spec.length > 5)
    return fileNotifier(spec.slice(5));
  if (spec === "osascript") return osascriptNotifier;
  if (spec !== undefined)
    throw new Error(
      `NUDGY_NOTIFIER must be file:<path> or osascript, got "${spec}"`,
    );
  if (!existsSync(paths.notifier)) return osascriptNotifier;
  return withFallback(
    helperNotifier(paths.notifier, {
      nudgyBin: paths.bin,
      nudgyHome: paths.home,
    }),
    osascriptNotifier,
    log,
  );
}
