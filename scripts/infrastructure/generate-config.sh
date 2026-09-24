#!/usr/bin/env bash
# Description: Generate the frontend config.js and inject CSP hosts into index.html
# All values are public (exposed in any SPA), so they come from repo variables,
# never secrets.
# Inputs:
#   FUNCTIONS_URL     — Azure Functions app URL (e.g. https://bikebuddy.azurewebsites.net)
#   STORAGE_HOST      — Azure Blob Storage host (e.g. bikebuddy.blob.core.windows.net)
#   ENTRA_SUBDOMAIN   — Microsoft Entra External ID tenant subdomain
#   ENTRA_CLIENT_ID   — Application (client) ID of the SPA app registration
#   DEV_MODE          — true/false (default: false)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${CONFIG_OUT:-$ROOT/frontend/src/config.js}"

# Defaults for local dev
API_HOST="${FUNCTIONS_URL:-http://127.0.0.1:7071}"
STORAGE_HOST="${STORAGE_HOST:-127.0.0.1:10000}"

API_SCOPE=""
if [ -n "${ENTRA_CLIENT_ID:-}" ]; then
  API_SCOPE="api://${ENTRA_CLIENT_ID}/access_as_user"
fi

cat >"$OUT" <<JSEOF
'use strict';
window.BIKEBUDDY_CONFIG = {
  apiBaseUrl: '${FUNCTIONS_URL:-}',
  entraSubdomain: '${ENTRA_SUBDOMAIN:-}',
  entraClientId: '${ENTRA_CLIENT_ID:-}',
  entraApiScope: '${API_SCOPE}',
  devMode: ${DEV_MODE:-false},
};
JSEOF

# Inject CSP hosts into index.html
INDEX_HTML="$ROOT/frontend/src/index.html"
if [ -f "$INDEX_HTML" ]; then
  # Replace CSP placeholders with actual hosts
  sed -i "s|https://{{API_HOST}}|${API_HOST}|g" "$INDEX_HTML"
  sed -i "s|https://{{STORAGE_HOST}}|https://${STORAGE_HOST}|g" "$INDEX_HTML"
  echo "==> Updated CSP in $INDEX_HTML"
fi

echo "==> Wrote $OUT"
