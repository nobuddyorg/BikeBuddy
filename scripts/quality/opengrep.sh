#!/usr/bin/env bash
# Description: Run the OpenGrep SAST scan (pinned version, same rule packs as CI)
# Installs the pinned OpenGrep into ~/.opengrep on first run. Extra arguments go
# to `opengrep scan` (CI adds --sarif-output/--json-output). Fails on any
# finding locally; CI's opengrep job gates on error severity only.
set -euo pipefail

VERSION="v1.30.0"
# `auto` picks the community packs for the languages found; `p/security-audit`
# keeps the audit rules BikeBuddy used before. Both are fetched anonymously.
CONFIGS=(--config auto --config p/security-audit)
PATHS=(functions/src functions/scripts frontend/src e2e scripts infrastructure)

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

BIN="$HOME/.opengrep/cli/latest/opengrep"
if [ ! -x "$BIN" ] || [ "$("$BIN" --version 2>/dev/null)" != "${VERSION#v}" ]; then
  echo "==> Installing OpenGrep $VERSION"
  installer="$(mktemp)"
  curl -fsSL https://raw.githubusercontent.com/opengrep/opengrep/main/install.sh -o "$installer"
  bash "$installer" -v "$VERSION"
  rm -f "$installer"
fi

if [ "${CI:-}" = "true" ]; then
  "$BIN" scan "${CONFIGS[@]}" "$@" "${PATHS[@]}"
else
  "$BIN" scan "${CONFIGS[@]}" --error "$@" "${PATHS[@]}"
fi
