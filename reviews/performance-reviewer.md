# Performance review: performance-reviewer

Raw findings from the **performance-reviewer** role of the 2026-09-24 five-lens review of BikeBuddy (`main` at `b0bde68`). It ran two passes: a first pass over the whole repo, then an independent second pass that looked for missed issues (IDs `PERF-Gnn`) and disputed first-pass claims. Vendored code (`frontend/src/vendor/`), lockfiles and generated output were out of scope.

Severity scale (shared by all reviewers): **critical**: exploitable now, severe; **high**: serious and plausible in production; **medium**: real defect, limited blast radius; **low**: hardening or minor; **info**: observation.

The findings below are the reviewer's own claims, as returned. The _Verification_ lines come from the adversarial verifiers: two independent lenses (code truth, impact) for every critical/high finding, and one skeptical batch check for medium/low. The lead's final, deduplicated severities are in [`REVIEW.md`](../REVIEW.md).

## Summary

The backend is built sensibly for a small app. Every Cosmos access stays inside one user partition, uses point reads for ownership checks and projects its fields. Clients are created once per instance, SAS URLs are signed locally, uploads are streamed with a size limit, and the sharp image pipeline is cheap: 12 MP JPEG in about 250 ms, and a 90 MP PNG adds only about 73 MB of memory. The main performance problem is GET /api/map. MAX\_GAP\_METERS=50 forces at least one point per 50 m of track, so the 100k-point budget is not actually enforced. I measured 200 tours × 60 km: 13 s of blocking CPU and 322k points (7 MB JSON). 1000 tours: 75 s and 45 MB. The gap rule exists only for a heat layer that the frontend no longer has. On top of that, every call re-reads all heatmapData from Cosmos, and any single upload or delete throws away the whole per-user cache. A client upload also triggers a full map refetch. Cost is capped only by a 40×2 GB instance ceiling and a budget that only sends alerts. Other defects: parseGpx throws a stack-overflow RangeError on valid GPX files under the 10 MB limit with more than about 130k elevation points. Three frontend commits shipped without bumping the service worker cache version, so returning PWA users run stale JS and CSS against a fresh index.html. Remaining items are low: payload precision, SAS/HTTP caching, cache sizing, rendering, observability and doc drift.

## Strengths noted

- All user-scoped Cosmos queries pass partitionKey=userId with maxItemCount (functions/src/lib/db.js:31-38), so no cross-partition fan-out; ownership checks are point reads by id+partition key (lib/ownedTour.js:18).
- Explicit projections: GetTours selects only list fields (GetTours/index.js:17-18), GetMapData only id/heatmapData/images, DeleteAccount only c.id.
- heatmapData and images are excluded from indexing consistently in both infrastructure/cosmos.tf:75-76 and functions/scripts/init-cosmos.js:29.
- CosmosClient and BlobServiceClient are module-level singletons (db.js:5-9, blobStorage.js:17-22); JWKS client is cached with cache+rateLimit and OIDC metadata is cached for 1 h (authMiddleware.js:21-42).
- SAS URLs are signed locally with the account key (no per-request user-delegation-key round trip), and image+thumb SAS are generated in parallel.
- parseMultipart streams through busboy with a streaming fileSize limit instead of arrayBuffer() (parseMultipart.js:37-90).
- The image pipeline is cheap and bounded. limitInputPixels=100M; full size and thumbnail are produced in parallel with EXIF read. Measured: 12 MP JPEG full+thumb+gps in about 245 ms; 90 MP PNG peak RSS delta 73 MB.
- Real 320px thumbnails are used for gallery tiles (loading=lazy) and map pins; full image only in the lightbox.
- Photo append uses an atomic Cosmos patch ('/images/-'); EditTour patches only changed fields; DeleteImage uses an ETag-guarded retry.
- GPX is downsampled to ≤5,000 points, so documents stay about 100-190 KB, far under the 2 MB limit.
- Frontend: /api/map and /api/tours are fired in parallel (sidebar.js:45); moveend and search re-renders are debounced 200 ms; the list is paginated at 10 rows; pin markers are reused across zooms; uploads use a concurrency pool of 3.
- The service worker precache is a fixed list with old caches deleted on activate (no runtime cache growth); map tiles and the API are never cached; fonts use font-display: swap; vendor scripts are deferred.

## Findings overview

Reviewer-assigned counts: 0 critical, 1 high, 5 medium, 19 low, 2 info.

| ID       | Reviewer severity | Title                                                                                                                                                                             | Location                                  | Verification                                                                   |
| -------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------ |
| PERF-01  | high              | GetMapData point budget is not enforced: the 50 m gap rule makes /api/map cost scale with total km ridden (13-75 s blocking CPU, 7-45 MB responses)                               | `functions/src/GetMapData/index.js:27`    | code-truth: partially-confirmed → medium; impact: partially-confirmed → medium |
| PERF-02  | medium            | Every /api/map call reads all heatmapData from Cosmos; one tour change invalidates the whole-user cache, and each upload refetches the full map                                   | `functions/src/GetMapData/index.js:61`    | partially-confirmed → low                                                      |
| PERF-03  | medium            | Cost ceiling is 40 × 2 GB Flex instances with no per-user limits; the budget only sends alerts                                                                                    | `infrastructure/functions.tf:26`          | confirmed → medium                                                             |
| PERF-04  | medium            | parseGpx rejects valid GPX files under 10 MB with more than about 130k elevation points (Math.min spread overflows the stack)                                                     | `functions/src/lib/parseGpx.js:49`        | partially-confirmed → low                                                      |
| PERF-05  | medium            | Cache-first service worker relies on a manual CACHE\_NAME bump that has already been missed; returning users run stale JS/CSS against a fresh index.html                          | `frontend/src/sw.js:10`                   | confirmed → medium                                                             |
| PERF-G01 | medium            | DeleteTour never deletes the tour's photo blobs (full + thumbnail); they stay in storage until the whole account is deleted                                                       | `functions/src/DeleteTour/index.js:29`    | confirmed → medium                                                             |
| PERF-06  | low               | parseGpx builds the full XML object tree plus three intermediate arrays synchronously: about 1.8 s CPU and about 150 MB heap per 10 MB upload                                     | `functions/src/lib/parseGpx.js:136`       | confirmed → low                                                                |
| PERF-07  | low               | heatmapData is stored and served at full source coordinate precision, doubling doc size and every map/detail payload                                                              | `functions/src/lib/parseGpx.js:152`       | confirmed → low                                                                |
| PERF-08  | low               | SAS URLs are minted with a sliding expiry on every response and blobs have no Cache-Control, so browsers re-download images on every refresh                                      | `functions/src/lib/blobStorage.js:12`     | confirmed → low                                                                |
| PERF-09  | low               | heatmapCache is bounded by entry count (500), not by bytes                                                                                                                        | `functions/src/lib/heatmapCache.js:3`     | confirmed → low                                                                |
| PERF-10  | low               | Large JSON responses (/api/map, /api/me/export, /api/tours/{id}) are sent uncompressed                                                                                            | `functions/src/GetMapData/index.js:88`    | confirmed → low                                                                |
| PERF-11  | low               | EditTour does an unnecessary full-document pre-read and returns the full heatmapData in the PATCH response, which the client ignores                                              | `functions/src/EditTour/index.js:48`      | confirmed → low                                                                |
| PERF-12  | low               | ExportData builds every full tour document into one in-memory JSON response                                                                                                       | `functions/src/ExportData/index.js:21`    | confirmed → low                                                                |
| PERF-13  | low               | DeleteAccount fans out every tour delete and every blob delete at once with no concurrency limit                                                                                  | `functions/src/DeleteAccount/index.js:47` | confirmed → low                                                                |
| PERF-14  | low               | Map rendering uses Leaflet's default SVG renderer and rebuilds every polyline on each renderAllRoutes; the in-view filter scans every point on each moveend                       | `frontend/src/ui/routes.js:25`            | confirmed → low                                                                |
| PERF-15  | low               | containerOnce caches a rejected createIfNotExists promise for the life of the instance, and provisions a container name that differs from Terraform's                             | `functions/src/lib/blobStorage.js:27`     | confirmed → low                                                                |
| PERF-16  | low               | No Application Insights is provisioned, so there is no production latency, dependency or RU telemetry; host.json sampling settings are inert                                      | `functions/host.json:4`                   | confirmed → medium                                                             |
| PERF-17  | low               | Non-English locales fetch the English and target locale files one after the other before auth and API calls start                                                                 | `frontend/src/lib/i18n.js:106`            | confirmed → low                                                                |
| PERF-G02 | low               | ensureMapData has no in-flight de-duplication, so overlapping renders each fire a full /api/map                                                                                   | `frontend/src/lib/mapData.js:17`          | confirmed → low                                                                |
| PERF-G03 | low               | On mobile, every app open fetches /api/map although the list-first layout keeps the map display:none                                                                              | `frontend/src/ui/sidebar.js:45`           | confirmed → low                                                                |
| PERF-G04 | low               | Photo pins: every geotagged photo in every tour gets a marker and an eagerly loaded thumbnail, regrouped O(n^2) on every zoomend                                                  | `frontend/src/ui/pins.js:95`              | confirmed → low                                                                |
| PERF-G05 | low               | Tour-scoped photo and delete operations move the whole ~120 KB document: full point reads for ownership checks and a full-document replace to drop one image                      | `functions/src/DeleteImage/index.js:44`   | confirmed → low                                                                |
| PERF-G06 | low               | A server-saved language that differs from the browser's triggers a full page reload after /api/tours and /api/map were already issued; language switching also reloads everything | `frontend/src/ui/auth.js:58`              | confirmed → low                                                                |
| PERF-G07 | low               | Photos are uploaded as full-size originals (up to 10 MB each, 20 per batch) only to be downscaled to 2000 px on the server                                                        | `frontend/src/ui/images.js:429`           | partially-confirmed → low                                                      |
| PERF-G08 | low               | Content-Length shortcut rejects files just under or at the 10 MB limit, contradicting the busboy +1 logic and the frontend check                                                  | `functions/src/lib/parseMultipart.js:33`  | confirmed → low                                                                |
| PERF-18  | info              | cost-report.md describes a different architecture (Static Web App, Azure AD B2C, classic Consumption grant, no budget in code)                                                    | `docs/cost-report.md:20`                  | not verified (info)                                                            |
| PERF-G09 | info              | Cold start: every function's dependencies are loaded eagerly (about 0.7 s of require time measured) and no always-ready instances are configured                                  | `functions/package.json:5`                | not verified (info)                                                            |

## Findings

### PERF-01: GetMapData point budget is not enforced: the 50 m gap rule makes /api/map cost scale with total km ridden (13-75 s blocking CPU, 7-45 MB responses)

- **Severity (reviewer):** high
- **Category:** scalability · **Effort:** M · **Confidence:** high
- **Location:** `functions/src/GetMapData/index.js:27`
- **Also:** `functions/src/lib/simplify.js:50`, `functions/src/lib/simplify.js:64`, `functions/src/GetMapData/index.js:116`, `functions/src/GetMapData/index.test.js:112`, `frontend/src/ui/routes.js:25`, `docs/reference/architecture.md:5`

**Evidence:**

```text
const MAX_GAP_METERS = 50;
```

**Description.** budgetHeatmapData passes maxGapMeters=50 into simplifyToTarget/douglasPeucker. There, a segment is never collapsed while its endpoints are more than 50 m apart (simplify.js:50), so each tour keeps at least length/50 m points whatever the target. For tours whose 5,000 stored points are more than about 25 m apart (any tour over about 125 km), no point can be dropped at all. TOTAL\_POINT\_BUDGET=100000 therefore bounds nothing. Meanwhile simplifyToTarget runs 13 full recursive, slice-copying Douglas-Peucker passes per tour, synchronously on the event loop. The gap rule exists 'because a heat layer draws a dot per point' (per heatmapZoom.js), but the frontend has no heat layer: it draws L.polyline per tour (ui/routes.js:25), and neither heatmapZoom.js nor Leaflet.heat exists, although docs/reference/architecture.md still lists Leaflet.heat. The unit test only uses two 300-point, 2 km tracks, so the failure never appears in tests. Measured (budgetHeatmapData, random-walk tracks): 200 tours × 60 km took 13.0 s CPU and gave 321,656 points (3.2× budget), 7.0 MB JSON. 200 × 150 km: 17.0 s, 1,000,000 points (zero reduction), 21.8 MB. 1000 × 80 km: 75.3 s, 2.08 M points, 45.2 MB.

**Impact.** A keen rider (about 150 tours a year) reaches the 200-tour case within about 1-2 years. Each cache miss then blocks the worker's event loop for 13 s or more, delaying every other request on that instance. Cache misses happen on a cold instance, a scale-out, and after every upload or delete. The browser then downloads multi-MB uncompressed JSON (egress and mobile data) and draws hundreds of thousands of SVG polyline points. Cost (GB-s, egress) and latency grow without bound with the user's history.

**Recommendation.** Drop the gap constraint for polyline rendering (maxGapMeters=Infinity) and enforce the budget as a hard cap: after DP, uniformly decimate any tour still over its share. Better still, compute a per-tour 'overview' track once at upload time (fixed epsilon of about 10-25 m, coordinates rounded to 5 decimals) and store it as its own field or document. /api/map then does no DP at request time. Add a unit test with realistic fixtures (for example 200 tours × 100 km) asserting total points ≤ budget and runtime under a threshold. Update architecture.md and the GetMapData comments, which still describe a heat layer.

**Verification (two adversarial lenses):**

- _code-truth_: **partially-confirmed**, severity → **medium**, reachable in production: yes.
- _impact_: **partially-confirmed**, severity → **medium**, reachable in production: yes.

<details><summary>code-truth verifier: reasoning, evidence and reproduction</summary>

The core claim holds. With maxGapMeters=50, DP never collapses a span whose endpoints are more than 50 m apart. Each tour therefore keeps at least about length/50 points. A tour stored at the 5,000-point cap with spacing over about 25 m (roughly 125 km or more) can't be reduced at all, so TOTAL\_POINT\_BUDGET is not a hard cap. The code's own comment at simplify.js:62-63 admits this. The gap rule's rationale ("a heat layer draws a dot per point", "see heatmapZoom.js") is stale: the frontend draws L.polyline per tour, and neither heatmapZoom.js nor Leaflet.heat exists. The architecture doc drift is real. The simplification runs synchronously on the event loop, and the only mitigation is a per-instance, per-user memo that is invalidated by any tour-set change, cold start or scale-out.

Corrections to scope and severity:
(1) "TOTAL\_POINT\_BUDGET bounds nothing" is overstated. For 60 km tours the output still drops from 1M to about 323k points. Zero reduction happens only for long tours.
(2) Most of the CPU cost comes from the 13-pass binary-search DP with slice copying, not from the gap rule. With maxGapMeters=Infinity the 200 × 60 km case still took 8.0 s (versus 12.7 s). So the reviewer's first recommendation (drop the gap rule) fixes response size but not latency. Precomputing an overview track at upload is the real fix.
(3) Blast radius: only users with hundreds of long tours hit multi-second stalls. Flex's default timeout is not hit. On a small hobby user base the realistic effect is a slow map load for a power user after each upload, plus head-of-line blocking for other requests on the same instance, which Flex can scale out around. That is degraded latency and response size for heavy users, not an outage or runaway cost for the service. Under the shared rubric this is "real defect with limited blast radius or needing unusual conditions", which is medium, not high.
(4) The test gap is real: the fixture is two 300-point tracks of about 2 km.

Evidence:

```text
functions/src/GetMapData/index.js:27 "const MAX_GAP_METERS = 50;" and :39 "return simplifyToTarget(points, target, maxGapMeters);" (called synchronously inside heatmapCache.getOrCompute at :68-70).
functions/src/lib/simplify.js:50 "if (!needsSplit && distanceMeters(first, last) <= maxGapMeters) return [first, last];"; :52 "const splitIndex = needsSplit ? index : Math.floor(points.length / 2);"; :53-54 recursive "points.slice(...)"; :62-63 comment admits "`maxGapMeters` can make the result exceed `targetCount` on long straight tracks — gap constraint wins over exact budget adherence."; :64 "maxIterations = 12" plus the initial pass at :69, so 13 DP passes per tour.
functions/src/lib/parseGpx.js:5 "const MAX_POINTS = 5000;" (per-tour cap, so point spacing grows with tour length).
functions/src/lib/heatmapCache.js:10 "return tours.map((tour) => `${tour.id}:${tour.heatmapData?.length || 0}`).join('|');". The cache is in-memory per instance and keyed on the tour-set signature, so every upload or delete, cold start or scale-out recomputes.
frontend/src/ui/routes.js:25 ".map((pts) => L.polyline(pts, { ...state.lineStyle, interactive: false }));". The client draws polylines, not a heat layer. No heatmapZoom.* file exists anywhere in the repo, and frontend/src/vendor contains only fonts, leaflet and msal-browser.min.js (no Leaflet.heat). docs/reference/architecture.md:5 still says "Leaflet + Leaflet.heat + MSAL".
functions/src/GetMapData/index.test.js:112-119: the only budget test uses two 300-point straight lines (0.0001° spacing, about 2.2 km).
functions/host.json sets no functionTimeout and no compression. infrastructure/functions.tf:25-26: "instance_memory_in_mb  = 2048", "maximum_instance_count = 40".
```

Reproduction:

```text
I wrote /tmp/claude-0/-home-user-BikeBuddy/ba198852-09c2-5d10-a6cd-4f788c2502d9/scratchpad/perf01v/run.js. It require()s the real functions/src/GetMapData/index.js and calls budgetHeatmapData(tours, 100000, 50) and then again with Infinity. The input is smooth, road-like synthetic tracks (slowly varying heading, 5,000 points each, 6-decimal coordinates). I ran it from functions/ with node. Output (after the @azure/functions test-mode warnings):
20 tours x 60km (5000 pts): gap50 0ms 100000 pts 2.2MB | gapInf 0ms 100000 pts
50 tours x 60km (5000 pts): gap50 3253ms 93875 pts 2.0MB | gapInf 2104ms 76753 pts
200 tours x 60km (5000 pts): gap50 12723ms 322847 pts 7.0MB | gapInf 8026ms 96786 pts
200 tours x 150km (5000 pts): gap50 16775ms 1000000 pts 21.8MB | gapInf 8929ms 98608 pts
100 tours x 40km (3000 pts): gap50 3869ms 124198 pts 2.7MB | gapInf 2404ms 86522 pts
These match the reviewer's numbers: 13.0 s / 321,656 points / 7.0 MB, and 17.0 s / 1,000,000 points / 21.8 MB. They also show that removing the gap rule restores the budget but still leaves 2-9 s of synchronous CPU. I did not run the 1000-tour case.
```

</details>

<details><summary>impact verifier: reasoning, evidence and reproduction</summary>

The facts hold. The 50 m gap rule lets the 100k budget be exceeded without limit, and the frontend's polyline rendering no longer needs that rule. The doc and comment drift (heat layer, Leaflet.heat) is real. The DP runs synchronously on the event loop, 13 passes per tour.

The finding overstates severity. It needs one user with an unusually large history: 200+ tours of at least about 60 km, each recorded densely enough to keep about 5,000 points. That is plausible for a very keen rider after 1-2 years, but nothing shows such a user exists today in this small hobby deployment. The blast radius is mostly that user: their map loads slowly and the response is several MB.

The cost is paid only on a cache miss (cold instance, scale-out, or after an upload or delete by that user). Repeat loads on a warm instance hit the per-user memo. Other users are affected only if their request lands on the same instance during the 13-17 s block, and Flex scale-out (up to 40 instances) softens this. Money cost is negligible: about 13-17 s on a 2 GB instance is about 26-34 GB-s per miss. That is not "runaway cost" or an "outage". Even at 1000 tours the run stays well under the roughly 230 s HTTP front-end limit.

A malicious authenticated user could upload many long synthetic tracks (there is no tour-count limit) to inflate their own /api/map cost and cause intermittent stalls for co-located requests. That is a nuisance, limited by the cache and scale-out, not a realistic outage path. Note too that the budget branch only applies above 100k points; even the "bounded" case returns about 2 MB uncompressed.

Under the shared rubric this is a real defect: the documented budget is not enforced, it is untested with realistic fixtures, and the docs have drifted. The blast radius is limited and it needs heavy-user scale, so it is medium, not high. The recommended fix (drop the gap constraint for polylines, hard-cap per-tour share, or precompute an overview at upload) is sound.

Evidence:

```text
functions/src/GetMapData/index.js:27 "const MAX_GAP_METERS = 50;" and :21 "const TOTAL_POINT_BUDGET = 100000;" (the comment at :17-20 says the budget keeps "the response ... bounded regardless of tour count"). functions/src/lib/simplify.js:50 "if (!needsSplit && distanceMeters(first, last) <= maxGapMeters) return [first, last];" means a segment is always split while its endpoints are more than 50 m apart. simplify.js:61-63 admits this: "`maxGapMeters` can make the result exceed `targetCount` on long straight tracks — gap constraint wins over exact budget adherence." simplify.js:64-80 runs 1 + 12 full DP passes per tour. functions/src/lib/parseGpx.js:5 "const MAX_POINTS = 5000;" caps each tour, but there is no cap on the number of tours per user (grep of UploadTour and lib finds no tour-count or rate limit). functions/src/lib/heatmapCache.js:10 keys the cache on "`${tour.id}:${tour.heatmapData?.length || 0}`", so every upload or delete, and every cold or new instance, recomputes. frontend/src/ui/routes.js:25 ".map((pts) => L.polyline(pts, ...))": the frontend draws polylines and has no heat layer, so the reason for the gap rule no longer holds. docs/reference/architecture.md:5,17 still list "Leaflet.heat". infrastructure/functions.tf:25-26 "instance_memory_in_mb = 2048" and "maximum_instance_count = 40": scale-out limits cross-user impact.
```

Reproduction:

```text
Ran /tmp/claude-0/-home-user-BikeBuddy/ba198852-09c2-5d10-a6cd-4f788c2502d9/scratchpad/perf01v/t.js. It require()s budgetHeatmapData from functions/src/GetMapData/index.js and uses smooth, road-like synthetic tracks (the heading drifts ±0.075 rad per step, 5,000 points per tour, rather than the reviewer's random walk). Budget 100000; the run compared gap=50 with gap=Infinity. Output:
"50 tours x 60 km: 3316 ms, 93777 pts, 2.0 MB; without gap: 76579"
"200 tours x 60 km: 12862 ms, 322170 pts, 7.0 MB; without gap: 97110"
"200 tours x 150 km: 16814 ms, 1000000 pts, 21.7 MB; without gap: 98503"
This confirms the reviewer's numbers. The 50 m gap rule causes the budget overrun (with gap=Infinity the budget holds at about 97-98k), and the synchronous CPU time is 13-17 s per cache miss at 200 tours.
```

</details>

Lead re-verified: **confirmed, downgraded to medium**. `simplify.js:50` never collapses a span longer than `maxGapMeters`, and the frontend draws polylines with no heat layer. Measured: 100 tours of 150 km each took 17.4 s of synchronous CPU and returned 500,000 points (5x the 100k budget), about 10 MB. The cost is paid only on a per-user cache miss, and only by users with a large history of long tours.

### PERF-02: Every /api/map call reads all heatmapData from Cosmos; one tour change invalidates the whole-user cache, and each upload refetches the full map

- **Severity (reviewer):** medium
- **Category:** caching · **Effort:** M · **Confidence:** high
- **Location:** `functions/src/GetMapData/index.js:61`
- **Also:** `functions/src/lib/heatmapCache.js:10`, `frontend/src/ui/upload-modal.js:95`, `frontend/src/ui/sidebar.js:45`, `frontend/src/lib/mapData.js:12`

**Evidence:**

```text
'SELECT c.id, c.heatmapData, c.images FROM c WHERE c.userId = @userId',
```

**Description.** The heatmapCache only skips the simplify step. Its signature is id:heatmapData.length for every tour (heatmapCache.js:10), so the handler must still load every tour's full point array (about 100-190 KB per tour) from Cosmos on every request, cache hit or not. Adding or deleting any single tour changes the signature and throws away the whole user's result, forcing a full re-simplification of all tours (see PERF-01 timings). On the client, submitUpload calls loadTours() (upload-modal.js:95), which replaces state.tours with objects lacking heatmapData. ensureMapData then treats every tour as missing and consumes a fresh full /api/map. So each GPX upload costs a full Cosmos read, a full server recompute and a full payload download.

**Impact.** RU and function memory per map load grow linearly with tour count: about 22 MB of documents read per call at 200 tours, about 109 MB at 1000 (measured synthetic doc sizes). Each upload by a heavy user triggers the slowest path end to end. On Cosmos Serverless this is recurring RU burn for data the instance already has in memory.

**Recommendation.** Store a small per-tour version or pointCount field (or use \_etag) and build the signature from 'SELECT c.id, c.\_etag FROM c WHERE c.userId=@userId'. Read heatmapData only for tours that changed, and cache simplified tracks per tour instead of per user (or use the stored overview track from PERF-01). Add an ETag/If-None-Match to /api/map so unchanged maps return 304. On the client, after an upload, insert the new tour and fetch only /api/tours/{id} instead of calling loadTours().

**Verification.** partially-confirmed, severity → low. Server side is accurate: GetMapData/index.js:61 selects c.heatmapData for every tour on every call, and the heatmapCache (heatmapCache.js:10,25) only skips simplification, keyed on a whole-user id:length signature. The client mechanism is misdescribed, though: loadTours() always fires apiFetch('/api/map') itself (sidebar.js:45). ensureMapData does not detect missing data. The 'RU burn' is also small: reads cost roughly 1 RU per 10 KB beyond the first KB, so about 2-3k RU per 22 MB call, fractions of a cent. The real cost is latency for heavy users, and PERF-01 already carries the CPU cost, so low.

### PERF-03: Cost ceiling is 40 × 2 GB Flex instances with no per-user limits; the budget only sends alerts

- **Severity (reviewer):** medium
- **Category:** cost · **Effort:** S · **Confidence:** medium
- **Location:** `infrastructure/functions.tf:26`
- **Also:** `infrastructure/budget.tf:15`, `functions/src/UploadTour/index.js:90`, `docs/cost-report.md:22`

**Evidence:**

```text
instance_memory_in_mb  = 2048
  maximum_instance_count = 40
```

**Description.** Sign-up is public (Entra External ID). No endpoint has a rate limit, and nothing caps tours per user; each upload is only capped at 10 MB. Combined with PERF-01/02, one account with many long tours makes every /api/map call cost tens of seconds of CPU, tens of MB of Cosmos reads and tens of MB of egress. Scripted calls can then fan out to 40 instances × 2 GB. The only guard rail is azurerm\_consumption\_budget\_resource\_group, which only sends emails (budget.tf:15-30) and stops nothing. docs/cost-report.md still assumes the classic Consumption grant (1M executions + 400,000 GB-s), not Flex.

**Impact.** For a hobby project with a €5/month target, one abusive or runaway client can build up a bill much faster than an email alert can be acted on. Cosmos Serverless RU, Flex GB-s and egress are all billed per use.

**Recommendation.** Lower maximum\_instance\_count to what a small user base needs (for example 3-5). Add a per-user tour cap (for example 2,000) and a simple per-user request throttle, for example a counter in the users document or API Management consumption tier. Attach an action group to the budget that disables the Function App, or at least runs an alerting runbook. Also update cost-report.md to Flex Consumption pricing.

**Verification.** confirmed, severity → medium. infrastructure/functions.tf:25-26 sets instance\_memory\_in\_mb = 2048 and maximum\_instance\_count = 40. No handler or infra rate limit exists: grep finds only the JWKS client's rateLimit at authMiddleware.js:39. budget.tf:15-30 only emails. The cost-report.md:22 drift is also real: it quotes the classic Consumption grant, Static Web Apps and B2C. Any signed-up user can script a denial-of-wallet, so medium stands.

### PERF-04: parseGpx rejects valid GPX files under 10 MB with more than about 130k elevation points (Math.min spread overflows the stack)

- **Severity (reviewer):** medium
- **Category:** correctness-scalability · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/lib/parseGpx.js:49`
- **Also:** `functions/src/UploadTour/index.js:53`, `functions/scripts/backfillTourStats.js:44`

**Evidence:**

```text
const minElevation = Math.min(...elevations);
  const maxElevation = Math.max(...elevations);
```

**Description.** Spreading an array into Math.min/Math.max passes every element as a call argument. Past roughly 125-130k elements, V8 throws 'RangeError: Maximum call stack size exceeded'. UploadTour catches every parseGpx error and returns 400 'Could not parse GPX file'. Measured with compact but valid GPX: 125k points (7.63 MB) parsed OK; 140k points (8.54 MB) and 160k points (9.77 MB), both under the 10 MB upload limit, threw RangeError at parseGpx.js:49. This needs 1 Hz recording of about 36 h or more, merged multi-day tracks, or exporters that write compact &lt;trkpt&gt; elements.

**Impact.** Long multi-day rides, a realistic case for the motorcycling users, are rejected with a misleading 'could not parse' error even though they are within the advertised size limit. backfillTourStats.js fails on the same files.

**Recommendation.** Compute min and max in the existing gain/loss loop (or with reduce) instead of spreading. Add a unit test with a 200k-point track.

**Verification.** partially-confirmed, severity → low. Reproduced: parseGpx throws RangeError at parseGpx.js:49:29 (Math.min(...elevations)) at 130k points (7.44 MB). 125k points works. UploadTour/index.js:53-54 maps this to 'Could not parse GPX file'. The trigger is narrower than claimed: a trkpt with &lt;time&gt; is at least ~95 bytes, so a 10 MB file holds at most ~110k timed points. A 36 h 1 Hz recording exceeds the size limit first. Only dense time-less route exports hit it, so low.

### PERF-05: Cache-first service worker relies on a manual CACHE\_NAME bump that has already been missed; returning users run stale JS/CSS against a fresh index.html

- **Severity (reviewer):** medium
- **Category:** caching · **Effort:** S · **Confidence:** high
- **Location:** `frontend/src/sw.js:10`
- **Also:** `frontend/src/sw.js:122`, `frontend/src/sw.js:81`, `.github/workflows/deploy.yml:111`, `frontend/test/sw.test.js:33`

**Evidence:**

```text
const CACHE_NAME = 'bikebuddy-shell-v9';
```

**Description.** Navigations are network-first, but every other same-origin asset is served cache-first from the precache (sw.js:122), and only a CACHE\_NAME change invalidates it. Nothing enforces the bump: sw.test.js checks only list membership, and deploy.yml publishes frontend/src as-is. Git history shows three commits after the last bump (b27e779, v8 → v9): 07bfdad, 42a19ee and aff8ef1. Together they changed ui/sidebar.js, ui/modal.js, ui/routes.js, ui/tour-detail.js, style.css and index.html without bumping. Also, install uses cache.add(url) (sw.js:81), which goes through the HTTP cache, so a precache can capture stale copies, and failures are silently swallowed.

**Impact.** Installed PWA users and returning visitors keep executing the older sidebar, routes, modal and tour-detail code with old CSS. They get a new index.html, so markup and scripts are mismatched. Fixes shipped in those commits never reach them until someone remembers the next bump.

**Recommendation.** Derive the cache name from the deploy, for example have deploy.yml sed the commit SHA into CACHE\_NAME, or add a CI check that fails when frontend/src changes without a sw.js change. Precache with cache.add(new Request(url, { cache: 'reload' })). Consider stale-while-revalidate for same-origin JS/CSS so a missed bump self-heals on the next visit.

**Verification.** confirmed, severity → medium. sw.js:10 CACHE\_NAME is still 'bikebuddy-shell-v9', last changed in b27e779. git log b27e779..HEAD -- frontend/src shows 07bfdad, 42a19ee and aff8ef1, which change sidebar.js, modal.js, routes.js, tour-detail.js, style.css and index.html. Unhashed assets are served cache-first (sw.js:122), and sw.js bytes are unchanged, so no new SW installs. Nothing enforces the bump: sw.test.js:33-54 checks list membership only, and deploy.yml uploads frontend/src/ as-is. Shipped fixes are not reaching returning users, so medium.

### PERF-G01: DeleteTour never deletes the tour's photo blobs (full + thumbnail); they stay in storage until the whole account is deleted

- **Severity (reviewer):** medium
- **Category:** storage-cost · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/DeleteTour/index.js:29`
- **Also:** `functions/src/UploadImage/index.js:73`, `functions/src/DeleteAccount/index.js:52`, `infrastructure/storage.tf:1`, `frontend/src/ui/tour-detail.js:185`

**Evidence:**

```text
await getToursContainer().item(tourId, userId).delete();

  const container = await getGpxContainer();
  await container.getBlockBlobClient(`${userId}/${tourId}.gpx`).deleteIfExists();
```

**Description.** Photos are stored at `${userId}/${tourId}/${imageId}.jpg`, with a `_thumb.jpg` sibling, in the images container (UploadImage/index.js:73). DeleteTour removes only the Cosmos document and the GPX blob. It never lists or deletes the `${userId}/${tourId}/` prefix in the images container. After that, no code path references those blobs. Only DeleteAccount's `deleteBlobsByPrefix(await getImages(), prefix)` reaps them, and only when the whole account goes. No lifecycle management policy exists in infrastructure/storage.tf. The frontend's tour delete (tour-detail.js scheduleTourRemoval) calls only `DELETE /api/tours/{id}`. DeleteTour/index.test.js has no image-related assertion, so this is untested. The first pass checked DeleteImage and DeleteAccount but not this gap.

**Impact.** Every deleted tour permanently leaks up to 20 x (about 2000 px JPEG + 320 px thumbnail) of storage, and the user can no longer see or delete these blobs. The storage cost is small per GB, but it grows without bound with delete/re-upload churn. A user who deletes a tour expects its photos gone, yet they stay for the life of the account, which cuts against the GDPR data-minimisation promise in docs/explanation/security.md. Security and QA reviewers may also want to cover the retention angle.

**Recommendation.** In DeleteTour, after the document delete, run deleteBlobsByPrefix(await imagesContainer(), `${userId}/${tourId}/`), or delete each tour.images\[\].blobName and its thumbBlobName, since loadOwnedTour already returns the doc. Use a bounded-concurrency or batch delete. Add a unit test. Optionally run a one-off script to reap existing orphans: list the `userId/tourId/` prefixes that have no tour doc.

**Verification.** confirmed, severity → medium. DeleteTour/index.js:26-29 deletes only the Cosmos document and `${userId}/${tourId}.gpx`. It never touches the images container, where UploadImage/index.js:73-76 writes `${userId}/${tourId}/${imageId}.jpg` plus a thumbnail. Only DeleteAccount/index.js:52 reaps them, no lifecycle policy exists in storage.tf, and no orphan-cleanup script is in functions/scripts. Deleted-tour photos persist unreachably for the life of the account, a retention/privacy defect, so medium.

### PERF-06: parseGpx builds the full XML object tree plus three intermediate arrays synchronously: about 1.8 s CPU and about 150 MB heap per 10 MB upload

- **Severity (reviewer):** low
- **Category:** memory · **Effort:** M · **Confidence:** high
- **Location:** `functions/src/lib/parseGpx.js:136`
- **Also:** `functions/src/lib/parseGpx.js:148`, `functions/src/lib/parseGpx.js:161`

**Evidence:**

```text
const doc = parser.parse(gpxInput);
```

**Description.** The whole buffer is decoded to a string, parsed into a full fast-xml-parser object tree, then mapped to point objects, filtered, and mapped again to \[lat,lon\] arrays before downsampling. All of this runs on the event loop. Measured: 100k points / 9.73 MB took 1,806 ms with heap +144 MB (RSS 255 MB); 50k / 4.86 MB took 998 ms with heap +75 MB. This comes on top of the 10 MB request buffer and the stored blob upload.

**Impact.** Each large upload blocks co-located requests for about 1-2 s. Several concurrent large uploads on one 2 GB instance can approach memory limits. At hobby scale this is unlikely but reachable.

**Recommendation.** Compute distance, downsampling, elevation and duration in a single pass without intermediate arrays. Alternatively use a streaming SAX parser (for example saxes) over the busboy stream so memory stays O(MAX\_POINTS) rather than O(file).

**Verification.** confirmed, severity → low. parseGpx.js:136 builds the full fast-xml-parser tree, then :148-161 build point objects, filter them and map them again, all synchronously. My probe on a 10.78 MB, 100k-point GPX with time and ele took 1,962 ms with a heap delta of about 133 MB, matching the claim. At hobby scale this is a real but minor inefficiency.

### PERF-07: heatmapData is stored and served at full source coordinate precision, doubling doc size and every map/detail payload

- **Severity (reviewer):** low
- **Category:** payload-size · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/lib/parseGpx.js:152`
- **Also:** `functions/src/lib/parseGpx.js:26`

**Evidence:**

```text
lat: parseFloat(pt['@_lat']),
          lon: parseFloat(pt['@_lon']),
```

**Description.** Coordinates are kept at whatever precision the GPX exporter wrote. Garmin-style 15-17 significant digits are common. Measured: 5,000 points at full precision is 186 KB of JSON, against 92 KB rounded to 5 decimals (about 1.1 m), which is more than enough for a web map.

**Impact.** About 2× larger Cosmos documents (storage plus read/write RU), /api/map and /api/tours/{id} payloads, and client memory, for no visible benefit.

**Recommendation.** Round to 5 (or 6) decimals when building heatmapData in processPoints, and backfill existing tours with a one-off script similar to backfillTourStats.js.

**Verification.** confirmed, severity → low. parseGpx.js:152-153 uses parseFloat(pt\['@\_lat'/'@\_lon'\]) and processPoints (:26) pushes the arrays unrounded into heatmapData. My probe output kept values like 47.100000000014. The size gain depends on the exporter (Komoot-style 6-decimal exports gain little), so low is right.

### PERF-08: SAS URLs are minted with a sliding expiry on every response and blobs have no Cache-Control, so browsers re-download images on every refresh

- **Severity (reviewer):** low
- **Category:** caching · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/lib/blobStorage.js:12`
- **Also:** `functions/src/UploadImage/index.js:78`, `functions/src/GetMapData/index.js:79`, `functions/src/GetTour/index.js:29`

**Evidence:**

```text
expiresOn: new Date(Date.now() + SAS_TTL_MS),
```

**Description.** Each GetTour, GetMapData and UploadImage response signs fresh URLs whose se and sig parameters change every call. Browsers cache by URL, so every map reload, 45-minute sasCache refresh or detail refetch re-downloads all pin thumbnails and gallery images. UploadImage also stores blobs with only a content type (no blobCacheControl), so even an identical URL gets heuristic caching at best.

**Impact.** Extra blob egress and transactions, plus slower pin and gallery rendering on every visit. Small at current scale but proportional to photo count × page loads.

**Recommendation.** Round the expiry to a fixed window, for example start of the current hour + 2 h, so URLs are stable within the window. Set blobHTTPHeaders.blobCacheControl: 'private, max-age=3600, immutable' on image and thumbnail upload; blob names are unique and never overwritten.

**Verification.** confirmed, severity → low. blobStorage.js:12 sets expiresOn: new Date(Date.now() + SAS\_TTL\_MS), so every signed URL is unique per response. UploadImage/index.js:78-79 sets only blobContentType, with no blobCacheControl. Every reload re-downloads thumbnails and photos. Minor egress.

### PERF-09: heatmapCache is bounded by entry count (500), not by bytes

- **Severity (reviewer):** low
- **Category:** memory · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/lib/heatmapCache.js:3`
- **Also:** `functions/src/lib/heatmapCache.js:29`

**Evidence:**

```text
const DEFAULT_MAX_ENTRIES = 500;
```

**Description.** Each entry retains the full per-tour point arrays. Measured: an in-budget entry (100k points) retains about 6.9 MB, so 500 entries is about 3.4 GB, more than instance\_memory\_in\_mb=2048. Because of PERF-01, entries are not actually bounded at 100k points (measured 322k to 2M points per user), so a single entry can be tens of MB. There is no TTL, so entries also keep deleted users' track data in memory until evicted.

**Impact.** Not reachable with the current small user base on one instance, but the comment's promise that the cache won't 'grow forever' does not hold in bytes. A few heavy users per instance could push memory toward the limit.

**Recommendation.** Bound by total cached points (bytes) instead of entry count, add a TTL, or drop maxEntries to about 50. Once PERF-01/02 are fixed, cache per-tour overview tracks, which are small.

**Verification.** confirmed, severity → low. heatmapCache.js:3 DEFAULT\_MAX\_ENTRIES = 500, and :30 evicts by count only, with no TTL. Because of the 50 m maxGap floor (simplify.js:62-63, GetMapData:27), entries can exceed the 100k-point budget. Reaching 500 heavy users on one instance is not plausible for this user base, so low (theoretical).

### PERF-10: Large JSON responses (/api/map, /api/me/export, /api/tours/{id}) are sent uncompressed

- **Severity (reviewer):** low
- **Category:** payload-size · **Effort:** S · **Confidence:** medium
- **Location:** `functions/src/GetMapData/index.js:88`
- **Also:** `functions/src/ExportData/index.js:27`, `functions/src/GetTour/index.js:56`

**Evidence:**

```text
return { status: 200, jsonBody };
```

**Description.** No handler compresses its response, and I found no compression setting in host.json or infrastructure. Track JSON compresses about 3×: the measured /api/map body for 200 tours was 7.0 MB raw vs 2.4 MB gzip, and 1000 tours was 45.2 MB vs 15.4 MB.

**Impact.** About 3× more egress and download time than needed on the largest responses, most noticeable on mobile.

**Recommendation.** For responses over about 32 KB where Accept-Encoding includes gzip or br, compress in the handler: zlib.brotliCompressSync/gzipSync into body, with Content-Encoding and Vary: Accept-Encoding. Or put a CDN or Front Door in front if one is ever added. Fixing PERF-01/07 first shrinks the payload itself.

**Verification.** confirmed, severity → low. No zlib, Content-Encoding or compression setting exists anywhere in functions/src, host.json or infrastructure. GetMapData/index.js:88, ExportData:27 and GetTour:56 return plain jsonBody. From the code I cannot fully rule out platform front-end compression on Flex, but none is configured. Low.

### PERF-11: EditTour does an unnecessary full-document pre-read and returns the full heatmapData in the PATCH response, which the client ignores

- **Severity (reviewer):** low
- **Category:** inefficiency · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/EditTour/index.js:48`
- **Also:** `functions/src/EditTour/index.js:38`, `functions/src/lib/tourResponse.js:13`

**Evidence:**

```text
return { status: 200, jsonBody: toTourResponse(updated) };
```

**Description.** EditTour first reads the whole tour (readItem, about 100-190 KB) only to produce a 404, then patches, then returns toTourResponse(updated). That response includes heatmapData (tourResponse.js:13) and raw, unsigned image entries. submitEdit (frontend/src/ui/tour-detail.js:148-153) uses only name, description and createdAt from it.

**Impact.** Two Cosmos round trips (read RU plus write) and about 100-190 KB of wasted egress per edit. Minor.

**Recommendation.** Skip the pre-read: patch directly and map a 404 from patch to 'Tour not found'. For the empty-operations case, return the metadata projection. Return only metadata fields from PATCH.

**Verification.** confirmed, severity → low. EditTour/index.js:38 readItem loads the full document only to 404, and :48 returns toTourResponse(updated), which includes heatmapData (tourResponse.js:13) plus raw image entries and gpxFileUrl. tour-detail.js:148-153 uses only name, description and createdAt. This is a minor inefficiency.

### PERF-12: ExportData builds every full tour document into one in-memory JSON response

- **Severity (reviewer):** low
- **Category:** memory · **Effort:** M · **Confidence:** medium
- **Location:** `functions/src/ExportData/index.js:21`
- **Also:** `frontend/src/ui/profile.js:106`

**Evidence:**

```text
queryUserItems(getTours(), userId, 'SELECT * FROM c WHERE c.userId = @userId'),
```

**Description.** fetchAll() drains every page into one array, which is then serialised as a single jsonBody, and the browser loads it with res.blob(). Response size and memory scale with the account: about 109 MB of document JSON at 1000 tours (synthetic measurement), several times that as JS objects on the worker.

**Impact.** A rare, user-triggered request by heavy users can use hundreds of MB on a 2 GB instance and take a long time to download.

**Recommendation.** Stream the export: iterate query pages with fetchNext and write NDJSON or a streamed JSON array (v4 supports stream bodies). Or build the export into a blob and return a SAS link.

**Verification.** confirmed, severity → low. ExportData/index.js:21 runs SELECT \* through queryUserItems, which fetchAll()s every page into one array (db.js:32-37). That array becomes a single jsonBody (:27), and profile.js:106 loads it with res.blob(). The request is rare and user-triggered, so low.

### PERF-13: DeleteAccount fans out every tour delete and every blob delete at once with no concurrency limit

- **Severity (reviewer):** low
- **Category:** concurrency · **Effort:** S · **Confidence:** medium
- **Location:** `functions/src/DeleteAccount/index.js:47`
- **Also:** `functions/src/DeleteAccount/index.js:20`

**Evidence:**

```text
await Promise.all(tours.map((tour) => toursC.item(tour.id, userId).delete()));
```

**Description.** All tour documents are deleted in one unbounded Promise.all, so thousands of concurrent ~100 KB-document deletes hit a Serverless container. Blobs are then listed fully and deleted one HTTP call each, again unbounded (line 20), instead of using the Blob Batch API (256 per call).

**Impact.** For large accounts this gives 429 throttling bursts, which the SDK retries, and a long, spiky request. If retries are exhausted the request fails partway, leaving a half-deleted account that needs a user retry. The operation is idempotent, so this is recoverable.

**Recommendation.** Use a small concurrency pool (for example 10-20) for Cosmos deletes, and BlobBatchClient.deleteBlobs in chunks of 256. Alternatively, enqueue the deletion to the existing out-of-band deletions job.

**Verification.** confirmed, severity → low. DeleteAccount/index.js:47 runs Promise.all over every tour delete, and deleteBlobsByPrefix (:20) deletes every blob in parallel, both with no concurrency limit. The SDK retries 429s and the operation is idempotent (a retry re-queries), so low.

### PERF-14: Map rendering uses Leaflet's default SVG renderer and rebuilds every polyline on each renderAllRoutes; the in-view filter scans every point on each moveend

- **Severity (reviewer):** low
- **Category:** frontend-rendering · **Effort:** S · **Confidence:** medium
- **Location:** `frontend/src/ui/routes.js:25`
- **Also:** `frontend/src/ui/map.js:7`, `frontend/src/lib/tours.js:86`, `frontend/src/ui/tour-detail.js:97`

**Evidence:**

```text
.map((pts) => L.polyline(pts, { ...state.lineStyle, interactive: false }));
```

**Description.** L.map is created without preferCanvas (ui/map.js:7), so every tour is an SVG path that is re-projected on each zoom. drawRoutes tears down and recreates the whole layer group on every renderAllRoutes: closing the detail panel on desktop, exiting select mode, undo, and deletes. toursInView (lib/tours.js:86-90) linearly scans every tour's points on every debounced moveend when the filter is on. Given PERF-01 volumes (300k-2M points), all of this runs on the main thread.

**Impact.** Janky pan and zoom and slow panel close for users with large histories, especially on mobile.

**Recommendation.** Use L.map(..., { preferCanvas: true }) or a shared L.canvas() renderer for route polylines. Keep polylines keyed by tour id and only add or remove changed ones. Precompute a per-tour bbox for toursInView.

**Verification.** confirmed, severity → low. ui/map.js:7 calls L.map('map', { center, zoom }) without preferCanvas. routes.js:21-28 clears and rebuilds every polyline on each renderAllRoutes, called from tour-detail.js:97/177/196/217, sidebar.js:433 and app.js:204. toursInView (lib/tours.js:86-90) scans points, though .some short-circuits for in-view tours. This is client jank for large histories only.

### PERF-15: containerOnce caches a rejected createIfNotExists promise for the life of the instance, and provisions a container name that differs from Terraform's

- **Severity (reviewer):** low
- **Category:** reliability · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/lib/blobStorage.js:27`
- **Also:** `functions/src/lib/blobStorage.js:35`, `infrastructure/storage.tf:34`

**Evidence:**

```text
return c.createIfNotExists().then(() => c);
```

**Description.** The promise is memoised with ??= (lines 34-35). If the first createIfNotExists call on a cold instance fails (a transient storage blip or throttling), the rejected promise is kept and every later image or GPX request on that warm instance fails until it recycles. Each cold instance also pays an extra storage round trip per container before its first blob operation. The code creates 'tour-images', while infrastructure/storage.tf:34 provisions an unused container named 'images'. The docs also say 'images'.

**Impact.** A short storage hiccup at scale-out can turn into minutes of 500s for image and GPX endpoints on that instance, plus a small cold-start latency cost.

**Recommendation.** Clear the memoised promise on rejection (for example .catch(err =&gt; { imagesContainerPromise = undefined; throw err; })). Better: provision 'tour-images' in Terraform and drop runtime createIfNotExists. Remove or rename the unused 'images' container.

**Verification.** confirmed, severity → low. blobStorage.js:27 and :34-35 memoise the containerOnce promise with ??=, so a rejected createIfNotExists stays cached for the instance's lifetime. The SDK's own retries make this rare. The code uses 'tour-images', while storage.tf:33-34 provisions 'images', which docs/reference/architecture.md:10 also names. cost-report.md:91 says tour-images, so the docs drift both ways.

### PERF-16: No Application Insights is provisioned, so there is no production latency, dependency or RU telemetry; host.json sampling settings are inert

- **Severity (reviewer):** low
- **Category:** observability · **Effort:** S · **Confidence:** high
- **Location:** `functions/host.json:4`
- **Also:** `infrastructure/functions.tf:28`, `docs/cost-report.md:97`

**Evidence:**

```text
"applicationInsights": {
      "samplingSettings": {
```

**Description.** infrastructure/functions.tf app\_settings has no APPLICATIONINSIGHTS\_CONNECTION\_STRING, and no azurerm\_application\_insights resource exists; grep over infrastructure, scripts and .github finds nothing. docs/cost-report.md says the host 'has Application Insights enabled with request sampling on'.

**Impact.** Regressions like PERF-01/02 (13 s+ map loads, RU spikes) cannot be seen in production except through the monthly bill.

**Recommendation.** Add an azurerm\_application\_insights resource (workspace-based, with a daily cap) and set APPLICATIONINSIGHTS\_CONNECTION\_STRING. Log the Cosmos request charge (response.requestCharge) and duration for /api/map.

**Verification.** confirmed, severity → medium. A grep over the whole repo finds App Insights only in functions/host.json:4 and docs/cost-report.md. functions.tf:28-38 app\_settings has no APPLICATIONINSIGHTS\_CONNECTION\_STRING, and no azurerm\_application\_insights exists. On Flex this leaves no durable logs or telemetry for any endpoint; parseMultipart's console.warn, for example, is lost. The rubric counts that as a meaningful observability gap on important paths, so medium. cost-report.md:99 also claims 'request sampling on', but host.json:7 excludes Request from sampling.

### PERF-17: Non-English locales fetch the English and target locale files one after the other before auth and API calls start

- **Severity (reviewer):** low
- **Category:** startup-latency · **Effort:** S · **Confidence:** high
- **Location:** `frontend/src/lib/i18n.js:106`
- **Also:** `frontend/src/app.js:291`, `frontend/src/index.html:961`

**Evidence:**

```text
fallbackMessages = await loadMessages(DEFAULT_LOCALE).catch(() => ({}));
    messages = await loadMessages(currentLocale).catch(() => fallbackMessages);
```

**Description.** app.js awaits i18n.init() before initAuth() (app.js:291-295), and init() fetches en.json and then the locale file sequentially. The first /api/tours, /api/map and /api/me requests therefore wait for two serial round trips on a first visit (the service worker hides this on repeat visits). The ~30 ES modules also have no modulepreload hints, so a first visit discovers the module graph level by level.

**Impact.** A few hundred ms of extra first-visit latency for non-English users on mobile networks. Minor.

**Recommendation.** Load both locale files with Promise.all. Start initAuth(), or at least msalClient.initialize(), in parallel with i18n. Optionally add &lt;link rel="modulepreload"&gt; for the ui/ and lib/ modules.

**Verification.** confirmed, severity → low. lib/i18n.js:106-107 awaits the en.json fetch and then the locale fetch in sequence. app.js:291-295 awaits i18n.init() before initAuth(). The extra first-visit latency is minor.

### PERF-G02: ensureMapData has no in-flight de-duplication, so overlapping renders each fire a full /api/map

- **Severity (reviewer):** low
- **Category:** redundant-requests · **Effort:** S · **Confidence:** high
- **Location:** `frontend/src/lib/mapData.js:17`
- **Also:** `frontend/src/ui/routes.js:56`, `frontend/src/ui/routes.js:76`, `frontend/src/ui/sidebar.js:415`, `frontend/src/lib/sasCache.js:125`

**Evidence:**

```text
const missing = tours.filter((tour) => !tour.heatmapData || !tour.images || isStale(tour));
  if (missing.length === 0) return;
  ...
    const res = await (mapDataPromise || apiFetch('/api/map'));
```

**Description.** A tour is only marked fetched after the /api/map response has been parsed. Every renderAllRoutes() or renderSelectedToursRoutes() call that runs while a request is in flight therefore sees the same tours as missing or stale and starts its own /api/map. This happens during the multi-second cold-start initial load, and on the first interaction after the 45-minute SAS\_CACHE\_TTL makes every tour stale at once. The triggers include select-mode taps (toggleTourSelection -&gt; renderSelectedToursRoutes -&gt; ensureMapData(apiFetch, state.tours)), the 'Show all' button, closing a detail panel and the mobile map FAB. Measured: three concurrent ensureMapData calls issued three /api/map requests.

**Impact.** /api/map is the most expensive endpoint (PERF-01: 3-32 s CPU and 4-22 MB for 50-500 tours, re-measured; PERF-02: full heatmapData RU read on every call). Each duplicate repeats the full Cosmos read and the multi-MB download. It also repeats the simplification when the duplicate lands on a different Flex instance, which the per-instance heatmapCache cannot absorb.

**Recommendation.** Keep a module-level in-flight promise in mapData.js. Concurrent callers await the same /api/map fetch and clear it on settle. Alternatively, mark the missing tours as pending before awaiting.

**Verification.** confirmed, severity → low. mapData.js:12-18 computes `missing` and awaits a new apiFetch('/api/map') per call, and markFetched only runs after the response (:23-30). Overlapping renderAllRoutes and renderSelectedToursRoutes calls (routes.js:56/76, sidebar.js:415-416, app.js:204) therefore issue duplicate full /api/map requests, for example during the initial load or when all tours go stale at 45 min (sasCache.js:8).

### PERF-G03: On mobile, every app open fetches /api/map although the list-first layout keeps the map display:none

- **Severity (reviewer):** low
- **Category:** network-waterfall · **Effort:** S · **Confidence:** high
- **Location:** `frontend/src/ui/sidebar.js:45`
- **Also:** `frontend/src/style.css:1939`, `frontend/src/ui/routes.js:54`, `frontend/src/app.js:249`

**Evidence:**

```text
const mapDataPromise = apiFetch('/api/map');
```

**Description.** loadTours() always starts /api/map in parallel with /api/tours and then renders every polyline. Since the mobile redesign (commit b27e779), style.css makes `.map-container { display: none; }` under `@media (max-width: 768px)`, and the map only appears when the FAB or a tour preview is opened. The mobile list needs none of this data: the in-view filter is disabled on mobile (sidebar.js inViewActive), and the detail panel loads its own track from /api/tours/{id}. So the heaviest request is paid on every mobile launch, whether or not the map is ever opened.

**Impact.** Mobile users on cellular download the whole map payload on every app open: 4-22 MB for heavy users per the re-measured PERF-01 numbers, uncompressed per PERF-10. The backend also pays the full Cosmos heatmapData read and the simplification CPU for data that is never shown. This multiplies the cost of PERF-01 and PERF-02 across mobile sessions.

**Recommendation.** When isMobileLayout() is true, fetch /api/map lazily on the first map open (FAB click or moveMapIntoDetailPanel), reusing ensureMapData. Keep the eager parallel fetch on desktop.

**Verification.** confirmed, severity → low. sidebar.js:45 always starts apiFetch('/api/map'), and :60 renders the routes. style.css (@media mobile) sets `.map-container { display: none; }` until expanded or in-detail. The mobile list does not use heatmapData: the in-view filter is disabled via isMobileLayout at sidebar.js:385, and the detail uses ensureDetail at sidebar.js:74-80. The heaviest payload is wasted on every mobile open.

### PERF-G04: Photo pins: every geotagged photo in every tour gets a marker and an eagerly loaded thumbnail, regrouped O(n^2) on every zoomend

- **Severity (reviewer):** low
- **Category:** frontend-render · **Effort:** M · **Confidence:** high
- **Location:** `frontend/src/ui/pins.js:95`
- **Also:** `frontend/src/lib/pinLayout.js:10`, `frontend/src/ui/pins.js:35`, `frontend/src/ui/pins.js:20`, `frontend/src/app.js:127`

**Evidence:**

```text
groupByProximity(points, PIN_GROUP_THRESHOLD_PX).forEach((group) => {
```

**Description.** renderPins() is bound to 'zoomend' in app.js:127. It projects all geotagged images across all tours, not just those in the viewport, and groups them with groupByProximity. That function does a linear scan over all groups and all their members for every point: `groups.find((g) => g.some(...))`, which is O(n^2). It then creates an L.marker whose divIcon holds an &lt;img&gt; with `img.src = thumbUrl || fullUrl` and no loading='lazy'. Leaflet does not cull off-screen markers, so every thumbnail is requested as soon as the pins toggle is on and zoom is 7 or higher. That is the typical zoom for a local rider whose tours all sit around home. Because the SAS URLs change on every response (PERF-08), none of these thumbnails come from the browser cache. Measured groupByProximity cost: 13 ms for 500 pins, 132 ms for 2,000 and 736 ms for 5,000, per zoom step.

**Impact.** A user with a few hundred geotagged photos who turns pins on downloads all of them at once, for example 900 thumbnails of about 20 KB each, roughly 18 MB, on every load. The main thread also stalls for 100 ms or more on each zoom for large collections. This costs blob egress and mobile data. It is opt-in (state.showPins defaults to false), hence low.

**Recommendation.** Only project and render the images inside map.getBounds() (padded), and set img.loading='lazy' or decoding='async'. Replace the O(n^2) grouping with a grid bucket keyed by floor(x/threshold), floor(y/threshold) that checks only neighbouring cells, or use a clustering plugin. Debounce renderPins on zoomend and moveend.

**Verification.** confirmed, severity → low. app.js:127 binds map.on('zoomend', renderPins). pins.js:88-95 projects every geotagged image, not only those in view, and groupByProximity (pinLayout.js:10-12) is a nested find/some, O(n^2). photoPinIcon (pins.js:34-35) sets img.src eagerly with no loading='lazy', and Leaflet does not cull off-screen markers. Pins are opt-in (state.js showPins: false), so low.

### PERF-G05: Tour-scoped photo and delete operations move the whole ~120 KB document: full point reads for ownership checks and a full-document replace to drop one image

- **Severity (reviewer):** low
- **Category:** cosmos-ru · **Effort:** M · **Confidence:** medium
- **Location:** `functions/src/DeleteImage/index.js:44`
- **Also:** `functions/src/lib/ownedTour.js:18`, `functions/src/UploadImage/index.js:52`, `functions/src/DeleteTour/index.js:16`, `functions/src/DeleteImage/index.js:51`

**Evidence:**

```text
await getToursContainer()
        .item(tourId, userId)
        .replace(
          { ...tour, images },
          { accessCondition: { type: 'IfMatch', condition: tour._etag } },
        );
```

**Description.** heatmapData, up to 5,000 points, is stored inline in the tour document. Measured: a 5,000-point tour document is 123,190 bytes, and heatmapData is 118,883 bytes of that (96%). loadOwnedTour point-reads this full document. UploadImage uses it only to check `(tour.images || []).length`, DeleteTour only to check existence, and DeleteImage only to find one image. DeleteImage then rewrites the whole document with replace() to remove a single array element, and re-reads the full document on each 412 retry. A Cosmos patch `remove` at `/images/{index}`, with a filter predicate or ETag condition, would write only the delta. Another option is to skip the pre-read and treat a 404 from the patch or delete call as not found. This differs from PERF-11, which covers EditTour's pre-read and response.

**Impact.** Each photo upload or delete, and each tour delete, spends RU in proportion to the track size (about 120 KB read, plus a ~120 KB write in DeleteImage) instead of a few hundred bytes. With 20 photos per tour this adds up. It raises serverless RU cost and latency, but the blast radius is bounded, so low.

**Recommendation.** UploadImage: patch with a filter predicate `FROM c WHERE ARRAY_LENGTH(c.images) < 20`, which also closes the check-then-append race. DeleteTour: delete directly and map a 404 to the not-found response. DeleteImage: read with a projection query (`SELECT c.images, c._etag`) and apply a patch `remove` with an IfMatch condition instead of replace. In the longer term, move heatmapData to its own document or to a blob.

**Verification.** confirmed, severity → low. ownedTour.js:18 point-reads the full document for UploadImage (only :52 length check), DeleteTour (existence) and DeleteImage. DeleteImage/index.js:42-47 then replace()s the whole document to drop one image, and re-reads it on a 412 (:51). The RU and latency overhead is real, but the cents are small, so low.

### PERF-G06: A server-saved language that differs from the browser's triggers a full page reload after /api/tours and /api/map were already issued; language switching also reloads everything

- **Severity (reviewer):** low
- **Category:** network-waterfall · **Effort:** M · **Confidence:** high
- **Location:** `frontend/src/ui/auth.js:58`
- **Also:** `frontend/src/lib/i18n.js:125`, `frontend/src/ui/auth.js:181`, `frontend/src/ui/menus.js:52`

**Evidence:**

```text
if (user.language && user.language !== i18n.getLocale()) {
    i18n.setLanguage(user.language);
  }
```

**Description.** renderSignedIn() starts loadTours(), which fires /api/map and /api/tours, and refreshUser(), which fires /api/me, together. When /api/me returns a saved language that differs from the locale i18n picked, syncLanguageFromUser calls i18n.setLanguage, which runs `location.reload()` (lib/i18n.js:125). The first boot's map and tour requests are thrown away, and everything runs again: MSAL init, the i18n fetches, /api/me, /api/tours and /api/map. This happens on every new browser or device, and whenever site storage was cleared, because the only thing that stops it is the localStorage key that setLanguage writes. Choosing a language in the switcher also goes through setLanguage, which reloads the page.

**Impact.** The expensive /api/map is paid twice, and the user sees a flash plus a second full startup. It happens once per device or storage reset, and on every language change, so the impact is low.

**Recommendation.** Apply the language in place: re-run loadMessages and applyI18n, then re-render dynamic views. Alternatively, resolve the saved language before starting data loads, for example by caching it in localStorage alongside the MSAL account, so a mismatch does not discard in-flight work.

**Verification.** confirmed, severity → low. auth.js:176-181 (renderSignedIn) starts loadTours() and refreshUser() together. syncLanguageFromUser (auth.js:56-60) calls i18n.setLanguage, which runs location.reload() (i18n.js:125), discarding the in-flight /api/map. localStorage is written first, so this happens once per device/storage reset plus on explicit language changes. Low.

### PERF-G07: Photos are uploaded as full-size originals (up to 10 MB each, 20 per batch) only to be downscaled to 2000 px on the server

- **Severity (reviewer):** low
- **Category:** upload-latency · **Effort:** M · **Confidence:** medium
- **Location:** `frontend/src/ui/images.js:429`
- **Also:** `functions/src/lib/resizeImage.js:113`, `functions/src/lib/parseMultipart.js:73`, `frontend/src/lib/files.js:28`

**Evidence:**

```text
const image = await xhrUpload(
        `${API_BASE}/api/tours/${tourId}/images`,
        job.file,
        token,
        job.tile.setProgress,
      );
```

**Description.** uploadImages sends each original File unchanged, and lib/files.js accepts up to 10 MB each and 20 per batch. UploadImage then parses the whole body into memory, runs two full sharp decodes, and stores only a 2000 px q82 JPEG plus a 320 px thumbnail (resizeImage.js MAX\_WIDTH = 2000, THUMB\_WIDTH = 320). Most of the uploaded bytes are discarded. The only reason to send the original is server-side EXIF GPS extraction, and GPS could be read client-side, or the EXIF block kept, before downscaling. Measured server cost is modest (48 MP JPEG: 290 ms and 110 MB RSS; 16 concurrent 100 MP PNG files: 3.6 s and 856 MB RSS, so no OOM on a 2 GB instance). The waste is mainly client upload time and function wall-clock time spent streaming large bodies.

**Impact.** Uploading a 20-photo batch from a phone on cellular sends 60-200 MB instead of roughly 10-20 MB. Uploads are 5-10x slower, and each Flex execution holds a 10 MB buffer for the duration.

**Recommendation.** Downscale in the browser (createImageBitmap plus an OffscreenCanvas or canvas toBlob, at about 2000 px and q0.85). Extract EXIF GPS client-side with a tiny parser and send it as query parameters, or copy the EXIF APP1 segment into the resized JPEG. Keep the server-side resize as the enforcement path.

**Verification.** partially-confirmed, severity → low. images.js:429-434 does xhrUpload the original File, and files.js:7/28 allows up to 10 MB. The resize constants are at resizeImage.js:5 (MAX\_WIDTH=2000) and :11 (THUMB\_WIDTH=320). The cited resizeImage.js:113 does not exist, since the file has 36 lines. The '60-200 MB per batch' figure is inflated: typical phone JPEGs are 2-5 MB. Sending originals is also an intentional trade-off for server-side EXIF GPS (UploadImage:68-70).

### PERF-G08: Content-Length shortcut rejects files just under or at the 10 MB limit, contradicting the busboy +1 logic and the frontend check

- **Severity (reviewer):** low
- **Category:** upload-limits · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/lib/parseMultipart.js:33`
- **Also:** `functions/src/lib/parseMultipart.js:45`, `frontend/src/lib/files.js:22`, `frontend/src/lib/files.js:28`

**Evidence:**

```text
if (Number.isFinite(contentLength) && contentLength > MAX_FILE_BYTES) {
    throw badRequest('File exceeds 10 MB limit');
```

**Description.** The Content-Length pre-check compares the whole multipart body, including the boundary and part headers, against the file limit. The busboy limit is deliberately MAX\_FILE\_BYTES + 1 so that 'a file of exactly 10 MB is accepted by the frontend (lib/files.js)', and the frontend only rejects `file.size > MAX_*_BYTES`. Browsers always send Content-Length for an XHR FormData body, so any file larger than roughly 10 MB minus the ~170-byte multipart overhead gets a 400 before busboy runs. Measured: a 10,485,760-byte file produced 'rejected: File exceeds 10 MB limit content-length 10485927 limit 10485760'. The same body without a Content-Length header was accepted.

**Impact.** GPX files and photos in the last ~200 bytes below or at the advertised 10 MB limit pass client validation, upload fully and are then rejected. This is a narrow edge case, hence low.

**Recommendation.** Compare Content-Length against MAX\_FILE\_BYTES plus a generous multipart overhead allowance (for example 64 KB), leaving the busboy fileSize limit as the exact enforcement. Add a unit test at exactly 10 MB with a realistic Content-Length.

**Verification.** confirmed, severity → low. parseMultipart.js:32-34 compares the whole multipart Content-Length against MAX\_FILE\_BYTES, contradicting the +1 busboy limit comment at :42-45 and files.js:22/28 (size &gt; 10 MB). My probe: a 10,485,760-byte file with Content-Length 10485953 was 'rejected: File exceeds 10 MB limit', the same body without Content-Length was accepted, and 300 bytes under the limit was accepted. The edge case is narrow.

### PERF-18: cost-report.md describes a different architecture (Static Web App, Azure AD B2C, classic Consumption grant, no budget in code)

- **Severity (reviewer):** info
- **Category:** doc-drift · **Effort:** S · **Confidence:** high
- **Location:** `docs/cost-report.md:20`
- **Also:** `docs/cost-report.md:22`, `docs/cost-report.md:127`, `docs/reference/architecture.md:5`

**Evidence:**

```text
| Static Web App       | **Free**                    | Unlimited apps, 100 GB bandwidth/mo | **€0**                     |
```

**Description.** The deployment is GitHub Pages + Entra External ID + Flex Consumption (FC1, 2048 MB, up to 40 instances). The report still costs a Static Web App that proxies /api, B2C MAU, and the classic Consumption grant (line 22: '1M executions + 400,000 GB-s/mo'). It also says a budget 'can't be created from this repo' (line 127), but infrastructure/budget.tf creates one. It does not mention /api/map, the single most expensive endpoint (PERF-01/02).

**Impact.** Cost projections and guard-rail assumptions are based on the wrong plan, which makes PERF-03 easier to miss.

**Recommendation.** Re-derive the report for Flex Consumption on-demand pricing and grants, GitHub Pages and External ID. Add /api/map RU and egress per load as a function of tour count, and point to budget.tf.

### PERF-G09: Cold start: every function's dependencies are loaded eagerly (about 0.7 s of require time measured) and no always-ready instances are configured

- **Severity (reviewer):** info
- **Category:** cold-start · **Effort:** S · **Confidence:** medium
- **Location:** `functions/package.json:5`
- **Also:** `infrastructure/functions.tf:25`, `frontend/src/ui/sidebar.js:45`

**Evidence:**

```text
"main": "src/**/index.js",
```

**Description.** The v4 model loads all 13 index.js files at worker start. Measured on a 4-core dev box: all modules load in 691 ms and 101 MB RSS (@azure/cosmos 277 ms, @azure/storage-blob 225 ms, jwks-rsa 93 ms, sharp 72 ms, zod 68 ms). infrastructure/functions.tf sets no always\_ready, so after idle the first /api/me, /api/tours and /api/map (issued together by renderSignedIn and loadTours) all wait for Flex instance allocation plus this load time. That is the cold-start latency sidebar.js:42-44 already works around. Lazy-requiring sharp and exif-reader inside UploadImage would save only about 75 ms, because Cosmos and Blob are needed by almost every function. Scale-to-zero is a deliberate cost choice for a hobby app, so this is an observation rather than a defect.

**Impact.** First load after idle takes several seconds. There is no correctness or cost impact.

**Recommendation.** Accept as a trade-off, or set always\_ready for the http group to 1 instance only if the cost target allows it. Optionally lazy-load sharp and exif-reader in UploadImage.

## Second-pass disputes of first-pass findings

The independent second pass checked the first pass's findings against the code. Where it disagreed on the facts or the rating, it recorded a dispute:

- **PERF-15**, suggested severity **low**: Not disputing the rating; this confirms it with added context. The rejected createIfNotExists promise is cached (functions/src/lib/blobStorage.js:26-27, 34-35: `c.createIfNotExists().then(() => c)` stored via `??=`). Poisoning needs a failure that outlasts @azure/storage-blob's built-in retry policy, and it only matters if that failure happens on the instance's first blob use. That is an unusual condition, so low stands. The lead should note the knock-on effect: GetMapData awaits getImagesContainer() whenever any tour has pinned photos (GetMapData/index.js:64-66). A poisoned instance therefore fails /api/map, GetTour, UploadTour and UploadImage for as long as it lives. The container-name drift ('tour-images' in code vs 'images' in storage.tf:148) is also confirmed.
- **PERF-01**, suggested severity **high**: Confirmed by independent measurement: budgetHeatmapData with synthetic 40 km, 5,000-point tours took 3.2 s for 50 tours (94k points, 3.7 MB), 12.4 s for 200 tours (223k points, 8.7 MB) and 31.7 s for 500 tours (557k points, 21.7 MB). The MAX\_GAP\_METERS=50 rule (GetMapData/index.js:27) overrides the 100k budget. heatmapCache (lib/heatmapCache.js:23-33) only helps a repeat load on the same warm instance with an unchanged tour set. Severity stands. Adding for the lead: PERF-G02 (duplicate client requests) and PERF-G03 (mobile fetches it with the map hidden) multiply this cost.

## Coverage

<details><summary>Files and areas read</summary>

- functions/src/lib/db.js
- functions/src/lib/heatmapCache.js
- functions/src/lib/simplify.js
- functions/src/lib/parseGpx.js
- functions/src/lib/parseMultipart.js
- functions/src/lib/resizeImage.js
- functions/src/lib/extractGps.js
- functions/src/lib/blobStorage.js
- functions/src/lib/tourResponse.js
- functions/src/lib/ownedTour.js
- functions/src/lib/validation.js
- functions/src/lib/thumbBlobName.js
- functions/src/lib/http.js
- functions/src/middleware/authMiddleware.js
- functions/src/GetMapData/index.js (+ index.test.js budget tests)
- functions/src/GetTours, GetTour, GetMe, EditTour, DeleteTour, DeleteImage, DeleteAccount, ExportData, UpdateProfile, UploadTour, UploadImage, Health (index.js)
- functions/host.json, functions/package.json
- functions/scripts/init-cosmos.js, backfillImageThumbnails.js, backfillTourStats.js, process-deletions.js
- infrastructure/\*.tf (functions, cosmos, storage, budget, main, variables, outputs)
- frontend/src/index.html (head/scripts), app.js, sw.js, style.css (font-face)
- frontend/src/lib/{concurrency,debounce,files,i18n,lineStyle,mapData,pinLayout,sasCache,stats,tours,upload}.js
- frontend/src/ui/{auth,images,map,pins,profile,routes,sidebar,state,statsModal,tour-detail,upload-modal}.js
- frontend/test/sw.test.js
- .github/workflows/deploy.yml, scripts/infrastructure/publish-functions.sh
- docs/cost-report.md, docs/reference/architecture.md, docs/explanation/design-decisions.md
- git history of frontend/src/sw.js vs other frontend/src changes
- functions/src/lib/{db,heatmapCache,blobStorage,tourResponse,ownedTour,parseGpx,simplify,parseMultipart,resizeImage,extractGps,validation,http,thumbBlobName}.js
- functions/src/{GetMapData,GetTours,GetTour,GetMe,UploadTour,UploadImage,EditTour,DeleteTour,DeleteImage,DeleteAccount,ExportData,UpdateProfile,Health}/index.js
- functions/host.json, functions/package.json, functions/.gitignore (no .funcignore)
- functions/scripts/init-cosmos.js, process-deletions.js; scripts/maintenance/delete-users.sh; scripts/infrastructure/publish-functions.sh
- infrastructure/{functions,cosmos,storage,budget,main,variables}.tf
- .github/workflows/{deploy,process-deletions}.yml (schedules, caching)
- frontend/src/app.js, sw.js, index.html head, 404.html, manifest.webmanifest, style.css (font-face, mobile .map-container rules)
- frontend/src/ui/{auth,sidebar,routes,pins,map,images,tour-detail,upload-modal,statsModal,router,state,menus}.js
- frontend/src/lib/{mapData,sasCache,tours,stats,pinLayout,concurrency,upload,files,i18n,url}.js
- ES module import graph depth (31 modules, 3 levels, no modulepreload)
- git history of frontend/src/sw.js vs other frontend changes (re-verified PERF-05)
- Re-verification of first-pass PERF-01, PERF-04, PERF-05, PERF-15, PERF-16 against code and measurements

</details>

<details><summary>Commands and probes run</summary>

- scratchpad/perf/gpx.js: parseGpx on synthetic GPX. 10k pts/0.97MB=355ms; 50k/4.86MB=998ms, heap +75MB; 100k/9.73MB=1806ms, heap +144MB, RSS 255MB; 130k+ → RangeError: Maximum call stack size exceeded
- scratchpad/perf/gpx2.js: compact GPX with &lt;ele&gt;. 125k pts/7.63MB OK; 140k pts/8.54MB and 160k/9.77MB (under the 10MB limit) → RangeError at computeElevationStats (parseGpx.js:49)
- scratchpad/perf/map.js: budgetHeatmapData(tours, 100000, 50) on random-walk 5,000-pt tours. 50×60km: 3.4s, 93k pts, 2.0MB. 200×60km: 13.0s, 321,656 pts, 7.0MB (2.4MB gzip). 200×150km: 17.0s, 1,000,000 pts (no reduction), 21.8MB. 500×80km: 36.0s, 1.04M pts, 22.6MB. 1000×80km: 75.3s, 2.08M pts, 45.2MB body (15.4MB gzip), about 109MB of heatmapData read from Cosmos
- scratchpad/perf/mem.js: heatmapCache retained heap. 10 users × 100k in-budget points = 69MB, i.e. 6.9MB per entry, so 500 entries is about 3.4GB against instance\_memory\_in\_mb=2048
- scratchpad/perf/img.js: sharp concurrency=1 (4 CPUs), cache max 50MB. 12MP JPEG (7.9MB) full+thumb+gps in parallel 241-251ms (full 235ms, thumb 101ms); 90MP PNG full+thumb 472ms, peak RSS delta 73MB
- scratchpad/perf/cold.js: require times. @azure/cosmos 239ms, @azure/storage-blob 92ms, zod 78ms, sharp 56ms, jwks-rsa 50ms, @azure/functions 35ms (all loaded on every cold start via main src/\*\*/index.js)
- node -e precision probe: 5,000 points at full source precision is 186KB JSON vs 92KB rounded to 5 decimals
- git log b27e779..HEAD -- frontend/src ':!frontend/src/sw.js': 07bfdad, 42a19ee and aff8ef1 changed sidebar.js, modal.js, routes.js, tour-detail.js, style.css and index.html after the last CACHE\_NAME bump (v8 → v9 in b27e779)
- grep for heatLayer/heatmapZoom/leaflet.heat: no heat layer or heatmapZoom.js exists in frontend (docs still claim Leaflet.heat)
- grep for insights/APPLICATIONINSIGHTS in infrastructure, scripts and .github: no matches
- grep for gzip/compress: no response compression anywhere in first-party code
- git ls-files (scope inventory)
- node scratchpad/perf2/mkimg.js + mkjpg.js (synthetic 100 MP PNG 311 KB, 48 MP JPEG 5.4 MB)
- CONC=1 node bench.js big.jpg|big.png N -&gt; jpg x1 290 ms/110 MB RSS, x3 564 ms/158 MB; png x1 639 ms/187 MB, x3 1022 ms/421 MB, x8 2009 ms/748 MB, x16 3600 ms/856 MB (sharp memory is NOT an OOM risk on a 2 GB instance)
- node req.js &lt;module&gt; -&gt; require times: @azure/cosmos 277 ms, @azure/storage-blob 225 ms, jwks-rsa 93 ms, sharp 72 ms, zod 68 ms; all 13 function index.js modules together 691 ms, 101 MB RSS
- node dedupe.mjs (3 concurrent ensureMapData calls) -&gt; '/api/map requests issued: 3'
- node pins.mjs (groupByProximity) -&gt; n=500 13 ms, n=2000 132 ms, n=5000 736 ms
- node docsize.js -&gt; 5001 points, tour doc 123,190 bytes of which heatmapData 118,883 bytes (96%)
- node sas.js -&gt; 4000 SAS URLs in 231 ms (SAS minting is not a bottleneck)
- node budget.js (re-verify PERF-01) -&gt; 50 tours x 40 km: 3.2 s, 94k pts, 3.7 MB; 200 tours: 12.4 s, 223k pts, 8.7 MB; 500 tours: 31.7 s, 557k pts, 21.7 MB
- node minspread.js (re-verify PERF-04) -&gt; 120,000 points ok (7.8 MB); 130,000 points RangeError (8.4 MB)
- node mp.mjs (parseMultipart 10 MB boundary) -&gt; 'rejected: File exceeds 10 MB limit content-length 10485927 limit 10485760'; the same body with no Content-Length is accepted (10485760 bytes)
- git log -- frontend/src/sw.js vs frontend/src/{app.js,ui,lib,style.css,index.html}
- grep for insights/lifecycle/orphan/modulepreload/line numbers

</details>
