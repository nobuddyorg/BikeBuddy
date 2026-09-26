#!/usr/bin/env bash
# Description: (CI) Check a deploy answers: the API's health, its refusal without a token, the site
# Fails the Deploy run when production does not answer as it should after a release (#563).
set -euo pipefail

: "${FUNCTIONS_URL:?}" "${PAGES_URL:?}"
ATTEMPTS="${SMOKE_ATTEMPTS:-30}"
BODY="$(mktemp)"
trap 'rm -f "$BODY"' EXIT

# Waits out a cold start or a swap still in progress, then insists on the expected status.
expect_status() {
  local url=$1 expected=$2 status=""
  for _ in $(seq 1 "$ATTEMPTS"); do
    status=$(curl -sS -o "$BODY" -w '%{http_code}' "$url" || true)
    [[ $status == "$expected" ]] && { echo "ok  $expected $url"; return; }
    sleep 10
  done
  echo "FAIL $url answered ${status:-nothing}, expected $expected" >&2
  exit 1
}

expect_status "$FUNCTIONS_URL/api/v1/health" 200
expect_status "$FUNCTIONS_URL/api/v1/me" 401
grep -q '"errors.unauthorized"' "$BODY" ||
  { echo "FAIL $FUNCTIONS_URL/api/v1/me refused without errors.unauthorized" >&2; exit 1; }
expect_status "${PAGES_URL%/}/" 200
# The published page allows this deployment's API, and no Azure host at large (#560).
grep -qF "$FUNCTIONS_URL" "$BODY" ||
  { echo "FAIL the published CSP does not name $FUNCTIONS_URL" >&2; exit 1; }
if grep -qE '\*\.(azurewebsites\.net|blob\.core\.windows\.net)|127\.0\.0\.1' "$BODY"; then
  echo "FAIL the published CSP still allows a development host" >&2
  exit 1
fi
expect_status "${PAGES_URL%/}/privacy.html" 200
