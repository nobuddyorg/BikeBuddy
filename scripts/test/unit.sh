#!/usr/bin/env bash
# Description: Run the Functions Vitest unit tests
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/functions"
npm test
