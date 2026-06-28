#!/usr/bin/env bash
# Description: Generate the frontend config.js from environment variables
# All values are public (exposed in any SPA), so they come from repo variables,
# never secrets. Inputs: FUNCTIONS_URL, ENTRA_SUBDOMAIN, ENTRA_CLIENT_ID, DEV_MODE.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${CONFIG_OUT:-$ROOT/frontend/config.js}"

API_SCOPE=""
if [ -n "${ENTRA_CLIENT_ID:-}" ]; then
  API_SCOPE="api://${ENTRA_CLIENT_ID}/access_as_user"
fi

cat >"$OUT" <<JSEOF
'use strict';
const BIKEBUDDY_CONFIG = {
  apiBaseUrl: '${FUNCTIONS_URL:-}',
  entraSubdomain: '${ENTRA_SUBDOMAIN:-}',
  entraClientId: '${ENTRA_CLIENT_ID:-}',
  entraApiScope: '${API_SCOPE}',
  devMode: ${DEV_MODE:-false},
};
JSEOF

echo "==> Wrote $OUT"
