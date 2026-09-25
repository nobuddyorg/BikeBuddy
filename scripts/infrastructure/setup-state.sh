#!/usr/bin/env bash
# Description: Set up the OpenTofu remote state backend (one-time prerequisite)
# Idempotent; tofu cannot create its own backend (docs/how-to/infrastructure.md, "State backend").
set -euo pipefail

STORAGE_ACCOUNT="${1:?usage: ./buddy.sh infrastructure setup-state <globally-unique-storage-account-name>}"
RESOURCE_GROUP="bikebuddy-tfstate-rg"
LOCATION="westeurope"

echo "==> Resource group $RESOURCE_GROUP"
az group create -n "$RESOURCE_GROUP" -l "$LOCATION" -o none

echo "==> Storage account $STORAGE_ACCOUNT"
az storage account create -g "$RESOURCE_GROUP" -n "$STORAGE_ACCOUNT" -l "$LOCATION" \
  --sku Standard_LRS --kind StorageV2 \
  --min-tls-version TLS1_2 --allow-blob-public-access false -o none

ACCOUNT_KEY="$(az storage account keys list -g "$RESOURCE_GROUP" -n "$STORAGE_ACCOUNT" --query '[0].value' -o tsv)"

echo "==> Container tfstate"
az storage container create -n tfstate --account-name "$STORAGE_ACCOUNT" --account-key "$ACCOUNT_KEY" -o none

echo
echo "Backend ready."
echo "  1. Set in main.tf:        storage_account_name = \"$STORAGE_ACCOUNT\""
echo "  2. Export for local apply: export ARM_ACCESS_KEY=\"\$(az storage account keys list -g $RESOURCE_GROUP -n $STORAGE_ACCOUNT --query '[0].value' -o tsv)\""
