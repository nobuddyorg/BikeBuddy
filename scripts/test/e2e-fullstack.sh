#!/usr/bin/env bash
# Description: Run the Playwright full-stack e2e tests against the real backend
# Needs the local stack: ./buddy.sh development start-all.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/e2e"
npm run test:fullstack
