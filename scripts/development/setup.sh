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
  "Install Node.js 22?|brew install node@22"
  "Install Azure Functions Core Tools v4?|brew tap azure/functions && brew trust azure/functions && brew install azure-functions-core-tools@4"
  "Install Azurite (local blob/queue/table emulator)?|npm install -g azurite"
  "Install SWA CLI (local dev proxy)?|npm install -g @azure/static-web-apps-cli"
  "Install OpenTofu (infrastructure)?|brew install opentofu"
  "Install prek (pre-commit runner)?|brew install prek"
  "Install npm dependencies (functions/)?|cd \"$REPO_ROOT/functions\" && npm ci"
  "Install pre-commit hooks?|cd \"$REPO_ROOT\" && prek install"
  "Write functions/local.settings.json with local-dev defaults?|cp \"$REPO_ROOT/functions/local.settings.json.example\" \"$REPO_ROOT/functions/local.settings.json\" && echo 'wrote local.settings.json'"
  "Write frontend/src/config.js with local-dev defaults?|cp \"$REPO_ROOT/frontend/src/config.js.example\" \"$REPO_ROOT/frontend/src/config.js\" && echo 'wrote config.js'"
  "Pull the Cosmos DB emulator image (Docker must be running)?|docker pull mcr.microsoft.com/cosmosdb/linux/azure-cosmos-emulator:vnext-preview"
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
