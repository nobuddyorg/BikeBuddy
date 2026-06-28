#!/usr/bin/env bash
# Description: Start the Azurite storage emulator (Docker) and wait until ready
set -euo pipefail

CONTAINER="bikebuddy-azurite"
IMAGE="mcr.microsoft.com/azure-storage/azurite"

if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker daemon is not running. Start Docker Desktop and retry." >&2
  exit 1
fi

if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "==> Azurite emulator already running."
elif docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "==> Starting existing Azurite emulator container..."
  docker start "$CONTAINER" >/dev/null
else
  echo "==> Creating Azurite emulator container (first run pulls the image)..."
  docker run --detach \
    --name "$CONTAINER" \
    --publish 10000:10000 \
    --publish 10001:10001 \
    --publish 10002:10002 \
    "$IMAGE" \
    azurite -l /data --blobHost 0.0.0.0 --queueHost 0.0.0.0 --tableHost 0.0.0.0 \
    --skipApiVersionCheck >/dev/null
fi

echo "==> Waiting for Azurite blob endpoint on http://localhost:10000 (up to 30 s)..."
for _ in $(seq 1 15); do
  if curl -s -o /dev/null http://localhost:10000/devstoreaccount1 2>/dev/null; then
    echo "==> Azurite is ready."
    exit 0
  fi
  sleep 2
done

echo "ERROR: Azurite did not become ready in time." >&2
echo "       Check logs with: docker logs $CONTAINER" >&2
exit 1
