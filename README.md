# nudgy

Notes and reminders from the terminal, for macOS.

Capture a thought without leaving the shell, attach a natural-language reminder, and get a
macOS banner when it comes due. Each note records the git repo and branch you were in.
`ndg` is a short alias for `nudgy`.

```sh
nudgy "check the migration landed"
nudgy "re-run the flaky suite" -r "in 2 hours"
nudgy "standup notes" -r "every weekday 9am"
nudgy            # open the TUI
```

## Requirements

- macOS 14+ on Apple Silicon
- [Bun](https://bun.sh) 1.3+
- Xcode (to build the Swift notifier helper)

## Install

```sh
bun install
bun run install:local    # builds, then installs ~/.local/bin/nudgy and ~/.local/bin/ndg
nudgy daemon install     # LaunchAgent that sends the reminder banners
nudgy doctor             # checks the setup and sends a test banner
```

Make sure `~/.local/bin` is on your `PATH`.

### Shell hook (optional)

Add to `~/.zshrc` to see overdue and upcoming items when a new shell opens:

```sh
eval "$(nudgy hook zsh)"
```

The hook also defines `nudgy_prompt_segment`, which shows the due count in your prompt
without starting a process:

```sh
setopt prompt_subst
RPROMPT='$(nudgy_prompt_segment)'
```

## Usage

```
nudgy "<text>" [-r <when>]              capture a note, optionally with a reminder
nudgy add <text...> [-r <when>]         capture text that collides with a subcommand
nudgy ls [--here] [--done] [--reminders] [--json]
nudgy today | yesterday | tomorrow [--here] [--json]
nudgy due [--json]                      overdue + due in the next 24h
nudgy search <query> [--here] [--json]
nudgy show <id> | edit <id> | rm <id> [-y]
nudgy remind <id> <when> | remind <id> --clear
nudgy snooze <id> [<duration>]          default 10m
nudgy done <id> | reopen <id>
nudgy daemon run | install | uninstall | status
nudgy config                            open ~/.nudgy/config.json in $EDITOR
```

`--here` limits results to items captured in the current repo. Run `nudgy --help` for the
full list.

Reminders take any natural-language time (`"in 2 hours"`, `"tomorrow 3pm"`) or a
recurrence rule:

```
every day [at <time>]          every weekday [at <time>]
every mon,thu [at <time>]      every week [at <time>]
every <N> hours                every <N> days [at <time>]
```

An unacknowledged reminder re-alerts every 15 minutes until you mark it done or snooze it.
Banners have Done, Snooze and Remind later… actions.

### TUI

`j/k` move · `tab` switch tabs (Due, Today, All, Done) · `/` search · `a` add · `e` edit ·
`r` remind · `s` snooze · `d` done · `x` delete · `h` current-repo filter · `?` help · `q` quit

## Config

`~/.nudgy/config.json`:

```json
{ "realertMinutes": 15, "defaultSnooze": "10m", "hookWindowHours": 4, "sound": "Glass" }
```

Missing keys fall back to these defaults. Data lives in `~/.nudgy/` (override with
`NUDGY_HOME`).

## Development

```sh
bun run dev -- <args>    # runs from source against ./.nudgy-dev
bun test
bun run typecheck
bun run check            # Biome lint + format
```

See [SPEC.md](SPEC.md) for the full design.

## License

MIT
