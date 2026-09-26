#!/usr/bin/env bash
# Description: Stop the local dev stack (Functions host, Azurite, SWA, Cosmos emulator)
set -euo pipefail

for port in 7071 4280 10000 10001 10002; do
  pids=$(lsof -ti:"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "==> Stopping process on :$port"
    echo "$pids" | xargs kill -9 2>/dev/null || true
  fi
done

# A host can outlive its port binding.
pkill -f "func start" 2>/dev/null || true
pkill -f "swa start" 2>/dev/null || true

for container in bikebuddy-cosmos bikebuddy-azurite; do
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$container"; then
    echo "==> Stopping $container container"
    docker stop "$container" >/dev/null
  fi
done

echo "==> Local dev stack stopped."
