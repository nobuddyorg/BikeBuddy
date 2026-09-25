#!/usr/bin/env bash
# Description: One-time install of local prerequisites + config templates
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

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
  "Install Node.js 24?|brew install node@24"
  "Install Azure Functions Core Tools v4?|brew tap azure/functions && brew trust azure/functions && brew install azure-functions-core-tools@4"
  "Install SWA CLI (local dev proxy)?|npm install -g @azure/static-web-apps-cli"
  "Install OpenTofu (infrastructure)?|brew install opentofu"
  "Install prek (pre-commit runner)?|brew install prek"
  "Install npm dependencies (functions/, frontend/, e2e/)?|cd \"$REPO_ROOT/functions\" && npm ci && cd ../frontend && npm ci && cd ../e2e && npm ci"
  "Install Playwright's Chromium (the e2e suites)?|cd \"$REPO_ROOT/e2e\" && npx playwright install chromium"
  "Install pre-commit hooks?|cd \"$REPO_ROOT\" && prek install"
  "Write functions/local.settings.json with local-dev defaults?|cp \"$REPO_ROOT/functions/local.settings.json.example\" \"$REPO_ROOT/functions/local.settings.json\" && echo 'wrote local.settings.json'"
  "Write frontend/src/config.js with local-dev defaults?|cp \"$REPO_ROOT/frontend/src/config.js.example\" \"$REPO_ROOT/frontend/src/config.js\" && echo 'wrote config.js'"
  "Pull the Cosmos DB emulator image (Docker must be running)?|docker pull mcr.microsoft.com/cosmosdb/linux/azure-cosmos-emulator:vnext-preview@sha256:2db1f9e74c506bcf6fc347aa937aea1c00fa756061296a5a9efba530ce86ec02"
)

echo
echo "NOTE: the Cosmos DB emulator runs in Docker. Install Docker Desktop"
echo "      (https://www.docker.com/products/docker-desktop) and start it before \`./buddy.sh development start-all\`."

for step in "${steps[@]}"; do
  IFS='|' read -r question command <<< "$step"
  echo
  if ask "$question"; then
    bash -c "$command"
  fi
done

echo
echo "Setup finished. Fill in your values in:"
echo "  functions/local.settings.json  (COSMOS_CONNECTION_STRING, ENTRA_*, or leave ENTRA blank and keep SKIP_AUTH=true for local dev)"
echo "  frontend/src/config.js             (entraSubdomain, entraClientId, only needed for real auth)"
echo
echo "Then run: ./buddy.sh development start-all"
