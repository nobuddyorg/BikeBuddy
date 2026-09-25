#!/usr/bin/env bash
# Description: Run the OWASP ZAP passive scans (frontend + API) against the local stack
# Frontend pass: frontend/src served as GitHub Pages serves it; API pass: the
# Functions host on :7071 (./buddy.sh development start-backend, SKIP_AUTH=true).
# Needs Docker. Reports: zap-reports/<pass>/. CI runs the same scans through the
# zaproxy actions in gate.yml's zap job.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IMAGE="${ZAP_IMAGE:-zaproxy/zap-stable}"
PORT=4175
cd "$ROOT"
mkdir -p zap-reports/frontend zap-reports/api
chmod a+w zap-reports/frontend zap-reports/api

node e2e/lighthouse/serve-pages.mjs "$PORT" signed-out &
SERVER=$!
trap 'kill "$SERVER" 2>/dev/null || true' EXIT
timeout 30 bash -c "until curl -sf -o /dev/null http://127.0.0.1:$PORT/BikeBuddy/; do sleep 1; done"

status=0
echo "==> ZAP baseline: frontend"
docker run --rm --network host -v "$ROOT:/zap/wrk:rw" "$IMAGE" zap-baseline.py \
  -t "http://127.0.0.1:$PORT/BikeBuddy/" -c .zap/rules-frontend.tsv -I \
  -J zap-reports/frontend/report_json.json -r zap-reports/frontend/report_html.html || status=$?

echo "==> ZAP API scan (passive): Functions host"
docker run --rm --network host -v "$ROOT:/zap/wrk:rw" "$IMAGE" zap-api-scan.py \
  -t /zap/wrk/.zap/openapi.yaml -f openapi -S -c .zap/rules-api.tsv -I \
  -J zap-reports/api/report_json.json -r zap-reports/api/report_html.html || status=$?

exit "$status"
