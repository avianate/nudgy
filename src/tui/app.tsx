import { basename } from "node:path";
import type {
  BoxRenderable,
  MouseEvent,
  MousePointerStyle,
} from "@opentui/core";
import {
  useFocus,
  useKeyboard,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { absolute, relative } from "../cli/format";
import { type Item, title } from "../core/items";
import { DEFAULT_SPLIT, splitColumns } from "./split";
import { type Store, TABS, type Tab } from "./store";
import {
  ACCENT,
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
  // Left pane's share of the width; onSplit fires once per drag, when it ends
  split?: number;
  onSplit?(ratio: number): void;
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
  split: initialSplit = DEFAULT_SPLIT,
  onSplit,
}: AppProps) {
  const { width, height } = useTerminalDimensions();
  const renderer = useRenderer();
  const [tab, setTab] = useState<Tab>("due");
  const [version, setVersion] = useState(0);
  const [selection, setSelection] = useState<Selection>({ id: null, index: 0 });
  const [mode, setMode] = useState<Mode>({ kind: "normal" });
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [repoOnly, setRepoOnly] = useState(false);
  const [split, setSplit] = useState(initialSplit);
  const [resizing, setResizing] = useState(false);
  const [hovering, setHovering] = useState(false);
  // Several drag events can arrive between renders, so the handlers read refs, not state
  const drag = useRef<{ start: number; ratio: number } | null>(null);
  const pointer = useRef<MousePointerStyle>("default");
  const panes = useRef<BoxRenderable>(null);

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
    // Suspending hands the pointer back to the terminal; forget the resize shape so a later hover sets it again
    showPointer("default");
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

  const leftCols = splitColumns(split, width);
  // The footer wraps on narrow terminals, so the panes' height comes from layout, not the terminal.
  // Read it when needed: layout runs after render, so during the first render it is still 0
  const paneRows = () => panes.current?.height || height - 1;
  // The divider is the two border columns where the panes meet
  const onSeam = (e: MouseEvent) =>
    (e.x === leftCols - 1 || e.x === leftCols) && e.y < paneRows();
  // Terminals without pointer-shape support (OSC 22), like Warp and Terminal.app, ignore the shape,
  // so the divider also lights up while the pointer is on it
  const showPointer = (style: MousePointerStyle) => {
    if (pointer.current === style) return;
    pointer.current = style;
    setHovering(style !== "default");
    renderer.setMousePointer(style);
    // The shape goes out with the next frame, and a hover alone doesn't draw one
    renderer.requestRender();
  };
  const onSeamHover = (e: MouseEvent) => {
    // ew-resize, not col-resize: Ghostty's macOS app ignores shapes it can't map to an NSCursor, col-resize among them
    if (!drag.current) showPointer(onSeam(e) ? "ew-resize" : "default");
  };
  const endDrag = () => {
    if (!drag.current) return;
    const { start, ratio } = drag.current;
    drag.current = null;
    setResizing(false);
    if (ratio !== start) onSplit?.(ratio);
  };
  const onSeamDown = (e: MouseEvent) => {
    // A release lost off the window edge would leave the drag live; settle it before the new press
    endDrag();
    if (e.button !== 0 || !onSeam(e)) return;
    drag.current = { start: leftCols / width, ratio: leftCols / width };
    setResizing(true);
    e.preventDefault();
  };
  const onSeamDrag = (e: MouseEvent) => {
    if (!drag.current) return;
    // Keep the left pane's right border under the pointer, and the stored ratio inside the clamp
    drag.current.ratio = splitColumns((e.x + 1) / width, width) / width;
    setSplit(drag.current.ratio);
  };

  const listWidth = leftCols - 5;
  const rows = Math.max(1, height - 5);
  const start = Math.max(0, index - rows + 1);
  const visible = items.slice(start, start + rows);
  const target =
    mode.kind === "remind" || mode.kind === "confirm-delete"
      ? store.get(mode.id)
      : null;

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: a terminal box, not a DOM element; there are no roles */}
      {/* biome-ignore lint/a11y/useKeyWithMouseEvents: a pointer shape only; keyboard users have no pointer to change */}
      <box
        ref={panes}
        flexDirection="row"
        flexGrow={1}
        onMouseDown={onSeamDown}
        onMouseDrag={onSeamDrag}
        onMouseUp={(e) => {
          endDrag();
          onSeamHover(e);
        }}
        onMouseMove={onSeamHover}
        onMouseOut={onSeamHover}
      >
        <box
          border
          title=" nudgy "
          width={leftCols}
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
        {resizing || hovering ? (
          // A box border has one colour, so the lit divider is drawn over the two facing vertical
          // edges. Not selectable: a press on selectable text starts a selection, which steals the drag
          <text
            position="absolute"
            left={leftCols - 1}
            top={1}
            width={2}
            selectable={false}
            fg={ACCENT}
            content={Array(Math.max(0, paneRows() - 2))
              .fill("││")
              .join("\n")}
          />
        ) : null}
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
