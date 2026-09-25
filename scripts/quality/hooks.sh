#!/usr/bin/env bash
# Description: Run every pre-commit hook (lint, format-check, shellcheck, SAST, tofu)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
prek run --all-files "$@"
