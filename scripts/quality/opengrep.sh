#!/usr/bin/env bash
# Description: Run the OpenGrep SAST scan (pinned version, same rule packs as CI)
# Fails on any finding locally; CI's opengrep job gates on error severity only.
set -euo pipefail

VERSION="v1.30.0"
CONFIGS=(--config auto --config p/security-audit)
PATHS=(functions/src functions/scripts frontend/src e2e load scripts infrastructure)

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

OPENGREP_BINARY="$HOME/.opengrep/cli/latest/opengrep"
if [ ! -x "$OPENGREP_BINARY" ] || [ "$("$OPENGREP_BINARY" --version 2>/dev/null)" != "${VERSION#v}" ]; then
  echo "==> Installing OpenGrep $VERSION"
  installer="$(mktemp)"
  curl -fsSL https://raw.githubusercontent.com/opengrep/opengrep/main/install.sh -o "$installer"
  bash "$installer" -v "$VERSION"
  rm -f "$installer"
fi

if [ "${CI:-}" = "true" ]; then
  "$OPENGREP_BINARY" scan "${CONFIGS[@]}" "$@" "${PATHS[@]}"
else
  "$OPENGREP_BINARY" scan "${CONFIGS[@]}" --error "$@" "${PATHS[@]}"
fi
