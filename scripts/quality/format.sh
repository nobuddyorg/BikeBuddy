#!/usr/bin/env bash
# Description: Auto-format the code with Prettier (functions, frontend, e2e)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

cd "$ROOT/functions"
npm run format
# frontend/ has no Prettier config of its own — reuse functions'.
npx prettier --write --config .prettierrc.json \
  '../frontend/*.js' '../frontend/src/*.{js,css,html}' \
  '../frontend/src/lib/**/*.js' '../frontend/test/**/*.js'

cd "$ROOT/e2e"
npm run format
