#!/usr/bin/env bash
# Description: Run the Functions Vitest unit tests with the coverage gate
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/functions"
npm run test:coverage
