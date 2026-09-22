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
  const home = env.JOT_HOME ? resolve(env.JOT_HOME) : join(user, ".jot");
  // Always under ~/.jot, even with JOT_HOME set: Notification Center permission belongs to this one bundle
  const notifierApp = join(user, ".jot", "Jot Notifier.app");
  return {
    home,
    db: join(home, "jot.db"),
    config: join(home, "config.json"),
    log: join(home, "daemon.log"),
    status: join(home, "status"),
    bin: join(user, ".local", "bin", "jot"),
    launchAgent: join(user, "Library", "LaunchAgents", "dev.jot.daemon.plist"),
    notifierApp,
    notifier: join(notifierApp, "Contents", "MacOS", "jot-notify"),
  };
}
