#!/usr/bin/env bash
# Run OpenTofu init + apply for the infrastructure, passing Microsoft Entra
# External ID variables from the environment (empty = no-auth mode). Used by the
# deploy workflow and runnable locally.
#
# Auth: locally use `az login` + export ARM_ACCESS_KEY; CI sets the ARM_* and
# ARM_ACCESS_KEY env vars from secrets.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/infrastructure"

tofu init
tofu apply -auto-approve \
  -var="entra_tenant_subdomain=${ENTRA_SUBDOMAIN:-}" \
  -var="entra_tenant_id=${ENTRA_TENANT_ID:-}" \
  -var="entra_client_id=${ENTRA_CLIENT_ID:-}"
