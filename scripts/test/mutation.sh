#!/usr/bin/env bash
# Description: Run the Stryker mutation tests (functions + frontend; pass --force for a full run)
# Incremental by default (reports/stryker-incremental.json); the modules in
# scope are listed in mutation-targets.mjs.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
for package in functions frontend; do
  echo "==> Mutation testing: $package"
  (cd "$ROOT/$package" && npx stryker run "$@" && npm run --silent mutation:summary)
done
