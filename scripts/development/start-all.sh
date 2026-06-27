#!/usr/bin/env bash
# Description: Start the full local dev stack (Cosmos emulator + API + frontend)
# Start the full local dev stack and open the app in the browser:
#   Cosmos DB emulator (Docker) → Functions API (+ Azurite) → Static Web App (SWA CLI proxy)
# Run `./buddy.sh development setup` first if tools are missing.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FUNCTIONS_DIR="$REPO_ROOT/functions"

# ── Use Node 22 (the Functions runtime doesn't support newer majors) ──────────
NODE22_BIN="$(brew --prefix node@22 2>/dev/null)/bin"
if [[ -d "$NODE22_BIN" ]]; then
  export PATH="$NODE22_BIN:$PATH"
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [[ "$NODE_MAJOR" != "22" && "$NODE_MAJOR" != "20" ]]; then
  echo "ERROR: Azure Functions needs Node 20 or 22 (found $(node --version 2>/dev/null))." >&2
  echo "       Install it with: brew install node@22" >&2
  exit 1
fi

# ── Preflight ─────────────────────────────────────────────────────────────────
for cmd in node npm func swa docker; do
  command -v "$cmd" &>/dev/null || { echo "ERROR: '$cmd' not found. Run './buddy.sh development setup' first." >&2; exit 1; }
done
docker info >/dev/null 2>&1 || { echo "ERROR: Docker daemon not running. Start Docker Desktop." >&2; exit 1; }
[[ -f "$FUNCTIONS_DIR/local.settings.json" ]] || { echo "ERROR: functions/local.settings.json missing. Run './buddy.sh development setup'." >&2; exit 1; }
[[ -f "$REPO_ROOT/frontend/config.js" ]] || { echo "ERROR: frontend/config.js missing. Run './buddy.sh development setup'." >&2; exit 1; }

PIDS=()
cleanup() {
  echo ""
  echo "==> Shutting down (emulator left running; stop it with: docker stop bikebuddy-cosmos)"
  for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null || true; done
  exit 0
}
trap cleanup INT TERM

# ── 1. Cosmos DB emulator ─────────────────────────────────────────────────────
"$REPO_ROOT/scripts/development/start-cosmos.sh"

# ── 2. Create database + containers (idempotent) ──────────────────────────────
echo "==> Initializing Cosmos database + containers..."
(cd "$FUNCTIONS_DIR" && node scripts/init-cosmos.js)

# ── 3. Functions API + Azurite ────────────────────────────────────────────────
echo "==> Installing function dependencies..."
(cd "$FUNCTIONS_DIR" && npm ci --silent)
echo "==> Starting Functions API + Azurite (Node $(node --version))..."
(cd "$FUNCTIONS_DIR" && npm run dev) &
PIDS+=($!)
echo "==> Waiting for API on http://localhost:7071..."
until curl -s http://localhost:7071/api/me -o /dev/null 2>/dev/null; do sleep 2; done

# ── 4. Static Web App (serves frontend, proxies /api → :7071) ─────────────────
echo "==> Starting Static Web App on http://localhost:4280..."
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
