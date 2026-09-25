#!/usr/bin/env bash
# Description: Run the Functions HTTP integration tests (needs Cosmos + Azurite up)
# Needs ./buddy.sh development start-cosmos and start-azurite; the suite starts the Functions host itself.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/functions"
npm run test:integration
