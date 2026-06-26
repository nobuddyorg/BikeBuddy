#!/usr/bin/env bash
# Publish the Functions app to Azure Flex Consumption with a remote build
# (compiles sharp for Linux). Flex deploys code from its package container via
# the publish API, so this is the correct path (not azure/functions-action).
# Used by the deploy workflow and runnable locally.
#
# Requires az login (locally) or the CI service-principal session, and the app
# name as $1 or $FUNCTIONS_APP_NAME. --javascript: CI has no local.settings.json
# so the runtime can't be auto-detected.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="${1:-${FUNCTIONS_APP_NAME:-}}"

if [ -z "$APP_NAME" ]; then
  echo "ERROR: Functions app name required (pass as arg or set FUNCTIONS_APP_NAME)." >&2
  exit 1
fi

cd "$ROOT/functions"
func azure functionapp publish "$APP_NAME" --build remote --javascript
