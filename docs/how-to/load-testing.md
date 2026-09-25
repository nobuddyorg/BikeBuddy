# How-to: Load testing

Load tests measure how the Functions API behaves under many requests and with
a heavy account's data: where latency bends, which handler owns the p95, and
what each request costs in Cosmos. They are a **measurement, never a gate**:
nothing runs them on push or pull request (see the design decision "Why load
testing is manual and local by default").

## Flows and profiles

One [k6](https://grafana.com/docs/k6/) script per journey in [`load/`](../../load),
each spelling out as HTTP what the frontend sends:

| Flow     | Scenarios                       | Endpoints                                                                             |
| -------- | ------------------------------- | ------------------------------------------------------------------------------------- |
| `smoke`  | every scenario below, 1 VU once | all of them: proves the scripts and the target work                                   |
| `browse` | `list`, `detail`, `map`         | `GET /api/tours`, `GET /api/tours/{id}`, `GET /api/map`                               |
| `upload` | `upload_tour`, `upload_image`   | `POST /api/tours/upload` (2,000- and 10,000-point GPX), `POST /api/tours/{id}/images` |
| `edit`   | `edit`                          | `PATCH /api/tours/{id}` (rename, date), `DELETE /api/tours/{id}`                      |
| `export` | `export`                        | `GET /api/me/export` for the seeded account                                           |

| Profile  | Users        | Seed                                       | Meant for                          |
| -------- | ------------ | ------------------------------------------ | ---------------------------------- |
| `normal` | ×1           | 200 tours, every 20th a 10,000-point track | the loop's comparisons, thresholds |
| `peak`   | ×5           | 500 tours, every 10th long                 | a busy day                         |
| `stress` | steps to ×20 | 1,000 tours, every 5th long                | finding the knee                   |

**Seed and teardown** ([`load/lib/seed.js`](../../load/lib/seed.js)): `setup()`
provisions the user and uploads deterministic tracks (a seeded PRNG, so two
runs load the same data); `teardown()` deletes **every** tour the user has
through `DELETE /api/tours/{id}` (the document, then its GPX blob; photo blobs
stay in Azurite until #553 is fixed). Locally the user is the `SKIP_AUTH` dev
user, so a load run empties the local dev account's tours.

A `population` flow (many distinct users at once) is out of scope: locally
`SKIP_AUTH` maps every request to one user, and a per-request user override
would widen the auth bypass (see #545); it needs its own design and review.

## Run it locally

```bash
./buddy.sh development start-cosmos
SKIP_AUTH=true LOAD_PROFILING=true ./buddy.sh development start-backend
./buddy.sh test load smoke                      # every journey once
./buddy.sh test load browse --profile normal    # ~3 minutes plus seeding
```

`load/run.mjs` (what `./buddy.sh test load` runs) refuses a non-local API for
`--target local-stack`, writes `load-results/<flow>.md` (the table below),
`<flow>.json` (k6's full summary), `<flow>.html` (charts over time) and, when
the host runs with `LOAD_PROFILING=true`, the backend report
`<flow>.backend.md`/`.json`.

## Run it in GitHub Actions

**Actions → Load test (k6) → Run workflow** (`.github/workflows/k6-load-test.yml`),
choosing flow, profile and target. The run starts the same local stack as the
CI gate (Cosmos emulator, Azurite, Functions host with `LOAD_PROFILING=true`),
puts the k6 table and the backend report in the job summary, and uploads
`load-results/` (HTML dashboard, JSON, CPU profiles) as the
`k6-<flow>-<profile>-<target>` artifact for 30 days. One run per target at a
time.

**Hosted target**: off unless `confirm_production` is ticked; the refusal runs
before checkout and before any secret is read. Production has no auth bypass
and Entra External ID has no password grant, so a hosted run needs a fresh
access token of a dedicated load-test account in the `LOAD_ACCESS_TOKEN`
secret and the API URL in the `LOAD_API_URL` variable. Every request is billed
(Cosmos Serverless) and shares capacity with real users; there is no backend
report for it. Use it rarely, with `smoke` or `normal` only.

## Read the results

Per scenario: requests, rate, failures, p50/p95/p99; then every threshold with
✅/❌. Thresholds (in [`load/lib/options.js`](../../load/lib/options.js)):
fewer than 1 % failed requests, no timeouts, more than 99 % of checks passing,
and a p95 per scenario.

### Thresholds

Calibrated at the `normal` profile as **3× the worse p95 of two runs, at least
100 ms, rounded up to 50**. `smoke` keeps every threshold except the p95s.
peak and stress are meant to cross them.

| Scenario       | Run 1 p50 / p95 | Run 2 p50 / p95 | p95 threshold |
| -------------- | --------------- | --------------- | ------------- |
| `list`         | 4,227 / 5,229   | 4,280 / 5,456   | 16,400        |
| `detail`       | 3,203 / 4,395   | 3,469 / 4,442   | 13,350        |
| `map`          | 12,806 / 13,867 | 13,032 / 14,621 | 43,900        |
| `upload_tour`  | 95 / 263        | 79 / 262        | 800           |
| `upload_image` | 63 / 91         | 64 / 97         | 300           |
| `edit`         | 60 / 106        | 67 / 126        | 400           |
| `export`       | 3,675 / 3,892   | 3,636 / 3,828   | 11,700        |

All values in ms, `normal` profile, no failed requests in any run. The
`browse` rows are slow because every query over a user's partition loads each
tour document whole, track included; the worked example below measures it. They
tighten when the track moves out of the tour document (#615).

These were measured in a development container running the whole stack; the
workflow can only run once it is on `main`, so recalibrate from two `normal`
runs on a runner then and update the table and `options.js` together (#621).

## Backend report

k6 says _that_ a request is slow; the backend report says _why_. With
`LOAD_PROFILING=true` the Functions host
([`functions/src/lib/profiling.js`](../../functions/src/lib/profiling.js),
registered by `functions/src/LoadProfiling/`) writes one `LOADPROF` log line per:

| Record     | Source                                                                                                  | Read it for                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| invocation | the Functions pre/post-invocation hooks: handler, status, duration, response bytes                      | which handler owns the p95; payload size of `/api/map`, `/api/tours`                              |
| cosmos     | the Cosmos SDK's request plugin: operation, request charge, duration per HTTP request (each query page) | RU per request (Serverless bills RU); several round trips per request (N+1, paging)               |
| blob       | a wrapped HTTP client for Blob Storage: method, blob or container                                       | extra list/properties calls, SAS work per item                                                    |
| sample     | `monitorEventLoopDelay` and `process.memoryUsage()` every 5 s                                           | CPU-bound work blocking everyone (GPX parsing #576, simplification, `sharp`); memory peaks (#550) |

`load/backend-report.mjs` aggregates this run's slice of the host log into
`load-results/<flow>.backend.md`. With the worker started under
`languageWorkers__node__arguments=--cpu-prof --cpu-prof-dir=load-results/cpu`
(the workflow does this), the report adds the top 15 functions by self time
once the host has stopped and written its `.cpuprofile` files; open those in
Chrome DevTools or speedscope for the flame graph:

```bash
node load/backend-report.mjs browse --log /tmp/func.log --cpu load-results/cpu
```

None of this exists in production: `LOAD_PROFILING` is never set there, and
without it the hooks, the Cosmos plugin and the blob client wrapper are not
installed. The vnext Cosmos emulator reports nominal request charges (1 per
read, about 3 per query page), so RU columns are only meaningful as counts
locally; operation counts per request are exact.

## Run the optimization loop

1. **Baseline**: `./buddy.sh test load <flow> --profile normal --save-as baseline`
   twice (keep the second; the first warms caches).
2. **Pick one hotspot** from `<flow>.backend.md`: highest total time or RU,
   most operations per request, worst event-loop delay.
3. **Write the hypothesis down** in the PR: "X costs Y because Z; changing W
   should cut p95/RU by about N".
4. **Change one thing** (a projection, a query, batching, caching, moving CPU
   work off the request path, trimming a payload). Restart the Functions host.
5. **Rerun** the same flow and profile twice, `--save-as candidate`.
6. **Compare**: `node load/compare.mjs load-results/baseline load-results/candidate <flow>`
   prints per-scenario p50/p95/p99, throughput and error rate, and per-handler
   server p95, response size and RU per request, with a ±20 % noise band. Only
   a change beyond the band counts.
7. **Keep or revert.** Kept: add a deterministic guard (below) and write the
   result here. Reverted: write the negative result here too.
8. Next hotspot, until the flow meets its target or the remaining cost is
   accepted with a reason. `peak`/`stress` find the knee; they are not for
   the loop's comparisons.

The loop is mechanical enough for a coding agent to propose and measure on a
branch; merging stays a human decision.

### Worked example

Browse at `normal`, the loop run as written above (September 2026, development
container, vnext Cosmos emulator).

**Baseline** (second of two runs): `map` p95 13.9 s, `list` 5.4 s, `detail`
4.2 s, no errors. The backend report ruled out the obvious suspect: the CPU
profile was 85 % idle and the event-loop p99 62 ms, so the worker was not
CPU-bound. Every handler was waiting on Cosmos instead: a point read averaged
2.9 s, the list query 3.8 s, and `GetMapData` made three query round trips per
request at 3.7 s each, all three returning every tour's full `heatmapData`
although the handler's heatmap cache already held the budgeted result.

**Hypothesis**: "`/api/map` reads every tour's points on every call although
its cache is warm. Querying only `ARRAY_LENGTH(c.heatmapData)` and loading the
points on a cache miss should cut `map` p95 by more than half and free Cosmos
for `list` and `detail`."

**Candidate** (same flow and profile, two runs): `map` p50 −21.6 % (beyond
the band), p95 −19.0 % and p99 −18.3 % (within it); `list` and `detail` −8 to
−16 %, within the band. The count query still made three round trips, at
2.9 s each.

**Decision: reverted.** Only p50 cleared the band, and the change added a
second query path to the handler.

**What the numbers pointed to instead.** A direct measurement on the idle
emulator, 200 tours in one partition (every 20th with 5,000 points, the rest
2,000), median of five:

| Query over the partition                     | Tracks in the document | Without tracks |
| -------------------------------------------- | ---------------------- | -------------- |
| list projection (`id`, `name`, `createdAt`)  | 1,953 ms               | 19 ms          |
| point counts (`ARRAY_LENGTH(c.heatmapData)`) | 1,935 ms               | 18 ms          |
| full `heatmapData`                           | 3,151 ms               | 27 ms          |

Every query over a user's partition loads each tour document whole, so the
track stored inside the tour document makes even the list query about 100×
slower, and no projection avoids it. Cosmos DB bills query RU by the size of
the documents it loads, so the same shape should also cost RU in production;
the emulator's nominal charges cannot confirm that here. The fix is a
document-shape change (the track in its own item or blob, read only by
`/api/map` and the detail view), which needs schema versioning and a backfill
(#615, #577). That makes it a design change of its own, not a step of this loop.

Profiling overhead in these runs: about 1 % of worker CPU, mostly measuring
response sizes.

## Deterministic guards

Load numbers drift; these do not. The integration suite (against the Cosmos
emulator and the Functions host) asserts the shape of the hot paths:

- `functions/test/integration/query-cost.test.js`: the tour-list query is
  single-partition (the caller's partition key on every page, never a
  cross-partition fan-out) and pages in bounded requests.
- `functions/test/integration/map-budget.test.js`: 120,000 raw points on ~20 km
  tracks come back simplified within `GET /api/map`'s point budget and a bounded
  response size. Longer tracks still exceed the budget (#546); the guard's
  track length goes up when that is fixed.
