import type { Database } from "bun:sqlite";
import { type Clock, clockFromEnv } from "../core/clock";
import { openDb } from "../core/db";
import { type Git, gitContext } from "../core/git";
import { type Env, type Paths, resolvePaths } from "../core/paths";

export type Context = {
  env: Env;
  cwd: string;
  paths: Paths;
  clock: Clock;
  git: Git;
  out(text: string): void;
  err(text: string): void;
  db(): Database;
};

export function createContext(env: Env, cwd: string): Context {
  const paths = resolvePaths(env);
  let db: Database | undefined;
  return {
    env,
    cwd,
    paths,
    clock: clockFromEnv(env),
    git: gitContext,
    out: (text) => process.stdout.write(`${text}\n`),
    err: (text) => process.stderr.write(`${text}\n`),
    db: () => {
      db ??= openDb(paths.db);
      return db;
    },
  };
}
