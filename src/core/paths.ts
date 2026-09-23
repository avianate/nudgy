import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type Paths = {
  home: string;
  db: string;
  config: string;
  log: string;
  status: string;
  bin: string;
  launchAgent: string;
  notifierApp: string;
  notifier: string;
};

export type Env = Record<string, string | undefined>;

export function resolvePaths(env: Env): Paths {
  const user = env.HOME || homedir();
  const home = env.NUDGY_HOME ? resolve(env.NUDGY_HOME) : join(user, ".nudgy");
  // Always under ~/.nudgy, even with NUDGY_HOME set: Notification Center permission belongs to this one bundle
  const notifierApp = join(user, ".nudgy", "Nudgy Notifier.app");
  return {
    home,
    db: join(home, "nudgy.db"),
    config: join(home, "config.json"),
    log: join(home, "daemon.log"),
    status: join(home, "status"),
    bin: join(user, ".local", "bin", "nudgy"),
    launchAgent: join(
      user,
      "Library",
      "LaunchAgents",
      "io.github.avianate.nudgy.daemon.plist",
    ),
    notifierApp,
    notifier: join(notifierApp, "Contents", "MacOS", "nudgy-notify"),
  };
}
