#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

ask() {
  local prompt="$1"
  while true; do
    read -r -p "$prompt [y/n]: " answer
    case "$answer" in
      [Yy]|[Yy][Ee][Ss]) return 0 ;;
      [Nn]|[Nn][Oo]) return 1 ;;
      *) echo "Please answer y or n." ;;
    esac
  done
}

echo "BikeBuddy setup starting…"

steps=(
  "Install Homebrew?|/bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
  "Install Node.js 22?|brew install node@22"
  "Install Azure Functions Core Tools v4?|brew tap azure/functions && brew trust azure/functions && brew install azure-functions-core-tools@4"
  "Install Azurite (local storage emulator)?|npm install -g azurite"
  "Install prek (pre-commit runner)?|brew install prek"
  "Install npm dependencies (functions/)?|cd \"$REPO_ROOT/functions\" && npm ci"
  "Install pre-commit hooks?|cd \"$REPO_ROOT\" && prek install"
  "Copy functions/local.settings.json from example?|cp \"$REPO_ROOT/functions/local.settings.json.example\" \"$REPO_ROOT/functions/local.settings.json\""
  "Copy frontend/config.js from example?|cp \"$REPO_ROOT/frontend/config.js.example\" \"$REPO_ROOT/frontend/config.js\""
)

for step in "${steps[@]}"; do
  IFS='|' read -r question command <<< "$step"
  echo
  if ask "$question"; then
    bash -c "$command"
  fi
done

echo
echo "Setup finished. Fill in your values in:"
echo "  functions/local.settings.json  (COSMOS_CONNECTION_STRING, B2C_* — or leave B2C blank and keep SKIP_AUTH=true for local dev)"
echo "  frontend/config.js             (b2cTenant, b2cClientId — only needed for real auth)"
echo
echo "Then run: ./dev.sh"
