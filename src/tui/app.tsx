import { basename } from "node:path";
import { useFocus, useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useEffect, useMemo, useState } from "react";
import { absolute, relative } from "../cli/format";
import { type Item, title } from "../core/items";
import { type Store, TABS, type Tab } from "./store";
import {
  Detail,
  Help,
  HINTS,
  ItemRow,
  Prompt,
  StatusLine,
  TabsLine,
} from "./views";

export type AppProps = {
  store: Store;
  repo: string | null;
  refreshMs?: number;
  onQuit(): void;
  // Returns the edited body, or null if the editor failed
  onEdit?(item: Item): Promise<string | null>;
};

// Exactly one handler sees each key, so typing into a prompt can never trigger a shortcut
type Mode =
  | { kind: "normal" }
  | { kind: "add" }
  | { kind: "search" }
  | { kind: "help" }
  | { kind: "remind"; id: number }
  | { kind: "confirm-delete"; id: number };

type Selection = { id: number | null; index: number };

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

export function App({
  store,
  repo,
  refreshMs = 30_000,
  onQuit,
  onEdit,
}: AppProps) {
  const { width, height } = useTerminalDimensions();
  const [tab, setTab] = useState<Tab>("due");
  const [version, setVersion] = useState(0);
  const [selection, setSelection] = useState<Selection>({ id: null, index: 0 });
  const [mode, setMode] = useState<Mode>({ kind: "normal" });
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [repoOnly, setRepoOnly] = useState(false);

  const reload = () => setVersion((v) => v + 1);
  // biome-ignore lint/correctness/useExhaustiveDependencies: version is the reload trigger
  const items = useMemo(
    () => store.load(tab, { repo: repoOnly && repo ? repo : undefined, query }),
    [store, tab, version, repoOnly, repo, query],
  );
  const now = store.now();

  // Follow the item, not the row: refreshes and actions reshape the list underneath the cursor
  const found =
    selection.id === null ? -1 : items.findIndex((i) => i.id === selection.id);
  const index =
    found !== -1 ? found : clamp(selection.index, 0, items.length - 1);
  const selected = items[index] ?? null;

  useEffect(() => {
    const id = selected?.id ?? null;
    const at = Math.max(0, index);
    if (id !== selection.id || at !== selection.index)
      setSelection({ id, index: at });
  }, [selected?.id, index, selection]);

  useEffect(() => {
    const timer = setInterval(() => setVersion((v) => v + 1), refreshMs);
    return () => clearInterval(timer);
  }, [refreshMs]);
  useFocus(reload);

  const moveTo = (i: number) => {
    const next = clamp(i, 0, items.length - 1);
    setSelection({ id: items[next]?.id ?? null, index: next });
  };
  const switchTab = (delta: number) => {
    setTab(
      (t) => TABS[(TABS.indexOf(t) + delta + TABS.length) % TABS.length] as Tab,
    );
    setSelection({ id: null, index: 0 });
  };

  // Store errors (bad reminder text, invalid config) surface on the status line; nothing may throw out of a handler
  const attempt = (action: () => string) => {
    try {
      setStatus(action());
    } catch (e) {
      setStatus(`✗ ${(e as Error).message.split(";")[0]}`);
    }
    setMode({ kind: "normal" });
    reload();
  };

  const describeNext = (remindAt: number | null) =>
    remindAt === null
      ? ""
      : `${absolute(remindAt)} (${relative(remindAt, store.now())})`;

  const onNormalKey = (name: string, shift: boolean) => {
    switch (name) {
      case "q":
        onQuit();
        return;
      case "j":
      case "down":
        moveTo(index + 1);
        return;
      case "k":
      case "up":
        moveTo(index - 1);
        return;
      case "tab":
        switchTab(shift ? -1 : 1);
        return;
      case "a":
        setMode({ kind: "add" });
        return;
      case "/":
        setMode({ kind: "search" });
        return;
      case "?":
        setMode({ kind: "help" });
        return;
      case "escape":
        setQuery("");
        return;
      case "h":
        if (!repo) setStatus("✗ not inside a git repo");
        else setRepoOnly((on) => !on);
        return;
    }
    if (!selected) return;
    const id = selected.id;
    switch (name) {
      case "d":
        attempt(() => {
          const updated = store.complete(id);
          return updated && updated.doneAt === null
            ? `#${id} next: ${describeNext(updated.remindAt)}`
            : `done #${id}`;
        });
        return;
      case "s":
        attempt(
          () =>
            `snoozed #${id} until ${describeNext(store.snooze(id)?.remindAt ?? null)}`,
        );
        return;
      case "r":
        setMode({ kind: "remind", id });
        return;
      case "x":
        setMode({ kind: "confirm-delete", id });
        return;
      case "e":
        if (onEdit) void edit(selected);
        return;
    }
  };

  const edit = async (item: Item) => {
    let edited: string | null;
    try {
      edited = await (onEdit as NonNullable<typeof onEdit>)(item);
    } catch (e) {
      setStatus(`✗ ${(e as Error).message}`);
      return;
    }
    attempt(() => {
      if (edited === null)
        return "✗ editor exited with an error; nothing saved";
      const body = edited.trimEnd();
      if (!body.trim()) return "✗ empty body; nothing saved";
      if (body === item.body) return `#${item.id} unchanged`;
      store.setBody(item.id, body);
      return `saved #${item.id}`;
    });
  };

  useKeyboard((key) => {
    if (mode.kind === "normal") {
      // Punctuation keys are matched on the sequence too, since terminals differ in how they name them
      const name =
        key.sequence === "/" || key.sequence === "?" ? key.sequence : key.name;
      onNormalKey(name, key.shift);
      return;
    }
    if (mode.kind === "help") {
      setMode({ kind: "normal" });
      return;
    }
    if (key.name === "escape") {
      if (mode.kind === "search") setQuery("");
      setMode({ kind: "normal" });
      setStatus("");
      return;
    }
    if (mode.kind === "confirm-delete") {
      if (key.name === "y") {
        attempt(() => {
          store.remove(mode.id);
          return `deleted #${mode.id}`;
        });
      } else {
        setMode({ kind: "normal" });
        setStatus("not deleted");
      }
    }
  });

  const submitAdd = (text: string) => {
    if (!text.trim()) return setMode({ kind: "normal" });
    attempt(() => {
      const item = store.add(text.trim());
      setSelection({ id: item.id, index: 0 });
      return `added #${item.id}`;
    });
  };
  const submitRemind = (id: number, text: string) => {
    if (!text.trim()) return setMode({ kind: "normal" });
    attempt(
      () =>
        `#${id} reminds ${describeNext(store.remind(id, text)?.remindAt ?? null)}`,
    );
  };

  const listWidth = Math.floor(width / 2) - 5;
  const rows = Math.max(1, height - 5);
  const start = Math.max(0, index - rows + 1);
  const visible = items.slice(start, start + rows);
  const target =
    mode.kind === "remind" || mode.kind === "confirm-delete"
      ? store.get(mode.id)
      : null;

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box flexDirection="row" flexGrow={1}>
        <box
          border
          title=" jot "
          width="50%"
          flexDirection="column"
          paddingLeft={1}
          paddingRight={1}
        >
          <TabsLine
            tab={tab}
            repo={repoOnly && repo ? basename(repo) : null}
            query={query}
          />
          {items.length === 0 ? (
            <text fg="#8a8f98">nothing here</text>
          ) : (
            visible.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                selected={item.id === selected?.id}
                now={now}
                width={listWidth}
              />
            ))
          )}
        </box>
        <box
          border
          title=" detail "
          flexGrow={1}
          flexDirection="column"
          paddingLeft={1}
          paddingRight={1}
        >
          {mode.kind === "help" ? (
            <Help />
          ) : selected ? (
            <Detail item={selected} now={now} />
          ) : (
            <text fg="#8a8f98">no item selected</text>
          )}
        </box>
      </box>
      {mode.kind === "add" ? (
        <Prompt label="New note:" onSubmit={submitAdd} />
      ) : mode.kind === "search" ? (
        <Prompt
          label="Search:"
          initial={query}
          onInput={setQuery}
          onSubmit={() => setMode({ kind: "normal" })}
        />
      ) : mode.kind === "remind" ? (
        <Prompt
          label={`Remind #${mode.id} (in 2h, fri 4pm, every weekday 9am, clear):`}
          onSubmit={(text) => submitRemind(mode.id, text)}
        />
      ) : mode.kind === "confirm-delete" ? (
        <StatusLine
          text={`Delete #${mode.id} "${target ? title(target.body) : ""}"? y/N`}
        />
      ) : (
        <StatusLine text={status || HINTS} />
      )}
    </box>
  );
}
