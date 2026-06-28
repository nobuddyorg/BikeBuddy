#!/usr/bin/env bash
# Description: Start only Azurite + the Functions host (waits for :7071)
# Settings come from the environment or functions/local.settings.json. Runs in
# the background (nohup) so the processes persist for later CI steps.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
AZURITE_LOCATION="${AZURITE_LOCATION:-/tmp/azurite}"
FUNC_LOG="${FUNC_LOG:-/tmp/func.log}"

echo "==> Starting Azurite (location: $AZURITE_LOCATION)..."
mkdir -p "$AZURITE_LOCATION"
nohup azurite --silent --skipApiVersionCheck --location "$AZURITE_LOCATION" \
  >/tmp/azurite.log 2>&1 &

echo "==> Starting Functions host..."
(cd "$ROOT/functions" && nohup func start >"$FUNC_LOG" 2>&1 &)

echo "==> Waiting for the Functions host on http://localhost:7071 (up to 2 min)..."
for _ in $(seq 1 60); do
  if curl -sS -o /dev/null http://localhost:7071/api/me 2>/dev/null; then
    echo "==> Functions host is up."
    exit 0
  fi
  sleep 2
done

echo "ERROR: Functions host did not start. Recent log:" >&2
tail -n 50 "$FUNC_LOG" >&2 || true
exit 1
