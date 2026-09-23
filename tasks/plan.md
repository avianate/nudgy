# Implementation Plan: jot

## Overview

Build `jot`, a terminal-only macOS notes and reminders tool, from an empty repo, following
`SPEC.md`. The work runs risk-first. The two load-bearing unknowns are banners from a LaunchAgent
and OpenTUI inside a compiled binary. They get spiked before any feature depends on them. After
that the work goes in vertical slices, each one usable from the shell before the next starts:
capture, then list and search, one-shot reminders with the daemon, recurrence, shell integration,
and last the TUI.

## Architecture Decisions

- **Pure core, injected effects.** `alerts.plan`, `recurrence`, `when` and all of `items.ts` take
  a clock and plain values. Notifier, launchctl, git and paths come in through small interfaces
  (per spec Code Style).
- **Env-level test seams for e2e.** E2E tests spawn `bun src/main.ts`, so in-process fakes don't
  reach them. `main.ts` picks real or fake implementations from env vars. The names are proposed
  and get confirmed in T1:
  - `JOT_NOTIFIER=file:<path>` appends notifications as JSON lines instead of calling osascript.
  - `JOT_LAUNCHCTL=fake:<file>` records launchctl calls and returns canned state.
  - `JOT_NOW=<epoch ms>` fixes the clock.

  This is how `daemon install/status`, `doctor` and `daemon run` get e2e-tested without a real
  banner or a real LaunchAgent.
- **Capture path stays lean.** `main.ts` dispatches on argv and imports only the command it
  needs. The TUI comes in through a static-string dynamic `import()`, and chrono only when `-r`
  is present. Latency is measured on the compiled binary in T5 and again in the final checkpoint.
- **All SQL lives in `core/items.ts`**, parameterised. Migrations are keyed on
  `PRAGMA user_version` and run on every open.
- **FTS queries are built, never passed raw.** User input is tokenised, each term quoted, and
  `*` appended for prefix match. That way `foo-bar` or a stray `"` never reaches FTS5 syntax.
- **Spikes use the real label and path** (`dev.jot.daemon`, `~/.local/bin/jot`). A throwaway
  label or plist would fall under the spec's ask-first file boundary. Spike code lives in
  `spikes/` and is deleted or left uncommitted afterwards.

## Dependencies requiring approval

The spec's boundary says to ask before adding any dependency. Approving this plan approves
exactly this list and nothing more:

| Package | Pin | When installed |
|---|---|---|
| `typescript` | ^5 (latest 5.x) | T1 |
| `@types/bun` | latest | T1 |
| `@biomejs/biome` | ^2.5 | T1 |
| `chrono-node` | ^2.10 | T8 |
| `@opentui/core` | **0.5.12 exact** | T3 spike |
| `@opentui/react` | **0.5.12 exact** | T3 spike |
| `react` | ^19.2 | T3 spike |
| `@types/react` | ^19 | T3 spike |

OpenTUI pulls in a platform-native package (`@opentui/core-darwin-arm64` or similar)
transitively. T3 records its exact name and version.

## Dependency Graph

```
T1 scaffold (build, sign, install:local, TZ canary)
 ├── T2 SPIKE banner via launchd            (gate: no banner → stop)
 ├── T3 SPIKE OpenTUI compiled + suspend    (gate: TUI viability, `e` strategy)
 └── T4 db + migrations + items core
      └── T5 capture (args, git, add)
           ├── T6 ls + show
           │    └── T7 edit + rm + search (FTS)
           └── T8 when.ts + one-shot reminders (-r, remind)
                ├── T9 config + done/reopen/snooze
                │    ├── T10 due + today/yesterday/tomorrow
                │    └── T11 alerts.plan + notifier + daemon run   ◄─ T2
                │         └── T12 launchd install/uninstall/status
                │              └── T17 doctor + config command
                └── T13 recurrence grammar parser
                     └── T14 nextOccurrence / rollForward (DST)
                          └── T15 wire recurrence into CLI + daemon   ◄─ T11

T16 zsh hook + prompt segment   ◄─ T10, T11   (blocked on Q7)
T18 TUI shell                   ◄─ T3, T7, T9, T15
 ├── T19 TUI actions            ◄─ T15
 ├── T20 TUI search/filter/help ◄─ T7
 └── T21 TUI `e` round-trip     ◄─ T3
```

Phase 4 (T16, T17) and Phase 5 (T18–T21) are independent of each other once their parents are done.

---

## Phase 0: Foundation and spikes

### Task 1: Project scaffold with build, sign and atomic install

**Description:** Create the Bun + TypeScript project so that every later gate command works on day
one. `jot --version` builds into a signed binary that installs atomically to `~/.local/bin/jot`.
The test preload pins `TZ=America/New_York` and proves Bun honours it.

**Acceptance criteria:**
- [ ] `bun run typecheck`, `bun run check`, `bun test` and `bun run build` all exist and exit 0.
  `dist/jot --version` prints the version.
- [ ] `scripts/build.ts` compiles, then runs `codesign -s - -f dist/jot`.
  `codesign --verify dist/jot` exits 0.
- [ ] `bun run install:local` copies to `~/.local/bin/.jot.tmp`, `mv`s it over
  `~/.local/bin/jot`, and runs `launchctl kickstart -k gui/$UID/dev.jot.daemon` only if the agent
  is loaded.
- [ ] A TZ canary test asserts that `2026-03-08T12:00Z` has a local offset of −4h and
  `2026-01-15T12:00Z` one of −5h. This proves the preload's `TZ` takes effect.
- [ ] The way to measure `src/core/` coverage alone is decided and written down. Bun's
  `coverageThreshold` may be global only.
- [ ] Env seam names (`JOT_HOME`, `JOT_NOW`, `JOT_NOTIFIER`, `JOT_LAUNCHCTL`) are recorded in
  `src/core/paths.ts` / `clock.ts` stubs or in a short note in `tasks/plan.md`.

**Verification:**
- [ ] `bun test` · `bun run typecheck` · `bun run check` · `bun run build`, each run raw, each
  exit 0
- [ ] `codesign --verify --verbose dist/jot`
- [ ] `bun run install:local && ~/.local/bin/jot --version`

**Dependencies:** None
**Files:** `package.json`, `tsconfig.json`, `biome.json`, `bunfig.toml`, `test/preload.ts`,
`scripts/build.ts`, `scripts/installLocal.ts`, `src/main.ts`, `.gitignore`
**Scope:** M (many files, all small config)

### Task 2: SPIKE — banner from a LaunchAgent

**Description:** Prove the real chain: launchd starts the compiled, signed binary at
`~/.local/bin/jot`, and that binary spawns `/usr/bin/osascript display notification` using the
argv-based script from the spec. Also check Script Editor attribution and first-run permission.

**Acceptance criteria:**
- [ ] A spike build of `jot`, with a hidden `__spike-notify` path that sends one banner and
  exits, is installed via `install:local`. A minimal `dev.jot.daemon` plist is bootstrapped with
  `launchctl bootstrap gui/$UID`. It sets `RunAtLoad` only, **no `KeepAlive`**. Otherwise
  launchd respawns the exiting process and keeps firing banners. It runs once, then gets
  booted out.
- [ ] Human confirms a banner appeared. They record the attribution shown (Script Editor or
  other) and whether permission had to be granted.
- [ ] A note with a quote, a newline and a backslash displays verbatim. This proves argv passing.
- [ ] Agent is booted out with `launchctl bootout gui/$UID/dev.jot.daemon` afterwards. Findings
  go in `tasks/spikes.md`.

**Verification:**
- [ ] Manual: human confirms the banner appeared, from launchd, not from a terminal
- [ ] `launchctl print gui/$UID/dev.jot.daemon` shows the job ran, then is gone after bootout

**Dependencies:** T1
**Files:** `spikes/notify.ts` (throwaway), `tasks/spikes.md`
**Scope:** S
**GATE:** If no banner appears, stop. The notification design gets revisited with the human
before any daemon work.

### Task 3: SPIKE — OpenTUI in a compiled binary, plus suspend/resume for `$EDITOR`

**Description:** Install the pinned OpenTUI deps and find out four things:
1. Does OpenTUI's native library load inside a `bun build --compile` binary?
2. Does a static-string dynamic `import()` of the TUI get bundled?
3. What does bundling the TUI cost capture latency?
4. Can the renderer release the terminal for `$EDITOR` and restore it cleanly?

**Acceptance criteria:**
- [ ] A compiled spike binary renders a two-box OpenTUI React screen and quits cleanly on `q`.
  The terminal is restored and there's no stray output.
- [ ] Pressing `e` suspends, runs `$EDITOR` (vi) on a temp file, and resumes to an intact
  screen. If that can't be done, the fallback is written down: quit the TUI, open the editor,
  relaunch the TUI on the same item.
- [ ] The native package name and version are recorded, along with anything the build needs to
  embed it.
- [ ] The median of 10 runs of a trivial non-TUI command, on the binary that also bundles the
  TUI, is recorded against the 100ms budget. It runs against a temp `JOT_HOME`.
- [ ] Record whether OpenTUI 0.5.12 renders Markdown itself. If it needs a parser package, that
  package goes to the human for approval before T18.

**Verification:**
- [ ] Manual: human runs the spike binary, presses `e`, edits, quits the editor, and confirms
  the screen is intact
- [ ] Findings recorded in `tasks/spikes.md`

**Dependencies:** T1
**Files:** `spikes/tui.tsx` (throwaway), `package.json`, `tasks/spikes.md`
**Scope:** S
**GATE:** If OpenTUI can't run from the compiled binary, stop and decide with the human. Options
are a different TUI approach or running the TUI via `bun` rather than the binary. The spec
requires the binary.

### Checkpoint 0: Spikes resolved
- [ ] T1 gates green. The exact commands and exit codes are listed.
- [ ] Human confirms: the LaunchAgent banner works. Attribution is noted, and so is the `e`
  strategy (suspend or fallback).
- [ ] The dependency list above is still accurate, or the human approves any change.

---

## Phase 1: Capture, list, search

### Task 4: Storage core — database, migrations, items create/get

**Description:** `core/paths.ts` resolves `JOT_HOME` (default `~/.jot`). `core/clock.ts`
provides the `Clock` interface and the `JOT_NOW` seam. `core/db.ts` opens SQLite with WAL mode
and `busy_timeout=5000`, then runs migration v1 from the spec: the table, both indexes, the FTS5
table and its three triggers. `core/items.ts` gets `createItem` and `getItem`.

**Acceptance criteria:**
- [ ] Opening a fresh db sets `user_version=1` and creates the full schema. Re-opening it is a
  no-op.
- [ ] `createItem` / `getItem` round-trip every column, with times in UTC ms from the injected
  clock.
- [ ] An FTS row exists after insert. The triggers are also covered for update and delete, which
  get exercised here directly in SQL tests.

**Verification:**
- [ ] `bun test src/core` exits 0

**Dependencies:** T1
**Files:** `src/core/paths.ts`, `clock.ts`, `db.ts`, `items.ts`, `db.test.ts`, `items.test.ts`
**Scope:** M

### Task 5: Capture a note from the shell

**Description:** `jot "text"`, `jot add <text...>` and `jot -- <text...>` save an item tagged
with the repo root and branch. `cli/args.ts` owns the reserved-word rule. `--help` prints usage.

**Acceptance criteria:**
- [ ] Every reserved word as a bare first arg dispatches to a subcommand. `jot add today` and
  `jot -- today` capture the literal text "today".
- [ ] Inside a git repo, `repo` is the absolute top-level path and `branch` is set. Outside one,
  both are null. Git is injected, and e2e runs against a temp repo.
- [ ] The compiled `jot "x"` has a median wall time under 100ms over 10 warm runs inside a repo
  (SC1). `scripts/benchCapture.ts` always uses a temp `JOT_HOME` so it never writes to the real
  `~/.jot/jot.db`.

**Verification:**
- [ ] `bun test` exits 0. This covers args unit tests and `test/cli/capture.test.ts` e2e.
- [ ] `bun run build && bun scripts/benchCapture.ts`. It prints the median and exits non-zero if
  ≥ 100ms. No output piping.

**Dependencies:** T4
**Files:** `src/cli/args.ts`, `src/cli/add.ts`, `src/core/git.ts`, `src/main.ts`,
`test/cli/capture.test.ts`, `scripts/benchCapture.ts`
**Scope:** M

### Task 6: List and show items

**Description:** `jot ls [--here] [--done] [--reminders] [--json]` and `jot show <id> [--json]`.
Lists show the ID, title (first line), repo basename and relative times. `show` gives absolute
local times and the full body.

**Acceptance criteria:**
- [ ] `ls` hides done items by default. `--done` shows them, and `--reminders` shows only items
  with `remind_at`.
- [ ] `--here` returns only items whose `repo` equals the current repo root (SC7).
- [ ] `--json` shapes are stable and snapshot-tested. `show` on a missing ID exits non-zero with
  a message.

**Verification:**
- [ ] `bun test` exits 0. This covers relative/absolute formatting units and `test/cli/ls.test.ts`.

**Dependencies:** T5
**Files:** `src/cli/ls.ts`, `src/cli/show.ts`, `src/cli/format.ts`, `src/core/items.ts`,
`test/cli/ls.test.ts`
**Scope:** M

### Task 7: Edit, delete and search

**Description:** `jot edit <id>` opens the body in `$EDITOR`, falling back to `vi`.
`jot rm <id> [-y]` asks `y/N` unless `-y` is given. `jot search <query> [--here] [--json]` runs
FTS5 prefix search using safely built queries.

**Acceptance criteria:**
- [ ] `search` finds items by word prefix. After `edit`, old words no longer match and new words
  do. After `rm`, the item is gone from results (SC8).
- [ ] Queries containing `-`, `"`, `*`, `(` or `NEAR` never raise FTS5 syntax errors.
- [ ] `rm` without `-y` and with no TTY, or with an answer of `n`, deletes nothing. E2E `edit`
  uses `EDITOR` set to a script that rewrites the file.

**Verification:**
- [ ] `bun test` exits 0. This covers the FTS query builder units and
  `test/cli/editRmSearch.test.ts`.

**Dependencies:** T6
**Files:** `src/cli/edit.ts`, `src/cli/rm.ts`, `src/cli/search.ts`, `src/core/items.ts`,
`test/cli/editRmSearch.test.ts`
**Scope:** M

### Checkpoint 1: Notes are usable
- [ ] `bun test`, `bun run typecheck`, `bun run check`, each run raw, each exit 0
- [ ] `src/core/` coverage ≥ 90%, measured by the method chosen in T1
- [ ] Human uses `jot "…"`, `ls --here`, `search` and `edit` for real in a repo

---

## Phase 2: One-shot reminders and the daemon

### Task 8: Parse times and attach one-shot reminders

**Description:** `core/when.ts` wraps chrono for one-shot times ("in 2 hours", "tomorrow 9am")
and durations. Capture accepts `-r <when>`. `jot remind <id> <when>` and
`jot remind <id> --clear` set or clear a reminder. A value starting with `every` is rejected with
"recurrence not yet supported" until T15.

**Acceptance criteria:**
- [ ] It's established whether chrono parses bare `10m`, `1h` and `90s`. If it doesn't,
  `when.ts` parses `<N><s|m|h|d>` itself before falling back to chrono. Both paths are tested.
- [ ] An unparseable time exits non-zero with a clear message. It's never stored as null or as
  "now".
- [ ] `remind` replaces an existing reminder and clears `last_alerted_at`. `--clear` nulls
  `remind_at`, `recurrence` and `recurrence_text`.

**Verification:**
- [ ] `bun test` exits 0. This covers `when.test.ts` with a fixed clock and
  `test/cli/remind.test.ts`.

**Dependencies:** T5 (chrono-node install approved above)
**Files:** `src/core/when.ts`, `src/core/when.test.ts`, `src/cli/add.ts`, `src/cli/remind.ts`,
`src/core/items.ts`
**Scope:** M

### Task 9: Config, done, reopen and snooze

**Description:** `core/config.ts` loads `~/.jot/config.json`, falling back to defaults for
missing keys. `jot done`, `jot reopen` and `jot snooze <id> [<duration>]` implement the spec's
one-shot state transitions.

**Acceptance criteria:**
- [ ] With the config missing, defaults apply. With it partial, the given keys merge over the
  defaults. With it invalid, jot reports an error naming the file and never overwrites it.
- [ ] `snooze` sets `remind_at = now + duration` (default `defaultSnooze`). It also takes absolute
  times like `tomorrow 9am`. Either way it clears `last_alerted_at`. `done` sets `done_at`. `reopen` clears it.
- [ ] Done items are hidden from `ls` and shown by `ls --done`.

**Verification:**
- [ ] `bun test` exits 0. This covers `config.test.ts` and `test/cli/doneSnooze.test.ts`.

**Dependencies:** T8
**Files:** `src/core/config.ts`, `src/core/config.test.ts`, `src/cli/done.ts`,
`src/cli/reopen.ts`, `src/cli/snooze.ts`, `src/core/items.ts`
**Scope:** M

### Task 10: `due` and day views

**Description:** `jot due [--json]` shows items overdue plus due in the next 24h.
`jot today | yesterday | tomorrow [--here] [--json]` shows items created that local day plus
reminders due that day.

**Acceptance criteria:**
- [ ] Day boundaries are local midnight, including on a DST-change day, under the pinned TZ.
- [ ] `due` excludes done items and sorts overdue first, then by `remind_at`.
- [ ] `--json` shapes are snapshot-tested.

**Verification:**
- [ ] `bun test` exits 0. This covers `test/cli/due.test.ts` with `JOT_NOW`.

**Dependencies:** T9
**Files:** `src/cli/due.ts`, `src/cli/day.ts`, `src/core/items.ts`, `test/cli/due.test.ts`
**Scope:** S

### Task 11: Alert planning, notifier and `daemon run`

**Description:** `core/alerts.ts` is a pure `plan(dueItems, now, config)` that returns `none`,
`single` or `summary`. `daemon/notifier.ts` is the osascript notifier from the spec plus the
`JOT_NOTIFIER=fake:<file>` seam. `daemon/loop.ts` is the 30s tick: query due items, plan, notify,
update `last_alerted_at`, and write `~/.jot/status`.

**Acceptance criteria:**
- [ ] `plan` alerts when an item was never alerted, or when `now − last_alerted_at ≥
  realertMinutes`. It excludes done items and items snoozed into the future. More than one item
  gives one summary ("N reminders due — jot due"). One item gives title plus repo basename as
  subtitle. It never changes `remind_at` (SC3 logic).
- [ ] The osascript argv test shows quotes, newlines and backslashes passed through unescaped,
  as separate argv entries. No test spawns the real osascript.
- [ ] `jot daemon run` with a fake notifier and `JOT_NOW` does one tick per interval. It writes
  the due count to `status` and handles SIGTERM cleanly. An e2e seam, either a hidden
  single-tick mode or an interval override, keeps tests from waiting 30 real seconds.

**Verification:**
- [ ] `bun test` exits 0. This covers `alerts.test.ts`, `notifier.test.ts` and `loop.test.ts`.

**Dependencies:** T9, T2 (gate passed)
**Files:** `src/core/alerts.ts`, `alerts.test.ts`, `src/daemon/notifier.ts`, `notifier.test.ts`,
`src/daemon/loop.ts`, `loop.test.ts`
**Scope:** M

### Task 12: LaunchAgent install, uninstall and status

**Description:** `daemon/launchd.ts` generates the plist and wraps `launchctl` behind an
interface with a `JOT_LAUNCHCTL=fake:<file>` seam. It implements
`jot daemon install | uninstall | status`.

**Acceptance criteria:**
- [ ] The plist has label `dev.jot.daemon`. `ProgramArguments` is `[~/.local/bin/jot, daemon,
  run]` (never `process.execPath`), with `KeepAlive`, `RunAtLoad`, and stdout/stderr going to
  `~/.jot/daemon.log`.
- [ ] Install and uninstall use `bootstrap gui/$UID` and `bootout gui/$UID/dev.jot.daemon`.
  Neither ever uses `load` or `unload`. Both are idempotent.
- [ ] `status` reports loaded or not loaded, the PID, and the last tick time. The source of the
  last tick time is per Open Question 1.

**Verification:**
- [ ] `bun test` exits 0. This covers plist unit tests and e2e with the fake launchctl.
- [ ] Manual, after human go-ahead: `bun run install:local && jot daemon install &&
  jot daemon status`

**Dependencies:** T11
**Files:** `src/daemon/launchd.ts`, `launchd.test.ts`, `src/cli/daemon.ts`,
`test/cli/daemon.test.ts`
**Scope:** M

### Checkpoint 2: Reminders work for real
- [ ] Gates green: `bun test`, `bun run typecheck`, `bun run check`, each run raw, with exit
  codes stated. Coverage ≥ 90% in `src/core/`.
- [ ] **Human confirms SC2:** `jot "x" -r "in 2 minutes"` shows a banner within 30s of the due
  time, under launchd.
- [ ] **Human confirms SC3:** it re-alerts after `realertMinutes`. Setting it to 1 temporarily
  is fine.
- [ ] **Human confirms SC4:** after sleeping through several due reminders, waking shows one
  summary banner.
- [ ] **Human confirms SC11:** `install:local` over the running daemon gives no SIGKILL, and the
  daemon restarts.
- [ ] Spike 3 decision: the human confirms Script Editor attribution is tolerable. This is best
  judged after a few days of use and doesn't block Phase 3.

---

## Phase 3: Recurrence

### Task 13: Recurrence grammar parser

**Description:** `core/recurrence.ts` parses every `every …` form in the spec into structured
JSON. It uses chrono only for the `<time>` part and defaults to 09:00 for day-based rules.

**Acceptance criteria:**
- [ ] Each form parses to the expected JSON: `every day`, `every weekday`, `every mon,thu at
  4pm`, `every week`, `every 3 hours`, `every 2 days at 16:30`, with and without `at`.
- [ ] Bad input is rejected with an error that names the grammar. Examples: `every`,
  `every blursday`, `every 0 hours`, `every day at nonsense`. None of these fall through to a
  one-shot.
- [ ] Day names accept short and long forms, case-insensitive.

**Verification:**
- [ ] `bun test src/core/recurrence.test.ts` exits 0

**Dependencies:** T8
**Files:** `src/core/recurrence.ts`, `src/core/recurrence.test.ts`
**Scope:** S

### Task 14: Next occurrence and roll-forward

**Description:** Pure `nextOccurrence(rule, anchor, after)` and `rollForward(rule, anchor, now)`.
Day-based rules are computed in local wall-clock time. Hour intervals are computed in absolute
time, anchored to creation.

**Acceptance criteria:**
- [ ] `every weekday 9am` gives 09:00 local, Mon–Fri only, across the March and November
  America/New_York DST transitions (SC5).
- [ ] Month ends and year ends work. `every N days` stays on its grid, and `every N hours` stays
  on its creation-anchored grid across DST.
- [ ] `rollForward` returns the latest occurrence ≤ now after a gap of several missed
  occurrences. `nextOccurrence` is strictly after `after` (SC6 logic).

**Verification:**
- [ ] `bun test src/core/recurrence.test.ts` exits 0

**Dependencies:** T13
**Files:** `src/core/recurrence.ts`, `src/core/recurrence.test.ts`
**Scope:** M (logic-dense, few files)

### Task 15: Recurring reminders end to end

**Description:** Remove the T8 "not yet supported" guard. `-r "every …"` and
`remind <id> "every …"` store `recurrence`, `recurrence_text` and the first `remind_at`. `done`
on a recurring item advances instead of completing. The daemon tick rolls forward
unacknowledged items. Lists and `show` display the recurrence text.

**Acceptance criteria:**
- [ ] `done` on a recurring item sets `remind_at` to the next occurrence strictly after now,
  clears `last_alerted_at`, and leaves `done_at` null. Missed occurrences are skipped (SC6).
- [ ] When the next occurrence passes while an item is unacknowledged, the tick moves
  `remind_at` to the latest occurrence ≤ now. There's only ever one outstanding instance. The
  `last_alerted_at` behaviour is per Open Question 2.
- [ ] `jot remind <id> --clear` on a recurring item removes the rule.

**Verification:**
- [ ] `bun test` exits 0. This covers `test/cli/recurring.test.ts` with `JOT_NOW` stepping plus
  loop tests.

**Dependencies:** T14, T11
**Files:** `src/cli/add.ts`, `src/cli/remind.ts`, `src/cli/done.ts`, `src/core/items.ts`,
`src/daemon/loop.ts`, `test/cli/recurring.test.ts`
**Scope:** M

### Checkpoint 3: Recurrence
- [ ] Gates green, with commands and exit codes stated. `src/core/` coverage ≥ 90%.
- [ ] Human sets `every weekday 9am` for real and sees it the next weekday morning

---

## Phase 4: Shell integration and diagnostics

### Task 16: zsh hook and prompt segment

**Description:** `jot hook zsh` prints `shell/hook.zsh`, which is embedded in the binary. On a
new interactive shell it runs `jot due`-style output for overdue items and items due within
`hookWindowHours`, and stays silent when there are none. It defines `jot_prompt_segment`, which
reads `~/.jot/status` with zsh builtins only.

**Acceptance criteria:**
- [ ] The hook output is snapshot-tested. `jot_prompt_segment` uses only `$(<file)` or `read`,
  with no `$(jot …)`, `cat` or other command. A test asserts this by parsing the function body.
- [ ] The hook's listing prints nothing, and exits 0, when nothing is overdue or upcoming (SC9).
- [ ] It honours `JOT_HOME` in the status path.

**Verification:**
- [ ] `bun test` exits 0
- [ ] Manual: `zsh -i -c 'eval "$(jot hook zsh)"'` in empty and non-empty states

**Dependencies:** T11 (status file), T10. **Blocked on Open Question 7.**
**Files:** `src/shell/hook.zsh`, `src/cli/hook.ts`, `src/cli/hook.test.ts`
**Scope:** S

### Task 17: `doctor` and `config`

**Description:** `jot doctor` checks:
- the binary is at `~/.local/bin/jot` and on `PATH`
- `codesign --verify` passes
- the agent is loaded and ticking
- the db opens with migrations current
- `$EDITOR` is set

Then it sends a test banner and asks whether it appeared. If the answer is no, it prints the
Script Editor fix. `jot config` opens the config in `$EDITOR`, creating it with defaults if it's
absent.

**Acceptance criteria:**
- [ ] Each check reports pass or fail with a one-line reason. The exit code is non-zero if any
  check fails.
- [ ] The test banner goes through the notifier seam, so e2e uses the fake. An answer of "n"
  prints System Settings → Notifications → Script Editor → Allow.
- [ ] `config` never overwrites an existing file.

**Verification:**
- [ ] `bun test` exits 0. This covers `test/cli/doctor.test.ts` with fake launchctl and notifier.
- [ ] Manual: `jot doctor` on the real machine

**Dependencies:** T12
**Files:** `src/cli/doctor.ts`, `src/cli/config.ts`, `test/cli/doctor.test.ts`
**Scope:** S

### Checkpoint 4: Shell
- [ ] Gates green, with commands and exit codes stated
- [ ] **Human confirms SC9** in a real new zsh tab: output shows when items are due and nothing
  shows when none are. The human adds the `eval` line to `~/.zshrc` themselves.

---

## Phase 4b: Native notifier (added 2026-09-22 at the human's request)

### Task N1: SPIKE — Swift notifier helper
Done. See `tasks/spikes.md`. The helper banners as "Jot", passes text verbatim, dismisses on
click, plays sounds, and keeps permission across ad-hoc re-signs once registered with
`lsregister`.

### Task N2: Swift helper as the daemon's notifier
**Acceptance criteria:**
- [ ] `bun run build` produces `dist/Jot Notifier.app`, signed ad hoc and passing
  `codesign --verify`. `install:local` installs it atomically to `~/.jot/Jot Notifier.app` and
  runs `lsregister -f`.
- [ ] The daemon and doctor use the helper when it's present. If it's missing, or a post fails
  (for example not authorized), they log the error and fall back to osascript, so reminders
  never go silent. `JOT_NOTIFIER=file:` still overrides both for tests.
- [ ] `doctor` checks the helper and points at Notifications → Jot. Under launchd, a real
  reminder banners as "Jot" (the human confirms).

## Phase 5: TUI

### Task 18: TUI shell — layout, tabs and navigation

**Description:** `jot` with no args dynamically imports `src/tui/` and opens the two-pane layout.
The tabs are Due · Today · All · Done. `j`/`k` and the arrows move, `tab` switches tabs, the
right pane renders the selected item's Markdown plus repo, branch, reminder and recurrence, and
`q` quits.

**Acceptance criteria:**
- [ ] OpenTUI `test-utils` tests cover navigation, wrap and clamp at the ends, tab switching,
  and the detail pane updating on selection.
- [ ] `main.ts` imports the TUI only via dynamic `import()`. A test asserts that the capture
  path's module graph excludes `src/tui/`.
- [ ] `q` restores the terminal cleanly, and so does an error thrown mid-render.

**Verification:**
- [ ] `bun test src/tui` exits 0
- [ ] Manual: the compiled `jot` opens the TUI

**Dependencies:** T3, T7, T9, T15
**Files:** `src/tui/app.tsx`, `list.tsx`, `detail.tsx`, `app.test.tsx`, `src/main.ts`
**Scope:** M

### Task 19: TUI item actions

**Description:** The keys `d` (done), `s` (snooze with the default duration), `x` (delete, with
an in-TUI confirm), `r` (set reminder via an input prompt) and `a` (add via an input prompt). All
of them go through `core/items.ts`, just like the CLI.

**Acceptance criteria:**
- [ ] Each key's effect is visible in the list and matches the CLI semantics. That includes
  recurring `done` advancing rather than completing.
- [ ] `x` needs an explicit confirm, and cancelling leaves the item intact.
- [ ] An invalid `r` input shows an inline error and changes nothing.

**Verification:**
- [ ] `bun test src/tui` exits 0

**Dependencies:** T18, T15
**Files:** `src/tui/app.tsx`, `src/tui/prompt.tsx`, `src/tui/actions.test.tsx`
**Scope:** M

### Task 20: TUI search, repo filter, help and refresh

**Description:** `/` filters the list with the same FTS query builder as the CLI. `h` toggles
the current-repo filter. `?` shows key help. The list reloads on focus and every 30s so it picks
up changes from the daemon.

**Acceptance criteria:**
- [ ] The search filter narrows the list as you type, and `esc` clears it. Its matches are the
  same as `jot search`.
- [ ] `h` shows only items from the current repo. The active state is indicated.
- [ ] A change made in the db outside the TUI appears after a refresh tick. This is tested with
  an injected timer.

**Verification:**
- [ ] `bun test src/tui` exits 0

**Dependencies:** T18, T7
**Files:** `src/tui/app.tsx`, `src/tui/help.tsx`, `src/tui/filter.test.tsx`
**Scope:** S

### Task 21: TUI `e` — editor round-trip

**Description:** Implement `e` using the strategy chosen in T3. That's either suspend the
renderer, run `$EDITOR`, save and resume, or the quit-edit-relaunch fallback that returns to the
same item.

**Acceptance criteria:**
- [ ] After `$EDITOR` exits, the TUI is intact with the edited body shown and the same item
  selected.
- [ ] An editor that exits non-zero, or leaves the body unchanged, changes nothing.
- [ ] `$EDITOR` unset falls back to `vi`.

**Verification:**
- [ ] `bun test src/tui` exits 0, covering the logic with a fake editor
- [ ] **Manual (human):** `e` round-trips through a real `$EDITOR` in the compiled binary

**Dependencies:** T18, T3
**Files:** `src/tui/app.tsx`, `src/tui/editor.ts`, `src/tui/editor.test.ts`
**Scope:** S

### Checkpoint 5: Complete
- [ ] `bun test`, `bun run typecheck`, `bun run check`, each run raw, with exit codes stated.
  `src/core/` coverage ≥ 90% (SC12).
- [ ] SC1 re-measured on the final compiled binary with the TUI bundled: `bun scripts/benchCapture.ts`
- [ ] **Human confirms SC10:** every TUI key works, and `e` returns to an intact TUI
- [ ] Manual checklist from the spec's Testing Strategy is done
- [ ] Every success criterion SC1–SC12 is checked off in the mapping below

## Success criteria → where verified

| SC | Verified in |
|---|---|
| 1 capture < 100ms | T5, re-measured in Checkpoint 5 |
| 2 banner within 30s under launchd | Checkpoint 2 (human) |
| 3 re-alert | T11 (logic), Checkpoint 2 (human) |
| 4 one summary after sleep | T11 (logic), Checkpoint 2 (human) |
| 5 weekday 9am across DST | T14 |
| 6 recurring done → next after now | T14, T15 |
| 7 `ls --here` | T6 |
| 8 search prefix + edit/rm sync | T7 |
| 9 hook output + no-spawn segment | T16, Checkpoint 4 (human) |
| 10 TUI keys + `e` | T18–T21, Checkpoint 5 (human) |
| 11 install:local over running daemon | T1, T2, Checkpoint 2 (human) |
| 12 gates + coverage | every checkpoint |

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| osascript banners don't show from launchd | High | T2 spike first, with a hard gate |
| OpenTUI native lib won't load from a compiled binary | High | T3 spike; gate decision with human |
| OpenTUI can't suspend for `$EDITOR` | Med | Documented fallback (quit, edit, relaunch) |
| Bundling the TUI pushes capture over 100ms | Med | Measure in T3 and T5; dynamic import; lazy-load chrono |
| chrono doesn't parse `10m`/`1h` | Low | Own duration parser in `when.ts` (T8) |
| Bun ignores a runtime-set `TZ`, so DST tests are meaningless | Med | TZ canary test in T1 |
| Bun coverage threshold can't be scoped to `src/core/` | Low | Pick a method in T1 (e.g. a separate `bun test --coverage src/core` run) |
| FTS5 syntax errors from raw input | Med | Query builder + adversarial tests (T7) |
| OpenTUI 0.5.x API churn | Med | Exact pin; no upgrades without asking |

## Decisions (resolved 2026-09-22)

1. **Last tick time.** The mtime of `~/.jot/status` is the last tick time.
   - **Superseded 2026-09-23:** the CLI and TUI now rewrite `status` straight after any change,
     so the prompt count has no lag. The daemon's heartbeat moved to its own `tick` file, which
     only the daemon writes.
2. **Roll-forward.** Rolling a recurring item forward clears `last_alerted_at`. It runs in the
   daemon tick and in `done`.
3. **`done` on plain notes** is allowed. It sets `done_at`, and the note is hidden from the
   default `ls`.
4. **`every week`** fires on the **creation weekday**. The first occurrence is the next
   `<creation weekday> <time>` strictly after now: today if the time hasn't passed yet,
   otherwise next week. `every N hours` first fires at creation + N hours. `every N days at T`
   first fires at the next T strictly after now.
5. **Dependencies:** the table above is approved as is.
6. **Spike code** is deleted after Checkpoint 0.
7. **Hook window.** There's a hidden `jot due --within <hours>` flag, left out of the help text.
   The hook calls it with `hookWindowHours`.

### Implementation judgement calls (made during build, open to overturn)

- `ls --done` lists **only** completed items, matching the TUI's Done tab. It doesn't mix them
  in with open items.
- A detached HEAD, or a repo with no commits, stores `branch = null` rather than the literal
  `HEAD`.
- `--json` emits times as ISO 8601 strings. The database stores epoch ms.
- `rm` exits 1 when the confirmation is declined or unanswered, including when there's no stdin.
- `search` includes done items, which are marked ✓ in the list.
- `doctor` treats an unset `$EDITOR` as a warning (`!`), not a failure, because `edit` falls back to `vi`.
- `due` with nothing due prints "nothing due" on stderr and leaves stdout empty. The hook discards stderr.
- Day views (`today` and friends) include done items. They sort as a chronological agenda: a reminder due that day by its due time, anything else by creation time.
- Usage errors exit 2. Runtime errors such as "no item #N" or "not in a repo" exit 1.
- `every day` is stored as a weekly rule covering all seven days, so there's one code path for
  day-based rules.
- `Jot Notifier.app` always lives in `~/.jot`, even when `JOT_HOME` points elsewhere. Notification
  permission belongs to that one bundle.
- The helper waits up to 60s for Notification Center, which allows time to answer the first
  permission prompt. That wait also bounds a daemon tick in the worst case.
- `JOT_NOTIFIER=osascript` forces the fallback notifier.
- The helper's bundle ID is `dev.jot.app`. It moved from `dev.jot.notifier`, whose
  Notification Center record had cached a blank icon. Changing it again means re-granting
  permission.
- Notification IDs are `jot-item-<id>`, `jot-summary` and `jot-doctor`. They dedupe
  Notification Center's list per reminder. Persistent alerts on screen still stack until
  dismissed, which is macOS behaviour. `jot-notify --list` prints the delivered IDs for
  diagnosis.
- The TUI `r` prompt accepts `clear` to remove a reminder. The TUI `a` prompt takes plain text
  only, with no `-r`. Set a reminder afterwards with `r`.
- `bun <file>` strips the first `--`. The e2e helper prepends one, and `JOT_E2E_BIN=dist/jot`
  (`bun run test:bin`) runs the e2e suite against the compiled binary.
