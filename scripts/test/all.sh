#!/usr/bin/env bash
# Description: Run the fast unit suites (Functions + frontend); no services needed
# Leaves out integration/e2e/e2e-fullstack/mutation, which need a running stack.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
"$HERE/unit.sh"
"$HERE/frontend.sh"
