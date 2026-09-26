#!/usr/bin/env bash
# Description: Run a k6 load test (smoke|browse|upload|edit|export) against the local stack
# Options go to load/run.mjs (docs/how-to/load-testing.md).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
node load/run.mjs "$@"
