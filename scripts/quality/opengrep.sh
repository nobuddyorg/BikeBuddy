#!/usr/bin/env bash
# Description: Run the OpenGrep SAST scan (pinned version, same rule packs as CI)
# Fails on any finding locally; CI's opengrep job gates on error severity only.
set -euo pipefail

VERSION="v1.30.0"
CONFIGS=(--config auto --config p/security-audit)
PATHS=(functions/src functions/scripts frontend/src e2e load scripts infrastructure)

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

TOOLS_DIRECTORY="${XDG_CACHE_HOME:-$HOME/.cache}/bikebuddy-tools"

# The release binary for this platform and its pinned sha256; never the installer from main.
release_asset() {
  case "$(uname -s)-$(uname -m)" in
    Linux-x86_64) echo "opengrep_manylinux_x86 35779bdd72e92129c8df2a77f0c55e8c08356801ea92591ef32108d6b28d564c" ;;
    Linux-aarch64) echo "opengrep_manylinux_aarch64 a5d5a4a58ba5d46ff51e921663da1c2bba38f4b03987f4aeec87f16c6ad3ecae" ;;
    Darwin-x86_64) echo "opengrep_osx_x86 650772a849a2986880982b7dea0371f96a75d354de95f94e8c1a2e6f8f6262d1" ;;
    Darwin-arm64) echo "opengrep_osx_arm64 0f5bc3dec09d995c61331a4017b856ede508f90d95b018d95f1dc6166be89fdd" ;;
    *)
      echo "ERROR: no pinned OpenGrep $VERSION binary for $(uname -s)-$(uname -m)" >&2
      exit 1
      ;;
  esac
}

OPENGREP_BINARY="$TOOLS_DIRECTORY/opengrep-$VERSION/opengrep"
if [ ! -x "$OPENGREP_BINARY" ]; then
  read -r asset sha256 <<<"$(release_asset)"
  echo "==> Installing OpenGrep $VERSION ($asset)"
  mkdir -p "$(dirname "$OPENGREP_BINARY")"
  download="$(mktemp)"
  curl -fsSL "https://github.com/opengrep/opengrep/releases/download/$VERSION/$asset" -o "$download"
  echo "$sha256  $download" | sha256sum --check --status || {
    echo "ERROR: checksum mismatch for OpenGrep $VERSION ($asset)" >&2
    rm -f "$download"
    exit 1
  }
  chmod +x "$download" && mv "$download" "$OPENGREP_BINARY"
fi

if [ "${CI:-}" = "true" ]; then
  "$OPENGREP_BINARY" scan "${CONFIGS[@]}" "$@" "${PATHS[@]}"
else
  "$OPENGREP_BINARY" scan "${CONFIGS[@]}" --error "$@" "${PATHS[@]}"
fi
