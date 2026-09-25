#!/usr/bin/env bash
# Description: Drain the GDPR account-deletion queue (delete users via Graph)
# Needs az login (for the Cosmos key) and GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET set.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RESOURCE_GROUP="${RESOURCE_GROUP:-bikebuddy-rg}"

ACCOUNT_NAME="$(az cosmosdb list -g "$RESOURCE_GROUP" --query '[0].name' -o tsv)"
ENDPOINT="$(az cosmosdb show -n "$ACCOUNT_NAME" -g "$RESOURCE_GROUP" --query documentEndpoint -o tsv)"
ACCOUNT_KEY="$(az cosmosdb keys list -n "$ACCOUNT_NAME" -g "$RESOURCE_GROUP" --query primaryMasterKey -o tsv)"

export COSMOS_CONNECTION_STRING="AccountEndpoint=${ENDPOINT};AccountKey=${ACCOUNT_KEY};"
export COSMOS_DATABASE="${COSMOS_DATABASE:-bikebuddy}"

node "$ROOT/functions/scripts/process-deletions.js" "$@"
