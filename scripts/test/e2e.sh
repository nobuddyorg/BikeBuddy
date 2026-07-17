#!/usr/bin/env bash
# Description: Run the Playwright static UI e2e tests (serves frontend/src, no backend)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/e2e"
npm test
