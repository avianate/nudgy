# Spike findings

## T2: banner from a LaunchAgent (2026-09-22)

**Result: pass.**

- **Chain tested:** launchd (`gui/501`, label `dev.jot.daemon`, `RunAtLoad` only) ran the compiled,
  ad-hoc-signed Bun binary at `~/.local/bin/jot`. That binary spawned
  `/usr/bin/osascript -e <script> <argv…>`.
- **Banner:** a banner appeared, and the human confirmed it. The first run at 14:13 went unseen
  because the human was away. The second run, via `launchctl kickstart`, was seen.
- **Argv passing:** the subtitle `repo "quoted" \ back` and a body containing quotes and a
  backslash came through verbatim.
- **Attribution and permission:** banners are attributed to Script Editor. The human finds this
  acceptable for v1. No manual permission grant was needed on this machine.
- **Exit codes:** `osascript` exits 0 and `launchctl print` shows `runs = 1`,
  `last exit code = 0`.
- **launchd environment:** `PATH=/usr/bin:/bin:/usr/sbin:/sbin`. The daemon must use absolute
  paths for anything it spawns. `/usr/bin/osascript` is fine. `git` is not needed by the daemon.
- **Cleanup:** the agent was booted out afterwards, and the plist and log were removed.
- **Takeaway for T12/T17:** an unseen banner is easy to miss. That supports re-alerting, and
  `doctor` should say "check Notification Center" when it asks whether the banner appeared.

## T3: OpenTUI in a compiled binary (2026-09-22)

**Result: pass. `e` uses suspend/resume, not the fallback.**

- **Packages:** `@opentui/core` and `@opentui/react` are 0.5.12, exact. The transitive native
  package is `@opentui/core-darwin-arm64@0.5.12`. It ships `libopentui.dylib`, loaded via
  `import(..., { with: { type: "file" } })`, which `bun build --compile` embeds. The binary loads
  it from a directory with no `node_modules`, so nothing extra is needed.
- **Markdown:** there's a built-in `<markdown content syntaxStyle>` renderable, using `marked`
  as a transitive dependency of core. **No extra dependency is needed.** T18 must supply a
  styled `SyntaxStyle`, because `SyntaxStyle.create()` renders raw markers such as `**bold**`.
- **Network:** tree-sitter grammars for JS, TS, Markdown and Zig are embedded local assets. The
  `fetch()` paths only run for parsers configured with a URL. jot must never configure one.
- **Suspend/resume:** `renderer.suspend()` → `spawnSync($EDITOR, [file], { stdio: "inherit" })`
  → `renderer.resume()` round-trips cleanly. This was checked two ways:
  - automated, under `script` with a fake editor
  - by the human, with a real editor in a terminal tab: "Clean round-trip"
- **tsconfig:** needs `"jsxImportSource": "@opentui/react"`.
- **Startup latency:** median of 10 runs of `--version`, which never imports the TUI.

  | Build | Median |
  |---|---|
  | No TUI in bundle | 10.8ms |
  | TUI bundled, default | **50.8ms** (the whole bundle is parsed on every launch) |
  | TUI bundled, `--minify` | 52.5ms |
  | TUI bundled, `--splitting` | **13.3ms** |
  | TUI bundled, `--bytecode` | build fails: OpenTUI uses top-level await, which bytecode (CJS) can't compile |

  **Decision:** `scripts/build.ts` uses `splitting: true`. The split binary's TUI was
  re-verified under a pty.

## Checkpoint 2: live daemon under launchd (2026-09-22)

- **SC2: pass.** The reminder was due at 14:56:39 and alerted at 14:57:02, 23s late (budget
  30s). The human saw the banner.
- **SC3: pass.** With `realertMinutes: 1` it re-alerted at 14:58:05, 63s after the first
  banner. The human saw the second banner.
- **SC11: pass.** `bun run install:local` over the running daemon swapped PID 44992 for 48841.
  The old process logged "daemon stopped" and exited 0, and the new one was ticking 2s later.
  `codesign --verify` passed, and there was no SIGKILL.
- **SC4: partial.** The Mac did **not** system-sleep. `pmset -g log` shows only the display off
  from 15:00:30 to 15:03:35, and something held a wake assertion. All three reminders were
  batched into one tick at 15:01:54. osascript exited 0, but no banner popped while the display
  was off. **Notification Center held exactly one "3 reminders due" entry**, so batching works.
  - A true sleep-through was not exercised. The human will check it in normal use.
  - The re-alert (every `realertMinutes`) is what surfaces a summary that arrived while the
    screen was off.
- **Cleanup:** the test items #1–4 were deleted and `config.json` was removed, so defaults
  apply. The daemon is left installed and running.

## Swift notifier helper (2026-09-22)

The human found the osascript banners unacceptable: they're attributed to Script Editor, and
clicking one opens an empty Script Editor. **Decision:** a Swift helper app becomes the primary
notifier, with osascript kept as a fallback. SPEC.md was updated to match.

- **Build:** `swiftc -O` builds `src/notifier/main.swift` into
  `Jot Notifier.app/Contents/MacOS/jot-notify`, alongside an `Info.plist` with
  `CFBundleIdentifier` = `dev.jot.notifier`, name "Jot" and `LSUIElement`. The bundle is
  ad-hoc signed. It uses the Xcode toolchain (Swift 6.4, macOS 27 SDK).
- **Registration:** the first run, straight from the binary, returned "Notifications are not
  allowed for this application" at once, with no prompt. **Running `lsregister -f <bundle>`
  fixes it.** After that, `requestAuthorization` granted and the banner showed as **Jot**.
- **Default settings:** the per-app defaults were "Temporary" style (banners) with previews
  hidden, so the banner read "Notification". The human set Show previews to Always and the style
  to Persistent. `doctor` should point at these settings.
- **Text:** the title, a subtitle with `"` and `\`, and a body with `\backslash` and `"quotes"`
  came through verbatim. They're passed as argv.
- **Click:** clicking dismisses the banner, and nothing opens. A click relaunch has no args, so
  the helper exits at once.
- **Sound:** `UNNotificationSound(named: "Glass")` plays the system Glass sound. The human heard
  it.
- **Rebuild and re-sign:** after changing the binary and re-signing ad hoc (a new cdhash), the
  helper stayed authorized and the banner appeared. **The permission survives rebuilds.**
- **Still open:** being launched by the daemon under launchd is checked after integration.
