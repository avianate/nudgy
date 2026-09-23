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
- [x] **Checkpoint 2:** SC2, SC3, SC11 confirmed; attribution OK. SC4 batching confirmed, but a true system sleep was not tested (see spikes.md)

## Phase 3: Recurrence
- [x] T13 Recurrence grammar parser plus rejection
- [x] T14 `nextOccurrence` / `rollForward` (DST, month ends, missed occurrences)
- [x] T15 Wire recurrence into capture, remind, done, daemon tick, display
- [ ] **Checkpoint 3:** gates green; human sees a real weekday reminder fire

## Phase 4: Shell integration and diagnostics
- [x] T16 `jot hook zsh`, spawn-free `jot_prompt_segment`
- [x] T17 `doctor` and `config`
- [ ] **Checkpoint 4:** human confirms SC9 in a new zsh tab

## Phase 4b: Native notifier (requested mid-build)
- [x] N1 SPIKE: Swift notifier helper (see spikes.md)
- [x] N2 Swift helper as primary notifier, osascript fallback, doctor + install
- [x] **Checkpoint 4b:** human confirmed a launchd-fired banner shows as "Jot" (icon still blank)

## Phase 5: TUI (parallel with Phase 4 once T15 is done)
- [x] T18 TUI shell: two panes, tabs, nav, Markdown detail, `q`
- [x] T19 TUI actions: `d` `s` `x` `r` `a`
- [x] T20 TUI `/` search, `h` repo filter, `?` help, 30s refresh
- [x] T21 TUI `e` editor round-trip
- [x] **Checkpoint 5:** gates green. SC10 confirmed by the human. SC1 was 50.3ms under load (load avg 21).

## Still open, for the human
- SC4 true sleep-through: sleep the Mac through several due reminders, then expect one summary on wake. Batching is verified, but only with the display off.
- SC9: add `eval "$(jot hook zsh)"` to ~/.zshrc yourself, then open a new tab.
- Checkpoint 3: a real `every weekday 9am` firing on the next weekday.
- Checkpoint 1: hands-on use of capture, ls --here and search in real repos.
- [x] Follow-up: stable notification IDs. They dedupe Notification Center per reminder; Persistent alerts on screen still stack, which is macOS behaviour.
- [x] Follow-up: an app icon for Jot Notifier.app, which needed the new bundle ID `dev.jot.app`.
- Optional: switch off the stale old "Jot" entry in System Settings → Notifications.

## Decisions
All open questions are resolved. See "Decisions" in `tasks/plan.md`.
