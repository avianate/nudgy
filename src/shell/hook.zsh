# nudgy zsh hook. Add to ~/.zshrc:  eval "$(nudgy hook zsh)"

if [[ -o interactive ]]; then
  nudgy due --within __NUDGY_WINDOW__ 2>/dev/null
fi

# Put $(nudgy_prompt_segment) in PROMPT/RPROMPT (with setopt prompt_subst).
# Builtins only: `read` from a redirect never forks, so this is safe to run on every prompt.
nudgy_prompt_segment() {
  local count
  [[ -r __NUDGY_STATUS__ ]] || return 0
  read -r count < __NUDGY_STATUS__ || return 0
  (( count > 0 )) && print -n "⏰${count}"
  return 0
}
