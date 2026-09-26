#!/usr/bin/env bash
# Description: Run a backfill against production (tour-stats, thumbnails, schema-version); a dry run unless --apply
# Needs az login. Order: tour-stats, thumbnails, then schema-version. Runbook: design-decisions.md, "Backfills".
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RESOURCE_GROUP="${RESOURCE_GROUP:-bikebuddy-rg}"

case "${1:-}" in
  tour-stats) SCRIPT="backfillTourStats.js" ;;
  thumbnails) SCRIPT="backfillImageThumbnails.js" ;;
  schema-version) SCRIPT="backfillSchemaVersion.js" ;;
  *)
    echo "Usage: $0 <tour-stats|thumbnails|schema-version> [--apply]" >&2
    exit 2
    ;;
esac
shift

ACCOUNT_NAME="$(az cosmosdb list -g "$RESOURCE_GROUP" --query '[0].name' -o tsv)"
ENDPOINT="$(az cosmosdb show -n "$ACCOUNT_NAME" -g "$RESOURCE_GROUP" --query documentEndpoint -o tsv)"
ACCOUNT_KEY="$(az cosmosdb keys list -n "$ACCOUNT_NAME" -g "$RESOURCE_GROUP" --query primaryMasterKey -o tsv)"
STORAGE_NAME="$(az storage account list -g "$RESOURCE_GROUP" --query "[?starts_with(name, 'bikebuddyfiles')].name | [0]" -o tsv)"

export COSMOS_CONNECTION_STRING="AccountEndpoint=${ENDPOINT};AccountKey=${ACCOUNT_KEY};"
export COSMOS_DATABASE="${COSMOS_DATABASE:-bikebuddy}"
BLOB_CONNECTION_STRING="$(az storage account show-connection-string -n "$STORAGE_NAME" -g "$RESOURCE_GROUP" -o tsv)"
export BLOB_CONNECTION_STRING

node "$ROOT/functions/scripts/$SCRIPT" "$@"
