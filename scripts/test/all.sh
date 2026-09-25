#!/usr/bin/env bash
# Description: Run the fast unit suites (Functions + frontend); no services needed
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
"$HERE/unit.sh"
"$HERE/frontend.sh"
