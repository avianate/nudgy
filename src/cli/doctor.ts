import {
  accessSync,
  constants,
  existsSync,
  realpathSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../core/config";
import { openDb, SCHEMA_VERSION } from "../core/db";
import { launchctlFromEnv } from "../daemon/launchd";
import { notifierFromEnv } from "../daemon/notifier";
import type { Parsed } from "./args";
import type { Context } from "./context";
import { relative } from "./format";
import { confirm } from "./prompt";

type Check = { label: string; ok: boolean; detail: string; warnOnly?: boolean };

const STALE_TICK_MS = 90_000;

function sameFile(a: string, b: string): boolean {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return false;
  }
}

function firstOnPath(env: Context["env"]): string | null {
  for (const dir of (env.PATH ?? "").split(":")) {
    if (!dir) continue;
    const candidate = join(dir, "nudgy");
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {}
  }
  return null;
}

async function runChecks(ctx: Context): Promise<Check[]> {
  const { paths, env } = ctx;
  const checks: Check[] = [];
  const binExists = existsSync(paths.bin);
  checks.push({
    label: "binary",
    ok: binExists,
    detail: binExists
      ? paths.bin
      : `${paths.bin} not found; run bun run install:local`,
  });

  const onPath = firstOnPath(env);
  checks.push({
    label: "on PATH",
    ok: onPath !== null && sameFile(onPath, paths.bin),
    detail:
      onPath === null
        ? "nudgy is not on PATH"
        : sameFile(onPath, paths.bin)
          ? onPath
          : `PATH finds ${onPath} first`,
  });

  if (binExists) {
    const sig = Bun.spawnSync(["/usr/bin/codesign", "--verify", paths.bin], {
      stderr: "pipe",
    });
    checks.push({
      label: "signature",
      ok: sig.exitCode === 0,
      detail:
        sig.exitCode === 0
          ? "valid"
          : sig.stderr.toString().trim() || "invalid",
    });
  } else {
    checks.push({
      label: "signature",
      ok: false,
      detail: "no binary to check",
    });
  }

  if (existsSync(paths.notifier)) {
    const sig = Bun.spawnSync(
      ["/usr/bin/codesign", "--verify", paths.notifierApp],
      { stderr: "pipe" },
    );
    checks.push({
      label: "notifier",
      ok: sig.exitCode === 0,
      detail:
        sig.exitCode === 0
          ? paths.notifierApp
          : `invalid signature: ${sig.stderr.toString().trim()}`,
    });
  } else {
    checks.push({
      label: "notifier",
      ok: false,
      detail: `${paths.notifierApp} missing; banners fall back to osascript (Script Editor). Run bun run install:local`,
    });
  }

  const { loaded, pid } = await launchctlFromEnv(env).print();
  const lastTick = existsSync(paths.status)
    ? statSync(paths.status).mtimeMs
    : null;
  const now = ctx.clock.now();
  const ticking = lastTick !== null && now - lastTick < STALE_TICK_MS;
  checks.push({
    label: "daemon",
    ok: loaded && pid !== null && ticking,
    detail: !loaded
      ? "not loaded; run nudgy daemon install"
      : `${pid ? `running (pid ${pid})` : "loaded, not running"}, last tick ${lastTick === null ? "never" : relative(lastTick, now)}`,
  });

  try {
    const db = openDb(paths.db);
    const { user_version } = db.query("PRAGMA user_version").get() as {
      user_version: number;
    };
    db.close();
    checks.push({
      label: "database",
      ok: user_version === SCHEMA_VERSION,
      detail: `schema v${user_version}`,
    });
  } catch (e) {
    checks.push({ label: "database", ok: false, detail: (e as Error).message });
  }

  try {
    loadConfig(paths.config);
    checks.push({
      label: "config",
      ok: true,
      detail: existsSync(paths.config) ? paths.config : "defaults (no file)",
    });
  } catch (e) {
    checks.push({ label: "config", ok: false, detail: (e as Error).message });
  }

  checks.push({
    label: "$EDITOR",
    ok: Boolean(env.EDITOR),
    detail: env.EDITOR || "not set (edit falls back to vi)",
    warnOnly: true,
  });
  return checks;
}

export async function run(_: Parsed, ctx: Context): Promise<number> {
  const checks = await runChecks(ctx);
  for (const c of checks) {
    ctx.out(
      `${c.ok ? "✓" : c.warnOnly ? "!" : "✗"} ${c.label.padEnd(10)} ${c.detail}`,
    );
  }

  let sound = "Glass";
  try {
    sound = loadConfig(ctx.paths.config).sound;
  } catch {}
  const failures: string[] = [];
  await notifierFromEnv(ctx.env, ctx.paths, (m) => failures.push(m)).notify({
    title: "nudgy doctor",
    subtitle: "",
    body: "If you can see this, notifications work.",
    sound,
    id: "nudgy-doctor",
  });
  for (const f of failures) ctx.out(`✗ helper     ${f}`);
  // Focus, preview settings or the osascript fallback can hide a banner without any error, so only the user can confirm it
  const seen = await confirm(
    "Sent a test banner. Did a banner appear (check Notification Center too)?",
  );
  if (!seen) {
    ctx.out("✗ banner     not confirmed");
    ctx.out(
      "  Fix: System Settings → Notifications → Nudgy → Allow notifications, Show previews: Always.",
    );
    ctx.out(
      "  (osascript fallback: System Settings → Notifications → Script Editor → Allow.)",
    );
    ctx.out(
      "  If it only shows in Notification Center, the screen may have been off or Focus is on.",
    );
  } else {
    ctx.out("✓ banner     confirmed");
  }
  return checks.every((c) => c.ok || c.warnOnly) && seen ? 0 : 1;
}
