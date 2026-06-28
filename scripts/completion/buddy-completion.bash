# Tab completion for buddy.sh. Enable with: eval "$(./buddy.sh completion)"

# zsh's `complete` comes from bashcompinit, which in turn needs compinit
# (it defines compdef) — load both so a bare eval works in a fresh zsh.
if [ -n "${ZSH_VERSION:-}" ]; then
  whence compdef >/dev/null 2>&1 || { autoload -Uz compinit && compinit -u; }
  autoload -Uz bashcompinit && bashcompinit
fi

_buddy_complete() {
  local cur scripts_dir
  cur="${COMP_WORDS[COMP_CWORD]}"

  # Resolve scripts/ from the typed buddy.sh path so completion is cwd-independent.
  scripts_dir="$(cd "$(dirname "${COMP_WORDS[0]}")" 2>/dev/null && pwd)/scripts"
  [ -d "$scripts_dir" ] || return 0

  if [ "$COMP_CWORD" -eq 1 ]; then
    local groups="" dir
    for dir in "$scripts_dir"/*/; do
      [ -d "$dir" ] || continue
      dir=${dir%/}; groups+="${dir##*/} "
    done
    # shellcheck disable=SC2207
    COMPREPLY=($(compgen -W "$groups" -- "$cur"))
  elif [ "$COMP_CWORD" -eq 2 ]; then
    local group="${COMP_WORDS[1]}" cmds="" file
    for file in "$scripts_dir/$group"/*.sh; do
      [ -e "$file" ] || continue
      file=${file##*/}; cmds+="${file%.sh} "
    done
    # shellcheck disable=SC2207
    COMPREPLY=($(compgen -W "$cmds" -- "$cur"))
  fi
}

complete -F _buddy_complete buddy.sh ./buddy.sh
