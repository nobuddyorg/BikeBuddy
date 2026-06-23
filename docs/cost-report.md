# BikeBuddy — Cost Report

**Target:** < €5 / month for a personal-scale deployment (a handful of users, a
few hundred tours, light daily traffic).

**Status:** *Projected* analysis based on the architecture and Azure pricing.
Replace the projected figures with real numbers from Azure Cost Management once
the app has run for a month (see [Reviewing actual costs](#reviewing-actual-costs)).

> Pricing below uses West Europe list prices and free grants as of 2026. Always
> confirm against the [Azure Pricing Calculator](https://azure.com/e/) — grants
> and prices change.

---

## Summary

| Resource | Tier / billing | Free grant | Projected cost |
| -------- | -------------- | ---------- | -------------- |
| Static Web App | **Free** | Unlimited apps, 100 GB bandwidth/mo | **€0** |
| Azure AD B2C | **Free** | 50,000 MAU/mo | **€0** |
| Azure Functions | Consumption (pay-per-use) | 1M executions + 400,000 GB-s/mo | **€0** (within free grant) |
| Cosmos DB | **Serverless** (pay-per-RU) | none, but RU/storage are tiny here | **~€0–1** |
| Blob Storage | Standard, LRS, Hot | none | **~€0–0.50** |
| Application Insights | Pay-per-GB ingested | 5 GB/mo | **€0** (sampling on) |
| Bandwidth (egress) | pay-per-GB | 100 GB/mo | **€0** |
| **Total** | | | **≈ €0–2 / month** |

The architecture is deliberately built on free / serverless tiers, so almost
everything is **€0** at this scale. The only metered services that can accrue
real charges are **Cosmos DB** and **Blob Storage**, and both are pennies for a
personal workload.

---

## Per-resource detail

### Static Web App — €0

Free tier hosts the frontend (static HTML/CSS/JS) and proxies `/api` to the
Functions app. Includes 100 GB/mo bandwidth and free SSL. No paid SKU is used.

### Azure AD B2C — €0

Free up to **50,000 monthly active users**. A personal app is nowhere near this.

### Azure Functions — €0 (Consumption)

The Consumption plan's monthly free grant is **1,000,000 executions** and
**400,000 GB-seconds**. Each tour upload/list/detail/edit/delete and image
upload is a short execution; light usage is a few thousand executions/month —
~0.1–0.5% of the free grant. Cold starts are acceptable for this use case.

### Cosmos DB — ~€0–1 (Serverless)

Serverless bills per **Request Unit (RU)** consumed plus storage (~€0.25/GB/mo).

- **Reads** (point reads by id + partition key) cost ~1 RU each — used by
  `GET /api/tours/{id}`, profile, ownership checks.
- **Writes** cost ~5–10 RU per document depending on size.
- **`GET /api/tours`** is a single-partition query (partition key `/userId`),
  the cheapest query shape.
- `heatmapData` is **not returned** in the list endpoint, keeping payloads (and
  RU) small.

At a few hundred tours and light traffic this is well under 1 €.

**Mitigated cost risk — indexing.** By default Cosmos indexes *every* field,
including the large `heatmapData` (up to 5,000 points) and `images` arrays,
which inflates write RU and storage. The `tours` container now ships a custom
index policy that **excludes `/heatmapData/*` and `/images/*`** (see
`functions/scripts/init-cosmos.js`). These arrays are never queried, only read
by id, so excluding them is free of downside.

> Caveat: the local vnext-preview emulator does not fully implement custom
> index policies (it returns empty `excludedPaths`), so this can only be
> confirmed on real Cosmos DB. `createIfNotExists` also does **not** update an
> existing container's policy — recreate the container (or `container.replace`)
> to apply it to one that already exists.

Other guards already in place: Serverless capacity (never provisioned
throughput), GPX downsampled to ≤ 5,000 points, documents kept under the 2 MB
limit.

### Blob Storage — ~€0–0.50 (LRS, Hot)

Two containers: `gpx-files` and `tour-images`. LRS Hot storage is ~€0.018/GB/mo;
operations are ~€0.004 per 10,000. Images are **resized to ≤ 2000px JPEG**
before storage (originals never kept), so a few hundred photos + GPX files is a
few hundred MB — cents per month. Served via short-lived **SAS URLs**, not a
public container.

### Application Insights — €0 (watch item)

The Functions host has Application Insights enabled with **request sampling on**
(`functions/host.json`). The first **5 GB/mo** of ingestion is free. Sampling
keeps a light app comfortably under that. If telemetry ever grows, set a daily
cap on the Application Insights resource or reduce sampling further.

### Bandwidth (egress) — €0

Azure includes **100 GB/mo** outbound free. Serving a static frontend, small
JSON payloads, and a few resized images stays far below this.

---

## Cost surprises & mitigations

| Risk | Status | Mitigation |
| ---- | ------ | ---------- |
| Cosmos indexes `heatmapData`/`images` → high write RU + storage | **Fixed** | Custom index policy excludes them (`init-cosmos.js`) |
| Provisioned Cosmos throughput billed 24/7 | Avoided | Serverless only |
| Storing original full-size images | Avoided | `sharp` resize to ≤ 2000px before upload |
| Returning `heatmapData` in list view → RU + egress | Avoided | List endpoint omits it; fetched only in detail |
| Public blob containers / unbounded reads | Avoided | Private containers + short-lived SAS URLs |
| App Insights ingestion over 5 GB | Watch | Sampling on; add a daily cap if needed |
| GRS replication (2× storage cost) | Avoided | LRS |

---

## Set a budget alert (€5)

A budget alert can't be created from this repo — it's an Azure subscription
action. After deployment, run (Azure CLI) or use **Cost Management → Budgets**
in the portal:

```bash
az consumption budget create \
  --budget-name bikebuddy-monthly \
  --amount 5 \
  --category Cost \
  --time-grain Monthly \
  --start-date "$(date +%Y-%m-01)" \
  --end-date 2030-12-31 \
  --resource-group <your-rg> \
  --notifications '{
    "actual80": { "enabled": true, "operator": "GreaterThanOrEqualTo", "threshold": 80, "contactEmails": ["<your-email>"] },
    "actual100": { "enabled": true, "operator": "GreaterThanOrEqualTo", "threshold": 100, "contactEmails": ["<your-email>"] }
  }'
```

This emails at 80% (€4) and 100% (€5) of the monthly budget.

---

## Reviewing actual costs

After ~1 month of real usage:

1. **Cost Management → Cost analysis**, scope to the resource group, group by
   **Service** — confirm Cosmos DB and Storage dominate and the total < €5.
2. **Cosmos DB → Metrics** — check **Total Request Units** and **Data Usage**;
   watch for unexpected RU spikes (often an indexing or cross-partition-query
   regression).
3. **Storage account → Metrics** — check **Used capacity** and **Transactions**.
4. **Functions → Metrics** — confirm executions and GB-seconds stay within the
   free grant.
5. Update the projected figures in the table above with the real numbers.
