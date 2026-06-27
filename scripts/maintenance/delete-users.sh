#!/usr/bin/env bash
# Description: Drain the GDPR account-deletion queue (delete users via Graph)
# Resolve the Cosmos connection string (via az) and run the out-of-band Entra
# deletion job. Requires: az login (or CI service principal) for the Cosmos
# account, and GRAPH_TENANT_ID/GRAPH_CLIENT_ID/GRAPH_CLIENT_SECRET in the env.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RG="${RESOURCE_GROUP:-bikebuddy-rg}"

NAME="$(az cosmosdb list -g "$RG" --query '[0].name' -o tsv)"
ENDPOINT="$(az cosmosdb show -n "$NAME" -g "$RG" --query documentEndpoint -o tsv)"
KEY="$(az cosmosdb keys list -n "$NAME" -g "$RG" --query primaryMasterKey -o tsv)"

export COSMOS_CONNECTION_STRING="AccountEndpoint=${ENDPOINT};AccountKey=${KEY};"
export COSMOS_DATABASE="${COSMOS_DATABASE:-bikebuddy}"

node "$ROOT/functions/scripts/process-deletions.js"
