#!/usr/bin/env bash
# Description: Start the full local dev stack (Cosmos emulator + API + frontend)
set -euo pipefail

die() {
  echo "ERROR: $*" >&2
  exit 1
}

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FUNCTIONS_DIR="$REPO_ROOT/functions"

# The Functions runtime supports Node 20/22 only.
NODE22_BIN="$(brew --prefix node@22 2>/dev/null)/bin"
[[ -d "$NODE22_BIN" ]] && export PATH="$NODE22_BIN:$PATH"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
[[ "$NODE_MAJOR" == "22" || "$NODE_MAJOR" == "20" ]] ||
  die "Azure Functions needs Node 20 or 22 (found $(node --version 2>/dev/null)). Install: brew install node@22"

for cmd in node npm func swa docker; do
  command -v "$cmd" &>/dev/null || die "'$cmd' not found. Run './buddy.sh development setup' first."
done
docker info >/dev/null 2>&1 || die "Docker daemon not running. Start Docker Desktop."
[[ -f "$FUNCTIONS_DIR/local.settings.json" ]] || die "functions/local.settings.json missing. Run './buddy.sh development setup'."
[[ -f "$REPO_ROOT/frontend/config.js" ]] || die "frontend/config.js missing. Run './buddy.sh development setup'."

PIDS=()
cleanup() {
  echo ""
  echo "==> Shutting down (emulator left running; stop it with: docker stop bikebuddy-cosmos)"
  for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null || true; done
  exit 0
}
trap cleanup INT TERM

"$REPO_ROOT/scripts/development/start-cosmos.sh"

echo "==> Initializing Cosmos database + containers..."
(cd "$FUNCTIONS_DIR" && node scripts/init-cosmos.js)

echo "==> Installing function dependencies..."
(cd "$FUNCTIONS_DIR" && npm ci --silent)
echo "==> Starting Functions API + Azurite (Node $(node --version))..."
(cd "$FUNCTIONS_DIR" && npm run dev) &
PIDS+=($!)
echo "==> Waiting for API on http://localhost:7071..."
until curl -s http://localhost:7071/api/me -o /dev/null 2>/dev/null; do sleep 2; done

echo "==> Starting frontend on http://localhost:4280 (SWA CLI proxies /api to :7071)..."
swa start "$REPO_ROOT/frontend" --api-devserver-url http://localhost:7071 &
PIDS+=($!)
until curl -s http://localhost:4280 -o /dev/null 2>/dev/null; do sleep 2; done

open http://localhost:4280 2>/dev/null || true
echo ""
echo "BikeBuddy is running:"
echo "  App            : http://localhost:4280"
echo "  API            : http://localhost:7071/api"
echo "  Cosmos explorer: http://localhost:1234"
echo "  Press Ctrl-C to stop (the emulator keeps running)."
echo ""
wait
