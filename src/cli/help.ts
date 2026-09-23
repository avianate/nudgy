export const USAGE = `nudgy — notes and reminders from the terminal

Usage:
  nudgy                                   open the TUI
  nudgy "<text>" [-r <when>]              capture a note, optionally with a reminder
  nudgy add <text...> [-r <when>]         capture text that collides with a subcommand
  nudgy -- <text...>                      capture literal text
  nudgy ls [--here] [--done] [--reminders] [--json]
  nudgy today | yesterday | tomorrow [--here] [--json]
  nudgy due [--json]                      overdue + due in the next 24h
  nudgy search <query> [--here] [--json]
  nudgy show <id> [--json]
  nudgy edit <id>                         open the body in $EDITOR
  nudgy remind <id> <when>                set a reminder (one-shot or "every …")
  nudgy remind <id> --clear
  nudgy snooze <id> [<duration>]          default 10m
  nudgy done <id>
  nudgy reopen <id>
  nudgy rm <id> [-y]
  nudgy daemon run | install | uninstall | status
  nudgy hook zsh                          print the zsh hook
  nudgy doctor                            check the environment
  nudgy config                            open ~/.nudgy/config.json in $EDITOR
  nudgy --version | --help

Recurrence:
  every day [at <time>]                 every weekday [at <time>]
  every mon,thu [at <time>]             every week [at <time>]
  every <N> hours                       every <N> days [at <time>]`;
