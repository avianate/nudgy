# Distribution plan

Goal: any macOS developer can install the tool in one command, from GitHub, Homebrew or npm.
Nothing should trip Gatekeeper, require a toolchain, or need hand-editing. Today jot is a
personal build: ad-hoc signed, Apple Silicon only, installed from source to fixed paths. This
plan gets it to a freely distributable release.

Phases 1–3 need no Apple Developer account. Phase 4 needs the $99/yr account. Phase 5 depends on
Phase 4 for anything a user downloads through a browser.

## Phase 1: Identity (do first; painful to change later)

**Decided 2026-09-23: `nudgy`.** It's free on npm and Homebrew, and has no macOS command clash.
The bundle ID is `io.github.avianate.nudgy`, and the LaunchAgent label is
`io.github.avianate.nudgy.daemon`. The data dir is `~/.nudgy`, the env vars are `NUDGY_*`,
and the helper is `Nudgy Notifier.app`, shown as "Nudgy", with an "n" icon. Code, spec and tests
were renamed. The history files in `tasks/` keep the old name.

The name and the bundle ID become permanent once other people install the tool.

| Item | Today | Problem | Target |
|---|---|---|---|
| Command name | `jot` | macOS ships `/usr/bin/jot` (a BSD sequence tool). Ours shadows it on PATH and breaks scripts that use it. | A name with no system, Homebrew or npm clash |
| npm package | none | `jot` is taken on npm | An unscoped free name, or `@<org>/<name>` |
| Helper bundle ID | `dev.jot.app` | A domain we don't own. Notification permission is tied to it, and changing it forces every user to re-grant. | Reverse-DNS on a domain we control |
| Helper app | `~/.jot/Jot Notifier.app`, shown as "Jot" | Named after the old command | Renamed to match |
| LaunchAgent label | `dev.jot.daemon` | Same domain problem | `<bundle-prefix>.daemon` |
| Data dir and env | `~/.jot`, `JOT_HOME`, `JOT_*` seams | Named after the old command | `~/.<name>`, `<NAME>_HOME` |
| Notification IDs | `jot-item-<id>`, `jot-summary` | Cosmetic | `<name>-item-<id>`, … |

**Migration for existing installs** (today, only the author's machine):
1. `jot daemon uninstall`, which boots out `dev.jot.daemon` and removes its plist.
2. Move `~/.jot/jot.db` (with its `-wal` and `-shm` files) and `config.json` into the new data
   dir. Leave the logs behind.
3. Remove `~/.local/bin/jot`, which also stops shadowing `/usr/bin/jot`, and
   `~/.jot/Jot Notifier.app`.
4. Install under the new name, then `<name> daemon install`, then allow notifications for the
   new bundle ID and set Persistent and Show previews: Always.
5. Switch off the stale "Jot" entries in System Settings → Notifications.

**Done on the author's machine, 2026-09-23:**
- The old agent was booted out, the WAL checkpointed, and `~/.jot` archived to
  `~/.nudgy/jot-backup-2026-09-23.tar.gz`.
- The database was copied to `~/.nudgy/nudgy.db` (integrity ok, one item).
- nudgy and its daemon were installed.
- `~/.local/bin/jot`, the old helper (unregistered from LaunchServices first) and `~/.jot` were
  removed.
- Permission was granted for the new bundle ID. `doctor` shows all green.
- Left to the human: `~/.zshrc` line 200 still says `jot hook zsh`, and the repo folder is still
  named `jot`, so notes captured there are tagged `jot@main`.

Ship a one-time migration inside `setup` if anyone else has installed a pre-release build.
Otherwise, do it by hand once.

## Phase 2: Relocatable install

Today's code assumes `~/.local/bin/<name>` and `~/.jot/…`. Homebrew installs to
`/opt/homebrew/bin`, a `.pkg` usually to `/usr/local/bin`, and npm to its own global prefix.

- **Binary path:** resolve the running binary with `realpath(process.execPath)`. Use it for the
  plist's `ProgramArguments`, `doctor`'s PATH and signature checks, and the helper payload's
  `jotBin`. The "canonical path" rule was right for a personal build; distributed builds
  should record wherever they were installed.
- **Helper app:** find it next to the binary first (`../libexec/<Name> Notifier.app` or the same
  directory), then fall back to the data dir. A package manager installs both together, so
  they version together.
- **`install:local`:** stays as the developer workflow, now just one install location among
  several.

## Phase 3: First-run and lifecycle commands

- **`<name> setup`** (idempotent):
  - creates the data dir
  - installs or refreshes the LaunchAgent using the resolved binary path
  - registers the helper with `lsregister`
  - sends a test alert, which triggers the permission prompt, and walks through
    Persistent and Show previews: Always
  - prints the zsh hook line
  - runs `doctor`
- **`<name> uninstall [--keep-data]`:** boots out the agent and removes the plist and helper.
  The data dir is removed only without `--keep-data`, after confirmation. The binary itself is
  left to the package manager, and the command prints how to remove it.
- **Upgrades:** after a package-manager upgrade, the running daemon still points at the old
  binary until restarted. Each channel's post-install step, or the first run of a new version
  (compare a version stamp in the data dir), runs `launchctl kickstart -k`.
- **Documentation:** README (install, quickstart, keys, notification settings,
  troubleshooting), LICENSE, CHANGELOG, semver tags.

## Phase 4: Signing and notarization (needs the Apple Developer account)

- **Certificates:** "Developer ID Application" for the CLI binary and the helper app;
  "Developer ID Installer" only if we ship a `.pkg`.
- **Signing:** replace ad-hoc `codesign -s -` in `scripts/build.ts` with
  `codesign --sign "Developer ID Application: … (TEAMID)" --options runtime --timestamp --entitlements <file>`.
  - **Bun binary entitlements:** JIT and executable memory, per Bun's codesigning docs. Probably
    also `com.apple.security.cs.disable-library-validation`, because OpenTUI's embedded
    `libopentui.dylib` is extracted and loaded at runtime. **Test this first:** run the signed,
    hardened binary's TUI.
  - **Helper app:** signed with the hardened runtime, no special entitlements expected.
- **Notarization:** `xcrun notarytool submit <zip|pkg> --keychain-profile … --wait`, then
  `xcrun stapler staple` on the `.app` and `.pkg`. A bare CLI binary can't be stapled, so
  Gatekeeper checks it online. A `.pkg` is the most robust format for offline installs.
- **Installers stop re-signing** and copy notarized artifacts untouched.
- **CI:** a GitHub Actions macOS runner. The `.p12` goes in secrets and is imported into a temp
  keychain. The App Store Connect API key is used for notarytool. A tag push builds, signs,
  notarizes, staples and uploads.

## Phase 5: Build matrix and channels

- **Universal build:**
  - `bun build --compile --target=bun-darwin-arm64` and `--target=bun-darwin-x64`, then
    `lipo -create`. Check OpenTUI ships an x64 native package; it has
    `@opentui/core-darwin-x64`.
  - `swiftc -target arm64-apple-macos14` plus `x86_64`, then `lipo`.
  - Test on macOS 14 and 15, the declared minimum.
- **Build without full Xcode:** `actool` is Xcode-only. CI has Xcode, but source builders may
  have only the Command Line Tools. Fall back to `iconutil` (`.icns` only) when `actool` is
  missing, or commit the compiled icon assets.
- **Channels, all fed by the same notarized release artifacts:**

| Channel | Mechanism | Post-install |
|---|---|---|
| GitHub Releases | `<name>-<version>-macos-universal.tar.gz` (+ `.pkg`), checksums | `<name> setup` |
| `curl -fsSL …/install.sh \| sh` | Downloads the tarball, verifies the checksum, installs to `~/.local/bin` and the helper next to it | Runs `setup` |
| Homebrew tap (`<org>/tap`) | A cask with the notarized tarball, helper to `libexec` | Caveats tell the user to run `<name> setup` |
| npm | A wrapper package plus a per-platform optional dependency (`@<org>/<name>-darwin-universal`) holding the binary and helper, as esbuild and Biome do | `<name> setup` (no postinstall magic) |

Unsigned builds (before Phase 4) are only OK for the `curl` path, because `curl` doesn't set
the quarantine attribute. Browser downloads and casks need Phase 4.

## Housekeeping

- **Spec:** SPEC.md still says "personal tool, no distribution", and its install path and
  LaunchAgent boundaries assume one machine. Revise it alongside Phase 1.
- **Licenses:** OpenTUI, chrono-node and React are MIT. The Bun runtime embeds JavaScriptCore
  (LGPL-2.1). Note it in the third-party notices; compiled Bun executables are routinely
  distributed.
- **Selling point to keep:** no network calls, no telemetry. Say so in the README.
- **Security:** the helper runs the `jotBin` path it's given in the payload, and the daemon
  writes the payload. That's fine locally. Keep the payload from anything untrusted.

## Order of work

1. **Now:** Phase 1 rename, new bundle ID, and migrating the author's install.
2. Phase 2, then Phase 3 (`setup`/`uninstall`), plus README and LICENSE.
3. The Phase 5 universal build and a release workflow with signing stubbed, shipped as a
   `curl` installer for early users.
4. **With the account:** Phase 4. Enable signing and notarization in CI, then add the tap and
   the npm package.
