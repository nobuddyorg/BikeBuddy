#!/usr/bin/env bash
# Description: Run the frontend Vitest unit tests (src/lib) with the coverage gate
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/frontend"
npm run test:coverage
