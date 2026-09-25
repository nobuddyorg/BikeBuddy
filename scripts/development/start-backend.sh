#!/usr/bin/env bash
# Description: Start the Azurite storage emulator (Docker) and the Functions host (waits for :7071)
# nohup: the host must outlive this script for later CI steps.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FUNCTIONS_HOST_LOG="${FUNCTIONS_HOST_LOG:-/tmp/func.log}"

"$ROOT/scripts/development/start-azurite.sh"

echo "==> Starting Functions host..."
(cd "$ROOT/functions" && nohup func start >"$FUNCTIONS_HOST_LOG" 2>&1 &)

echo "==> Waiting for the Functions host on http://localhost:7071 (up to 2 min)..."
for _ in $(seq 1 60); do
  if curl -sS -o /dev/null http://localhost:7071/api/me 2>/dev/null; then
    echo "==> Functions host is up."
    exit 0
  fi
  sleep 2
done

echo "ERROR: Functions host did not start. Recent log:" >&2
tail -n 50 "$FUNCTIONS_HOST_LOG" >&2 || true
exit 1
