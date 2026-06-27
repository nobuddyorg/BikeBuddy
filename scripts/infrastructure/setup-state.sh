#!/usr/bin/env bash
# Description: Set up the OpenTofu remote state backend (one-time prerequisite)
# One-time prerequisite for the OpenTofu remote backend.
#
# OpenTofu keeps its state in an Azure Storage account, which must exist BEFORE
# `tofu init` (it can't create its own backend, a chicken-and-egg problem). This script
# creates that storage account + container. Run it once per Azure account.
# Idempotent: re-running is safe.
#
# Usage:
#   az login
#   az account set --subscription <SUB_ID>
#   ./buddy.sh infrastructure setup-state <globally-unique-storage-account-name>
#
# Then set `storage_account_name` in main.tf to the name you chose, and apply
# (see infrastructure/README.md).
set -euo pipefail

SA="${1:?usage: ./buddy.sh infrastructure setup-state <globally-unique-storage-account-name>}"
RG="bikebuddy-tfstate-rg"
LOCATION="westeurope"

echo "==> Resource group $RG"
az group create -n "$RG" -l "$LOCATION" -o none

echo "==> Storage account $SA"
az storage account create -g "$RG" -n "$SA" -l "$LOCATION" \
  --sku Standard_LRS --kind StorageV2 \
  --min-tls-version TLS1_2 --allow-blob-public-access false -o none

KEY="$(az storage account keys list -g "$RG" -n "$SA" --query '[0].value' -o tsv)"

echo "==> Container tfstate"
az storage container create -n tfstate --account-name "$SA" --account-key "$KEY" -o none

echo
echo "Backend ready."
echo "  1. Set in main.tf:        storage_account_name = \"$SA\""
echo "  2. Export for local apply: export ARM_ACCESS_KEY=\"\$(az storage account keys list -g $RG -n $SA --query '[0].value' -o tsv)\""
