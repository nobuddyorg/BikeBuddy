# Ops review: ops-reviewer

Raw findings from the **ops-reviewer** role of the 2026-09-24 five-lens review of BikeBuddy (`main` at `b0bde68`). It ran two passes: a first pass over the whole repo, then an independent second pass that looked for missed issues (IDs `OPS-Gnn`) and disputed first-pass claims. Vendored code (`frontend/src/vendor/`), lockfiles and generated output were out of scope.

Severity scale (shared by all reviewers): **critical**: exploitable now, severe; **high**: serious and plausible in production; **medium**: real defect, limited blast radius; **low**: hardening or minor; **info**: observation.

The findings below are the reviewer's own claims, as returned. The _Verification_ lines come from the adversarial verifiers: two independent lenses (code truth, impact) for every critical/high finding, and one skeptical batch check for medium/low. The lead's final, deduplicated severities are in [`REVIEW.md`](../REVIEW.md).

## Summary

The CI side is strong. Actions are pinned to SHAs, permissions are least-privilege, the gate is thorough (prek/zizmor/tofu validate, unit tests with a 90% coverage gate, frontend, static and full-stack e2e, integration, mutation), and deploys are serialized. The release and runtime operations around it are the weak point. deploy.yml runs on every push to main without depending on the CI gate, and Dependabot auto-merges every update, majors included. Stateful resources have no prevent\_destroy or locks and are applied with -auto-approve. Cosmos keeps only the default periodic backup, and blob storage is LRS with no soft delete or versioning, so a bad apply, script or bug can cause irrecoverable loss of sensitive GPS/photo data. Production has no telemetry at all: no Application Insights, no alerts, no uptime check and no post-deploy smoke test. The docs (cost-report) wrongly claim App Insights is enabled. Other issues: IaC fails open to SKIP\_AUTH when the Entra CI variables are missing (verified by probe). Auth uses a long-lived subscription-Contributor client secret. Frontend and API deploys are not ordered. The service-worker cache version is bumped by hand and has already been missed (stale JS is served to installed PWAs now). Core Tools is unpinned in deploy (4.14.0 carried the broken private-feed shrinkwrap from 2026-08-24 to 2026-09-22). destroy.yml is itself broken (undeclared package\_path var).

## Strengths noted

- Every third-party GitHub Action is pinned to a full commit SHA with a version comment, uses persist-credentials: false, and top-level permissions are contents: read with per-job elevation only where needed; zizmor runs in the prek gate.
- deploy.yml serialises deploys with concurrency group 'deploy' and cancel-in-progress: false, so two tofu applies never race the state lock or get cancelled mid-apply.
- Comprehensive CI gate: prek (lint, prettier, shellcheck, typos, tofu fmt/validate, OpenGrep), functions unit tests with a local 90% line/branch coverage gate (check-coverage.js), frontend Vitest, static and full-stack Playwright, HTTP integration tests against Cosmos emulator + Azurite, and Stryker mutation tests.
- Dependabot covers github-actions, pre-commit and functions npm with a 7-day cooldown, which blunts fresh-malicious-release supply-chain attacks.
- The privileged Graph 'delete any user' credential is kept out of the public Functions app and used only by the scheduled GitHub job; the deletion queue is written first in DeleteAccount so intent survives partial failure.
- Write ordering in handlers is deliberately chosen so partial failures leave only invisible orphans (UploadTour blob-then-doc with rollback, DeleteTour/DeleteImage doc-then-blob), plus ETag retry in DeleteImage.
- authMiddleware distinguishes client token errors (401) from verification infrastructure failures (thrown -&gt; 5xx), and refuses SKIP\_AUTH when Entra settings are present.
- All shell scripts use set -euo pipefail, quote variables, and emulator start scripts are idempotent with bounded readiness polling; buddy.sh is a clean single entry point.
- Remote state in Azure Blob (blob-lease locking) shared by local and CI; budget alert is codified in IaC (budget.tf) with forecast and actual thresholds.
- Cost-conscious design: Cosmos serverless, heatmapData/images excluded from indexing, bounded maxItemCount per query, 10 MB streamed upload limit, per-instance heatmap cache.

## Findings overview

Reviewer-assigned counts: 0 critical, 3 high, 10 medium, 18 low, 0 info.

| ID      | Reviewer severity | Title                                                                                                                                                                                | Location                                         | Verification                                                                   |
| ------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------ |
| OPS-01  | high              | Production deploy runs on every push to main without depending on the CI gate                                                                                                        | `.github/workflows/deploy.yml:4`                 | code-truth: partially-confirmed → low; impact: partially-confirmed → medium    |
| OPS-02  | high              | Stateful resources have no destroy guards; every push auto-applies and destroy is a one-click, approval-free workflow                                                                | `scripts/infrastructure/provision.sh:11`         | code-truth: partially-confirmed → medium; impact: partially-confirmed → medium |
| OPS-03  | high              | No meaningful backup or restore path: default periodic Cosmos backup, LRS blobs with no soft delete or versioning, no restore runbook                                                | `infrastructure/storage.tf:16`                   | code-truth: partially-confirmed → medium; impact: partially-confirmed → medium |
| OPS-04  | medium            | Production has no telemetry, alerting or uptime monitoring; docs claim Application Insights is enabled                                                                               | `infrastructure/functions.tf:28`                 | confirmed → medium                                                             |
| OPS-05  | medium            | Dependabot auto-merge enables merge for every Dependabot PR, including semver-major and Actions bumps                                                                                | `.github/workflows/dependabot-auto-merge.yml:15` | partially-confirmed → low                                                      |
| OPS-06  | medium            | IaC fails open: a missing ENTRA\_CLIENT\_ID CI variable deploys the production API with SKIP\_AUTH=true                                                                              | `infrastructure/functions.tf:37`                 | confirmed → medium                                                             |
| OPS-07  | medium            | Long-lived subscription-wide service-principal secret used from repo-level secrets in three workflows, including a scheduled job                                                     | `.github/workflows/deploy.yml:19`                | confirmed → medium                                                             |
| OPS-08  | medium            | Frontend deploy does not wait for the Functions deploy; no smoke test or rollback                                                                                                    | `.github/workflows/deploy.yml:88`                | partially-confirmed → low                                                      |
| OPS-09  | medium            | Service worker serves app JS/CSS cache-first with a hand-bumped version, and the bump has already been missed                                                                        | `frontend/src/sw.js:10`                          | partially-confirmed → medium                                                   |
| OPS-10  | medium            | Deploy installs unpinned azure-functions-core-tools@4 while CI pins 4.13.0; the deploy tool is untested and was broken for a month                                                   | `.github/workflows/deploy.yml:79`                | partially-confirmed → low                                                      |
| OPS-11  | medium            | Cost ceiling depends only on an email budget alert; Flex can scale to 40 x 2 GB instances with no rate limiting                                                                      | `infrastructure/functions.tf:26`                 | confirmed → medium                                                             |
| OPS-G01 | medium            | Auto-merged Dependabot commits never deploy or run the main-branch gate: production has been out of sync with main since 2026-09-03                                                  | `.github/workflows/dependabot-auto-merge.yml:18` | confirmed → medium                                                             |
| OPS-G02 | medium            | Blob container clients cache a rejected promise, so one transient storage failure breaks GPX/photo endpoints for the rest of the instance's life                                     | `functions/src/lib/blobStorage.js:34`            | confirmed → medium                                                             |
| OPS-12  | low               | IaC/code drift: tofu manages an unused 'images' container while photos live in the runtime-created, unmanaged 'tour-images'                                                          | `infrastructure/storage.tf:33`                   | confirmed → low                                                                |
| OPS-13  | low               | Provider lock file is gitignored, so CI applies whichever azurerm 4.x is newest                                                                                                      | `.gitignore:73`                                  | confirmed → low                                                                |
| OPS-14  | low               | GDPR deletion job has no failure alerting, timeout, or throttling handling                                                                                                           | `.github/workflows/process-deletions.yml:8`      | partially-confirmed → low                                                      |
| OPS-15  | low               | Outbound calls to Entra/Graph have no timeout                                                                                                                                        | `functions/src/middleware/authMiddleware.js:27`  | partially-confirmed → low                                                      |
| OPS-16  | low               | Codecov upload fails the gate on third-party errors, contradicting the stated intent                                                                                                 | `.github/workflows/gate.yml:116`                 | confirmed → low                                                                |
| OPS-17  | low               | No timeout-minutes on any workflow job                                                                                                                                               | `.github/workflows/deploy.yml:27`                | confirmed → low                                                                |
| OPS-18  | low               | Prod maintenance/backfill scripts have no dry-run, batching, or runbook                                                                                                              | `functions/scripts/backfillTourStats.js:68`      | confirmed → low                                                                |
| OPS-19  | low               | .funcignore is gitignored, so CI publishes tests, scripts and tooling config into the Flex package                                                                                   | `.gitignore:16`                                  | confirmed → low                                                                |
| OPS-20  | low               | Terraform state backend is LRS with no versioning or soft delete, accessed by account key; setup docs point to a missing README                                                      | `scripts/infrastructure/setup-state.sh:16`       | confirmed → low                                                                |
| OPS-21  | low               | OpenGrep hook downloads and executes an unpinned installer from the main branch, locally and in CI                                                                                   | `.pre-commit-config.yaml:161`                    | confirmed → low                                                                |
| OPS-22  | low               | Operator docs drift from the real deployment (cost report, secrets list)                                                                                                             | `docs/cost-report.md:127`                        | partially-confirmed → low                                                      |
| OPS-23  | low               | Dependency update coverage gaps: frontend/e2e npm and vendored MSAL/Leaflet are not tracked; dev-tree advisories                                                                     | `.github/dependabot.yml:18`                      | confirmed → low                                                                |
| OPS-G03 | low               | Destroy workflow cannot run: it passes an undeclared -var, has never been executed, and shares no concurrency group with Deploy                                                      | `.github/workflows/destroy.yml:41`               | confirmed → low                                                                |
| OPS-G04 | low               | Runtime authenticates to Cosmos and Storage with account master keys (no managed identity); one storage key covers both the code package and all user data, with no rotation runbook | `infrastructure/functions.tf:29`                 | confirmed → low                                                                |
| OPS-G05 | low               | Function App does not set https\_only, so the API also answers over plain HTTP                                                                                                       | `infrastructure/functions.tf:10`                 | confirmed → low                                                                |
| OPS-G06 | low               | OIDC metadata refresh fails hard at TTL expiry instead of serving the cached copy, and the JWKS client never follows a jwks\_uri change                                              | `functions/src/middleware/authMiddleware.js:28`  | confirmed → low                                                                |
| OPS-G07 | low               | GDPR deletion pipeline races with re-login: data created before the daily Entra purge is orphaned forever, and the queue entry is never cancelled                                    | `functions/src/DeleteAccount/index.js:42`        | partially-confirmed → low                                                      |
| OPS-G08 | low               | CI gate depends on mutable emulator images (Cosmos `vnext-preview`, untagged Azurite)                                                                                                | `scripts/development/start-cosmos.sh:8`          | partially-confirmed → low                                                      |

## Findings

### OPS-01: Production deploy runs on every push to main without depending on the CI gate

- **Severity (reviewer):** high
- **Category:** ci-cd · **Effort:** S · **Confidence:** high
- **Location:** `.github/workflows/deploy.yml:4`
- **Also:** `.github/workflows/gate.yml:4`, `.github/workflows/deploy.yml:6`, `.github/workflows/deploy.yml:25`

**Evidence:**

```text
on:
  push:
    branches: ["main"]
  workflow_dispatch:
```

**Description.** deploy.yml and gate.yml are separate workflows that both run on push to main. deploy.yml has no workflow\_run dependency on 'CI Gate', no `needs` on test jobs, and no environment with required reviewers on the infrastructure/deploy-functions jobs. The gate therefore protects PR merges only if branch protection requires its checks, and that configuration is not in the repo. A direct push, an admin merge, or a merge made while a check is not marked required deploys to prod in parallel with (not after) the tests on the same commit. workflow\_dispatch has no branch restriction, so a writer can also run tofu apply and publish the Functions app from any unreviewed branch. Only the github-pages environment restricts branches, which produces an API/frontend split.

**Impact.** Code or IaC that fails lint, unit, integration or e2e tests can reach the production API that holds users' GPS tracks and photos, and tofu apply -auto-approve runs against prod state from the same trigger. With auto-merge enabled (OPS-05), a red commit can be deployed with no human involved.

**Recommendation.** Trigger deploy from `workflow_run: workflows: ["CI Gate"] types: [completed]` with `if: github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.head_branch == 'main'`, or merge the gate and deploy into one workflow with deploy jobs `needs:` all gate jobs. Put the infrastructure and deploy-functions jobs in a protected 'production' environment limited to the main branch, and add `if: github.ref == 'refs/heads/main'` for workflow\_dispatch.

**Verification (two adversarial lenses):**

- _code-truth_: **partially-confirmed**, severity → **low**, reachable in production: yes.
- _impact_: **partially-confirmed**, severity → **medium**, reachable in production: yes.

<details><summary>code-truth verifier: reasoning, evidence and reproduction</summary>

The workflow facts are accurate. deploy.yml runs on every push to main and has no dependency on 'CI Gate'. It runs in parallel with the gate's push run. Neither the infrastructure job nor the deploy-functions job is in a protected environment. workflow\_dispatch has no branch restriction, so a dispatch from any branch would run `tofu apply -auto-approve` and publish Functions from that branch. Only the github-pages environment, whose default policy limits deployments to main, would block the frontend, which produces the API/frontend split the reviewer describes.

The attack path and the severity are overstated, though. The maintainer's own commit message (75321d9) says branch protection on main requires CI status checks. The dependabot auto-merge workflow uses `gh pr merge --auto`, which only waits for checks when required checks exist. The history shows every change reaching main through a PR, with no direct pushes. So the normal path, including auto-merged dependabot PRs, gets through only after the PR's required checks pass. The reviewer's claim that "a red commit can be deployed with no human involved" does not hold for auto-merge: auto-merge waits for the required checks to go green.

Three residual paths remain:
(a) An admin bypasses protection or dispatches from an unreviewed branch. The single maintainer is the only writer, so this is deliberate self-action, not an attack path.
(b) Merge skew: several PRs are merged back to back (for example the #532/#533/#534 dependabot batch) without "require branches up to date". The combined main commit is then deployed while its own gate run is still in progress, so the deploy does not wait for it.
(c) Not every gate job is marked required. I cannot verify (b) or (c) from the repo.

These are real hardening gaps (defence in depth, dispatch branch guard, protected production environment) with a narrow realistic path in a single-maintainer repo. Under the rubric that makes them low, not high. It would rise to medium only if branch protection turns out not to require the gate checks, which contradicts the documented configuration.

Evidence:

```text
.github/workflows/deploy.yml:3-6 "on:\n  push:\n    branches: [\"main\"]\n  workflow_dispatch:" — no workflow_run, no branch filter on dispatch.
.github/workflows/deploy.yml:25-27 "infrastructure:\n    name: OpenTofu Apply\n    runs-on: ubuntu-latest" and :54-57 "deploy-functions: ... needs: infrastructure" — no `environment:` and no dependency on gate jobs; only deploy-frontend has "environment:\n      name: github-pages" (:94-95).
.github/workflows/gate.yml:3-6 "on:\n  pull_request:\n  push:\n    branches: [\"main\"]" — separate workflow, runs in parallel with deploy on the same push.
scripts/infrastructure/provision.sh:11 "tofu apply -auto-approve \" — invoked by deploy.yml:41 "run: ./buddy.sh infrastructure provision".
Mitigation (git history, commit 75321d9 "Auto-merge dependabot PRs once required checks pass"): body says "branch protection already requires 0 reviews, so CI status is the only gate." .github/workflows/dependabot-auto-merge.yml:15 "gh pr merge --auto --merge \"$PR_URL\"" relies on required checks.
git log --first-parent on main: 64 commits, 63 are "Merge pull request #..." and the other one (ee83aad "... (#521)") is a squash-merged PR. The history shows no direct pushes.
```

Reproduction:

```text
Not reproducible locally: it would need GitHub Actions and the branch-protection API. I read deploy.yml, gate.yml, dependabot-auto-merge.yml and scripts/infrastructure/provision.sh. I ran `git log --first-parent --format='%h %an | %s'` on main. Result: 64 first-parent commits, all merged PRs (63 merge commits plus one squash merge of #521). I ran `git log --grep='Auto-merge dependabot'` and `git show 75321d9`. The commit body reads "branch protection already requires 0 reviews, so CI status is the only gate."
```

</details>

<details><summary>impact verifier: reasoning, evidence and reproduction</summary>

The fact is correct. deploy.yml does not depend on the CI Gate in any way. On a push to main, tests and deploy run in parallel, and `tofu apply` and the Functions publish are not guarded by a protected environment. workflow\_dispatch has no branch restriction.

The severity is overstated for this deployment:

1. No external attacker path. Triggering either path (a push to main, an admin merge, or workflow\_dispatch from any branch) needs repo write access. The repo belongs to a single-maintainer org. Anyone with write access can already read the repo-level ARM\_\* secrets by pushing a workflow to any branch, because the secrets are not environment-scoped. So the missing branch restriction on workflow\_dispatch gives such a person nothing extra. This is not a security boundary against outsiders.
2. The realistic failure is a maintainer mistake: an admin or direct merge, or a missing required-check setting, lets untested code or IaC reach prod. The outcome is a broken API or an outage, which the maintainer can fix by reverting and redeploying. It does not expose other users' data, and nothing shows irrecoverable data loss as a likely result.
3. There is strong circumstantial evidence that PR gating is in place: a pre-commit hook blocks local commits to main, history is merge-PR based, and the Dependabot flow relies on `gh pr merge --auto`, which only waits for checks when protection rules exist. The protection settings live outside the repo and I could not verify them. That uncertainty is why this remains a finding.
4. The claim that auto-merge (OPS-05) can deploy a red commit with no human involved holds only if protection is absent. With the auto-merge mechanism in use, protection is more likely to be present.

Per the rubric this is not "serious and plausible" in the high sense. It is a real defense-in-depth gap on the deploy path with limited blast radius (the maintainer's own mistakes, recoverable outage) that needs unusual conditions. That is medium. The recommendation still stands and is cheap: gate deploy with workflow\_run or `needs:`, put the infra and functions jobs in a protected environment, and restrict workflow\_dispatch to main.

Evidence:

```text
.github/workflows/deploy.yml:3-6 "on:\n  push:\n    branches: [\"main\"]\n  workflow_dispatch:". There is no workflow_run trigger and no `needs` on a gate job. The infrastructure job (deploy.yml:25-45) has no `environment:`, and neither does deploy-functions (deploy.yml:54-84). Only deploy-frontend has one (deploy.yml:94-95 "environment:\n      name: github-pages").
.github/workflows/gate.yml:3-6 "on:\n  pull_request:\n  push:\n    branches: [\"main\"]". This is a separate workflow, so it runs at the same time as deploy on a push to main.
Mitigations in the repo: .pre-commit-config.yaml:23-24 "- id: no-commit-to-branch\n        args: [\"--branch\", \"main\"]". .github/workflows/dependabot-auto-merge.yml:15 "gh pr merge --auto --merge \"$PR_URL\"", and GitHub auto-merge only waits on checks when the branch has protection rules. Secrets are repo-level, not environment-scoped (deploy.yml:17-22 "ARM_CLIENT_SECRET: ${{ secrets.ARM_CLIENT_SECRET }}"). Git history is PR-based: `git log --first-parent` shows 29 of the last 30 subjects are "Merge pull request #...".
```

Reproduction:

```text
Not executed; this is static analysis only (running workflows or querying GitHub branch protection would need credentials or deployment). I ran: `cat -n .github/workflows/deploy.yml gate.yml dependabot-auto-merge.yml`, `sed -n 15,30p .pre-commit-config.yaml`, and `git log --first-parent --format='%s' | head -30 | grep -c "Merge pull request"`, which printed 29.
```

</details>

Lead re-verified: **confirmed, downgraded to medium**. `deploy.yml` has no `needs` or `workflow_run` link to the gate. Branch protection with required checks (commit 75321d9) covers the normal PR path. The live Actions history shows a bigger, related problem, filed as OPS-G01: auto-merged Dependabot PRs trigger no deploy at all.

### OPS-02: Stateful resources have no destroy guards; every push auto-applies and destroy is a one-click, approval-free workflow

- **Severity (reviewer):** high
- **Category:** iac-safety · **Effort:** S · **Confidence:** high
- **Location:** `scripts/infrastructure/provision.sh:11`
- **Also:** `infrastructure/cosmos.tf:3`, `infrastructure/storage.tf:4`, `infrastructure/main.tf:36`, `.github/workflows/destroy.yml:4`, `.github/workflows/destroy.yml:41`

**Evidence:**

```text
tofu apply -auto-approve \
  -var="entra_tenant_subdomain=${ENTRA_SUBDOMAIN:-}" \
```

**Description.** The Cosmos account, the containers and the storage account (all user GPX/photo data) have no `lifecycle { prevent_destroy = true }` and no azurerm\_management\_lock. Every push to main runs `tofu apply -auto-approve` with no saved or reviewed plan. Any change that forces replacement is applied silently and deletes data: location default, a partition\_key\_paths edit, account name/suffix (random\_string), or kind/offer changes. destroy.yml is `workflow_dispatch` with `tofu destroy -auto-approve`, no confirmation input, no environment/required reviewer, and it reuses the same repo-level ARM secrets. The workflow is also currently broken: it passes `-var="package_path=..."` for a variable that no longer exists in variables.tf, so tofu errors. That hides the danger until someone 'fixes' it.

**Impact.** One mistaken merge or dispatch permanently deletes all users' tours, photos and profiles (see OPS-03 for the lack of backups). This is irrecoverable personal data loss for every user.

**Recommendation.** Add `lifecycle { prevent_destroy = true }` to azurerm\_cosmosdb\_account.main, the three cosmosdb\_sql\_container resources, azurerm\_storage\_account.main and the resource group. Add an `azurerm_management_lock` (CanNotDelete) on the RG or the data resources. In deploy, run `tofu plan -detailed-exitcode -out=tfplan` and fail (or require environment approval) when the plan contains delete/replace actions. Put destroy.yml behind a protected environment with required reviewers and a typed confirmation input. Fix or remove its stale package\_path var.

**Verification (two adversarial lenses):**

- _code-truth_: **partially-confirmed**, severity → **medium**, reachable in production: yes.
- _impact_: **partially-confirmed**, severity → **medium**, reachable in production: yes.

<details><summary>code-truth verifier: reasoning, evidence and reproduction</summary>

The core facts check out:

- No stateful resource has prevent\_destroy.
- There is no management lock.
- Every push to main runs `tofu apply -auto-approve` without a plan anyone reviews. Nothing on PRs shows a plan either.
- destroy.yml is an approval-free workflow\_dispatch with no environment and no confirmation input, using the same repo-level ARM secrets.
- destroy.yml passes -var for an undeclared variable (package\_path). OpenTofu/Terraform treat an undeclared variable given on the command line with -var as a hard error ("Value for undeclared variable"), unlike tfvars files, where it is only a warning. So the destroy workflow currently fails before destroying anything.

The severity is inflated, for three reasons:

1. The destroy path is currently NOT reachable. The stale var makes the workflow error out, so "one-click destroy" is latent, not live. The reviewer admits this.
2. The auto-apply risk needs the single maintainer to merge a replacement-forcing change: editing the location default, a partition key, the random\_string suffix, or the account kind. That is a plausible human error, not an external attack path and not something that happens on its own. Only people with write access to this single-maintainer org can push to main or dispatch workflows.
3. Cosmos DB accounts have periodic backup by default (not configured here, but on by default), which may allow a support-assisted restore after an accidental account deletion. Storage has no soft delete, so blob data (GPX files and photos) would really be lost.

Under the rubric this is a real safety gap: it lacks guard rails against irrecoverable data loss, but it needs unusual conditions (a maintainer mistake) and is not exploitable now. That makes it medium, not high. The recommendations (prevent\_destroy on the Cosmos account, containers, storage account and RG; a CanNotDelete lock; a plan-and-fail-on-delete gate; a protected environment for destroy.yml; fixing or removing the stale var) are sound and cheap.

Minor detail corrections:

- The resource group is at main.tf:42, not :36. Line 36 is random\_string.suffix, which is also a replacement trigger, so that citation is still relevant.
- The "deletions" container is a third container alongside users and tours. The storage containers (gpx\_files, images) also lack guards.

Evidence:

```text
scripts/infrastructure/provision.sh:10-11: "tofu init" / "tofu apply -auto-approve \" (no plan file, no review of the plan).
.github/workflows/deploy.yml:3-5: "on:\n  push:\n    branches: [\"main\"]"; :40-41 "run: ./buddy.sh infrastructure provision". The infrastructure job has no `environment:`. The only environments are github-pages (deploy.yml:94) and ci (gate.yml:49,202).
grep for "prevent_destroy|management_lock|lifecycle" across infrastructure/ returned nothing.
infrastructure/cosmos.tf:3 "resource \"azurerm_cosmosdb_account\" \"main\" {" with no lifecycle block; containers at cosmos.tf:35/50/63 with "partition_key_paths = [\"/id\"]" / "[\"/userId\"]" (changing these forces replacement).
infrastructure/storage.tf:4 "resource \"azurerm_storage_account\" \"main\" {" has no lifecycle block, no delete_retention_policy and no versioning (grep for delete_retention|versioning|backup found nothing).
infrastructure/main.tf:42-44 "resource \"azurerm_resource_group\" \"main\" { ... location = var.location" and variables.tf:4 "default = \"northeurope\"". Changing location replaces the RG and everything under it.
.github/workflows/destroy.yml:3-4 "on:\n  workflow_dispatch:" has no inputs and no environment. :41 "run: tofu destroy -auto-approve -var=\"package_path=$GITHUB_WORKSPACE/func.zip\"".
infrastructure/variables.tf declares only location, entra_tenant_subdomain, entra_tenant_id, entra_client_id, budget_amount, budget_contact_email, budget_start_date. package_path appears nowhere except destroy.yml:29,41.
gate.yml runs tofu only through prek hooks (fmt/validate). No `tofu plan` runs on PRs, so nobody sees a replacement before merge.
```

Reproduction:

```text
Not reproduced by running anything. `which tofu terraform` found no binary, and the task forbids running OpenTofu anyway. I checked by static reading instead:
- grep -rn "prevent_destroy\|management_lock\|lifecycle" infrastructure/ → no matches
- grep -rn "package_path" over *.tf/*.yml/*.sh/*.md → only .github/workflows/destroy.yml:29 and :41, not declared in infrastructure/variables.tf
- grep -rn "environment:" .github/workflows → only deploy.yml:94 (github-pages) and gate.yml:49,202 (ci). Neither the infrastructure job nor destroy.yml is behind an environment.
- grep -rn "delete_retention\|versioning\|backup" infrastructure/ → no matches.
```

</details>

<details><summary>impact verifier: reasoning, evidence and reproduction</summary>

All the facts in the finding hold. There are no prevent\_destroy or lock resources. Deploy auto-applies with no reviewable plan, and nothing in CI shows a plan on PRs (only fmt/validate). destroy.yml is dispatch-only with no confirmation and no protected environment. It also passes a stale package\_path var. The severity and the "irrecoverable" wording do not survive calibration:

1. Nobody outside can trigger this. There is no attacker path. Both apply-on-push and workflow\_dispatch need write access to a repo that one maintainer owns. Data loss only happens if that maintainer merges an infra edit that forces replacement (partition key, location, account name/suffix, kind), or dispatches destroy after fixing it. That is maintainer error, not something "plausible under realistic load" or reachable by anyone else.
2. The destroy path does not work today. OpenTofu rejects a -var for an undeclared variable, so destroy.yml fails before it touches state. The reviewer admits this but still counts it toward the headline severity.
3. "Irrecoverable" overstates it. By default Azure Cosmos DB accounts get periodic backups (4-hour interval, 8-hour retention). Microsoft support can restore a deleted account inside that window. A deleted Azure Storage account can usually be recovered for up to 14 days if the name hasn't been reused. Recovery is time-limited and manual, and that part really is fragile (OPS-03), but it is not certain total loss.
4. Infra churn is low. Dependabot does not track Terraform, so nothing auto-merges infra changes. The unpinned provider (no lock file) is a small extra risk that a provider upgrade forces a replacement.
   What remains is a real process/IaC-safety gap on the store for every user's personal data. Impact is severe if it fires, but it needs an insider mistake with no guardrail, and one of the two paths is broken. Under the shared rubric that is medium: a real defect that needs unusual conditions. It is not high, which calls for a serious weakness with a realistic attack path or plausible data loss under normal operation, and not critical, since nothing is exploitable now. The recommendation stands and costs little: prevent\_destroy on cosmos account/containers/storage/RG, a CanNotDelete management lock, plan-then-apply with a check for deletes/replaces, destroy behind a protected environment with a typed confirm, and removing the stale var.

Evidence:

```text
- scripts/infrastructure/provision.sh:11 `tofu apply -auto-approve \` (no plan file, no review). deploy.yml:3-5 `on: push: branches: ["main"]` and deploy.yml:40-41 `run: ./buddy.sh infrastructure provision`, so every push to main applies unreviewed.
- `grep -rn "prevent_destroy\|management_lock\|lifecycle" infrastructure` finds nothing. The data resources have no guards: cosmos.tf:3 `resource "azurerm_cosmosdb_account" "main" {`, cosmos.tf:63-68 tours container `partition_key_paths = ["/userId"]` (changing this forces replacement), storage.tf:4 `resource "azurerm_storage_account" "main" {`, main.tf:42-44 RG `location = var.location`, variables.tf:4 `default = "northeurope"`.
- There is no `.terraform.lock.hcl` in infrastructure/ (`ls -a` shows only .tf files) and main.tf:7 has `version = "~> 4.0"`, so each apply can pick up a newer provider.
- The PR gate only runs validate, not plan: .pre-commit-config.yaml:146 `tofu init -backend=false -input=false >/dev/null && tofu validate`.
- destroy.yml:3-4 `on:\n  workflow_dispatch:` has no inputs and no `environment:`. destroy.yml:41 `run: tofu destroy -auto-approve -var="package_path=$GITHUB_WORKSPACE/func.zip"`. `grep package_path infrastructure` finds no declaration (variables.tf declares only location, entra_*, budget_*), so tofu rejects the undeclared -var and the workflow cannot destroy anything today.
- No Terraform/OpenTofu ecosystem in .github/dependabot.yml, so dependabot-auto-merge.yml cannot auto-merge infra changes.
```

Reproduction:

```text
Not attempted beyond static checks. Running tofu is out of scope, and init would need cloud credentials and the backend. I ran grep for prevent_destroy/lifecycle/management_lock in infrastructure/*.tf (no matches), grep for package_path in infrastructure/ (declared nowhere, referenced only in destroy.yml:29,41), and `ls -a infrastructure` (no .terraform.lock.hcl). I also read deploy.yml, destroy.yml, gate.yml, dependabot.yml, dependabot-auto-merge.yml and .pre-commit-config.yaml:134-146 to confirm that CI runs only validate and never plan.
```

</details>

Lead re-verified: **confirmed, downgraded to medium**. There is no `prevent_destroy` or lock anywhere in `infrastructure/`, and apply runs with `-auto-approve` on every push. `destroy.yml` currently fails because it passes an undeclared `package_path` variable, so the one-click destroy is dormant rather than live.

### OPS-03: No meaningful backup or restore path: default periodic Cosmos backup, LRS blobs with no soft delete or versioning, no restore runbook

- **Severity (reviewer):** high
- **Category:** backup-restore · **Effort:** S · **Confidence:** high
- **Location:** `infrastructure/storage.tf:16`
- **Also:** `infrastructure/cosmos.tf:3`, `infrastructure/storage.tf:9`, `functions/src/DeleteAccount/index.js:15`

**Evidence:**

```text
  blob_properties {
    cors_rule {
      allowed_origins    = ["https://nobuddy.org", "https://nobuddyorg.github.io", "http://localhost:4280"]
```

**Description.** blob\_properties sets only CORS. There is no delete\_retention\_policy (blob soft delete), no container\_delete\_retention\_policy, no versioning\_enabled and no change feed, on an LRS account. The Cosmos account has no `backup` block, so it gets the provider default Periodic backup (every 4 h, 8 h retention, restore only via a support ticket). Continuous point-in-time restore is not enabled, even though the 7-day continuous tier costs little. Deletion paths are hard deletes with no recovery: DeleteTour, DeleteImage, DeleteAccount's deleteBlobsByPrefix, the maintenance scripts run with the primary key, and a replace or destroy from OPS-02. No doc describes how to restore.

**Impact.** An app bug, a faulty migration or backfill script, an operator error or a compromised key can permanently destroy users' GPX files and photos. Cosmos recovery depends on noticing within about 8 hours and getting help from Azure support.

**Recommendation.** Add `backup { type = "Continuous"; tier = "Continuous7Days" }` to the Cosmos account. Add `delete_retention_policy { days = 14 }`, `container_delete_retention_policy { days = 14 }` and `versioning_enabled = true` with a lifecycle rule that deletes old versions after N days. Write a short restore runbook in docs/how-to/infrastructure.md covering Cosmos PITR restore to a new account and blob undelete.

**Verification (two adversarial lenses):**

- _code-truth_: **partially-confirmed**, severity → **medium**, reachable in production: yes.
- _impact_: **partially-confirmed**, severity → **medium**, reachable in production: yes.

<details><summary>code-truth verifier: reasoning, evidence and reproduction</summary>

The facts in the finding are correct. The storage account is LRS and blob\_properties sets only CORS, so there is no blob soft delete, no container soft delete and no versioning. The Cosmos account has no backup block, so it gets Azure's default Periodic backup: about every 4 hours, 8-hour retention, restore only through a support ticket. It does not use continuous point-in-time restore. The repo has no restore documentation. Nothing elsewhere compensates: no az CLI scripts turn on soft delete, no azapi resources, no lifecycle guards.

The severity is overstated for this rubric, though. This is a missing safety net, not a defect that loses data by itself. Loss needs a separate trigger, such as an app bug, a faulty script, an operator mistake or a leaked key. The deletion paths the reviewer cites are intended, authorized user actions. DeleteTour, DeleteImage and DeleteAccount delete the owner's own data by design, and GDPR erasure is expected to be permanent. The backfill scripts only patch derived fields (stats, thumbnails) and do not delete. Cosmos is not completely without backup: the Periodic default exists, even though the window is short and restore is support-assisted. The OPS-02 replace/destroy scenario belongs to a different root cause.

Under the shared rubric, "needing unusual conditions" and a hobby-scale deployment point to medium. It is a real resilience gap on sensitive, irreplaceable user data (GPX files and photos) that is cheap to close. The recommendation is sound: add Continuous7Days PITR on Cosmos, blob and container soft delete plus versioning, and a runbook. One caveat: the soft-delete and version retention windows keep "deleted" personal data for N more days. That should be written into the privacy/GDPR docs so it matches the promise of immediate erasure.

Evidence:

```text
infrastructure/storage.tf:8-9 `account_tier = "Standard"` / `account_replication_type = "LRS"`. infrastructure/storage.tf:16-24: `blob_properties {` contains only a `cors_rule { ... }` block. There is no delete_retention_policy, container_delete_retention_policy, versioning_enabled or change_feed_enabled. infrastructure/cosmos.tf:3-27: `resource "azurerm_cosmosdb_account" "main"` has consistency_policy, geo_location and capabilities `EnableServerless` but no `backup {}` block, so Azure's default Periodic backup applies. No resource has a lifecycle/prevent_destroy guard (grep over infrastructure/ for prevent_destroy|lifecycle found nothing). A repo-wide grep for "backup|soft delete|versioning|point in time|continuous", excluding vendor, node_modules and lockfiles, matched only `.gitignore:75: infrastructure/terraform.tfstate.backup` and an unrelated comment. The only "restore" hit in docs is docs/how-to/user-guide.md:33 ("Show All Tours** restores every route"), so there is no restore runbook. Hard-delete paths: functions/src/DeleteAccount/index.js:15-21 `async function deleteBlobsByPrefix(container, prefix) { ... await Promise.all(names.map((name) => container.deleteBlob(name)));`. Maintenance scripts write with full connection strings, e.g. functions/scripts/backfillTourStats.js:17 `const connectionString = process.env.COSMOS_CONNECTION_STRING;` and :55 `await container.item(tour.id, tour.userId).patch(operations);`.
```

Reproduction:

```text
Not reproducible at runtime, because this is an infrastructure configuration gap and running OpenTofu or Azure is out of scope. I verified it statically. I read infrastructure/storage.tf, infrastructure/cosmos.tf and infrastructure/main.tf (azurerm "~> 4.0", `features {}`) in full. I ran `grep -rn -i "soft.delete|delete-retention|versioning|backup|point.in.time|continuous"` across the repo, excluding node_modules, vendor, coverage and package-lock.json. The only matches were .gitignore:75 (tfstate.backup) and an unrelated comment in GetMapData, so no backup or soft-delete configuration exists anywhere. I also grepped docs for restore guidance and found none beyond the unrelated user-guide line.
```

</details>

<details><summary>impact verifier: reasoning, evidence and reproduction</summary>

The facts are confirmed. The storage account has no blob soft delete, container soft delete or versioning. The Cosmos account uses the default periodic backup with an 8 h window that only Azure support can restore. There are no resource locks, no prevent\_destroy and no restore runbook.

I am downgrading from high to medium for four reasons.
(1) Nothing is losing data today. Every deletion path the finding lists is a user-intended, authenticated delete of that user's own data. DeleteAccount is a GDPR erasure path, where hard delete is the correct behaviour and must not be undone. These are not defects.
(2) Actual loss needs a separate trigger. That could be an app bug, an operator mistake with a maintenance script, a leaked key, or a replace-forcing tofu change. The backfill scripts (backfillTourStats.js, backfillImageThumbnails.js) do not call delete. process-deletions.js only deletes queue items in the deletions container. The replace/destroy path is OPS-02's root cause and should be counted there, not again here.
(3) Part of the proposed fix would not help in the scariest case. Blob soft delete and versioning do nothing if the whole storage account is deleted or replaced, because they live inside the account. That case needs a management lock or prevent\_destroy. Cosmos continuous backup does help, since a deleted account can be restored within the retention window.
(4) The deployment is a hobby app with a small user base and one maintainer. A loss would be serious for the affected users' ride history, but the probability is moderate, not "likely now".

Under the rubric this is a real resilience gap on an important path that needs an unusual failure to trigger: medium. The recommendation is sound and cheap, and should be kept. Continuous7Days is free for serverless accounts, and blob soft delete adds only storage cost for retained blobs. Add a CanNotDelete lock or prevent\_destroy on the storage and Cosmos accounts, because soft delete does not cover account-level deletion. Soft delete retention also briefly delays true erasure after DeleteAccount, so the privacy/GDPR docs should mention it.

Evidence:

```text
infrastructure/storage.tf:9 `account_replication_type        = "LRS"`; infrastructure/storage.tf:16-24 `blob_properties {` contains only a `cors_rule { ... }`, with no delete_retention_policy, container_delete_retention_policy or versioning_enabled. infrastructure/cosmos.tf:3-27 `resource "azurerm_cosmosdb_account" "main"` has no `backup` block, so it gets the platform default (Periodic, 4 h interval, 8 h retention). `grep -i "lifecycle|prevent_destroy|lock|backup" infrastructure/*.tf` returned nothing, and no doc mentions backup, restore or recovery; the only "restores" hit is in docs/how-to/user-guide.md:33 and refers to the map UI. .github/workflows/deploy.yml:3-5 `on: push: branches: ["main"]` leads to deploy.yml:40-41 `./buddy.sh infrastructure provision`, an automatic apply with no plan gate. .github/workflows/destroy.yml:3-4 `on: workflow_dispatch:` means destroy is manual only. The user-driven deletes are intentional: functions/src/DeleteTour/index.js:26 `await getToursContainer().item(tourId, userId).delete();`, :29 `.deleteIfExists()`, and functions/src/DeleteAccount/index.js:15-21 `deleteBlobsByPrefix` (GDPR erasure).
```

Reproduction:

```text
Not attempted beyond static inspection, because the backup configuration can only be observed in Azure, which is out of scope. I ran read-only greps over infrastructure/*.tf, the workflow files, docs and functions/scripts. There were no matches for backup, lifecycle, prevent_destroy or lock in the tf files. In docs, the only "restore" wording is the map UI line in user-guide.md:33. The backfill scripts have no delete calls.
```

</details>

Lead re-verified: **confirmed, downgraded to medium**. There is no Cosmos `backup` block (so the default periodic backup with 8 h retention applies) and no blob soft-delete, versioning or container retention. It is a missing safety net, not an active loss path.

### OPS-04: Production has no telemetry, alerting or uptime monitoring; docs claim Application Insights is enabled

- **Severity (reviewer):** medium
- **Category:** observability · **Effort:** M · **Confidence:** high
- **Location:** `infrastructure/functions.tf:28`
- **Also:** `functions/host.json:4`, `docs/cost-report.md:99`, `functions/src/Health/index.js:8`

**Evidence:**

```text
  app_settings = {
    COSMOS_CONNECTION_STRING = "AccountEndpoint=${azurerm_cosmosdb_account.main.endpoint};AccountKey=${azurerm_cosmosdb_account.main.primary_key};"
```

**Description.** There is no azurerm\_application\_insights, no Log Analytics workspace, no diagnostic settings, no metric alerts or action groups, and no availability test. app\_settings has no APPLICATIONINSIGHTS\_CONNECTION\_STRING. host.json's applicationInsights sampling block therefore configures telemetry that does not exist. The whole API contains four console.warn/error calls and no request/correlation logging via context.log. Unhandled exceptions become 500s that are recorded nowhere durable. The Health endpoint is liveness-only and nothing probes it. docs/cost-report.md says 'The Functions host has Application Insights enabled with request sampling on', so the operator believes monitoring exists.

**Impact.** A full outage (bad deploy, Entra metadata failure giving 5xx on every request, Cosmos key rotated, storage throttling), elevated errors or a cost spike cannot be detected or diagnosed after the fact. Users see failures and the maintainer only learns from reports.

**Recommendation.** Add a workspace-based azurerm\_application\_insights (with a daily cap) plus azurerm\_log\_analytics\_workspace, wire APPLICATIONINSIGHTS\_CONNECTION\_STRING into app\_settings, and add an action group with alerts on Http5xx/failed requests and on no successful /api/health (standard availability test). Log via the invocation context (context.error with invocationId) in a small handler wrapper. Correct cost-report.md.

**Verification.** confirmed, severity → medium. infrastructure/\*.tf has no application\_insights, Log Analytics, diagnostic or alert resources, and functions.tf:28-38 app\_settings has no APPLICATIONINSIGHTS\_CONNECTION\_STRING. functions/host.json:4-8 configures sampling for telemetry that does not exist, and the API's only logging is 4 console.warn/error calls (authMiddleware.js:88,112,115; parseMultipart.js:63). docs/cost-report.md:99 wrongly says App Insights is enabled, and host.json actually excludes Request from sampling.

### OPS-05: Dependabot auto-merge enables merge for every Dependabot PR, including semver-major and Actions bumps

- **Severity (reviewer):** medium
- **Category:** supply-chain · **Effort:** S · **Confidence:** high
- **Location:** `.github/workflows/dependabot-auto-merge.yml:15`
- **Also:** `.github/workflows/dependabot-auto-merge.yml:11`, `.github/dependabot.yml:21`

**Evidence:**

```text
    if: github.event.pull_request.user.login == 'dependabot[bot]'
    ...
        run: gh pr merge --auto --merge "$PR_URL"
```

**Description.** Every Dependabot PR gets auto-merge regardless of update type: npm majors (only minor/patch are grouped, majors arrive as individual PRs), GitHub Actions majors, and pre-commit hook revs. dependabot/fetch-metadata is not used to limit this to patch/minor. The only safety net is branch-protection required checks, which are not codified. Because of OPS-01, each auto-merge is also an unattended prod deploy. The guard checks the PR author (`pull_request.user.login`), not `github.actor`, so a human commit pushed onto a Dependabot branch is auto-merged too.

**Impact.** A breaking major (for example @azure/functions, sharp, or a workflow action) or a compromised upstream release can reach production with no human review. The 7-day cooldown is the only buffer.

**Recommendation.** Use dependabot/fetch-metadata and enable auto-merge only for `version-update:semver-patch`/`semver-minor` (and never for github-actions). Check `github.actor == 'dependabot[bot]'`. Document or codify (for example via a ruleset export) that the gate jobs are required status checks on main.

**Verification.** partially-confirmed, severity → low. dependabot-auto-merge.yml:11-15 does enable auto-merge for every Dependabot PR with no update-type filter. Two claims are wrong: the 'unattended prod deploy' premise is refuted by OPS-G01 (bot merges never trigger deploy.yml), and `github.event.pull_request.user.login` is GitHub's own recommended guard, while `github.actor` is the check vulnerable to Dependabot-confusion attacks. Required gate checks (which merges visibly wait for) and a 7-day cooldown (dependabot.yml:25-26) limit the risk to hardening.

### OPS-06: IaC fails open: a missing ENTRA\_CLIENT\_ID CI variable deploys the production API with SKIP\_AUTH=true

- **Severity (reviewer):** medium
- **Category:** config-safety · **Effort:** S · **Confidence:** high
- **Location:** `infrastructure/functions.tf:37`
- **Also:** `scripts/infrastructure/provision.sh:12`, `functions/src/middleware/authMiddleware.js:54`, `docs/how-to/infrastructure.md:65`

**Evidence:**

```text
    SKIP_AUTH              = var.entra_client_id == "" ? "true" : "false"
```

**Description.** The auth mode is derived from whether a CI repo variable is non-empty. provision.sh passes `${ENTRA_CLIENT_ID:-}` and friends, defaulting to empty, and neither the workflow nor tofu validates that production has Entra configured. authMiddleware only refuses the bypass when ENTRA\_CLIENT\_ID or ENTRA\_TENANT\_ID is set. If both variables are missing (renamed or deleted variable, repo transfer, moved to an environment scope), the prod API serves every anonymous caller as one shared user. Probe (scratchpad/ops/skipauth.js), with the settings tf would produce: `anonymous request resolves to: {"userId":"local-dev-user",...}`. The docs present this as a feature ('leave unset to run in no-auth mode').

**Impact.** A single CI-variable misconfiguration silently turns the public API into an unauthenticated shared account: anyone could read, upload and delete that account's data, and new users' data would be pooled. Nothing alerts on it (OPS-04).

**Recommendation.** Make production auth mandatory in IaC: add `validation` blocks requiring non-empty entra\_\* vars (or a separate `allow_no_auth` bool defaulting to false), hard-code SKIP\_AUTH="false" in the prod stack, and have deploy.yml fail fast when the ENTRA\_\* vars are empty.

**Verification.** confirmed, severity → medium. functions.tf:37 sets `SKIP_AUTH = var.entra_client_id == "" ? "true" : "false"`, provision.sh:12-14 defaults all entra vars to empty, and the frontend also falls back to dev auth when entraClientId is empty (frontend/src/ui/auth.js:39-40). authMiddleware.js:54 only fails closed when ENTRA\_CLIENT\_ID or ENTRA\_TENANT\_ID is set, so both repo variables must be missing, which is an unusual condition and justifies medium.

### OPS-07: Long-lived subscription-wide service-principal secret used from repo-level secrets in three workflows, including a scheduled job

- **Severity (reviewer):** medium
- **Category:** identity · **Effort:** M · **Confidence:** high
- **Location:** `.github/workflows/deploy.yml:19`
- **Also:** `.github/workflows/process-deletions.yml:28`, `.github/workflows/destroy.yml:11`, `docs/how-to/infrastructure.md:47`, `scripts/maintenance/delete-users.sh:12`, `infrastructure/functions.tf:29`

**Evidence:**

```text
  ARM_CLIENT_SECRET: ${{ secrets.ARM_CLIENT_SECRET }}
```

**Description.** CI authenticates with a client secret for an SP that docs/how-to/infrastructure.md creates as `--role Contributor --scopes /subscriptions/<SUB_ID>`. It is a repo-level secret (no environment scoping), exported workflow-wide in deploy.yml and destroy.yml, and passed to azure/login in process-deletions.yml. The deletion job only needs to read one Cosmos key, which delete-users.sh fetches via `az cosmosdb keys list`, yet it holds full subscription Contributor. The tfstate backend is reached with a storage account key (TF\_BACKEND\_ACCESS\_KEY). No GitHub OIDC federation is used, and there is no documented rotation procedure for the SP secret, Cosmos keys or storage keys. Cosmos and storage primary keys are also embedded in app settings instead of managed identity.

**Impact.** Leaking one secret (for example via a compromised action or workflow change by any writer) gives persistent control of the whole Azure subscription and all user data until someone rotates it manually. Rotation is undocumented and error-prone.

**Recommendation.** Switch azure/login and the azurerm provider to OIDC (`id-token: write`, federated credential restricted to `repo:nobuddyorg/BikeBuddy:environment:production`). Scope the deploy SP to the bikebuddy-rg and tfstate RG. Give the deletion job its own identity with only Cosmos data-plane rights on the deletions container, scoped to its own environment. Use `use_azuread_auth = true` for the backend. Document key rotation.

**Verification.** confirmed, severity → medium. deploy.yml:18-22 and destroy.yml:10-14 export ARM\_CLIENT\_SECRET workflow-wide, process-deletions.yml:28-34 uses it for azure/login, and docs/how-to/infrastructure.md:47-48 creates the SP as subscription-wide Contributor. No job declares an environment, so these are repo-level secrets. Exposure is wider than stated: the 2026-09-03 deploy log shows an unpinned `npm install -g azure-functions-core-tools@4` running after azure/login with ARM\_\* in env, and process-deletions.yml:36 runs `npm ci` after login. The master-keys-in-app-settings point duplicates OPS-G04.

### OPS-08: Frontend deploy does not wait for the Functions deploy; no smoke test or rollback

- **Severity (reviewer):** medium
- **Category:** deployability · **Effort:** S · **Confidence:** high
- **Location:** `.github/workflows/deploy.yml:88`
- **Also:** `.github/workflows/deploy.yml:54`, `functions/src/Health/index.js:8`

**Evidence:**

```text
  deploy-frontend:
    name: Deploy Frontend (GitHub Pages)
    needs: infrastructure
```

**Description.** deploy-functions and deploy-frontend both depend only on `infrastructure` and run in parallel. When the Functions publish fails (for example the Core Tools install break in OPS-10, a remote-build/sharp failure, or Flex publish errors), the new frontend still goes live against the old API. No step calls /api/health or any endpoint after publish, so a deployed-but-crashing host (bad require, missing app setting) still counts as success. There is no documented rollback: Functions publish overwrites the package blob and Pages has no pinned previous artifact.

**Impact.** API/frontend version skew and silently broken production after a 'green' deploy. The maintainer finds out only from users (see OPS-04).

**Recommendation.** Make deploy-frontend `needs: [infrastructure, deploy-functions]`. After publish, poll `${functions_url}/api/health` (and ideally an unauthenticated-401 check on /api/me) with retries and fail the job on error. Document a rollback: re-run deploy on the previous commit via workflow\_dispatch pinned to a SHA, or keep the previous package blob.

**Verification.** partially-confirmed, severity → low. deploy.yml:88 `needs: infrastructure` is accurate: frontend and functions deploy in parallel, and there is no explicit smoke test or rollback. However, the Core Tools publish checks health itself: the run 33783579394 log shows 'Checking the app health... Host status: Running' before 'The deployment was successful!'. A failed publish also fails the workflow run, and GitHub notifies the pusher by default, so 'finds out only from users' is overstated.

### OPS-09: Service worker serves app JS/CSS cache-first with a hand-bumped version, and the bump has already been missed

- **Severity (reviewer):** medium
- **Category:** release-management · **Effort:** S · **Confidence:** high
- **Location:** `frontend/src/sw.js:10`
- **Also:** `frontend/src/sw.js:122`, `frontend/test/sw.test.js:33`

**Evidence:**

```text
const CACHE_NAME = 'bikebuddy-shell-v9';
...
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
```

**Description.** All same-origin non-navigation assets (app.js, ui/\*.js, lib/\*.js, style.css, config.js, locales) are served cache-first. The only invalidation is a manual CACHE\_NAME edit, and no CI check enforces it. Git history shows the last bump was in b27e779 (2026-08-24 10:17), while later commits aff8ef1, 42a19ee (style.css, ui/modal.js, ui/routes.js, ui/sidebar.js, ui/tour-detail.js) and 07bfdad (ui/sidebar.js) changed precached files without bumping it. Because sw.js itself did not change, installed clients never reinstall. They get a fresh network-first index.html combined with stale cached modules and CSS. config.js is cached the same way, so an API URL change would not reach installed PWAs either.

**Impact.** Installed/returning users are running outdated or mixed frontend code right now. Fixes deployed to Pages do not reach them, and API-contract changes can break them with no way to detect it server-side.

**Recommendation.** Derive CACHE\_NAME at deploy time (for example have generate-config.sh or a deploy step substitute the commit SHA or a content hash into sw.js). Alternatively switch static assets to stale-while-revalidate/network-first, and add a CI check that fails when precached files change without a CACHE\_NAME change.

**Verification.** partially-confirmed, severity → medium. sw.js:10 and sw.js:122 serve app assets cache-first, invalidated only by a manual CACHE\_NAME bump, and 42a19ee and 07bfdad did change style.css and ui/\*.js after the v9 bump (b27e779). aff8ef1 changed only index.html, which is network-first (sw.js:111-118). Deploy timestamps (#510 08:33Z, #514 09:32Z, #516 09:52Z on 2026-08-24) mean only clients that installed v9 in that roughly 80-minute window are stale now. The real risk is recurrence: every returning client holds v9, so the next missed bump hits all of them.

### OPS-10: Deploy installs unpinned azure-functions-core-tools@4 while CI pins 4.13.0; the deploy tool is untested and was broken for a month

- **Severity (reviewer):** medium
- **Category:** ci-cd · **Effort:** S · **Confidence:** high
- **Location:** `.github/workflows/deploy.yml:79`
- **Also:** `.github/workflows/gate.yml:258`, `.github/workflows/gate.yml:321`, `.github/zizmor.yml:4`

**Evidence:**

```text
        run: npm install -g azure-functions-core-tools@4 --unsafe-perm true
```

**Description.** gate.yml pins Core Tools 4.13.0 and explains that 4.14.0 ships an npm-shrinkwrap resolving from Microsoft's private Azure DevOps feed (401/403 outside Microsoft). deploy.yml, the job that publishes to production, installs the floating `@4`. Probe: npm pack of 4.13.0/4.14.0/4.15.1 shows pkgs.dev.azure.com refs in the shrinkwrap only for 4.14.0, which was `latest` from 2026-08-24 to 2026-09-22. Every deploy in that window would have failed at install. Combined with OPS-08, that means infra applied and the frontend shipped without the new API. Today `@4` resolves to 4.15.1, released 2026-09-23, which no CI job exercises. zizmor's adhoc-packages rule is suppressed for deploy.yml.

**Impact.** Non-reproducible production deploys that can break (or change behaviour) when Microsoft publishes a release, independent of any repo change.

**Recommendation.** Pin the same exact Core Tools version in deploy.yml and gate.yml (one shared env var or a composite action), and let Dependabot or a scheduled job propose bumps so the version is tested in the gate before deploy uses it.

**Verification.** partially-confirmed, severity → low. deploy.yml:79 does install floating `azure-functions-core-tools@4`, while gate.yml:258 and :321 pin 4.13.0, so the reproducibility point stands. The 'broken for a month / every deploy would have failed' claim is refuted: the 2026-09-03 Deploy run 33783579394 (inside the claimed window) installed azure-functions-core-tools@4.14.0 ('added 30 packages in 16s') and published successfully.

### OPS-11: Cost ceiling depends only on an email budget alert; Flex can scale to 40 x 2 GB instances with no rate limiting

- **Severity (reviewer):** medium
- **Category:** cost-control · **Effort:** M · **Confidence:** medium
- **Location:** `infrastructure/functions.tf:26`
- **Also:** `infrastructure/budget.tf:15`, `infrastructure/variables.tf:38`

**Evidence:**

```text
  instance_memory_in_mb  = 2048
  maximum_instance_count = 40
```

**Description.** Sign-up is self-service (Entra External ID) and the API has no per-user rate limiting or quota: unlimited tours, 20 photos per tour, 10 MB uploads processed by sharp. Flex can scale to 40 instances x 2 GB = 80 GB-s per second. At Flex on-demand pricing (about $0.000026/GB-s) sustained saturation costs roughly $180/day, against a €5/month target. Cosmos serverless and blob storage have no caps either. budget.tf only emails one address at 80% forecast and 100% actual, with no action group and no automated response. Cost Management data also lags by hours.

**Impact.** A single abusive or buggy client (for example a retry loop in the SPA, or a scripted uploader) can run up a bill orders of magnitude over target before anyone reads the email.

**Recommendation.** Lower maximum\_instance\_count (for example 5-10) and consider instance\_memory\_in\_mb 512/1024 if sharp fits. Add per-user throttling (for example daily upload counts stored in the user doc). Add an action group to the budget with a higher 'stop' threshold (for example an automation or Logic App that sets maximum\_instance\_count to 1 or stops the app). Alert on Function execution-count and Cosmos RU metrics once OPS-04 exists.

**Verification.** confirmed, severity → medium. functions.tf:25-26 sets `instance_memory_in_mb = 2048` and `maximum_instance_count = 40`, and budget.tf:15-30 only emails at Forecasted 80% and Actual 100%, with no action group. The API has no rate limiting beyond per-request caps (parseMultipart.js:6 10 MB; UploadImage/index.js:16 MAX\_TOUR\_IMAGES=20). The cost estimate is plausible, but it takes abusive load to reach it, so medium fits.

### OPS-G01: Auto-merged Dependabot commits never deploy or run the main-branch gate: production has been out of sync with main since 2026-09-03

- **Severity (reviewer):** medium
- **Category:** ci-cd · **Effort:** S · **Confidence:** high
- **Location:** `.github/workflows/dependabot-auto-merge.yml:18`
- **Also:** `.github/workflows/deploy.yml:4`, `.github/workflows/gate.yml:5`

**Evidence:**

```text
run: gh pr merge --auto --merge "$PR_URL"
        env:
          PR_URL: ${{ github.event.pull_request.html_url }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Description.** Auto-merge is turned on with the repository GITHUB\_TOKEN, so GitHub performs the merge as github-actions\[bot\]. Pushes made with GITHUB\_TOKEN do not trigger new workflow runs, so neither deploy.yml (`on: push: branches: ["main"]`) nor gate.yml's push-to-main run fires for these merges. Evidence: `git log --first-parent` shows 11 merges by github-actions\[bot\] from 2026-09-06 to 2026-09-20 (#522-#534, including azure/login 3.1.0, zod/fast-xml-parser minor-and-patch groups and a frontend security bump). The Actions API shows the newest Deploy run (33783579394) and the newest CI Gate push run are both for ee83aad on 2026-09-03, with no run for any later commit. The deploy job's azure/login ran at SHA f5d393ae, not the a641126d now pinned in deploy.yml. PR #519 said the intent was to 'Auto-merge dependabot PRs once required checks pass', meaning ship them. Nothing in the pipeline shows that main and production have drifted apart.

**Impact.** Dependency security fixes the maintainer believes are live are not deployed. Production currently runs code about three weeks and 11 merges behind main. The next human push will deploy that whole batch at once, including action SHAs (azure/login) that have never run in the deploy workflow, and that code never ran through a push-to-main gate. This also changes how OPS-05 plays out: an auto-merged major reaches production later, bundled with an unrelated human change, which makes failures harder to attribute.

**Recommendation.** Enable auto-merge with a GitHub App installation token (actions/create-github-app-token) or a fine-grained PAT so the merge push triggers workflows. Alternatively, add a scheduled or workflow\_dispatch deploy that compares the deployed SHA (for example an app setting or a /health version field) with main HEAD and deploys when they differ. Add an alert when they drift apart.

**Verification.** confirmed, severity → medium. git log shows 11 first-parent merges by github-actions\[bot\] after ee83aad (2026-09-06 to 09-20), and the Actions API shows the latest Deploy (33783579394) and CI Gate push run are both at ee83aad (2026-09-03). The drift matters: an `npm audit --omit=dev` of ee83aad's lockfile flags sharp &lt;0.35.4 (high, libheif GHSAs), which main fixes but production still runs. Reachability is limited because UploadImage/index.js:64 accepts only JPEG/PNG magic bytes.

### OPS-G02: Blob container clients cache a rejected promise, so one transient storage failure breaks GPX/photo endpoints for the rest of the instance's life

- **Severity (reviewer):** medium
- **Category:** reliability · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/lib/blobStorage.js:34`
- **Also:** `functions/vitest.config.js:19`, `codecov.yml:3`

**Evidence:**

```text
function containerOnce(name) {
  const c = getClient().getContainerClient(name);
  return c.createIfNotExists().then(() => c);
}
...
  gpxContainer: () => (gpxContainerPromise ??= containerOnce('gpx-files')),
  imagesContainer: () => (imagesContainerPromise ??= containerOnce('tour-images')),
```

**Description.** `??=` stores the promise from the first createIfNotExists call. If that call rejects, the rejected promise is non-null and stays memoised, so every later call on that warm instance returns the same rejection and never retries. Causes include storage throttling or 503s that outlast the SDK's built-in retries, a DNS or network blip during cold start, or a 403 while account keys are being rotated. UploadTour, UploadImage, GetTour, GetMapData (when photos are pinned), DeleteTour, DeleteImage and DeleteAccount all go through these getters. The file is excluded from unit coverage (functions/vitest.config.js:19-20, codecov.yml:3-4), so the 99.85% figure does not cover it. Reproduced in scratchpad/ops2/probe-blob.js: with the first createIfNotExists rejecting once, calls 1-4 all fail with 'ServerBusy (transient 503)' and createIfNotExists runs only once.

**Impact.** A short storage incident becomes a lasting partial outage: uploads, tour detail, GPX download, photo pins and deletes return 500 on every affected Flex instance until it is recycled. With no telemetry (OPS-04), nobody would see it. Account deletion (GDPR) also fails on those instances.

**Recommendation.** Clear the memo on failure, e.g. `gpxContainerPromise ??= containerOnce('gpx-files').catch(e => { gpxContainerPromise = undefined; throw e; })`. Better, drop the createIfNotExists call from the request path: have IaC manage the containers (see OPS-12) and use plain getContainerClient. Add a unit test for the rejection path and stop excluding blobStorage.js from coverage.

**Verification.** confirmed, severity → medium. blobStorage.js:34-35 memoises with `??=` the promise from containerOnce (:25-28), so a rejection sticks for the life of the instance. I reproduced it (scratchpad/verify-ops/probe-blob.js): calls 1-3 all failed with 'ServerBusy (transient 503)' and createIfNotExists was invoked only once. The file is excluded from coverage at vitest.config.js:20 and codecov.yml:4.

### OPS-12: IaC/code drift: tofu manages an unused 'images' container while photos live in the runtime-created, unmanaged 'tour-images'

- **Severity (reviewer):** low
- **Category:** iac-drift · **Effort:** S · **Confidence:** high
- **Location:** `infrastructure/storage.tf:33`
- **Also:** `functions/src/lib/blobStorage.js:35`, `docs/reference/architecture.md:10`, `infrastructure/storage.tf:39`

**Evidence:**

```text
resource "azurerm_storage_container" "images" {
  name                  = "images"
```

**Description.** blobStorage.js writes photos to `containerOnce('tour-images')`, which the app itself creates via createIfNotExists. The tofu-managed `images` container is never used. docs/reference/architecture.md lists 'gpx-files, images, deployments'. The deployments container comment still says 'runs via WEBSITE\_RUN\_FROM\_PACKAGE', which is not how Flex works (storage\_container\_endpoint is). Any container-scoped policy added to tofu (immutability, lifecycle filter, RBAC) would target the wrong container, and the API needs container-create rights in production just to self-provision.

**Impact.** Misleading operator documentation and a real risk that future data-protection or lifecycle work misses the photo container. It also leaves an empty managed resource behind.

**Recommendation.** Rename the tofu resource to `tour-images` (or import the existing container into state), drop the runtime createIfNotExists for prod, and fix architecture.md and the deployments comment.

**Verification.** confirmed, severity → low. storage.tf:33-37 manages an `images` container, but blobStorage.js:35 uses `containerOnce('tour-images')`, created at runtime via createIfNotExists (blobStorage.js:27). docs/reference/architecture.md:10 lists 'gpx-files, images, deployments', and storage.tf:39 still says WEBSITE\_RUN\_FROM\_PACKAGE, contradicting functions.tf:17.

### OPS-13: Provider lock file is gitignored, so CI applies whichever azurerm 4.x is newest

- **Severity (reviewer):** low
- **Category:** iac-reproducibility · **Effort:** S · **Confidence:** high
- **Location:** `.gitignore:73`
- **Also:** `infrastructure/main.tf:5`

**Evidence:**

```text
infrastructure/.terraform.lock.hcl
```

**Description.** main.tf constrains azurerm to `~> 4.0` and random to `~> 3.6`, but the dependency lock file is explicitly ignored. Each deploy's `tofu init` therefore resolves the latest matching provider with no checksum pinning, and that provider is used for an `-auto-approve` apply against prod (OPS-02). Provider minor releases occasionally change defaults or force replacements.

**Impact.** Non-reproducible infrastructure applies. A provider release can change the plan for stateful resources with no code change and no human review, and provider checksums are not verified.

**Recommendation.** Commit infrastructure/.terraform.lock.hcl (generated with `tofu providers lock -platform=linux_amd64 -platform=darwin_arm64`) and let Dependabot's terraform ecosystem bump it.

**Verification.** confirmed, severity → low. .gitignore:73 ignores `infrastructure/.terraform.lock.hcl`, and main.tf:5-12 uses `~> 4.0` / `~> 3.6`, so every CI `tofu init` in provision.sh:10 resolves the newest matching provider with no checksum pinning before `apply -auto-approve`.

### OPS-14: GDPR deletion job has no failure alerting, timeout, or throttling handling

- **Severity (reviewer):** low
- **Category:** reliability · **Effort:** S · **Confidence:** medium
- **Location:** `.github/workflows/process-deletions.yml:8`
- **Also:** `functions/scripts/process-deletions.js:57`

**Evidence:**

```text
    - cron: "0 3 * * *" # daily at 03:00 UTC
```

**Description.** Failures only set exitCode=1. Notification relies on GitHub's default email to whoever last edited the cron, and nothing escalates if the job fails repeatedly. The job has no timeout-minutes. process-deletions.js makes sequential Graph calls with no 429/Retry-After handling, and one token is used for the whole run. GitHub disables scheduled workflows in public repos after 60 days without repository activity. Today Dependabot merges keep the repo active, but that coupling is implicit.

**Impact.** Entra identities of users who deleted their accounts can remain undeleted for a long time without anyone noticing, which is a GDPR erasure compliance gap.

**Recommendation.** Add timeout-minutes. On failure, open or update a GitHub issue (or post to a webhook). Emit a metric or alert when the queue has items older than N days. Handle 429 with Retry-After.

**Verification.** partially-confirmed, severity → low. process-deletions.yml:15-16 has no timeout-minutes and no failure notification beyond GitHub defaults. The throttling concern is mitigated: process-deletions.js:58-66 treats any non-204/404 status (including 429) as failed and leaves the queue entry for the next run, so nothing is lost. User data is already deleted synchronously in DeleteAccount/index.js:45-55, and only the Entra identity lingers.

### OPS-15: Outbound calls to Entra/Graph have no timeout

- **Severity (reviewer):** low
- **Category:** reliability · **Effort:** S · **Confidence:** medium
- **Location:** `functions/src/middleware/authMiddleware.js:27`
- **Also:** `functions/scripts/process-deletions.js:20`, `functions/scripts/process-deletions.js:34`

**Evidence:**

```text
    const res = await fetchImpl(openIdConfigUrl());
```

**Description.** The OIDC metadata fetch uses global fetch with no AbortSignal.timeout. It runs on every cold instance and hourly thereafter, on the request path of every authenticated call. The JWKS client has no explicit timeout either. If ciamlogin.com is slow or degraded, requests hang for up to the platform HTTP limit (about 230 s) instead of failing fast with a retryable 5xx. That piles up concurrency and drives Flex scale-out (see OPS-11). The Graph calls in process-deletions.js have the same pattern.

**Impact.** An external dependency slowdown becomes a full API stall and a cost amplifier rather than a quick, visible error.

**Recommendation.** Pass `signal: AbortSignal.timeout(5000)` to these fetches, set `timeout` on jwksRsa, and consider serving the stale cached config on refresh failure.

**Verification.** partially-confirmed, severity → low. authMiddleware.js:27 and process-deletions.js:20 and :34 use global fetch with no AbortSignal (undici defaults: 10s connect, 300s headers). The JWKS part is wrong: jwks-rsa defaults to `timeout: 30000` (functions/node\_modules/jwks-rsa/src/JwksClient.js:12). The metadata fetch runs only on a cold instance or hourly, which limits the stall risk.

### OPS-16: Codecov upload fails the gate on third-party errors, contradicting the stated intent

- **Severity (reviewer):** low
- **Category:** ci-cd · **Effort:** S · **Confidence:** high
- **Location:** `.github/workflows/gate.yml:116`
- **Also:** `functions/scripts/check-coverage.js:3`

**Evidence:**

```text
          fail_ci_if_error: true
```

**Description.** check-coverage.js says the local gate exists so that Codecov's 'own service hiccups shouldn't block a PR'. The Codecov step still uses fail\_ci\_if\_error: true inside the `unit` job, and frontend, e2e, e2e-fullstack, integration and mutation all `needs: unit`. A Codecov outage or missing token therefore skips the entire downstream gate.

**Impact.** Flaky or blocked CI (including Dependabot PRs) for reasons unrelated to the code.

**Recommendation.** Set fail\_ci\_if\_error: false (the local check:coverage step is the real gate), or move the upload to a separate non-blocking job.

**Verification.** confirmed, severity → low. gate.yml:116 sets `fail_ci_if_error: true` in the `unit` job that frontend, e2e, mutation, e2e-fullstack and integration all `needs:` (gate.yml:119,157,199,226,295). This contradicts check-coverage.js:3-5 ('its own service hiccups shouldn't block a PR') and the gate.yml:89-90 comment.

### OPS-17: No timeout-minutes on any workflow job

- **Severity (reviewer):** low
- **Category:** ci-cd · **Effort:** S · **Confidence:** high
- **Location:** `.github/workflows/deploy.yml:27`
- **Also:** `.github/workflows/gate.yml:16`, `.github/workflows/process-deletions.yml:15`, `.github/workflows/destroy.yml:17`

**Evidence:**

```text
    name: OpenTofu Apply
    runs-on: ubuntu-latest
```

**Description.** No job in gate.yml, deploy.yml, destroy.yml or process-deletions.yml sets timeout-minutes, so a hung step runs for the 6-hour default. Examples: tofu waiting on a stuck state lease, a Flex publish, emulator start, or Playwright. Because the deploy concurrency group is non-cancelling, one hung deploy blocks all later deploys for hours.

**Impact.** Stalled deploy queue and wasted runner minutes.

**Recommendation.** Add realistic timeout-minutes per job (for example infra 20, functions 20, pages 10, gate jobs 15-30, deletions 10).

**Verification.** confirmed, severity → low. `grep timeout-minutes .github/` returns nothing, and the deploy concurrency group is non-cancelling (deploy.yml:13-15), so a hung apply or publish blocks later deploys for up to the 6h default.

### OPS-18: Prod maintenance/backfill scripts have no dry-run, batching, or runbook

- **Severity (reviewer):** low
- **Category:** data-migration · **Effort:** S · **Confidence:** high
- **Location:** `functions/scripts/backfillTourStats.js:68`
- **Also:** `functions/scripts/backfillImageThumbnails.js:59`

**Evidence:**

```text
  const { resources: tours } = await container.items.query('SELECT * FROM c').fetchAll();
```

**Description.** The backfill scripts are meant to be run by hand against production with primary-key connection strings. backfillTourStats does a cross-partition `SELECT *`, pulling every tour including heatmapData (up to 5,000 points each) into memory, then patches sequentially. There is no --dry-run, no limit/resume cursor and no progress checkpoint. backfillImageThumbnails collects all images first. Neither script is referenced from buddy.sh or documented (how to obtain BLOB\_CONNECTION\_STRING, when to run, how to verify). Idempotency is good, but combined with OPS-03 a mistake is not recoverable.

**Impact.** Risky ad-hoc production data operations: memory or RU blow-ups as data grows, and no preview of what will change.

**Recommendation.** Project only needed fields (`SELECT c.id, c.userId, c.elevationGain FROM c WHERE NOT IS_DEFINED(c.elevationGain)`), iterate with getAsyncIterator/continuation, add --dry-run and --limit flags, wire the scripts through buddy.sh maintenance with a documented runbook, and take a backup/PITR note before running.

**Verification.** confirmed, severity → low. backfillTourStats.js:68 does a cross-partition `SELECT *` then filters in memory at :69 and patches sequentially at :75-79, and backfillImageThumbnails.js:59-62 collects all images up front. Neither script has a dry-run flag, and neither is referenced from any .sh, .md or .yml file. At the current few-hundred-tour scale, and with idempotent set-only patches, this is hardening only.

### OPS-19: .funcignore is gitignored, so CI publishes tests, scripts and tooling config into the Flex package

- **Severity (reviewer):** low
- **Category:** deployability · **Effort:** S · **Confidence:** medium
- **Location:** `.gitignore:16`
- **Also:** `scripts/infrastructure/publish-functions.sh:17`

**Evidence:**

```text
functions/.funcignore
```

**Description.** `func azure functionapp publish` uses .funcignore to decide what to zip. Because it is gitignored, the CI checkout has none, and publish-functions.sh ships the whole functions/ folder: \*.test.js, test/integration, scripts/, stryker.config.mjs, eslint configs. The remote build then installs from package.json. Unless Oryx prunes, that includes devDependencies (vitest, stryker, eslint), which inflates the package and cold-start download. Local publishes may differ from CI publishes depending on each developer's untracked .funcignore.

**Impact.** Larger deployment package and slower Flex cold starts. Non-deterministic package contents between local and CI publishes. Maintenance scripts that hold admin logic are deployed to the web host unnecessarily.

**Recommendation.** Commit a functions/.funcignore (exclude test/, \*\*/\*.test.js, scripts/, coverage/, reports/, stryker/eslint/vitest configs) and ensure production-only install (for example set `NODE_ENV=production` or `npm prune --omit=dev` in a post-build step).

**Verification.** confirmed, severity → low. .gitignore:16 ignores functions/.funcignore, and publish-functions.sh:16-17 publishes the whole functions/ folder. The 2026-09-03 deploy log reports 'Uploading 126.6 KB', which matches zipping all tracked functions/ files (about 136 KB at HEAD, including tests and scripts) rather than a prod-only set. Whether devDependencies are installed remotely is unverified.

### OPS-20: Terraform state backend is LRS with no versioning or soft delete, accessed by account key; setup docs point to a missing README

- **Severity (reviewer):** low
- **Category:** iac-state · **Effort:** S · **Confidence:** high
- **Location:** `scripts/infrastructure/setup-state.sh:16`
- **Also:** `infrastructure/main.tf:15`, `scripts/infrastructure/setup-state.sh:5`

**Evidence:**

```text
az storage account create -g "$RG" -n "$SA" -l "$LOCATION" \
  --sku Standard_LRS --kind StorageV2 \
```

**Description.** The state account is created with no blob versioning, soft delete or delete lock, and the backend authenticates with a shared account key (ARM\_ACCESS\_KEY). A corrupted or deleted state file leaves every production resource unmanaged (or makes the next apply try to recreate them). The script header says 'see infrastructure/README.md', but that file does not exist in the repo.

**Impact.** State loss or corruption has no recovery point, and the next auto-approved apply could conflict with or duplicate live resources.

**Recommendation.** Enable `az storage account blob-service-properties update --enable-versioning true --enable-delete-retention true --delete-retention-days 30` and a CanNotDelete lock on bikebuddy-tfstate-rg. Consider `use_azuread_auth`. Fix the README reference to point to docs/how-to/infrastructure.md.

**Verification.** confirmed, severity → low. setup-state.sh:16-18 creates the state account as Standard\_LRS with no versioning, soft-delete or lock, and the backend uses the account key (deploy.yml:22 ARM\_ACCESS\_KEY). The setup-state.sh:5 reference to infrastructure/README.md is broken because that file does not exist. Portal-side settings could not be verified.

### OPS-21: OpenGrep hook downloads and executes an unpinned installer from the main branch, locally and in CI

- **Severity (reviewer):** low
- **Category:** supply-chain · **Effort:** S · **Confidence:** high
- **Location:** `.pre-commit-config.yaml:161`

**Evidence:**

```text
            curl -fsSL https://raw.githubusercontent.com/opengrep/opengrep/main/install.sh \
              -o /tmp/opengrep-install.sh && bash /tmp/opengrep-install.sh; fi &&
```

**Description.** Every other tool in the pre-commit config is pinned by rev, but OpenGrep is installed by piping a script from a moving branch and uses `latest`. The CI prek job runs it with --all-files. The job has a read-only token and no secrets, which limits the blast radius, but developer machines that run hooks with local Azure credentials also execute it.

**Impact.** A compromise of the upstream repo runs arbitrary code on the maintainer's workstation, which holds az login and ARM keys, and in CI. The SAST rule set can also change unannounced.

**Recommendation.** Pin the installer to a tagged release with a checksum (or install a pinned binary release and verify sha256), and pin the ruleset version.

**Verification.** confirmed, severity → low. .pre-commit-config.yaml:161-162 curls `opengrep/main/install.sh` and runs it, uses the `latest` path at :163, and uses unversioned `p/security-audit` rules, while other hooks are pinned by rev. The CI prek job runs it via `--all-files` (gate.yml:38-41) with a read-only token and no secrets.

### OPS-22: Operator docs drift from the real deployment (cost report, secrets list)

- **Severity (reviewer):** low
- **Category:** docs-drift · **Effort:** S · **Confidence:** high
- **Location:** `docs/cost-report.md:127`
- **Also:** `docs/cost-report.md:20`, `docs/cost-report.md:99`, `docs/reference/configuration.md:111`

**Evidence:**

```text
A budget alert can't be created from this repo — it's an Azure subscription
action.
```

**Description.** cost-report.md describes a different architecture than the one deployed. It lists Static Web App hosting (actually GitHub Pages), Azure AD B2C (actually Entra External ID), Y1 Consumption free-grant math (actually Flex FC1, which has a different grant), and Application Insights with sampling (no such resource exists). It says a budget cannot be created from the repo (budget.tf does it) and describes 'actual80' thresholds (IaC uses Forecasted 80). configuration.md's secrets list omits GRAPH\_TENANT\_ID/GRAPH\_CLIENT\_ID/GRAPH\_CLIENT\_SECRET and STRYKER\_DASHBOARD\_API\_KEY, which the workflows require. No runbook exists for incident response, restore or key rotation.

**Impact.** Operators planning costs, monitoring or recovery from these docs will draw wrong conclusions. In particular they will believe telemetry exists (OPS-04).

**Recommendation.** Rewrite cost-report.md for GitHub Pages + Flex + External ID, remove the App Insights claim (or add it via OPS-04), list all required secrets in configuration.md, and add short incident/restore/rotation runbooks to docs/how-to/infrastructure.md.

**Verification.** partially-confirmed, severity → low. cost-report.md drift is real: :20-22 lists Static Web App, B2C and Y1, :99 claims App Insights, :127 says a budget can't be created from the repo although budget.tf does it, and :141 uses actual80. The cited docs/reference/configuration.md:111 does not exist (the file has 41 lines); the incomplete secrets list, missing GRAPH\_\* and STRYKER\_DASHBOARD\_API\_KEY, is at configuration.md:35.

### OPS-23: Dependency update coverage gaps: frontend/e2e npm and vendored MSAL/Leaflet are not tracked; dev-tree advisories

- **Severity (reviewer):** low
- **Category:** dependency-management · **Effort:** S · **Confidence:** high
- **Location:** `.github/dependabot.yml:18`
- **Also:** `functions/package.json:46`, `frontend/src/vendor/.msal-source:1`

**Evidence:**

```text
  - package-ecosystem: "npm"
    directory: "/functions"
```

**Description.** Dependabot version updates cover only /functions. frontend/ (vitest) and e2e/ (Playwright, @azure/cosmos) get security alerts only, and there is no terraform ecosystem entry. The vendored browser libraries have no update mechanism: .msal-source pins @azure/msal-browser 3.28.1 from 2025-01-14, a major line behind current, and Leaflet 1.9.4. The functions dev tree has npm audit findings (brace-expansion high, qs moderate via @stryker-mutator/core), and the package.json override `"qs": "^6.15.2"` resolves to 6.15.3, which is inside the advisory range. CI runs no npm audit step.

**Impact.** The MSAL auth library that runs on the production page can go stale without anyone noticing. Dev-tooling advisories stay unresolved.

**Recommendation.** Add npm entries for /frontend and /e2e and a terraform entry for /infrastructure. Add a scheduled check comparing vendored versions (.msal-source/.leaflet-source) with npm latest. Bump the qs override past the fixed version, and add `npm audit --omit=dev --audit-level=high` to the gate.

**Verification.** confirmed, severity → low. dependabot.yml:18-19 has npm only for /functions (frontend got only a security PR, #525), and vendor/.msal-source pins msal-browser@3.28.1. `npm audit` in functions/ shows 1 high (brace-expansion) and 2 moderate (qs@6.15.3 overridden via @stryker-mutator/core, package.json:46-47), and `npm audit --omit=dev` is clean, so all of these are dev-only.

### OPS-G03: Destroy workflow cannot run: it passes an undeclared -var, has never been executed, and shares no concurrency group with Deploy

- **Severity (reviewer):** low
- **Category:** ci-cd · **Effort:** S · **Confidence:** high
- **Location:** `.github/workflows/destroy.yml:41`
- **Also:** `infrastructure/variables.tf:1`, `infrastructure/storage.tf:39`, `docs/how-to/developer-guide.md:84`

**Evidence:**

```text
# package_path must resolve for config to parse, but destroy reads from
      # state and never uploads — a placeholder zip is enough.
...
        run: tofu destroy -auto-approve -var="package_path=$GITHUB_WORKSPACE/func.zip"
```

**Description.** infrastructure/variables.tf declares only location, entra\_\*, budget\_amount, budget\_contact\_email and budget\_start\_date. No `package_path` variable exists anywhere (grep finds it only in destroy.yml), which dates from the earlier Y1/zip-deploy design. OpenTofu, like Terraform, rejects a command-line `-var` for an undeclared root variable ('Value for undeclared variable'), so the job fails before destroying anything. The Actions API reports 0 runs of destroy.yml, so this has never been exercised. The workflow also has no `concurrency: deploy`, so a push landing during a manual destroy would start `tofu apply` against the same state. storage.tf:39 still says the package runs 'via WEBSITE\_RUN\_FROM\_PACKAGE', which is the same stale design assumption.

**Impact.** The documented teardown path (developer-guide.md: 'destroy.yml (manual) tears the infrastructure down') and the only remote cost kill switch fail when needed, for example during runaway spend (OPS-11). Operators must fall back to a local `tofu destroy` with the state key. On the plus side, this currently blocks the one-click destroy risk described in OPS-02.

**Recommendation.** Decide whether a remote destroy should exist. If it should, drop the placeholder-zip step and the -var, and gate the job behind a protected environment with required reviewers plus a typed confirmation input. Add `concurrency: { group: deploy }`. Fix the stale WEBSITE\_RUN\_FROM\_PACKAGE comment.

**Verification.** confirmed, severity → low. destroy.yml:41 passes `-var="package_path=..."`, but variables.tf declares no package\_path variable (grep finds it only in destroy.yml), and OpenTofu rejects undeclared CLI -var values. The Actions API reports 0 runs of destroy.yml, and there is no concurrency group, unlike deploy.yml:13-15.

### OPS-G04: Runtime authenticates to Cosmos and Storage with account master keys (no managed identity); one storage key covers both the code package and all user data, with no rotation runbook

- **Severity (reviewer):** low
- **Category:** secrets-management · **Effort:** M · **Confidence:** high
- **Location:** `infrastructure/functions.tf:29`
- **Also:** `infrastructure/functions.tf:21`, `functions/src/lib/blobStorage.js:9`, `scripts/maintenance/delete-users.sh:11`

**Evidence:**

```text
COSMOS_CONNECTION_STRING = "AccountEndpoint=${azurerm_cosmosdb_account.main.endpoint};AccountKey=${azurerm_cosmosdb_account.main.primary_key};"
    COSMOS_DATABASE          = "bikebuddy"
    BLOB_CONNECTION_STRING   = azurerm_storage_account.main.primary_connection_string
```

**Description.** The Function App has no identity block. Cosmos access uses the primary master key, and blob access uses the primary storage connection string. The same account and key also serve the Flex deployment package container (`storage_access_key = ...primary_access_key`, functions.tf:21) and AzureWebJobsStorage. SAS URLs (blobStorage.js readSasUrl) are signed with that account key. Every one of these secrets also sits in plaintext in the tofu state. No doc describes key rotation. Rotating the storage key invalidates every outstanding SAS URL and needs a tofu apply plus an app restart. Rotating the Cosmos key breaks process-deletions until the next run fetches the new key.

**Impact.** A compromise of the API process (for example an image or XML parser bug) yields keys that can read and write all users' data and overwrite the deployed code package, giving persistence. Rotating after a leak is an unrehearsed, disruptive manual procedure.

**Recommendation.** Assign a system-assigned managed identity. Use Cosmos data-plane RBAC and Storage Blob Data Contributor, with user-delegation SAS for reads and `storage_authentication_type = "SystemAssignedIdentity"` for the Flex package. Put the deployment package in a separate storage account. Set `local_authentication_disabled`/`shared_access_key_enabled = false` once migrated. Write a short key-rotation runbook in docs/how-to/infrastructure.md.

**Verification.** confirmed, severity → low. functions.tf:29,31 inject the Cosmos master key and the storage primary connection string, and functions.tf:20-21 uses the same account key for the Flex package container. There is no identity block and no rotation doc. This shares its root cause with OPS-07's app-settings remark, so dedupe.

### OPS-G05: Function App does not set https\_only, so the API also answers over plain HTTP

- **Severity (reviewer):** low
- **Category:** hardening · **Effort:** S · **Confidence:** medium
- **Location:** `infrastructure/functions.tf:10`
- **Also:** `infrastructure/storage.tf:11`

**Evidence:**

```text
resource "azurerm_function_app_flex_consumption" "main" {
  name                = "bikebuddy-api-${random_string.suffix.result}"
...
  site_config {
    cors {
```

**Description.** `https_only` is not set on azurerm\_function\_app\_flex\_consumption, and the provider default is false, so the \*.azurewebsites.net host accepts http:// requests. The SPA always uses the https functions\_url output, so normal traffic is encrypted. However, any client or script that follows an http link (or a downgrade) would send the bearer token in cleartext. The storage account enforces https\_traffic\_only\_enabled, so the two resources are configured inconsistently.

**Impact.** Hardening gap. There is no production exploit path through the SPA itself.

**Recommendation.** Add `https_only = true` to the Function App resource. Optionally also set `site_config.minimum_tls_version = "1.2"` explicitly.

**Verification.** confirmed, severity → low. The azurerm\_function\_app\_flex\_consumption block (functions.tf:10-51) sets no `https_only` (the provider default is false), while storage.tf:11 sets `https_traffic_only_enabled = true`. The SPA uses the https functions\_url, so this is hardening only.

### OPS-G06: OIDC metadata refresh fails hard at TTL expiry instead of serving the cached copy, and the JWKS client never follows a jwks\_uri change

- **Severity (reviewer):** low
- **Category:** reliability · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/middleware/authMiddleware.js:28`
- **Also:** `functions/src/middleware/authMiddleware.js:39`

**Evidence:**

```text
if (!cachedConfig || Date.now() - cachedConfigAt >= CONFIG_TTL_MS) {
    const res = await fetchImpl(openIdConfigUrl());
    if (!res.ok) throw new Error(`OIDC metadata fetch failed: ${res.status}`);
```

**Description.** Once the 1-hour TTL has passed, every request re-fetches the discovery document, and any non-2xx or network error throws, even though a still-valid cachedConfig is available. During an Entra/ciamlogin blip, every authenticated request on a warm instance whose TTL has lapsed returns 5xx, with no backoff and no stale-while-revalidate. The TTL comment says it exists to catch a jwks\_uri change, but defaultJwksClient (line 39) is memoised on the first jwksUri and ignores later values, so that goal is not met. This is a separate root cause from OPS-15, which is about missing timeouts.

**Impact.** A transient identity-provider outage becomes a full API outage for its whole duration, and every incoming request hammers the metadata endpoint.

**Recommendation.** On refresh failure, log the error and keep serving the stale cachedConfig (with a maximum staleness, e.g. 24h). Deduplicate concurrent refreshes. Rebuild the JWKS client when jwksUri changes.

**Verification.** confirmed, severity → low. authMiddleware.js:26-28 refetches after the TTL and throws on any non-ok response, discarding a still-usable cachedConfig, and does not deduplicate concurrent refreshes. defaultJwksClient (:37-41) is memoised on the first jwksUri and ignores later values, which defeats the TTL rationale in the :18-20 comment.

### OPS-G07: GDPR deletion pipeline races with re-login: data created before the daily Entra purge is orphaned forever, and the queue entry is never cancelled

- **Severity (reviewer):** low
- **Category:** data-lifecycle · **Effort:** M · **Confidence:** medium
- **Location:** `functions/src/DeleteAccount/index.js:42`
- **Also:** `functions/src/GetMe/index.js:17`, `functions/scripts/process-deletions.js:170`, `.github/workflows/process-deletions.yml:8`

**Evidence:**

```text
await getDeletions().items.upsert({ id: userOid, requestedAt: new Date().toISOString() });
```

**Description.** DELETE /api/account wipes the data now but only queues the Entra identity for deletion. That queue is drained once a day by process-deletions.yml, and in practice the scheduled runs start around 08:00 UTC. Until then the Entra user and its refresh tokens stay valid, including on other devices, and GetMe (GetMe/index.js:17-19) silently re-creates the user doc on the next sign-in. Tours or photos uploaded in that window belong to a `sub` that process-deletions.js:170 then makes unreachable. Nothing reaps those orphans, and the deletions entry is never removed if the user signs back in.

**Impact.** Personal GPS and photo data can outlive a completed account deletion with no owner who can export or delete it. Blast radius is small (a user must act inside the window).

**Recommendation.** Have GetMe/authenticate refuse (e.g. 410) callers whose oid is in the deletions container, or record a deletion tombstone on the user doc. Have process-deletions also delete any tours, blobs and user doc for the queued subject before deleting the Entra user.

**Verification.** partially-confirmed, severity → low. DeleteAccount/index.js:41-42 only queues the oid, GetMe/index.js:16-19 recreates the user doc on the next call, and scheduled deletion runs actually start around 08:00 UTC (the Actions API shows 08:01-08:28). The frontend signs out right after deletion (frontend/src/ui/profile.js deleteMyAccount → signOut), so the window needs a deliberate re-login or another device. The cited process-deletions.js:170 does not exist (the file has 75 lines).

### OPS-G08: CI gate depends on mutable emulator images (Cosmos `vnext-preview`, untagged Azurite)

- **Severity (reviewer):** low
- **Category:** ci-cd · **Effort:** S · **Confidence:** high
- **Location:** `scripts/development/start-cosmos.sh:8`
- **Also:** `scripts/development/start-azurite.sh:6`, `functions/src/lib/db.js:115`, `.github/workflows/gate.yml:260`

**Evidence:**

```text
IMAGE="mcr.microsoft.com/cosmosdb/linux/azure-cosmos-emulator:vnext-preview"
```

**Description.** The integration and e2e-fullstack gate jobs call start-cosmos.sh and start-azurite.sh. These pull a preview Cosmos emulator tag and `mcr.microsoft.com/azure-storage/azurite` with no tag or digest. Both change underneath the repo. db.js:115-116 already documents a semantic difference between the emulator and real Cosmos (404 thrown vs undefined resolved), and UploadImage relies on patch error codes. An upstream image change can therefore turn the gate red, or green on behaviour production does not share. Because Dependabot auto-merge (OPS-05) waits on these checks, a broken emulator stalls all merges.

**Impact.** Non-reproducible, flaky gate failures unrelated to the change under test, and false confidence in Cosmos-specific behaviour.

**Recommendation.** Pin both images by digest (and let Dependabot's docker ecosystem bump them). Document known differences between the emulator and real Cosmos next to the integration tests.

**Verification.** partially-confirmed, severity → low. start-cosmos.sh:8 uses the mutable `vnext-preview` tag and start-azurite.sh:6 uses an untagged `mcr.microsoft.com/azure-storage/azurite`, both run by the gate (gate.yml:260-261,323-324). The cited db.js:115 does not exist (the file has 50 lines); the emulator-vs-Cosmos 404 note is at functions/src/lib/db.js:11-12.

## Second-pass disputes of first-pass findings

The independent second pass checked the first pass's findings against the code. Where it disagreed on the facts or the rating, it recorded a dispute:

- **OPS-02**, suggested severity **medium**: The 'one-click, approval-free destroy' part does not hold today. .github/workflows/destroy.yml:41 passes `-var="package_path=..."`, but infrastructure/variables.tf declares no package\_path variable, so tofu rejects the undeclared variable before destroying anything. The Actions API also reports 0 runs of destroy.yml (see OPS-G03). The remaining risk is real but conditional: a replacement-forcing change (e.g. to cosmos.tf:partition\_key\_paths or a resource name) auto-applied without plan review, with no prevent\_destroy guard. Combined with OPS-03, that fits medium ('needing unusual conditions') better than high. Restore high once the destroy workflow is fixed without an approval gate.
- **OPS-10**, suggested severity **low**: The 'deploy tool was broken for a month' claim is not supported by the deploy history. In the latest Deploy run 33783579394 (2026-09-03, commit ee83aad, the same commit that pinned 4.13.0 in gate.yml), the step 'Install Azure Functions Core Tools' (`npm install -g azure-functions-core-tools@4`, deploy.yml:79) succeeded, and so did 'Publish (remote build)'. Every Deploy run from #240 to #249 is also green. No deploy has run since (see OPS-G01), so a breakage could not have been observed there. The unpinned version remains a reproducibility risk worth fixing, which is low under the rubric.
- **OPS-01**, suggested severity **medium**: Everything in main's first-parent history since the auto-merge change arrives via PR merges, and gate.yml:3 runs on pull\_request, which tests the PR merge ref. The missing needs/workflow\_run link from deploy.yml:4 to the gate only matters when a PR is merged with failing or pending checks, or someone pushes directly to main. That is a real gap, but it needs a bypass and is not the default path. Dependabot merges do not deploy at all (OPS-G01). Medium is a better fit unless branch protection is confirmed to be absent.
- **OPS-23**, suggested severity **low**: The severity stands, but the claim that frontend/e2e npm dependencies are not tracked is partly inaccurate. Repository-level Dependabot security updates do cover /frontend: merge e11e0f8 (#525, 'Bump @vitest/mocker and vitest in /frontend', dependabot/npm\_and\_yarn/frontend/multi-...) came from one. What is missing is routine version updates in .github/dependabot.yml:18 for frontend/ and e2e/, plus any tracking of the vendored MSAL/Leaflet copies. The finding should be narrowed to that.

## Coverage

<details><summary>Files and areas read</summary>

- .github/workflows/gate.yml
- .github/workflows/deploy.yml
- .github/workflows/destroy.yml
- .github/workflows/process-deletions.yml
- .github/workflows/dependabot-auto-merge.yml
- .github/dependabot.yml
- .github/zizmor.yml
- infrastructure/main.tf, functions.tf, cosmos.tf, storage.tf, budget.tf, variables.tf, outputs.tf
- functions/host.json, functions/package.json, functions/local.settings.json.example, functions/.gitignore, .gitignore
- functions/src/\*/index.js (all 13 handlers incl. Health)
- functions/src/lib/db.js, blobStorage.js, http.js, parseMultipart.js, heatmapCache.js
- functions/src/middleware/authMiddleware.js
- functions/scripts/process-deletions.js, backfillTourStats.js, backfillImageThumbnails.js, init-cosmos.js, check-coverage.js
- buddy.sh, scripts/infrastructure/\*.sh, scripts/maintenance/delete-users.sh, scripts/development/\*.sh, scripts/quality/\*.sh, scripts/test/\*.sh
- .pre-commit-config.yaml, codecov.yml
- frontend/src/sw.js, frontend/test/sw.test.js, frontend/package.json, e2e/package.json, frontend/src/vendor/.msal-source/.leaflet-source (version only)
- docs/how-to/infrastructure.md, docs/reference/configuration.md, docs/cost-report.md, docs/how-to/developer-guide.md (auth/deploy), docs/reference/architecture.md, docs/explanation/design-decisions.md, docs/explanation/security.md (grep)
- git history of frontend/src (shell changes vs CACHE\_NAME bumps)
- .github/workflows/deploy.yml, gate.yml, destroy.yml, process-deletions.yml, dependabot-auto-merge.yml, .github/dependabot.yml, .github/zizmor.yml
- GitHub Actions run history via the GitHub API (read-only): Deploy, CI Gate (push), Account Deletions, Destroy runs; job steps of Deploy run 33783579394
- git history of main (first-parent merges, authors, dates)
- functions/host.json, package.json, vitest.config.js, codecov.yml, scripts/check-coverage.js
- functions/src/lib/blobStorage.js, db.js, http.js, parseMultipart.js, heatmapCache.js, ownedTour.js, tourResponse.js
- functions/src handlers: UploadTour, UploadImage, DeleteImage, DeleteTour, DeleteAccount, GetMe, GetMapData, GetTour, ExportData, Health, EditTour/UpdateProfile catch sites
- functions/scripts/process-deletions.js, backfillImageThumbnails.js, init-cosmos.js
- .pre-commit-config.yaml, .gitignore
- frontend/src/sw.js (precache list incl. config.js), frontend/src/ui/profile.js (account deletion flow)
- docs/how-to/infrastructure.md, docs/how-to/developer-guide.md (deploy/teardown sections)

</details>

<details><summary>Commands and probes run</summary>

- git ls-files (inventory, 252 tracked files) - identified no .terraform.lock.hcl tracked; .gitignore line 73 ignores it
- grep -rn package\_path over tf/yml/sh/md - only referenced in destroy.yml (lines 29, 41); no variable declared in infrastructure/\*.tf, so `tofu destroy -var=package_path=...` fails with 'Value for undeclared variable'
- grep for App Insights/Log Analytics/monitor across repo - only functions/host.json mentions applicationInsights; no tf resource or APPLICATIONINSIGHTS\_CONNECTION\_STRING app setting
- grep console./context.log in functions/src - only 4 log calls in the whole API (authMiddleware x3, parseMultipart x1)
- git log -G'bikebuddy-shell-v' -- frontend/src/sw.js vs git log -- frontend/src: last CACHE\_NAME bump b27e779 (2026-08-24 10:17); later shell changes aff8ef1, 42a19ee (style.css, ui/modal.js, ui/routes.js, ui/sidebar.js, ui/tour-detail.js), 07bfdad (ui/sidebar.js) did not bump it
- npm view azure-functions-core-tools dist-tags/time - latest 4.15.1 (2026-09-23); 4.14.0 was latest 2026-08-24..2026-09-22
- npm pack azure-functions-core-tools@{4.13.0,4.14.0,4.15.1} into scratchpad/ops and grep npm-shrinkwrap.json for pkgs.dev.azure.com - 4.13.0: 0, 4.14.0: 1, 4.15.1: 0 (so deploy.yml's unpinned @4 resolved to the broken 4.14.0 for a month)
- node scratchpad/ops/skipauth.js (sets SKIP\_AUTH='true', ENTRA\_CLIENT\_ID='', ENTRA\_TENANT\_ID='' as functions.tf would when CI vars are empty, then authenticate() with no Authorization header) -&gt; 'anonymous request resolves to: {"userId":"local-dev-user","userEmail":"dev@localhost","userName":"Local Dev"}'
- npm audit --omit=dev (functions) - 0 vulnerabilities; npm audit (functions, incl dev) - 3 (1 high brace-expansion, 2 moderate qs/typed-rest-client via @stryker-mutator/core; qs override pins 6.15.3 which is in the vulnerable range); e2e and frontend - 0
- npx eslint src/ scripts/ (functions) - clean, no output
- which shellcheck tofu - neither installed locally; not run (tofu forbidden by scope)
- cat -n .github/workflows/\*.yml infrastructure/\*.tf functions/host.json functions/package.json ...
- git log --first-parent --format='%h %ad %an | %s' --date=iso | head -12 -&gt; 11 merges by github-actions\[bot\] between 2026-09-06 and 2026-09-20 after the last human commit ee83aad (2026-09-03)
- git log -S package\_path; grep -rn package\_path -&gt; only .github/workflows/destroy.yml:29,41 (no variable declared anywhere)
- GitHub API actions\_list list\_workflow\_runs deploy.yml -&gt; newest run 33783579394 on 2026-09-03 for ee83aad; no runs for any later commit
- GitHub API list\_workflow\_runs gate.yml event=push branch=main -&gt; newest 2026-09-03 (ee83aad)
- GitHub API list\_workflow\_runs destroy.yml -&gt; total\_count 0
- GitHub API list\_workflow\_runs process-deletions.yml -&gt; daily scheduled runs at head b0bde68, success
- GitHub API list\_workflow\_jobs 33783579394 -&gt; 'Install Azure Functions Core Tools' (unpinned @4) conclusion success; azure/login ran at SHA f5d393ae (not the current a641126d)
- node /tmp/.../scratchpad/ops2/probe-blob.js (monkeypatches BlobServiceClient.fromConnectionString so the first createIfNotExists rejects with a transient 503, then calls blobStorage.gpxContainer() 4 times) -&gt; 'call 1..4: FAILED ServerBusy (transient 503)', 'createIfNotExists invoked 1 time(s)'
- git show --stat e11e0f8 -&gt; Dependabot security update bumping vitest in /frontend
- ls functions/.funcignore -&gt; absent (gitignored)

</details>
