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
