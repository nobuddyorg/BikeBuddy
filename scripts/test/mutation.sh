#!/usr/bin/env bash
# Description: Run the Stryker mutation tests for the Functions (85% break threshold)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/functions"
npm run mutate
