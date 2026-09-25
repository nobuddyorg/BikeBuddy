#!/usr/bin/env bash
# Description: Run the Definition of done (CLAUDE.md) in order; --stack adds the suites that need the local stack
# Stops at the first red gate. --stack expects `development start-cosmos` and `start-backend` (SKIP_AUTH=true) for the e2e, Lighthouse and ZAP steps.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

# CI measures e2e coverage (floors in the Playwright configs); so does this.
export E2E_COVERAGE=1

stack=false
for arg in "$@"; do
  case $arg in
    --stack) stack=true ;;
    *) echo "Unknown option: $arg (only --stack)" >&2; exit 2 ;;
  esac
done

lighthouse() {
  (cd "$ROOT/e2e" && npm run lighthouse -- signed-out && npm run lighthouse -- signed-in)
}

step() {
  printf '\n==> %s\n' "$1"
  shift
  "$@"
}

step "Hooks: hygiene, secrets, lint, format, types, architecture, dead code, SAST, IaC" "$HERE/hooks.sh"
step "Functions unit tests + coverage" "$ROOT/scripts/test/unit.sh"
step "Frontend unit tests + coverage" "$ROOT/scripts/test/frontend.sh"
step "Static e2e + axe + e2e coverage" "$ROOT/scripts/test/e2e.sh"

if [ "$stack" = true ]; then
  step "Integration (Functions host, Cosmos emulator, Azurite)" "$ROOT/scripts/test/integration.sh"
  step "Full-stack e2e" "$ROOT/scripts/test/e2e-fullstack.sh"
  step "Lighthouse (signed out, signed in)" lighthouse
  step "OWASP ZAP (frontend, API)" "$HERE/zap.sh"
else
  printf '\nSkipped, need the local stack (rerun with --stack): integration, full-stack e2e, Lighthouse, ZAP.\n'
fi

printf '\nNot run here: ./buddy.sh test mutation, required if you changed a file in mutation-targets.mjs.\n'
