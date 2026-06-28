#!/usr/bin/env bash
# Description: Provision/update Azure resources (tofu init + apply)
# Empty Entra vars = no-auth mode. Auth: az login + ARM_ACCESS_KEY locally; the
# ARM_* env vars from secrets in CI.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/infrastructure"

tofu init
tofu apply -auto-approve \
  -var="entra_tenant_subdomain=${ENTRA_SUBDOMAIN:-}" \
  -var="entra_tenant_id=${ENTRA_TENANT_ID:-}" \
  -var="entra_client_id=${ENTRA_CLIENT_ID:-}"
