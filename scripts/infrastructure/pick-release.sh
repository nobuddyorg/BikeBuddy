#!/usr/bin/env bash
# Description: (CI) Pick the commit Deploy ships: the one CI Gate passed on main, or none
# Every deploy is gated (#563). A bot merge starts no workflow (#539), so the daily run re-runs the
# gate on main when production lags it, waits for the result, and ships main only if it passed.
# Writes `sha=<commit>` to $GITHUB_OUTPUT; an empty sha means there is nothing to deploy.
set -euo pipefail

: "${GITHUB_OUTPUT:?}" "${EVENT:?}" "${REPO:?}"

release() {
  echo "sha=$1" >>"$GITHUB_OUTPUT"
  [[ -n $1 ]] && echo "Deploying $1."
  exit 0
}

# The commit of the last deployment to `production` that succeeded.
deployed_sha() {
  local id
  for id in $(gh api "repos/$REPO/deployments?environment=production&per_page=20" --jq '.[].id'); do
    if [[ $(gh api "repos/$REPO/deployments/$id/statuses?per_page=1" --jq '.[0].state // ""') == success ]]; then
      gh api "repos/$REPO/deployments/$id" --jq .sha
      return
    fi
  done
}

# Dispatches CI Gate on main and waits for that run; fails when it fails.
gate_main() {
  local main=$1 dispatched_at run_id=""
  dispatched_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  gh workflow run gate.yml --repo "$REPO" --ref main
  for _ in $(seq 1 30); do
    run_id=$(gh run list --repo "$REPO" --workflow gate.yml --event workflow_dispatch --branch main \
      --limit 5 --json databaseId,headSha,createdAt \
      --jq "[.[] | select(.headSha == \"$main\" and .createdAt >= \"$dispatched_at\")][0].databaseId // \"\"")
    [[ -n $run_id ]] && break
    sleep 10
  done
  [[ -n $run_id ]] || { echo "CI Gate did not start for $main." >&2; exit 1; }
  gh run watch "$run_id" --repo "$REPO" --exit-status >/dev/null ||
    { echo "CI Gate failed on $main (run $run_id): not deploying." >&2; exit 1; }
}

case "$EVENT" in
  workflow_run)
    release "${WORKFLOW_RUN_SHA:?}"
    ;;
  workflow_dispatch)
    [[ ${GITHUB_REF:-} == refs/heads/main ]] || { echo "Deploy runs from main only, not ${GITHUB_REF:-?}." >&2; exit 1; }
    release "${GITHUB_SHA:?}"
    ;;
  schedule)
    main=$(gh api "repos/$REPO/commits/main" --jq .sha)
    deployed=$(deployed_sha)
    if [[ $main == "$deployed" ]]; then
      echo "Production runs main ($main): nothing to deploy."
      release ""
    fi
    echo "Production runs ${deployed:-nothing yet}, main is $main: running CI Gate on main."
    gate_main "$main"
    release "$main"
    ;;
  *)
    echo "Deploy does not run on $EVENT." >&2
    exit 1
    ;;
esac
