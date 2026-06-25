#!/usr/bin/env bash
# Start the Azure Cosmos DB Linux emulator (vnext-preview) in Docker and wait
# until it's ready. Idempotent: reuses the container if it already exists.
#
# vnext-preview serves the gateway over HTTP on :8081 (no TLS/cert needed) and a
# data explorer on http://localhost:1234. It's the cross-platform-friendly
# emulator recommended for macOS/Linux.
set -euo pipefail

CONTAINER="bikebuddy-cosmos"
IMAGE="mcr.microsoft.com/cosmosdb/linux/azure-cosmos-emulator:vnext-preview"

if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker daemon is not running. Start Docker Desktop and retry." >&2
  exit 1
fi

if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "==> Cosmos emulator already running."
elif docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "==> Starting existing Cosmos emulator container..."
  docker start "$CONTAINER" >/dev/null
else
  echo "==> Creating Cosmos emulator container (first run pulls the image)..."
  docker run --detach \
    --name "$CONTAINER" \
    --publish 8081:8081 \
    --publish 1234:1234 \
    "$IMAGE" >/dev/null
fi

echo "==> Waiting for emulator gateway on http://localhost:8081 (up to 2 min)..."
# Probe the gateway endpoint directly rather than grepping container logs: the
# vnext-preview image's log wording is not stable across releases, but a 2xx/4xx
# response on :8081 reliably means the gateway is accepting requests.
for _ in $(seq 1 60); do
  if curl -sS -o /dev/null http://localhost:8081/ 2>/dev/null; then
    echo "==> Emulator is ready. Data explorer: http://localhost:1234"
    exit 0
  fi
  sleep 2
done

echo "ERROR: Cosmos emulator did not become ready in time." >&2
echo "       Check logs with: docker logs $CONTAINER" >&2
exit 1
