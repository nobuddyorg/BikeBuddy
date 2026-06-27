# Explanation: Design decisions

The *why* behind the architecture. For *what*, see [Architecture](../reference/architecture.md).

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

## OpenTofu, reproducibly

Infrastructure is OpenTofu with remote azurerm state, so local runs and CI share
one source of truth. Globally-unique names carry a random suffix so the config
applies cleanly in any subscription. The state-backend storage account is the one
bootstrap prerequisite (it can't create itself).

## Cost

Everything targets the free/serverless tier (< €5/month), enforced by a budget
alert. See the [Cost report](../cost-report.md).
