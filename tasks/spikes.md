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
