# Explanation: Design decisions

The _why_ behind the architecture. For _what_, see [Architecture](../reference/architecture.md).

## No frontend framework

Plain HTML/CSS/JS keeps the site truly static (no build pipeline) and trivially
hostable on GitHub Pages. Leaflet loads from a CDN; MSAL is **vendored** in
`frontend/vendor/` because loading it cross-origin from a CDN was blocked by the
browser (ORB) on GitHub Pages.

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

## Cost

Everything targets the free/serverless tier (< €5/month), enforced by a budget
alert. See the [Cost report](../cost-report.md).
