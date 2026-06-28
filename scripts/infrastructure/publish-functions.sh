#!/usr/bin/env bash
# Description: Publish the Functions app code to Azure Flex Consumption (remote build)
# Flex deploys code via the publish API, not azure/functions-action. --build
# remote compiles sharp for Linux; --javascript because CI has no
# local.settings.json to auto-detect the runtime. App name: $1 or FUNCTIONS_APP_NAME.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP_NAME="${1:-${FUNCTIONS_APP_NAME:-}}"

if [ -z "$APP_NAME" ]; then
  echo "ERROR: Functions app name required (pass as arg or set FUNCTIONS_APP_NAME)." >&2
  exit 1
fi

cd "$ROOT/functions"
func azure functionapp publish "$APP_NAME" --build remote --javascript
