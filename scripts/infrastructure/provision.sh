#!/usr/bin/env bash
# Description: Provision/update Azure resources (tofu init + apply)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/infrastructure"

VARIABLES=(
  -var="entra_tenant_subdomain=${ENTRA_SUBDOMAIN:-}"
  -var="entra_tenant_id=${ENTRA_TENANT_ID:-}"
  -var="entra_client_id=${ENTRA_CLIENT_ID:-}"
)

# tour-images predates its resource (the app created it): adopt it once. A fresh subscription has no
# storage account in state yet, and apply creates the container.
adopt_tour_images_container() {
  local managed account_id
  managed="$(tofu state list)"
  if grep -qx 'azurerm_storage_container.tour_images' <<<"$managed"; then return; fi
  account_id="$(tofu show -json | jq -r '.values.root_module.resources[]? | select(.address == "azurerm_storage_account.main") | .values.id')"
  if [ -z "$account_id" ]; then return; fi
  echo "==> Importing the existing tour-images container"
  tofu import -input=false "${VARIABLES[@]}" azurerm_storage_container.tour_images \
    "$account_id/blobServices/default/containers/tour-images"
}

tofu init
adopt_tour_images_container
tofu apply -auto-approve "${VARIABLES[@]}"
