# Explanation: Design decisions

The _why_ behind the architecture. For _what_, see [Architecture](../reference/architecture.md).

## No frontend framework

Plain HTML/CSS/JS keeps the site truly static (no build pipeline) and trivially
hostable on GitHub Pages. Every third-party script is **vendored** in
`frontend/src/vendor/`: MSAL because loading it cross-origin from a CDN was
blocked by the browser (ORB) on GitHub Pages, Leaflet because a CDN that serves
altered bytes would execute in the app's origin, where the Entra access tokens
live. Vendoring lets `script-src` stay at `'self'`.

The vendored files stay byte-identical to the npm packages pinned as exact
`devDependencies` in `frontend/package.json` (`@azure/msal-browser`,
`leaflet`), so Dependabot proposes their updates (#564). The `verify-vendor`
hook (`scripts/quality/verify-vendor.mjs`) fails while `vendor/` differs from
`node_modules`; after a bump, `node scripts/quality/verify-vendor.mjs --write`
re-copies the files and rewrites the `.msal-source`/`.leaflet-source`
provenance with their SHA-256. A bump PR therefore cannot merge with stale
vendored code.

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
across Entra surfaces. Both are cached per instance: the key set is looked up by
`kid` locally and refetched hourly, or for an unknown `kid` at most once every
5 minutes, so unauthenticated junk tokens cannot exhaust the key fetches (#537).
A failed refresh keeps serving the last good copy for up to a day (#571). See the
[Developer guide](../how-to/developer-guide.md#authentication--tokens).

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

- Both sizes are rendered from the original, never one from the other, so
  quality does not degrade through chained re-encodes. The thumbnail is 320 px,
  the detail grid tile at typical device pixel ratios (#466); photos from before
  #466 fall back to the full image.
- The 100-megapixel input limit sits far below `sharp`'s ~268 MP default, so a
  decompression bomb is refused before it allocates.
- Multipart bodies are streamed with a byte limit instead of read with
  `arrayBuffer()`: `Content-Length` can be absent or attacker-controlled. HTTP
  streaming is on (`app.setup({ enableHttpStream: true })` in
  `functions/src/lib/functionsApp.js`, which every handler takes `app` from, a
  dependency-cruiser rule), so the host hands the body over as it arrives and
  the 10 MB limit bounds memory rather than applying after the host has
  buffered the whole request (#550). Streaming needs Functions host 4.28 or
  later.
- Blob names are built from the token's user id and the ids in the route, never
  read back from a stored `blobName`, so a document can never point a request at
  another user's blob.
- A SAS URL expires at the end of the hour after the one it was signed in, so
  it works for one to two hours and every URL signed within the same clock hour
  is identical. Photos never reuse a name, so they are stored with
  `Cache-Control: private, max-age=3600, immutable`, and a map reload or a
  detail refetch within the hour is served from the browser cache instead of
  Blob Storage (#578). The frontend refetches signed URLs after 45 minutes,
  inside the shortest lifetime.

## Write ordering and concurrency

A tour is a Cosmos document plus blobs, with no transaction across the two.
The order is chosen so a failure leaves something harmless:

- **Create:** blobs first, then the document; if the document write fails the
  blobs are deleted and the error rethrown (a rollback failure surfaces too). A
  document pointing at a missing blob would list fine and fail on download.
- **Delete:** the document first, then its blobs with `deleteIfExists()`. A
  leftover is an unreferenced blob that a retry or the account deletion reaps,
  never a document pointing at nothing. `DeleteAccount` queues the Entra object
  id first, so the intent survives a failure halfway through.
- **Concurrent edits:** `EditTour` patches per field, because the realistic race
  is an edit overlapping a photo upload; `UploadImage` appends to `/images/-`
  atomically so concurrent uploads each keep their entry, with `IfMatch` on the
  tour it counted, so the 20-photo cap holds under concurrency: on a 412 it
  reads the tour again and counts again (the vnext emulator cannot evaluate an
  `ARRAY_LENGTH` patch condition, so the cap is an ETag, not a filter
  predicate); `DeleteImage` must
  rewrite the array, so it uses `IfMatch` and retries on 412. `GetMe` writes the
  claims only into empty fields, with `IfMatch`, and turns a first-login 409
  into a re-read.

External ID sign-up does not reliably collect a display name, so BikeBuddy owns
it: the token's `name` fills an empty profile, never overwrites a chosen one
(#551). `GET /api/health` does no I/O, so it cannot become an unauthenticated
probe of the backing services.

## Map endpoint

`GET /api/map` returns every tour's points within a hard budget of 100,000
(`functions/src/lib/mapBudget.js`): each track keeps a floor of up to 20
points, and the rest of the budget is shared by point count. Each track is cut
to its share in one Douglas-Peucker pass that ranks every point by the largest
tolerance that still keeps it, and keeps the top of that ranking (#546). The
map draws polylines, so there is no gap rule: a straight 5 km stretch can be
two points. A per-tour overview computed at upload would move this cost off
the request path; it waits on where the track is stored (#615). The expensive
part is that simplification, so an LRU cache keys it on tour id and point count
(`heatmapData` is set once at upload); it holds at most 1,000,000 points (about
75 MB, measured), so a warm instance cannot grow past that (#578). The frontend
fetches `/api/map` in parallel with `/api/tours`, so a cold start is paid once,
and overlapping renders queue behind the load in flight instead of each
fetching it again (#580).

## Frontend behaviour

- One Leaflet map: on mobile it moves into the detail panel instead of a second
  instance being created. Closing the panel keeps the map where it is; only
  "Show all" refits. Photo pin markers persist across renders to avoid flicker.
- Routes draw on one canvas (`preferCanvas`), not an SVG path per tour that is
  re-projected on every zoom. Pin thumbnails load lazily, and pins are grouped
  on a grid, so a zoom compares each pin only with its neighbours (#580).
- Back closes the open panel or modal while the selection stays (#442, #443).
  Closing one with its button or Escape takes its history entry back too, so
  Back never lands on a closed layer, and a reload starts the depth over
  (#586).
- Open dialogs form a stack: Escape, the focus trap and returning focus act on
  the one on top (profile → delete account, lightbox → confirm). A menu that
  uses Escape to close marks the key handled, so its dialog stays open.
- A malformed `#/tour/` link opens no tour, and blocked storage costs only the
  saved line style and language, never startup.
- Deletes are undoable: the DELETE is deferred behind an undo toast (#559 tracks
  that closing the tab during that window loses the delete).
- iOS page zoom is handled by a gesture handler instead of a `maximum-scale`
  viewport meta.
- The line style is saved on change, not on every input event.
- The account-deletion confirmation phrase (`DELETE`) is not translated: it is
  a typed safety check, identical in every language.
- Icons are inline SVG from one sprite (`icons.svg`), not emoji, so they render
  the same on every platform.
- The service worker fetches every same-origin file network-first and keeps
  its cache current, so a deploy reaches returning users on their next load
  and the page never runs one deploy's HTML with another's modules. The cache
  is only the offline copy. Cache-first behind a hand-bumped `CACHE_NAME` was
  dropped after a missed bump left users on stale code (#544); the name now
  changes only to discard an old cache.

## Account deletion (GDPR), out-of-band

`DELETE /api/account` purges all app data immediately (tours, blobs, user doc)
and **queues** the user's Entra directory object id, with the app user id (the
token's `sub`) it belongs to, in a `deletions` container. A **scheduled GitHub
Action** (`process-deletions.yml`) then purges that app user's data again and
deletes the user from the External ID tenant via Graph.

Until the job runs, the identity still signs in. So that nothing can be created
that no process would ever delete (#538), `GetMe`, `UpdateProfile` and
`UploadTour` answer **410** (`errors.accountDeleted`) to a caller whose object
id is queued, and the frontend signs that session out. The job's second purge
(`lib/accountPurge.js`, the same code the API runs) catches what the API's first
one missed: a partial failure, or a write from another device in between.

Why out-of-band: deleting a directory user needs a tenant-wide
`User.ReadWrite.All` Graph credential. Keeping that **only in CI** (never in the
internet-facing Functions app) means a compromise of the web app can't delete
arbitrary users. GDPR allows the identity removal to complete shortly after (the
app data — the bulk of personal data — is already gone).

Deleted data stays in the backups for a bounded time and then expires on its
own: Cosmos continuous backup can restore it for 7 days, and blob soft delete
and previous versions keep it for 14 (#541). That window is what makes an
accidental or malicious delete recoverable; nothing outlives it.

What the job accepts (`functions/scripts/lib/deletionJob.js`, unit-tested with
fakes; a change to it is security-relevant):

- Only queued ids shaped like a GUID reach Graph, URL-encoded. Anything else
  (`../groups/…`, `a/b`) stays queued and fails the run for a human to look at.
- A queued `userId` is purged before the Graph call; the identity is deleted and
  the entry removed only when the purge succeeded. A `userId` that is not a
  token subject (empty, or with a `/`) is refused, since it would widen the
  blob prefix. Entries queued before #538 carry no `userId`; their data was
  purged when they were queued.
- A Graph 204 or 404 removes the queue entry, so a re-run is idempotent; a 5xx,
  429 or network error keeps it for the next run and fails this one. One
  failing id never stops the others.
- Logs carry counts and masked ids (`…abcd`), never a full object id (#570
  tracks purging Entra's soft-deleted users).
- `--dry-run` lists what a real run would do without Graph credentials; manual
  runs of `process-deletions.yml` default to it (input `dry_run`), the daily
  cron runs for real, and runs never overlap.

By hand, `./buddy.sh maintenance delete-users --dry-run` shows the queue; it
reads the production Cosmos key and Storage connection string through `az`, so
it is for an operator with a reason, never a routine local command.

## Backfills

A document-shape change ships a backfill with a dry run (CLAUDE.md, "Data and
authorization changes"). The existing ones, `functions/scripts/backfillTourStats.js`
(elevation and moving-time stats) and `backfillImageThumbnails.js` (thumbnail
blobs; the blob name is derived from the image's, so no document changes), are
**dry by default**: they read in pages, report what they would change and what
would fail, and write only with `--apply`. They are idempotent, fail the exit
code on any failed item, and need `COSMOS_CONNECTION_STRING`, `COSMOS_DATABASE`
and `BLOB_CONNECTION_STRING`. The stats backfill recomputes every tour's
distance and stats from its GPX (`functions/src/lib/tourStats.js`, the mapping
`UploadTour` stores) and sets only the fields that differ: it fills a tour from
before the stats, and corrects the distance, moving time and average speed of a
tour from before #552, which counted the gap between two segments as riding. A
tour that already matches its GPX is not written.

New documents carry `schemaVersion` (#577,
`functions/src/lib/schemaVersion.js`); one without it predates versioning.
`backfillSchemaVersion.js` marks a tour as version 1 once it has its stats (adding the `images` array a tour from
before photos lacks) and counts the tours still waiting for the stats backfill.
Once its dry run reports nothing left to mark or wait for, the shims for old
shapes can go: the `images`-less branch in `UploadImage` and the `?? null`
stats in `toTourResponse`.

Runbook, from a machine with `az login` to the subscription:

1. Note the time: Cosmos keeps 7 days of point-in-time restore
   ([infrastructure.md](../how-to/infrastructure.md)).
2. `./buddy.sh maintenance backfill tour-stats`, read the dry run, then again
   with `--apply`.
3. The same for `thumbnails`, then `schema-version`.
4. Put the dry-run and apply summaries in the PR or issue that needed the
   backfill: that is the record that it ran.

## OpenTofu, reproducibly

Infrastructure is OpenTofu with remote azurerm state, so local runs and CI share
one source of truth. Globally-unique names carry a random suffix so the config
applies cleanly in any subscription. The state-backend storage account is the one
bootstrap prerequisite (it can't create itself).

The Cosmos account is not zone-redundant: at this scale the cost target wins,
and zone-redundant accounts are capacity-constrained in West Europe. Backup,
not redundancy, is the answer to losing data (#541): Cosmos runs continuous
backup at the free 7-day tier (point-in-time restore into a new account), and
the storage account keeps deleted blobs and containers for 14 days, with
versioning so an overwrite is recoverable too; a lifecycle rule expires
previous versions after the same 14 days. Neither protects against losing the
region, which LRS and a single-region Cosmos account accept for the cost
target. The restore steps are in the
[infrastructure guide](../how-to/infrastructure.md#restore-user-data).

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

## No CI output on pull requests

The gate writes nothing into a pull request: no bot comments, no issues, no
check runs of reporting actions (`comment: false` for Codecov, `check_run:
false` for the JUnit reporter, `allow_issue_writing: false` for ZAP). The
exceptions are statuses GitHub or Codecov attach to the commit, not text:
code scanning's per-tool checks for the SARIF uploads, and Codecov's patch and
project statuses. Beyond those, each job's pass/fail is the signal; tables and
numbers go to the run's job summary, reports to artifacts, and SARIF findings
to code scanning ([Where to find CI results](../how-to/developer-guide.md#where-to-find-ci-results)).

Why: comments pile up with every push and go stale, a second check run per tool
doubles the list a reviewer scans, and a reporting action that can write to the
PR needs `pull-requests: write`, a permission an untrusted PR's workflow should
not hold. The summary is one click away and always matches the commit it ran
on.

The same rule keeps every check runnable locally: a job's command is a
`buddy.sh` or `npm` script a contributor runs as is, and the summary step only
formats its output ([Run the checks CI runs, locally](../how-to/developer-guide.md#run-the-checks-ci-runs-locally)).

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

What Dependabot does not see is pinned by hand, so every run uses the same
build until someone bumps it on purpose (#566):

- **OpenTofu providers**: `infrastructure/.terraform.lock.hcl` is committed,
  with hashes for linux and macOS on amd64 and arm64. To bump:
  `tofu init -upgrade -backend=false`, then
  `tofu providers lock -platform=linux_amd64 -platform=linux_arm64 -platform=darwin_amd64 -platform=darwin_arm64`.
- **Emulator images**: the Cosmos emulator and Azurite run by digest (a
  multi-arch index) in `scripts/development/start-{cosmos,azurite}.sh` and
  `setup.sh`. To bump: pull the tag, then copy the digest that
  `docker image inspect --format '{{json .RepoDigests}}'` prints.
- **Scanners**: OpenGrep, TFLint and Trivy download a pinned release and check
  its sha256 before running (`scripts/quality/opengrep.sh`, `iac.sh`).
- **Function package**: `functions/.funcignore` keeps tests, scripts and tool
  configs out of what `func azure functionapp publish` uploads.

Current overrides: `functions/` and `frontend/` pin `qs` to `^6.16.0`,
because Stryker's `typed-rest-client` pins a vulnerable `qs` exactly
(GHSA-x5fp-wj9c-mxmx, GHSA-4mjr-xmp4-gh2g). `e2e/` pins `tmp` to `0.2.7` and
`uuid` to `^14.0.2` for `@lhci/cli` (GHSA-52f5-9888-hmc6, GHSA-w5hq-g745-h8pq).

Accepted risk: `extract-zip` (GHSA-jmr9-qjv8-65gv, GHSA-7pqw-9j4j-h8q3; no
fixed release) under `@lhci/cli` → `lighthouse` → `puppeteer-core` →
`@puppeteer/browsers`. It unpacks downloaded browser archives, and Lighthouse CI
never downloads one here: it runs the Chromium Playwright installs
(`CHROME_PATH`), on a CI runner or a developer machine, never in production.
The fix exists one major up: `@puppeteer/browsers` 3 unpacks without
`extract-zip`, but only `puppeteer-core` 25 depends on it, and `lighthouse`
12.6.1 (pinned by `@lhci/cli` 0.15.1) takes `puppeteer-core` `^24`, whose last
release still pins 2.13.2 (checked September 2026). An override would force a
major under Lighthouse; look again when `@lhci/cli` moves to a Lighthouse on
`puppeteer-core` 25 (#564).
Look again when `@lhci/cli` or `lighthouse` bumps `puppeteer-core`.

Pinned tools outside a lockfile: Azure Functions Core Tools is installed as
`azure-functions-core-tools@4.13.0` in CI and deploy, because 4.14.0 ships an
`npm-shrinkwrap.json` that resolves a dependency from Microsoft's internal
package feed (401 outside their network). Bump it once a fixed release exists.

## SAST rule packs

OpenGrep runs `--config auto` and `--config p/security-audit` together.
`auto` selects the community rules for every language in
the tree (JavaScript, TypeScript, HCL, Bash, HTML, JSON), including the
taint rules that catch `eval(req.body)`-style injections at error severity.
`p/security-audit` is the narrower audit pack the pre-commit hook ran before;
keeping it means the switch cannot lose a rule that was already enforced. Only
error severity fails the job: the warning-level packs (i18n key formats, Azure
hardening advice) are reported for triage, and the IaC ones are owned by the
IaC scanner. Two findings were fixed on adoption (the language menu built
markup with `innerHTML`; it now uses `textContent`). `applyI18n`'s
`data-i18n-html` sink no longer parses HTML at all: `lib/markup.js` splits a
translation into text, `<strong>` and `<code>` runs and the UI builds those
elements, so no finding needs a suppression.

## IaC scan exceptions

TFLint and Trivy lint what defines production: `infrastructure/`. Every
accepted finding is listed in `.trivyignore.yaml` or `.tflint.hcl` with its
reason, so the list of trade-offs stays short; the only inline suppressions
are the two per-resource `prevent_destroy` exceptions below, reason on the same
line:

| Finding                                                           | Why it is accepted                                                                                           | Lifted by |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------- |
| AZU-0012 storage network default allow                            | browsers load photos by SAS URL, and Flex Consumption without paid VNet integration uses the public endpoint | #556      |
| AZU-0057 storage logging                                          | billed per GB, read by nobody today; recovery relies on soft delete and versioning, not logs                 | —         |
| AZU-0058 no geo-redundant replication                             | LRS keeps the cost target; soft delete and versioning cover deletes and overwrites, not region loss          | —         |
| AZU-0060 no customer-managed key                                  | see "Encryption at rest": Key Vault is above the cost target                                                 | —         |
| AZU-0061 no infrastructure encryption                             | fixed at account creation, not retrofitted                                                                   | —         |
| TFLint `…_missing_prevent_destroy` on the `deployments` container | holds only the Functions package, which every deploy re-uploads                                              | —         |

The tools are installed from GitHub releases by version and SHA-256 (in
`scripts/quality/iac.sh`), not through third-party install actions: Trivy's
distribution channels were compromised once, and a hash pin is what a
repointed tag cannot move.

## Mutation scope

Mutation testing runs on an explicit list of modules (`mutation-targets.mjs`),
not on a glob: the pure logic whose behaviour unit tests can pin down, the
Function handlers (called directly with fake requests) and `frontend/src/lib/`.
Off the list: the Cosmos/Blob adapters and the multipart stream parser, which
the integration suite exercises against the emulators; the system clock and id
source `functions/src/lib/system.js` (nothing to mutate but the platform calls);
the load-test instrumentation `lib/profiling.js` and its switch `LoadProfiling/`
(never enabled in production; the load run's report checks them); the thin
entry files of `functions/scripts/` (wiring only; their logic is in
`scripts/lib/`, which is on the list); and the DOM layer `frontend/src/ui/`,
which Playwright exercises. Mutating those would measure the mocks. The same list sets the 100 % per-file coverage floor, so a module
cannot be mutation-tested without being fully covered, or the reverse.

`ignoreStatic` (functions) skips mutants that only run at module load
(`app.http()` registration, top-level schema constants): handlers are
imported once per test file, so those mutants cannot be killed without
reloading the module per mutant. Break thresholds start one point below the
measured score and only move up; known equivalent mutants are listed here when
one blocks a raise. Current survivors, all equivalent:

- `parseGpx.js`: min/max comparisons on equal values, the elevation loop
  starting at the first point, `difference >= 0`, the 1 km/h speed boundary,
  and `toArray`'s empty-element branch.
- `emulatorGuard.js`: the `'utf8'` read encoding (`JSON.parse` accepts the
  Buffer either way).
- `frontend/src/lib/mapData.js`: `|| []` → a non-empty array; a body that is not
  a list settles every tour on empty data either way.
- `frontend/src/lib/tours.js`: the static `SORT_OPTIONS` initialiser, which
  only runs at import.

## Property tests

Property tests are for functions whose input space is too large for examples
and whose invariant is easy to state: the GPX parser and simplifier take
arbitrary user files, and the open bug list is mostly edge cases examples
missed (#575, #548, #552, #554). The first run found three: fast-xml-parser's
internal error escaping `parseGpx` on malformed markup, `Math.min(...)`
overflowing the stack on a 150,000-point track (#575), and a test assumption
(`-0` does not survive being written into XML). The first two are fixed and
kept as example tests. Duration spans the earliest to the latest timestamp, so
out-of-order timestamps are a property too: the duration is never negative.

## GPX parsing: segments, names and empty files

- Distance, moving time and climb add up **within** each `<trkseg>` (and each
  `<trk>`), never across the gap between two: a train ride between two
  segments is not riding (#552). Elapsed duration still spans the earliest to
  the latest timestamp. The stored `heatmapData` stays one flat line, so the
  map still draws a straight line across the gap; splitting it is a
  document-shape change for another issue.
- A file without a valid track point falls back to its `<rte>` points (a
  planner's export); with none of either, the upload is refused with
  `errors.gpxNoTrack` instead of storing an empty 0 km tour (#554).
- Text stays text (`parseTagValue: false`), and a name taken from the file
  passes the same `nameSchema` as a typed one, falling back to "Untitled Tour"
  (#548). Tours stored before that may hold a numeric name; the responses read
  it as text, so no backfill is needed.
- An unreadable `<time>` no longer rejects the file: the date falls back to the
  earliest valid point time (#575). The magic-byte check skips leading
  whitespace and XML comments.
- Parsing runs on a worker thread (`lib/parseGpxOffThread.js`, #576): a 10 MB
  file takes about a second of CPU (crafted ones up to five), and on the
  request thread that stalled every other request on the instance. At most two
  parse at once, since each holds the whole XML tree, and a worker gets 512 MB
  of heap; a file that needs more is refused as an invalid GPX file. GPX keeps
  the 10 MB limit, because a long ride with heart-rate extensions needs it.
- Stored coordinates keep five decimals, about a metre, which halves the
  track's share of every map and detail payload. Tours stored before keep full
  precision; they read the same, so there is no backfill.

## Why load testing is manual and local by default

The k6 flows ([load testing](../how-to/load-testing.md)) run on demand
(`./buddy.sh test load`, or the `Load test (k6)` workflow's Run button), never
on push or pull request, and against the local stack unless a run explicitly
targets production.

- **A measurement, not a gate.** A shared runner's latency varies by more than
  most regressions a gate would catch, so a p95 threshold on every PR would
  either flap or be set so loose it never fails. What must not regress is
  asserted deterministically instead: RU per request, operations per request,
  single-partition queries and response size in the integration suite
  ("Deterministic guards" in the guide).
- **Local by default.** The local stack has the same code, queries and
  document shapes as production, costs nothing, and can be profiled
  (`LOAD_PROFILING=true`); the emulator's request charges are nominal, so RU
  are compared as operation counts, not absolute cost.
- **Production only on purpose.** Cosmos DB Serverless bills every request and
  real users share the capacity, and there is no staging environment. A hosted
  run needs `confirm_production`, is refused before any secret is read
  otherwise, runs one at a time, and uses a dedicated account's token
  (`LOAD_ACCESS_TOKEN`), since the auth bypass never exists there (#545).

## Cost

Everything targets the free/serverless tier (< €5/month), enforced by a budget
alert. See the [Cost report](../cost-report.md).
