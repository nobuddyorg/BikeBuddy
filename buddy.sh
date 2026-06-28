#!/usr/bin/env bash
# Single entry point: ./buddy.sh <group> <command> [options]
# Groups/commands are scripts/<group>/<command>.sh; --help is generated from
# each script's `# Description:` line.
set -euo pipefail

cd "$(dirname "$0")" || exit 1

SCRIPTS_ROOT="./scripts"

# Read a script's `# Description:` line without spawning grep/sed per file.
description_of() {
  local line
  while IFS= read -r line; do
    case $line in '# Description: '*) printf '%s' "${line#'# Description: '}"; return;; esac
  done <"$1"
}

print_help() {
  echo -e "\nUsage: $0 <command-group> <command> [options]\n"
  echo "Available command groups and commands:"

  for group_dir in "$SCRIPTS_ROOT"/*/; do
    local group_name=${group_dir%/}; group_name=${group_name##*/}

    commands=()
    descriptions=()
    max_len=0

    for script_path in "$group_dir"*.sh; do
      [ -e "$script_path" ] || continue
      local cmd=${script_path##*/}; cmd=${cmd%.sh}
      local desc; desc=$(description_of "$script_path")
      [ -z "$desc" ] && continue
      commands+=("$cmd")
      descriptions+=("$desc")
      ((${#cmd} > max_len)) && max_len=${#cmd}
    done

    [ ${#commands[@]} -eq 0 ] && continue

    echo -e "\n$group_name:"
    for idx in "${!commands[@]}"; do
      printf "  %-*s  - %s\n" "$max_len" "${commands[$idx]}" "${descriptions[$idx]}"
    done
  done

  echo -e "\nother:"
  echo "  completion  - Print the tab-completion script (e.g. eval \"\$($0 completion)\")"
  echo
}

if [ "${1:-}" = "completion" ]; then
  cat "$SCRIPTS_ROOT/completion/buddy-completion.bash"
  exit 0
fi

if [ $# -lt 2 ]; then
  print_help
  exit 1
fi

SCRIPT_PATH="$SCRIPTS_ROOT/$1/$2.sh"

if [ ! -f "$SCRIPT_PATH" ]; then
  echo "Error: Script '$SCRIPT_PATH' not found." >&2
  print_help
  exit 1
fi

"$SCRIPT_PATH" "${@:3}"
