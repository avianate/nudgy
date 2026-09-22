# jot zsh hook. Add to ~/.zshrc:  eval "$(jot hook zsh)"

if [[ -o interactive ]]; then
  jot due --within __JOT_WINDOW__ 2>/dev/null
fi

# Put $(jot_prompt_segment) in PROMPT/RPROMPT (with setopt prompt_subst).
# Builtins only: `read` from a redirect never forks, so this is safe to run on every prompt.
jot_prompt_segment() {
  local count
  [[ -r __JOT_STATUS__ ]] || return 0
  read -r count < __JOT_STATUS__ || return 0
  (( count > 0 )) && print -n "⏰${count}"
  return 0
}
