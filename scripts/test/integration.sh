#!/usr/bin/env bash
# Description: Run the Functions HTTP integration tests (needs Cosmos + Azurite up)
# Start the dependencies first: ./buddy.sh development start-cosmos and start-azurite.
# The vitest globalSetup starts/stops the func host itself.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/functions"
npm run test:integration
