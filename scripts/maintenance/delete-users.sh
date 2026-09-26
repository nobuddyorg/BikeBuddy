#!/usr/bin/env bash
# Description: Drain the GDPR account-deletion queue (delete users via Graph)
# Needs az login (for the Cosmos key and the Storage connection string) and GRAPH_TENANT_ID,
# GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET set. Each queued user's app data is purged again first (#538).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RESOURCE_GROUP="${RESOURCE_GROUP:-bikebuddy-rg}"

ACCOUNT_NAME="$(az cosmosdb list -g "$RESOURCE_GROUP" --query '[0].name' -o tsv)"
ENDPOINT="$(az cosmosdb show -n "$ACCOUNT_NAME" -g "$RESOURCE_GROUP" --query documentEndpoint -o tsv)"
ACCOUNT_KEY="$(az cosmosdb keys list -n "$ACCOUNT_NAME" -g "$RESOURCE_GROUP" --query primaryMasterKey -o tsv)"

export COSMOS_CONNECTION_STRING="AccountEndpoint=${ENDPOINT};AccountKey=${ACCOUNT_KEY};"
export COSMOS_DATABASE="${COSMOS_DATABASE:-bikebuddy}"
STORAGE_NAME="$(az storage account list -g "$RESOURCE_GROUP" --query "[?starts_with(name, 'bikebuddyfiles')].name | [0]" -o tsv)"
BLOB_CONNECTION_STRING="$(az storage account show-connection-string -n "$STORAGE_NAME" -g "$RESOURCE_GROUP" -o tsv)"
export BLOB_CONNECTION_STRING

node "$ROOT/functions/scripts/process-deletions.js" "$@"
