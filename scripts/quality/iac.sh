#!/usr/bin/env bash
# Description: Lint and scan the OpenTofu code (TFLint + Trivy config, pinned versions)
# --report <directory> also writes SARIF and text reports there (CI).
set -euo pipefail

TFLINT_VERSION="0.64.0"
TFLINT_SHA256="cca9d13e2e1d7a2c627af60ff899a3c9b74212899416aeb96ec764d2ef954537"
TRIVY_VERSION="0.74.0"
TRIVY_SHA256="2ae6fe3ee734b7fdf11335663e18c75ea12dccc76062f09f164a3b0f8be4371a"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TOOLS_DIRECTORY="${XDG_CACHE_HOME:-$HOME/.cache}/bikebuddy-tools"
REPORT=""
if [ "${1:-}" = "--report" ]; then REPORT="$(mkdir -p "$2" && cd "$2" && pwd)"; fi

# download <url> <sha256> <file>: fails unless the file matches the pinned hash.
download() {
  curl -fsSL "$1" -o "$3"
  echo "$2  $3" | sha256sum --check --status || {
    echo "ERROR: checksum mismatch for $1" >&2
    exit 1
  }
}

install_tflint() {
  local tool_directory="$TOOLS_DIRECTORY/tflint-$TFLINT_VERSION"
  if [ ! -x "$tool_directory/tflint" ]; then
    echo "==> Installing TFLint $TFLINT_VERSION"
    mkdir -p "$tool_directory"
    download "https://github.com/terraform-linters/tflint/releases/download/v$TFLINT_VERSION/tflint_linux_amd64.zip" \
      "$TFLINT_SHA256" "$tool_directory/tflint.zip"
    python3 -m zipfile -e "$tool_directory/tflint.zip" "$tool_directory" && chmod +x "$tool_directory/tflint" && rm "$tool_directory/tflint.zip"
  fi
  TFLINT="$tool_directory/tflint"
}

install_trivy() {
  local tool_directory="$TOOLS_DIRECTORY/trivy-$TRIVY_VERSION"
  if [ ! -x "$tool_directory/trivy" ]; then
    echo "==> Installing Trivy $TRIVY_VERSION"
    mkdir -p "$tool_directory"
    download "https://github.com/aquasecurity/trivy/releases/download/v$TRIVY_VERSION/trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz" \
      "$TRIVY_SHA256" "$tool_directory/trivy.tar.gz"
    tar -xzf "$tool_directory/trivy.tar.gz" -C "$tool_directory" trivy && rm "$tool_directory/trivy.tar.gz"
  fi
  TRIVY="$tool_directory/trivy"
}

install_tflint
install_trivy
cd "$ROOT/infrastructure"

echo "==> TFLint"
# --init fetches the azurerm ruleset pinned in .tflint.hcl (GITHUB_TOKEN avoids API rate limits in CI).
"$TFLINT" --config ../.tflint.hcl --init >/dev/null
tflint_status=0
if [ -n "$REPORT" ]; then
  "$TFLINT" --config ../.tflint.hcl --format sarif >"$REPORT/tflint.sarif" || tflint_status=$?
  "$TFLINT" --config ../.tflint.hcl --format compact >"$REPORT/tflint.txt" || true
  cat "$REPORT/tflint.txt"
else
  "$TFLINT" --config ../.tflint.hcl || tflint_status=$?
fi

echo "==> Trivy config (fails on HIGH/CRITICAL)"
# Embedded checks only: the result depends on the pinned version, not on the day it runs.
trivy_args=(config --skip-check-update --ignorefile ../.trivyignore.yaml --quiet)
if [ -n "$REPORT" ]; then
  "$TRIVY" "${trivy_args[@]}" --format sarif --output "$REPORT/trivy.sarif" .
  "$TRIVY" "${trivy_args[@]}" --format table --output "$REPORT/trivy.txt" .
fi
trivy_status=0
"$TRIVY" "${trivy_args[@]}" --severity HIGH,CRITICAL --exit-code 1 . || trivy_status=$?

if [ "$tflint_status" -ne 0 ] || [ "$trivy_status" -ne 0 ]; then
  echo "IaC checks failed (tflint: $tflint_status, trivy: $trivy_status)." >&2
  exit 1
fi
echo "==> IaC checks passed."
