#!/usr/bin/env bash
# Description: Stop the local dev stack (Functions host, Azurite, SWA, Cosmos emulator)
set -euo pipefail

# Free the dev ports: Functions (7071), SWA proxy (4280), Azurite (10000-10002).
for port in 7071 4280 10000 10001 10002; do
  pids=$(lsof -ti:"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "==> Stopping process on :$port"
    echo "$pids" | xargs kill -9 2>/dev/null || true
  fi
done

# Catch stragglers that outlived their port binding.
pkill -f "func start" 2>/dev/null || true
pkill -f "azurite" 2>/dev/null || true
pkill -f "swa start" 2>/dev/null || true

# The Cosmos emulator runs as a Docker container (start-all leaves it up).
if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx bikebuddy-cosmos; then
  echo "==> Stopping Cosmos emulator container"
  docker stop bikebuddy-cosmos >/dev/null
fi

echo "==> Local dev stack stopped."
