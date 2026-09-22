# Spec: jot

## Objective

`jot` is a terminal-only notes and reminders tool for macOS, for development work.
Capture a thought without leaving the shell, attach a natural-language reminder to it,
and get a macOS banner when it comes due. It is a from-scratch take on
[nikki](https://nikhil-gautam-dev.github.io/nikki/) (Linux-only: systemd + `notify-send`)
rebuilt around macOS primitives: launchd and AppleScript notifications.

**User:** one developer, at their Mac, working in zsh. Personal tool — no distribution,
no sync, no second device.

**Success looks like:** capturing a note is fast enough to never break flow, reminders
are hard to miss, and nothing requires leaving the terminal except the banner itself.

### User stories

- As a dev, I type `jot "check the migration landed"` and it is saved in under 100ms,
  tagged with the repo and branch I'm in.
- I type `jot "re-run the flaky suite" -r "in 2 hours"` and a macOS banner appears in
  two hours, and keeps re-appearing every 15 minutes until I mark it done or snooze it.
- I type `jot "standup notes" -r "every weekday 9am"` and get a banner each weekday at 9.
- I open a new terminal tab and see what's overdue and what's due soon.
- I type `jot` with no arguments and get a TUI to browse, search, edit, complete and
  snooze everything.
- I type `jot ls --here` and see only items captured in the current repo.
- My laptop sleeps through three reminders; on wake I get one banner summarising them,
  not three.

### Out of scope (v1)

Apple Reminders / EventKit, iCloud or any sync, a Swift helper, any GUI, clickable or
actionable notifications, Homebrew dependencies (including `alerter` and
`terminal-notifier`), non-zsh shells, Intel builds, distribution/packaging, tags
(repo/branch context replaces them for v1), attachments.

## Tech Stack

| Concern | Choice | Notes |
|---|---|---|
| Runtime / language | Bun 1.3.x + TypeScript (strict) | Compiled to one binary with `bun build --compile` |
| Storage | `bun:sqlite` (system SQLite 3.54, FTS5 verified working) | WAL mode, `busy_timeout` 5000 |
| Date parsing | `chrono-node` ^2.10 | One-shot times and the time part of recurrence rules only |
| TUI | `@opentui/core` + `@opentui/react` **pinned exactly** (0.5.12) + `react` ^19.2 | Pre-1.0 — upgrades are deliberate |
| Background | launchd LaunchAgent running `jot daemon run` | `KeepAlive`, `RunAtLoad` |
| Notifications | `/usr/bin/osascript` `display notification` | Built into macOS; no Homebrew |
| Lint / format | Biome ^2.5 | |
| Tests | `bun test` | |

Measured on this machine: a compiled Bun binary that opens SQLite, inserts a row and
spawns `git rev-parse` runs in ~30ms. That's the basis for the 100ms capture budget.

## Behaviour

### Items

There is one entity: an **item**. Every item is a note. An item may carry a reminder
(`remind_at`), and a reminder may recur.

- The first line of the body is the title. The rest is Markdown.
- On capture, jot records the git repo root (`git rev-parse --show-toplevel`) and branch
  (`git rev-parse --abbrev-ref HEAD`) of the current directory, or null outside a repo.
  The repo is displayed by its basename.
- IDs are short integers, shown everywhere.
- `rm` hard-deletes after a `y/N` confirmation (skipped with `-y`). Completed reminders
  are kept and hidden from default lists.

### Reminders and re-alerting

- A reminder is **due** when `remind_at <= now` and it is not done.
- The daemon polls every 30 seconds. When it finds due reminders that have never been
  alerted, or were last alerted at least `realertMinutes` ago (default 15), it alerts.
- **Batching:** if more than one reminder needs alerting in a single tick (typically
  after wake from sleep), send **one** summary banner ("3 reminders due — jot due"),
  not one per reminder. A single reminder gets its own banner, with its title and repo.
- Alerting updates `last_alerted_at`, never `remind_at`.
- **Snooze** sets `remind_at = now + duration` (default 10m) and clears
  `last_alerted_at`.
- **Done** on a one-shot reminder sets `done_at`. On a recurring one it advances
  `remind_at` to the next occurrence **strictly after now** and clears `last_alerted_at`.
  Missed occurrences are skipped, not replayed.
- If a recurring reminder's next occurrence arrives while the current one is still
  unacknowledged, it rolls forward: `remind_at` moves to the latest occurrence `<= now`.
  One outstanding instance, never a stack.
- Alerts are up to 30 seconds late by design.

### Recurrence grammar

chrono-node does not parse recurrence, so jot has its own small grammar. A `-r` value
starting with `every` is a recurrence rule. Anything else goes to chrono as a one-shot time.

```
every day [at <time>]                       daily
every weekday [at <time>]                   Mon–Fri
every <dayname>[,<dayname>...] [at <time>]  e.g. every mon,thu at 4pm
every week [at <time>]                      same weekday as the first occurrence
every <N> hours                             interval, anchored to creation time
every <N> days [at <time>]
```

- `<time>` is parsed by chrono (`9am`, `16:30`, `noon`). With no `at`, the default is
  09:00 for day-based rules.
- Stored structured (JSON), not as raw text, e.g.
  `{"kind":"weekly","days":[1,4],"time":"16:00"}` or `{"kind":"interval","hours":3}`.
  The original text is kept only for display.
- Day-based occurrences are computed in **local wall-clock time**, so "9am" stays 9am
  across DST. Hour intervals are computed in absolute time.
- Unparseable rules are rejected with an error naming the grammar. They are never
  silently stored as one-shots.

### Time

Stored as UTC epoch milliseconds, displayed in the Mac's local time zone. Relative display
("in 2h", "3d ago") in lists; absolute on `show`.

## Commands

### CLI surface

```
jot                                   open the TUI
jot "<text>" [-r <when>]              capture (shorthand for `jot add`)
jot add <text...> [-r <when>]         capture; use for text that collides with a subcommand
jot -- <text...>                      same, for literal text
jot ls [--here] [--done] [--reminders] [--json]
jot today | yesterday | tomorrow [--here] [--json]   items created that day + reminders due that day
jot due [--json]                      overdue + due in the next 24h
jot search <query> [--here] [--json]  FTS5 over body text
jot show <id> [--json]
jot edit <id>                         open the body in $EDITOR (falls back to vi)
jot remind <id> <when>                set/replace a reminder (one-shot or `every …`)
jot remind <id> --clear
jot snooze <id> [<duration>]          default 10m; accepts chrono durations ("1h", "tomorrow 9am")
jot done <id>
jot reopen <id>
jot rm <id> [-y]
jot daemon run                        foreground loop (what launchd runs)
jot daemon install | uninstall | status
jot hook zsh                          print the zsh hook; user adds `eval "$(jot hook zsh)"`
jot doctor                            environment checks (see below)
jot config                            open ~/.jot/config.json in $EDITOR
jot --version | --help
```

**Reserved words** (a bare first argument matching one of these is a subcommand, not a
note): `add ls today yesterday tomorrow due search show edit remind snooze done reopen rm
daemon hook doctor config help`. To capture one of these words literally, use
`jot add today` or `jot -- today`.

### Daemon install

- The plist is `~/Library/LaunchAgents/dev.jot.daemon.plist`. `ProgramArguments` names the
  **canonical install path** `~/.local/bin/jot`, never `process.execPath` of whatever
  binary ran the install. Logs go to `~/.jot/daemon.log`.
- Use `launchctl bootstrap gui/$UID <plist>` / `launchctl bootout gui/$UID/dev.jot.daemon`,
  not the deprecated `load`/`unload`.
- `status` reports loaded/not loaded, PID, and the last tick time the daemon wrote.

### Shell hook

- `jot hook zsh` prints a snippet. jot never edits `~/.zshrc` itself.
- On a new interactive shell the snippet prints overdue items and items due within the
  next `hookWindowHours` (default 4). It stays silent when there are none.
- It also defines `jot_prompt_segment`, which reads `~/.jot/status` (a count the daemon
  writes each tick) using zsh builtins only. **No process spawn per prompt.**

### doctor

Checks and reports: binary at `~/.local/bin/jot` and on `PATH`; valid code signature;
LaunchAgent loaded and ticking; database opens and migrations are current; `$EDITOR` set.

Then it sends a test banner and **asks the user whether it appeared**. `osascript
display notification` exits 0 even when Script Editor's notifications are disabled, so
permission cannot be detected, only confirmed by the user. If the answer is no, it prints
the fix: System Settings → Notifications → Script Editor → Allow.

### Config (`~/.jot/config.json`)

```json
{ "realertMinutes": 15, "defaultSnooze": "10m", "hookWindowHours": 4, "sound": "Glass" }
```

Missing keys fall back to defaults. An invalid file is reported, never overwritten.

### TUI

`jot` with no args opens a two-pane layout:

- **Left:** a list with tabs — Due · Today · All · Done.
- **Right:** the selected item rendered as Markdown, with its repo, branch, reminder and
  recurrence.
- **Keys:** `j/k` or arrows to move, `tab` to switch tabs, `/` search, `a` add,
  `e` edit (suspends the TUI and opens `$EDITOR`), `r` set reminder, `s` snooze,
  `d` done, `x` delete (confirms), `h` toggle current-repo filter, `?` help, `q` quit.
- Reflects daemon-side changes on focus or a 30-second refresh.

### Development commands

```bash
bun install
bun run dev -- <args>          # bun src/main.ts <args>, uses JOT_HOME=./.jot-dev
bun test                       # all tests
bun test --coverage
bun run typecheck              # tsc --noEmit
bun run check                  # biome check --write .
bun run build                  # scripts/build.ts: compile → dist/jot, then codesign -s - -f dist/jot
bun run install:local          # build, atomically install to ~/.local/bin/jot, kickstart the daemon if loaded
```

**`install:local` must replace the binary atomically.** Copy to
`~/.local/bin/.jot.tmp`, `mv` it over `~/.local/bin/jot`, then
`launchctl kickstart -k gui/$UID/dev.jot.daemon` if the agent is loaded. A `cp` in
place over a signed binary gets it SIGKILLed on the next launch on Apple Silicon.

## Data

`~/.jot/` (overridable with `JOT_HOME`): `jot.db`, `config.json`, `daemon.log`, `status`.

```sql
CREATE TABLE items (
  id              INTEGER PRIMARY KEY,
  body            TEXT    NOT NULL,
  repo            TEXT,              -- absolute repo root, null outside a repo
  branch          TEXT,
  created_at      INTEGER NOT NULL,  -- UTC epoch ms
  updated_at      INTEGER NOT NULL,
  remind_at       INTEGER,           -- null = plain note
  recurrence      TEXT,              -- structured JSON rule, null = one-shot
  recurrence_text TEXT,              -- what the user typed, for display
  last_alerted_at INTEGER,
  done_at         INTEGER
);
CREATE INDEX items_due  ON items (remind_at) WHERE done_at IS NULL;
CREATE INDEX items_repo ON items (repo);
CREATE VIRTUAL TABLE items_fts USING fts5 (body, content='items', content_rowid='id');
-- + insert/update/delete triggers keeping items_fts in sync
```

Migrations are forward-only, versioned by `PRAGMA user_version`, and run on every open.

## Project Structure

```
src/
  main.ts            entry: argv dispatch; imports the TUI only via dynamic import()
  cli/               one file per command + args.ts (parsing, reserved words)
  core/
    db.ts            open, pragmas, migrations
    items.ts         queries (the only module that writes SQL)
    when.ts          chrono wrapper: one-shot times, durations
    recurrence.ts    grammar parser + nextOccurrence / rollForward
    alerts.ts        pure: (dueItems, now, config) → alert plan (none | single | summary)
    git.ts           repo/branch capture
    config.ts, paths.ts, clock.ts
  daemon/
    loop.ts          tick: query → alerts.plan → notifier → write status
    notifier.ts      Notifier interface + osascript implementation
    launchd.ts       plist generation + Launchctl interface
  tui/               OpenTUI React app and components
  shell/hook.zsh     hook template
scripts/build.ts
*.test.ts            colocated next to the module under test
test/cli/            end-to-end CLI tests
```

## Code Style

- TypeScript strict, ESM, Biome defaults (2-space indent, double quotes, semicolons).
- Functional modules, no classes. Side effects (clock, notifier, launchctl, git, fs
  paths) enter through small interfaces passed in, so core logic stays pure and testable.
- `camelCase` functions/variables, `PascalCase` types and React components,
  `kebab-case` never. Files are `camelCase.ts`.
- SQL is parameterised, always, and lives only in `core/items.ts`.
- Comments follow the crewview rule: default to none. Write one only for a *why* a future
  reader would otherwise get wrong.

```ts
export type Notifier = { notify(n: { title: string; subtitle?: string; body: string }): Promise<void> };

// Text goes in via argv, never interpolated into the script — a quote in a note would otherwise inject AppleScript
const SCRIPT = `on run argv
  display notification (item 3 of argv) with title (item 1 of argv) subtitle (item 2 of argv) sound name (item 4 of argv)
end run`;

export function osascriptNotifier(sound: string): Notifier {
  return {
    async notify({ title, subtitle = "", body }) {
      await Bun.spawn(["/usr/bin/osascript", "-e", SCRIPT, title, subtitle, body, sound]).exited;
    },
  };
}
```

## Testing Strategy

- **Runner:** `bun test`. Tests are colocated (`recurrence.test.ts` beside `recurrence.ts`).
  End-to-end CLI tests live in `test/cli/`.
- **Isolation, always:** every test runs with a temp `JOT_HOME`, an injected clock, and
  `TZ=America/New_York` pinned in `bunfig.toml`/the test preload, so DST cases are
  deterministic. The notifier and launchctl are always fakes. **No test may show a real
  banner or load a real LaunchAgent.**
- **Unit (bulk of the suite):**
  - recurrence grammar: every accepted form, rejection of bad input
  - `nextOccurrence` / `rollForward`, including both DST transitions, month ends and missed occurrences
  - `alerts.plan`: never-alerted, re-alert interval, batching into a summary, done/snoozed exclusion
  - `when.ts`: relative times and durations
  - items queries against in-memory SQLite, including FTS sync on update/delete
  - plist generation (canonical path, labels)
  - osascript argv construction (quotes, newlines and backslashes pass through unescaped)
  - arg parsing and reserved words
  - hook output
- **End-to-end CLI:** spawn `bun src/main.ts` against a temp `JOT_HOME`. Covers
  capture → ls → remind → done → search, `--json` output shapes, and exit codes.
- **TUI:** OpenTUI's `test-utils` for navigation, tab switching, done/snooze keys and
  the search filter.
- **Manual checklist (can't be automated):** a banner appears from the LaunchAgent; the
  daemon survives sleep/wake and batches; `e` in the TUI round-trips through `$EDITOR`;
  `install:local` over a running daemon.
- **Coverage:** `src/core/` ≥ 90% lines. No gate elsewhere.

## Boundaries

- **Always:**
  - Run `bun test`, `bun run typecheck` and `bun run check` before committing.
  - Keep the capture path free of TUI imports.
  - Parameterise SQL.
  - Pass notification text via argv.
  - Re-sign after every compile.
  - Install atomically (temp file + `mv`).
  - Keep migrations forward-only.
- **Ask first:**
  - Adding or upgrading any dependency, **especially OpenTUI**.
  - Changing the DB schema once real data exists.
  - Changing the data directory, LaunchAgent label or install path.
  - Anything that would touch files outside `~/.jot`, `~/.local/bin/jot` and the plist.
- **Never:**
  - Make network calls.
  - Edit `~/.zshrc` or any dotfile.
  - Delete or recreate `jot.db` to "fix" a migration.
  - Add Homebrew, Swift or native-helper dependencies.
  - Spawn a process from the prompt segment.
  - Show a real notification from a test.

## Success Criteria

1. `jot "x"` completes in **< 100ms** wall time (compiled binary, warm, median of 10), inside a git repo.
2. A one-shot reminder set `-r "in 2 minutes"` produces a banner within 30 seconds of its time,
   with the daemon running under launchd.
3. An unacknowledged reminder re-alerts every `realertMinutes` until done or snoozed.
4. After sleeping through multiple due reminders, wake produces exactly one summary banner.
5. `every weekday 9am` fires at 09:00 local on weekdays only, including across a DST change (unit-tested).
6. Marking a recurring reminder done schedules the next occurrence strictly after now.
7. `jot ls --here` returns only items whose repo matches the current repo root.
8. `jot search` finds items by word prefix and reflects edits and deletes.
9. A new zsh shell shows overdue/upcoming items when there are any and prints nothing when there are none.
   The prompt segment spawns no process.
10. `jot` opens the TUI. Every key listed above works. `e` returns to an intact TUI after `$EDITOR` exits.
11. `bun run install:local` over a running daemon leaves a binary that launches (no SIGKILL) and a restarted daemon.
12. `bun test`, `bun run typecheck` and `bun run check` all pass. `src/core/` coverage is ≥ 90%.

## Open Questions / Spikes

These are load-bearing and untested, so they're the first tasks, before the features that depend on them:

1. **Banner from a LaunchAgent.** Does `osascript display notification`, run by a
   launchd-spawned process on this macOS version, actually show a banner? If not, the
   notification design needs revisiting before anything else.
2. **OpenTUI suspend/resume.** Can OpenTUI release the terminal for `$EDITOR` and
   restore cleanly afterwards? If not, `e` falls back to quitting the TUI, opening the
   editor, and relaunching the TUI on the same item.
3. **Script Editor attribution.** Banners show as coming from Script Editor, and the first
   one may need permission granted by hand. Accepted for v1. Confirm it's tolerable in daily use.
