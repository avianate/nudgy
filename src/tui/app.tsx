import { useFocus, useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useEffect, useMemo, useState } from "react";
import { type Store, TABS, type Tab } from "./store";
import { Detail, HINTS, ItemRow, StatusLine, TabsLine } from "./views";

export type AppProps = {
  store: Store;
  repo: string | null;
  refreshMs?: number;
  onQuit(): void;
};

type Mode = { kind: "normal" };

type Selection = { id: number | null; index: number };

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

export function App({ store, refreshMs = 30_000, onQuit }: AppProps) {
  const { width, height } = useTerminalDimensions();
  const [tab, setTab] = useState<Tab>("due");
  const [version, setVersion] = useState(0);
  const [selection, setSelection] = useState<Selection>({ id: null, index: 0 });
  const [mode] = useState<Mode>({ kind: "normal" });
  const [status] = useState("");

  const reload = () => setVersion((v) => v + 1);
  // biome-ignore lint/correctness/useExhaustiveDependencies: version is the reload trigger
  const items = useMemo(() => store.load(tab, {}), [store, tab, version]);
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

  useKeyboard((key) => {
    if (mode.kind !== "normal") return;
    switch (key.name) {
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
        switchTab(key.shift ? -1 : 1);
        return;
    }
  });

  const listWidth = Math.floor(width / 2) - 5;
  const rows = Math.max(1, height - 5);
  const start = Math.max(0, index - rows + 1);
  const visible = items.slice(start, start + rows);

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
          <TabsLine tab={tab} repo={null} query="" />
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
          {selected ? (
            <Detail item={selected} now={now} />
          ) : (
            <text fg="#8a8f98">no item selected</text>
          )}
        </box>
      </box>
      <StatusLine text={status || HINTS} />
    </box>
  );
}
