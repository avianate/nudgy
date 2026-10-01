import { SyntaxStyle } from "@opentui/core";
import { absolute, relative } from "../cli/format";
import { type Item, repoLabel, title } from "../core/items";
import type { Tab } from "./store";

export const TAB_LABELS: Record<Tab, string> = {
  due: "Due",
  today: "Today",
  all: "All",
  done: "Done",
};

const MUTED = "#8a8f98";
export const ACCENT = "#7aa2f7";
const SELECTED_BG = "#2b3350";

export const markdownStyle = SyntaxStyle.fromStyles({
  "markup.heading": { fg: ACCENT, bold: true },
  "markup.strong": { bold: true },
  "markup.italic": { italic: true },
  "markup.strikethrough": { dim: true },
  "markup.raw": { fg: "#e0af68" },
  "markup.raw.block": { fg: "#e0af68" },
  "markup.link.url": { fg: ACCENT, underline: true },
  "markup.link.label": { fg: ACCENT },
  "markup.list": { fg: ACCENT },
  "markup.quote": { fg: MUTED, italic: true },
});

export function TabsLine({
  tab,
  repo,
  query,
}: {
  tab: Tab;
  repo: string | null;
  query: string;
}) {
  const tabs = (Object.keys(TAB_LABELS) as Tab[])
    .map((t) => (t === tab ? `[${TAB_LABELS[t]}]` : ` ${TAB_LABELS[t]} `))
    .join(" ");
  const filters = [repo ? `here: ${repo}` : "", query ? `/${query}` : ""]
    .filter(Boolean)
    .join("  ");
  return (
    <text>
      {tabs}
      {filters ? `   ${filters}` : ""}
    </text>
  );
}

// Measured in terminal cells, not code units: ⏰ and ↻ can be two cells wide
function fit(text: string, width: number): string {
  if (width <= 1) return "";
  if (Bun.stringWidth(text) <= width)
    return text + " ".repeat(width - Bun.stringWidth(text));
  let out = "";
  for (const ch of text) {
    if (Bun.stringWidth(out + ch) > width - 1) break;
    out += ch;
  }
  return `${out}…${" ".repeat(Math.max(0, width - 1 - Bun.stringWidth(out)))}`;
}

export function ItemRow({
  item,
  selected,
  now,
  width,
}: {
  item: Item;
  selected: boolean;
  now: number;
  width: number;
}) {
  const when =
    item.remindAt !== null
      ? `⏰ ${relative(item.remindAt, now)}`
      : relative(item.createdAt, now);
  const right = `${when}${item.recurrenceText ? " ↻" : ""}`;
  const left = `${selected ? "›" : " "} ${String(item.id).padStart(3)}  ${item.doneAt !== null ? "✓ " : ""}${title(item.body)}`;
  const line = `${fit(left, Math.max(8, width - Bun.stringWidth(right) - 1))} ${right}`;
  return selected ? (
    <text bg={SELECTED_BG} fg="#ffffff">
      {line}
    </text>
  ) : (
    <text>{line}</text>
  );
}

export function Detail({ item, now }: { item: Item; now: number }) {
  const meta = [`#${item.id}${item.repo ? `  ${repoLabel(item)}` : ""}`];
  if (item.remindAt !== null)
    meta.push(
      `remind   ${absolute(item.remindAt)} (${relative(item.remindAt, now)})`,
    );
  if (item.recurrenceText) meta.push(`repeats  ${item.recurrenceText}`);
  if (item.doneAt !== null) meta.push(`done     ${absolute(item.doneAt)}`);
  meta.push(`created  ${absolute(item.createdAt)}`);
  return (
    <box flexDirection="column">
      {meta.map((line) => (
        <text key={line} fg={MUTED}>
          {line}
        </text>
      ))}
      <text> </text>
      <markdown
        key={`${item.id}:${item.updatedAt}`}
        content={item.body}
        syntaxStyle={markdownStyle}
      />
    </box>
  );
}

export function StatusLine({ text }: { text: string }) {
  return <text fg={MUTED}>{text}</text>;
}

export const HINTS =
  "j/k move · tab switch · / search · a add · e edit · r remind · s snooze · d done · x delete · h here · ? help · q quit";

export function Prompt({
  label,
  initial,
  onInput,
  onSubmit,
}: {
  label: string;
  initial?: string;
  onInput?(text: string): void;
  onSubmit(text: string): void;
}) {
  return (
    <box flexDirection="row" height={1}>
      <text fg={ACCENT}>{`${label} `}</text>
      <input
        focused
        flexGrow={1}
        value={initial}
        onInput={onInput}
        onSubmit={(value: unknown) =>
          onSubmit(typeof value === "string" ? value : "")
        }
      />
    </box>
  );
}

const HELP: [string, string][] = [
  ["j / k, ↓ / ↑", "move"],
  ["tab / shift-tab", "next / previous tab"],
  ["/", "search (esc clears)"],
  ["h", "toggle current-repo filter"],
  ["a", "add a note"],
  ["e", "edit in $EDITOR"],
  ["r", "set reminder (in 2h, every weekday 9am, clear)"],
  ["s", "snooze by defaultSnooze"],
  ["d", "done (recurring: next occurrence)"],
  ["x", "delete (confirms)"],
  ["drag divider", "resize the panes (remembered)"],
  ["?", "this help"],
  ["q", "quit"],
];

export function Help() {
  return (
    <box flexDirection="column">
      <text fg={ACCENT}>keys (any key closes)</text>
      <text> </text>
      {HELP.map(([key, what]) => (
        <text key={key}>{`${key.padEnd(18)}${what}`}</text>
      ))}
    </box>
  );
}
