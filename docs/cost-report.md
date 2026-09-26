# BikeBuddy — Cost Report

**Target:** < €5 / month for a personal-scale deployment (a handful of users, a
few hundred tours, light daily traffic).

**Status:** _Projected_ from the architecture and the published free grants.
Replace the projections with Azure Cost Management figures once the app has run
for a month (see [Reviewing actual costs](#reviewing-actual-costs)).

> Free grants and prices change; confirm against the
> [Azure pricing pages](https://azure.microsoft.com/en-us/pricing/) for the
> deployment region (`location`, default `northeurope`).

---

## Summary

| Resource                    | Tier / billing                   | Free grant                                   | Projected cost             |
| --------------------------- | -------------------------------- | -------------------------------------------- | -------------------------- |
| GitHub Pages (frontend)     | Free for public repositories     | 100 GB bandwidth/mo soft limit               | **€0**                     |
| Microsoft Entra External ID | Monthly active users             | 50,000 MAU/mo (core features)                | **€0**                     |
| Azure Functions             | Flex Consumption (FC1) on-demand | 250,000 executions + 100,000 GB-s/mo per sub | **€0** (within free grant) |
| Cosmos DB                   | **Serverless** (pay-per-RU)      | none, but RU/storage are tiny here           | **~€0–1**                  |
| Blob Storage                | Standard, LRS, Hot               | none                                         | **~€0–0.50**               |
| Bandwidth (egress)          | pay-per-GB                       | 100 GB/mo                                    | **€0**                     |
| **Total**                   |                                  |                                              | **≈ €0–2 / month**         |

Everything runs on free or serverless tiers, so almost every line is **€0** at
this scale. Only **Cosmos DB** and **Blob Storage** meter real usage, and both
are pennies for a personal workload. No always-ready Functions instances are
configured, so nothing is billed while idle.

---

## Per-resource detail

### GitHub Pages — €0

Serves the static frontend (`frontend/src/`) from the repository. The browser
calls the Functions app directly; nothing proxies `/api` in production.

### Microsoft Entra External ID — €0

The core offering is free for the first **50,000 monthly active users**. A
personal app stays far below; no premium add-ons are used.

### Azure Functions — €0 (Flex Consumption)

The on-demand meters include a monthly free grant of **250,000 executions** and
**100,000 GB-seconds** per subscription. Each API call is one short execution;
light use is a few thousand executions a month. Cold starts are acceptable for
this app. The plan and instance memory are set in `infrastructure/functions.tf`,
and `maximum_instance_count` caps the scale-out at 10 instances (#549): the hard
ceiling on what a burst of traffic can cost per hour.

### Cosmos DB — ~€0–1 (Serverless)

Serverless bills per **Request Unit (RU)** consumed plus storage.

- **Point reads** (id + partition key) cost ~1 RU: `GET /api/v1/tours/{tourId}`,
  the profile, every ownership check.
- **Writes** cost ~5–10 RU per document depending on size.
- **`GET /api/v1/tours`** is a single-partition query (partition key `/userId`)
  and never returns `heatmapData`, the cheapest shape.
- Every user-scoped query runs with a page size (`MAX_ITEMS_PER_REQUEST` in
  `functions/src/lib/db.js`), so one round trip stays bounded however many
  tours a user has. `ORDER BY c.createdAt` uses the range index from `/*`.
- The `tours` index policy in `infrastructure/cosmos.tf` excludes
  `/heatmapData/*` and `/images/*`: they are only ever read by id, and indexing
  them would inflate write RU and storage.
  `functions/scripts/init-cosmos.js` creates the same policy for the local
  emulator, whose vnext-preview build does not fully honour custom index
  policies, so the effect is only measurable on real Cosmos DB.

At a few hundred tours and light traffic this stays well under €1. Per-request
RU is measured, not guessed: see [load testing](how-to/load-testing.md) and the
query-cost guard in the integration suite.

### Blob Storage — ~€0–0.50 (LRS, Hot)

Two data containers: `gpx-files` and `tour-images` (plus `deployments` for the
Functions package). Images are resized to ≤ 2000 px JPEG before storage, and
originals are never kept, so a few hundred photos and GPX files come to a few
hundred MB. They are served through short-lived SAS URLs, never a public
container. Soft delete and versioning (#541) bill deleted and
overwritten blobs at the same rate for their 14 days; the blobs are written
once, so that is a small multiple of what users delete. Cosmos continuous
backup at the 7-day tier carries no backup-storage charge.

### Monitoring — ~€0–1

`infrastructure/monitoring.tf` (#547) sends the Functions host's requests,
failures and console output to workspace-based Application Insights. Both the
Log Analytics workspace and Application Insights cap ingestion at 0.1 GB a
day, which stays inside the workspace's free monthly ingestion. What costs a
little:

- the availability test on `/api/v1/health`: every 15 minutes from one region,
  about 2,900 runs a month;
- two metric alerts (API down, failed requests);
- one log alert on token failures, evaluated every 15 minutes.

Check the first month's bill for these meters.

### Bandwidth (egress) — €0

Azure includes **100 GB/mo** outbound free. Small JSON payloads and a few
resized images stay far below this.

---

## Cost surprises & mitigations

| Risk                                                            | Status    | Mitigation                                                    |
| --------------------------------------------------------------- | --------- | ------------------------------------------------------------- |
| Cosmos indexes `heatmapData`/`images` → high write RU + storage | **Fixed** | Index policy excludes them (`infrastructure/cosmos.tf`)       |
| Provisioned Cosmos throughput billed 24/7                       | Avoided   | Serverless only                                               |
| Storing original full-size images                               | Avoided   | `sharp` resize to ≤ 2000 px before upload                     |
| Returning `heatmapData` in the tour list → RU + egress          | Avoided   | List omits it; detail and the budgeted map endpoint return it |
| Public blob containers / unbounded reads                        | Avoided   | Private containers + short-lived SAS URLs                     |
| One self-registered account driving unbounded volume            | **Fixed** | 1,000 tours / 5 GB per rider, 100 uploads/hour (#549)         |
| GRS replication (2× storage cost)                               | Avoided   | LRS                                                           |

---

## Budget alert

`infrastructure/budget.tf` creates a monthly consumption budget on the resource
group (`budget_amount`, default 5) and mails `budget_contact_email` when the
**forecast** reaches 80 % and when **actual** spend reaches 100 %. At 100 %
actual it also **stops the Function App** through an action group and a Logic
App (#549), once an Owner has granted that Logic App its role. It is applied
with the rest of the infrastructure on every deploy; see
[Infrastructure](how-to/infrastructure.md#budget).

---

## Reviewing actual costs

After ~1 month of real usage:

1. **Cost Management → Cost analysis**, scope to the resource group, group by
   **Service**: confirm Cosmos DB and Storage dominate and the total < €5.
2. **Cosmos DB → Metrics**: check **Total Request Units** and **Data Usage**;
   an RU spike usually means an indexing or cross-partition-query regression.
3. **Storage account → Metrics**: check **Used capacity** and **Transactions**.
4. **Function App → Metrics**: confirm executions and GB-seconds stay within
   the free grant.
5. Replace the projected figures above with the real numbers.
