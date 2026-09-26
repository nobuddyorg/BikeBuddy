#!/usr/bin/env bash
# Description: Start the full local dev stack (Cosmos emulator + API + frontend)
set -euo pipefail

die() {
  echo "ERROR: $*" >&2
  exit 1
}

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FUNCTIONS_DIRECTORY="$REPO_ROOT/functions"

# The Functions runtime supports Node 22/24 only.
NODE_24_BIN_DIRECTORY="$(brew --prefix node@24 2>/dev/null)/bin"
[[ -d "$NODE_24_BIN_DIRECTORY" ]] && export PATH="$NODE_24_BIN_DIRECTORY:$PATH"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
[[ "$NODE_MAJOR" == "24" || "$NODE_MAJOR" == "22" ]] ||
  die "Azure Functions needs Node 22 or 24 (found $(node --version 2>/dev/null)). Install: brew install node@24"

for required_command in node npm func swa docker; do
  command -v "$required_command" &>/dev/null || die "'$required_command' not found. Run './buddy.sh development setup' first."
done
docker info >/dev/null 2>&1 || die "Docker daemon not running. Start Docker Desktop."
[[ -f "$FUNCTIONS_DIRECTORY/local.settings.json" ]] || die "functions/local.settings.json missing. Run './buddy.sh development setup'."
[[ -f "$REPO_ROOT/frontend/src/config.js" ]] || die "frontend/src/config.js missing. Run './buddy.sh development setup'."

background_process_ids=()
stop_background_processes() {
  for process_id in "${background_process_ids[@]}"; do kill "$process_id" 2>/dev/null || true; done
}
cleanup() {
  echo ""
  echo "==> Shutting down (emulators left running; stop with: ./buddy.sh development stop)"
  stop_background_processes
  exit 0
}
trap cleanup INT TERM

wait_for() {
  local url="$1" name="$2"
  for _ in $(seq 1 60); do
    curl -s "$url" -o /dev/null 2>/dev/null && return 0
    sleep 2
  done
  stop_background_processes
  die "$name did not answer on $url within 2 min."
}

"$REPO_ROOT/scripts/development/start-cosmos.sh"
"$REPO_ROOT/scripts/development/start-azurite.sh"

echo "==> Installing function dependencies..."
(cd "$FUNCTIONS_DIRECTORY" && npm ci --silent)

echo "==> Initializing Cosmos database + containers..."
(cd "$FUNCTIONS_DIRECTORY" && node scripts/init-cosmos.js)

echo "==> Starting Functions API (Node $(node --version))..."
(cd "$FUNCTIONS_DIRECTORY" && npm run dev) &
background_process_ids+=($!)
echo "==> Waiting for API on http://localhost:7071..."
wait_for http://localhost:7071/api/v1/me "The Functions API"

echo "==> Starting frontend on http://localhost:4280 (SWA CLI proxies /api to :7071)..."
swa start "$REPO_ROOT/frontend/src" --api-devserver-url http://localhost:7071 &
background_process_ids+=($!)
wait_for http://localhost:4280 "The frontend"

open http://localhost:4280 2>/dev/null || true
echo ""
echo "BikeBuddy is running:"
echo "  App            : http://localhost:4280"
echo "  API            : http://localhost:7071/api/v1"
echo "  Cosmos explorer: http://localhost:1234"
echo "  Press Ctrl-C to stop (the emulator keeps running)."
echo ""
wait
