# Explanation: Design decisions

The _why_ behind the architecture. For _what_, see [Architecture](../reference/architecture.md).

## No frontend framework

Plain HTML/CSS/JS keeps the site truly static (no build pipeline) and trivially
hostable on GitHub Pages. Every third-party script is **vendored** in
`frontend/src/vendor/`: MSAL because loading it cross-origin from a CDN was
blocked by the browser (ORB) on GitHub Pages, Leaflet and Leaflet.heat because a
CDN that serves altered bytes would execute in the app's origin, where the Entra
access tokens live. Vendoring lets `script-src` stay at `'self'`.

## Node.js Functions on Flex Consumption

Node gives fast cold starts and first-class Azure SDKs for Cosmos + Blob. We run
on **Flex Consumption (FC1)**, not the legacy Y1 Consumption plan: new
subscriptions get a "Total VMs: 0" App Service quota that blocks Y1, while Flex
allocates from a different pool, scales to zero, and costs ~€0 idle. Flex deploys
code from a blob package container via the publish API (so we use Core Tools with
a remote build, **not** `azure/functions-action`).

## Microsoft Entra External ID (not B2C)

Azure AD B2C is closed to new tenants, so customer sign-in uses **Entra External
ID** (`ciamlogin.com`). The backend trusts the tenant's OIDC discovery document
for issuer + keys rather than hard-coding them, since the issuer host varies
across Entra surfaces. See the [Developer guide](../how-to/developer-guide.md#authentication--tokens).

## Cosmos partitioning & payload hygiene

`users` is partitioned by `/id`, `tours` by `/userId`, so a user's tours live in
one partition (no cross-partition queries). `heatmapData` is large and never
queried, so it's excluded from indexing and from list responses, and GPX tracks
over 5,000 points are downsampled to keep documents under Cosmos's 2 MB limit.

## Images

Originals are never stored: uploads are resized to ≤2000px with `sharp` and
re-encoded as JPEG. GPS is read from the **original** EXIF before resize strips
it, so geotagged photos can appear as map pins. Private blobs are served via
short-lived **SAS URLs** rather than public containers.

## Account deletion (GDPR), out-of-band

`DELETE /api/account` purges all app data immediately (tours, blobs, user doc)
and **queues** the user's Entra directory object id in a `deletions` container.
A **scheduled GitHub Action** (`process-deletions.yml`) then deletes those users
from the External ID tenant via Graph.

Why out-of-band: deleting a directory user needs a tenant-wide
`User.ReadWrite.All` Graph credential. Keeping that **only in CI** (never in the
internet-facing Functions app) means a compromise of the web app can't delete
arbitrary users. GDPR allows the identity removal to complete shortly after (the
app data — the bulk of personal data — is already gone). The job only ever
deletes ids the API queued, and is idempotent.

## OpenTofu, reproducibly

Infrastructure is OpenTofu with remote azurerm state, so local runs and CI share
one source of truth. Globally-unique names carry a random suffix so the config
applies cleanly in any subscription. The state-backend storage account is the one
bootstrap prerequisite (it can't create itself).

## Encryption at rest

All stored data is encrypted at rest with **Microsoft-managed keys** (AES-256),
on by default and verified:

- **Blob Storage** — `keySource = Microsoft.Storage`, blob + file services encrypted.
- **Cosmos DB** — platform encryption is always on (no `keyVaultKeyUri`/CMK).

We deliberately stay on **platform-managed keys**. Customer-managed keys (CMK)
would add an Azure Key Vault (cost + operational overhead) and push past the
< €5/month target without a real threat-model benefit here. Note that
`infrastructure_encryption_enabled` (a second encryption layer) is fixed at
account creation, so it isn't retrofitted to the existing storage account; it
could be enabled on a fresh deployment if ever required.

## Dependency updates and npm audit

Dependabot opens weekly, grouped PRs for npm (`functions/`, `frontend/`,
`e2e/`), GitHub Actions and pre-commit hooks, each with a 7-day cooldown. Only
**patch updates of direct devDependencies** merge themselves
(`dependabot-auto-merge.yml`): a devDependency reaches the CI runner, a runtime
dependency (`sharp`, `jsonwebtoken`, `jwks-rsa`, `@azure/*`) reaches
production, and an action reaches the deploy credentials. Groups are split by
dependency type, because a mixed group reports as `direct:production` and would
never qualify. Every lockfile entry must resolve from the npm registry over
https with an integrity hash (lockfile-lint, pre-commit).

`npm audit` findings are handled with the smallest change that removes them:

1. An in-range lockfile update (`npm update <pkg>` or a plain `npm audit fix`)
   when the parent's semver range already allows the fixed version.
2. Otherwise a targeted `overrides` entry with a floor at the fixed version,
   and a line in the PR saying which parent pins the vulnerable one.
3. When no fix exists, the risk is written down here: package, advisory, why it
   is not reachable (e.g. dev tooling only), and when to look again.

Never `npm audit fix --force` (it jumps majors) and never a from-scratch
lockfile regeneration (it moves every transitive dependency at once).

Current overrides: `functions/` and `frontend/` pin `qs` to `^6.16.0`,
because Stryker's `typed-rest-client` pins a vulnerable `qs` exactly
(GHSA-x5fp-wj9c-mxmx, GHSA-4mjr-xmp4-gh2g). `e2e/` pins `tmp` to `0.2.7` and
`uuid` to `^14.0.2` for `@lhci/cli` (GHSA-52f5-9888-hmc6, GHSA-w5hq-g745-h8pq).

Accepted risk: `extract-zip` (GHSA-jmr9-qjv8-65gv, GHSA-7pqw-9j4j-h8q3; no
fixed release) under `@lhci/cli` → `lighthouse` → `puppeteer-core` →
`@puppeteer/browsers`. It unpacks downloaded browser archives, and Lighthouse CI
never downloads one here: it runs the Chromium Playwright installs
(`CHROME_PATH`), on a CI runner or a developer machine, never in production.
Look again when `@lhci/cli` or `lighthouse` bumps `puppeteer-core`.

## SAST rule packs

OpenGrep runs `--config auto` and `--config p/security-audit` together.
`auto` is what CollectionBuddy runs: the community rules for every language in
the tree (JavaScript, TypeScript, HCL, Bash, HTML, JSON), including the
taint rules that catch `eval(req.body)`-style injections at error severity.
`p/security-audit` is the narrower audit pack the pre-commit hook ran before;
keeping it means the switch cannot lose a rule that was already enforced. Only
error severity fails the job: the warning-level packs (i18n key formats, Azure
hardening advice) are reported for triage, and the IaC ones are owned by the
IaC scanner. Two findings were fixed on adoption (the language menu built
markup with `innerHTML`; it now uses `textContent`) and one is suppressed
inline: `applyI18n`'s `data-i18n-html` sink renders repo-owned translation
markup by design.

## IaC scan exceptions

TFLint and Trivy lint what defines production: `infrastructure/`. Every
accepted finding is listed in `.trivyignore.yaml` or `.tflint.hcl` with its
reason, instead of an inline suppression, so the list of trade-offs is one
file long:

| Finding                                | Why it is accepted                                                                                           | Lifted by |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------- |
| AZU-0012 storage network default allow | browsers load photos by SAS URL, and Flex Consumption without paid VNet integration uses the public endpoint | #556      |
| AZU-0057 storage logging               | billed per GB, read by nobody today                                                                          | #541      |
| AZU-0058 no geo-redundant replication  | LRS keeps the cost target; backup is the answer to region loss                                               | #541      |
| AZU-0060 no customer-managed key       | see "Encryption at rest": Key Vault is above the cost target                                                 | —         |
| AZU-0061 no infrastructure encryption  | fixed at account creation, not retrofitted                                                                   | —         |
| TFLint `…_missing_prevent_destroy`     | also blocks `destroy.yml`; decided together with a destroy path                                              | #543      |

The tools are installed from GitHub releases by version and SHA-256 (in
`scripts/quality/iac.sh`), not through third-party install actions: Trivy's
distribution channels were compromised once, and a hash pin is what a
repointed tag cannot move.

## Mutation scope

Mutation testing runs on an explicit list of modules (`mutation-targets.mjs`),
not on a glob: the pure logic whose behaviour unit tests can pin down, the
Function handlers (called directly with fake requests) and `frontend/src/lib/`.
Off the list: the Cosmos/Blob adapters and the multipart stream parser, which
the integration suite exercises against the emulators, and the DOM layer
`frontend/src/ui/`, which Playwright exercises; mutating those would measure
the mocks. The same list sets the 100 % per-file coverage floor, so a module
cannot be mutation-tested without being fully covered, or the reverse.

`ignoreStatic` (functions) skips mutants that only run at module load
(`app.http()` registration, top-level schema constants): handlers are
imported once per test file, so those mutants cannot be killed without
reloading the module per mutant. Break thresholds start one point below the
measured score and only move up; known equivalent mutants are listed here when
one blocks a raise.

## Property tests

Property tests are for functions whose input space is too large for examples
and whose invariant is easy to state: the GPX parser and simplifier take
arbitrary user files, and the open bug list is mostly edge cases examples
missed (#575, #548, #552, #554). The first run found three: fast-xml-parser's
internal error escaping `parseGpx` on malformed markup, `Math.min(...)`
overflowing the stack on a 150,000-point track (#575), and a test assumption
(`-0` does not survive being written into XML). The first two are fixed and
kept as example tests. Out-of-order timestamps (negative duration, #575) are
not a property yet: what the duration should be is still that issue's call.

## Cost

Everything targets the free/serverless tier (< €5/month), enforced by a budget
alert. See the [Cost report](../cost-report.md).
