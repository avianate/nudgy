import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type Paths = {
  home: string;
  db: string;
  config: string;
  log: string;
  status: string;
};

export type Env = Record<string, string | undefined>;

export function resolvePaths(env: Env): Paths {
  const home = env.JOT_HOME ? resolve(env.JOT_HOME) : join(homedir(), ".jot");
  return {
    home,
    db: join(home, "jot.db"),
    config: join(home, "config.json"),
    log: join(home, "daemon.log"),
    status: join(home, "status"),
  };
}
