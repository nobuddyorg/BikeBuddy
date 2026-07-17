#!/usr/bin/env bash
# Description: Run every pre-commit hook (lint, format-check, shellcheck, SAST, tofu)
# Mirrors the CI `prek` gate. Pass extra args straight through to prek.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
prek run --all-files "$@"
