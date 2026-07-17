#!/usr/bin/env bash
# Description: Run the frontend Vitest unit tests (src/lib)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/frontend"
npm test
