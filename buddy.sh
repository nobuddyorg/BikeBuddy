#!/usr/bin/env bash
# Single entry point for every helper script in this repo.
#   ./buddy.sh <command-group> <command> [options]
#   ./buddy.sh --help
#   ./buddy.sh completion            # print the tab-completion script
# Commands live in scripts/<group>/<command>.sh; the help text below is
# auto-generated from each script's `# Description:` line.
set -euo pipefail

cd "$(dirname "$0")" || exit 1

SCRIPTS_ROOT="./scripts"

print_help() {
  echo -e "\nUsage: $0 <command-group> <command> [options]\n"
  echo "Available command groups and commands:"

  for group_dir in "$SCRIPTS_ROOT"/*/; do
    group_name=$(basename "$group_dir")

    commands=()
    descriptions=()
    max_len=0

    for script_path in "$group_dir"/*.sh; do
      [ -e "$script_path" ] || continue
      cmd=$(basename "$script_path" .sh)
      desc=$(grep -m1 '^# Description:' "$script_path" | sed 's/^# Description: //')
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

# Print the completion script to stdout so it can be eval'd, the way
# `kubectl completion` works: eval "$(./buddy.sh completion)"
# (eval, not source <(...), to also work in macOS's system bash 3.2)
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
