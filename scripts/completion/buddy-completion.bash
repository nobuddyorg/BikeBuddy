# Shell completion for buddy.sh (works in bash and zsh).
#
# Completes the command group (first argument) and the command (second
# argument) by scanning the scripts/ tree next to buddy.sh, so it stays in sync
# automatically as scripts are added or renamed.
#
# Enable it:
#   bash:  echo 'source "$HOME/Repos/BikeBuddy/scripts/completion/buddy-completion.bash"' >> ~/.bashrc
#   zsh:   echo 'autoload -Uz bashcompinit && bashcompinit && source "$HOME/Repos/BikeBuddy/scripts/completion/buddy-completion.bash"' >> ~/.zshrc

_buddy_complete() {
  local cur scripts_dir
  cur="${COMP_WORDS[COMP_CWORD]}"

  # Resolve scripts/ relative to the typed buddy.sh path so completion works
  # regardless of the current directory.
  scripts_dir="$(cd "$(dirname "${COMP_WORDS[0]}")" 2>/dev/null && pwd)/scripts"
  [ -d "$scripts_dir" ] || return 0

  if [ "$COMP_CWORD" -eq 1 ]; then
    local groups=""
    local dir
    for dir in "$scripts_dir"/*/; do
      [ -d "$dir" ] || continue
      groups+="$(basename "$dir") "
    done
    # shellcheck disable=SC2207
    COMPREPLY=($(compgen -W "$groups" -- "$cur"))
  elif [ "$COMP_CWORD" -eq 2 ]; then
    local group="${COMP_WORDS[1]}"
    local cmds=""
    local file
    for file in "$scripts_dir/$group"/*.sh; do
      [ -e "$file" ] || continue
      cmds+="$(basename "$file" .sh) "
    done
    # shellcheck disable=SC2207
    COMPREPLY=($(compgen -W "$cmds" -- "$cur"))
  fi
}

complete -F _buddy_complete buddy.sh ./buddy.sh
