#!/usr/bin/env bash
# Description: Generate the frontend config.js from environment variables
# Every value ends up public in the SPA: pass repository variables, never secrets.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUTPUT_FILE="${CONFIG_OUT:-$ROOT/frontend/src/config.js}"

DEV_MODE="${DEV_MODE:-false}"
case "$DEV_MODE" in
  true | false) ;;
  *) echo "ERROR: DEV_MODE must be true or false, not '$DEV_MODE'." >&2; exit 1 ;;
esac

API_SCOPE=""
if [ -n "${ENTRA_CLIENT_ID:-}" ]; then
  API_SCOPE="api://${ENTRA_CLIENT_ID}/access_as_user"
fi

cat >"$OUTPUT_FILE" <<JSEOF
'use strict';
window.BIKEBUDDY_CONFIG = {
  apiBaseUrl: '${FUNCTIONS_URL:-}',
  entraSubdomain: '${ENTRA_SUBDOMAIN:-}',
  entraClientId: '${ENTRA_CLIENT_ID:-}',
  entraApiScope: '${API_SCOPE}',
  devMode: ${DEV_MODE},
};
JSEOF

echo "==> Wrote $OUTPUT_FILE"
