#!/usr/bin/env bash
# Description: (CI) Narrow index.html's CSP to this deployment's API, storage and Entra hosts
# The repository keeps the development policy (any Azure host, Azurite); the published page allows
# exactly FUNCTIONS_URL, STORAGE_URL and ENTRA_SUBDOMAIN.ciamlogin.com (#560).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
node "$ROOT/functions/scripts/production-csp.js" "${CSP_PAGE:-$ROOT/frontend/src/index.html}"
