# jot — Task List

See `tasks/plan.md` for acceptance criteria, verification and dependencies.

## Phase 0: Foundation and spikes
- [x] T1 Project scaffold: build, codesign, atomic `install:local`, TZ canary, coverage method
- [x] T2 SPIKE: banner from LaunchAgent (real label and path). **Gate:** no banner means stop
- [x] T3 SPIKE: OpenTUI in compiled binary, dynamic import, latency, suspend for `$EDITOR`. **Gate**
- [x] **Checkpoint 0:** gates green; human confirms banner and `e` strategy; deps approved

## Phase 1: Capture, list, search
- [x] T4 Storage core: db, pragmas, migration v1, FTS triggers, `createItem`/`getItem`
- [x] T5 Capture: `jot "…"` / `add` / `--`, reserved words, git context, <100ms bench
- [x] T6 `ls` (`--here --done --reminders --json`) and `show`
- [x] T7 `edit`, `rm [-y]`, `search` with safe FTS query builder
- [ ] **Checkpoint 1:** gates green, core coverage ≥ 90%, human uses it in a repo

## Phase 2: One-shot reminders and daemon
- [x] T8 `when.ts`, `-r` on capture, `remind` / `remind --clear` (one-shot only)
- [x] T9 `config.ts`, `done`, `reopen`, `snooze`
- [x] T10 `due`, `today` / `yesterday` / `tomorrow`
- [x] T11 `alerts.plan`, osascript notifier plus fake seam, `daemon run` tick plus status file
- [x] T12 plist, launchctl seam, `daemon install` / `uninstall` / `status`
- [ ] **Checkpoint 2:** human confirms SC2, SC3, SC4, SC11; Script Editor attribution OK

## Phase 3: Recurrence
- [x] T13 Recurrence grammar parser plus rejection
- [x] T14 `nextOccurrence` / `rollForward` (DST, month ends, missed occurrences)
- [ ] T15 Wire recurrence into capture, remind, done, daemon tick, display
- [ ] **Checkpoint 3:** gates green; human sees a real weekday reminder fire

## Phase 4: Shell integration and diagnostics
- [ ] T16 `jot hook zsh`, spawn-free `jot_prompt_segment`
- [ ] T17 `doctor` and `config`
- [ ] **Checkpoint 4:** human confirms SC9 in a new zsh tab

## Phase 5: TUI (parallel with Phase 4 once T15 is done)
- [ ] T18 TUI shell: two panes, tabs, nav, Markdown detail, `q`
- [ ] T19 TUI actions: `d` `s` `x` `r` `a`
- [ ] T20 TUI `/` search, `h` repo filter, `?` help, 30s refresh
- [ ] T21 TUI `e` editor round-trip
- [ ] **Checkpoint 5:** SC1–SC12 all checked; human confirms SC10; manual checklist done

## Decisions
All open questions are resolved. See "Decisions" in `tasks/plan.md`.
