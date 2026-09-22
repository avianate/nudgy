export const USAGE = `jot — notes and reminders from the terminal

Usage:
  jot                                   open the TUI
  jot "<text>" [-r <when>]              capture a note, optionally with a reminder
  jot add <text...> [-r <when>]         capture text that collides with a subcommand
  jot -- <text...>                      capture literal text
  jot ls [--here] [--done] [--reminders] [--json]
  jot today | yesterday | tomorrow [--here] [--json]
  jot due [--json]                      overdue + due in the next 24h
  jot search <query> [--here] [--json]
  jot show <id> [--json]
  jot edit <id>                         open the body in $EDITOR
  jot remind <id> <when>                set a reminder (one-shot or "every …")
  jot remind <id> --clear
  jot snooze <id> [<duration>]          default 10m
  jot done <id>
  jot reopen <id>
  jot rm <id> [-y]
  jot daemon run | install | uninstall | status
  jot hook zsh                          print the zsh hook
  jot doctor                            check the environment
  jot config                            open ~/.jot/config.json in $EDITOR
  jot --version | --help

Recurrence:
  every day [at <time>]                 every weekday [at <time>]
  every mon,thu [at <time>]             every week [at <time>]
  every <N> hours                       every <N> days [at <time>]`;
