import type { EventEmitter } from "node:events";
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import type { Context } from "../cli/context";
import { editText } from "../cli/editor";
import { App } from "./app";
import { createStore } from "./store";

type Guarded = {
  destroy(): void;
  exit(code: number): void;
  write(text: string): void;
};

// A thrown handler or rejected promise must not leave the terminal in raw mode on the alternate screen
export function installGuards(
  target: Guarded,
  proc: EventEmitter = process,
): () => void {
  const fatal = (e: unknown) => {
    target.destroy();
    target.write(
      `jot: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`,
    );
    target.exit(1);
  };
  const term = () => {
    target.destroy();
    target.exit(143);
  };
  proc.on("uncaughtException", fatal);
  proc.on("unhandledRejection", fatal);
  proc.on("SIGTERM", term);
  return () => {
    proc.off("uncaughtException", fatal);
    proc.off("unhandledRejection", fatal);
    proc.off("SIGTERM", term);
  };
}

export async function runTui(ctx: Context): Promise<number> {
  const origin = ctx.git(ctx.cwd);
  const store = createStore(ctx.db(), ctx.clock, {
    config: ctx.config,
    origin,
  });
  const renderer = await createCliRenderer({ exitOnCtrlC: true });
  return new Promise<number>((resolve) => {
    let destroyed = false;
    const destroy = () => {
      if (destroyed) return;
      destroyed = true;
      renderer.destroy();
    };
    const removeGuards = installGuards({
      destroy,
      exit: (code) => process.exit(code),
      write: (text) => process.stderr.write(text),
    });
    const quit = () => {
      removeGuards();
      destroy();
      resolve(0);
    };
    // Hand the terminal to $EDITOR and take it back; the spike showed suspend/resume round-trips cleanly
    const onEdit = async (item: { id: number; body: string }) => {
      renderer.suspend();
      try {
        return editText(item.body, ctx.env, `jot-${item.id}.md`);
      } finally {
        renderer.resume();
      }
    };
    createRoot(renderer).render(
      <App store={store} repo={origin.repo} onQuit={quit} onEdit={onEdit} />,
    );
  });
}
