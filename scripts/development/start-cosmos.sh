#!/usr/bin/env bash
# Description: Start only the Cosmos DB emulator (Docker) and wait until ready
# vnext-preview serves plain HTTP on :8081, so no emulator certificate is needed.
set -euo pipefail

CONTAINER="bikebuddy-cosmos"
# Pinned by digest (multi-arch index): the tag moves, and every run must test against the same build.
IMAGE="mcr.microsoft.com/cosmosdb/linux/azure-cosmos-emulator:vnext-preview@sha256:2db1f9e74c506bcf6fc347aa937aea1c00fa756061296a5a9efba530ce86ec02"

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
# The image's log wording changes between releases; any HTTP answer on :8081 means ready.
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
