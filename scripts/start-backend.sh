#!/usr/bin/env bash
# Start Azurite (blob emulator) and the Azure Functions host in the background,
# then wait until the API answers on :7071. Used by the full-stack e2e workflow
# and reproducible locally.
#
# The Functions host reads its settings from the environment (COSMOS_CONNECTION_STRING,
# BLOB_CONNECTION_STRING, SKIP_AUTH, ...) or functions/local.settings.json. Set
# those before running. Background processes persist for later CI steps.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
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
