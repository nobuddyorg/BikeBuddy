#!/usr/bin/env bash
# Generate frontend/config.js from environment variables. Used by the deploy
# workflow and runnable locally to point the static frontend at an API.
#
# Inputs (env): FUNCTIONS_URL, ENTRA_SUBDOMAIN, ENTRA_CLIENT_ID, DEV_MODE.
# All values are public (client id + subdomain are exposed in any SPA), so they
# come from repo *variables*, never secrets.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
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
