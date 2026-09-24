#!/usr/bin/env bash
# Description: Run a k6 load test (smoke|browse|upload|edit|export) against the local stack
# Needs k6 and the local stack (./buddy.sh development start-cosmos, then
# SKIP_AUTH=true ./buddy.sh development start-backend). Options go to load/run.mjs:
# --profile normal|peak|stress, --target local-stack|hosted --confirm-production.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
node load/run.mjs "$@"
