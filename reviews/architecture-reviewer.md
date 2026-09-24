# Architecture review: architecture-reviewer

Raw findings from the **architecture-reviewer** role of the 2026-09-24 five-lens review of BikeBuddy (`main` at `b0bde68`). It ran two passes: a first pass over the whole repo, then an independent second pass that looked for missed issues (IDs `ARCH-Gnn`) and disputed first-pass claims. Vendored code (`frontend/src/vendor/`), lockfiles and generated output were out of scope.

Severity scale (shared by all reviewers): **critical**: exploitable now, severe; **high**: serious and plausible in production; **medium**: real defect, limited blast radius; **low**: hardening or minor; **info**: observation.

The findings below are the reviewer's own claims, as returned. The _Verification_ lines come from the adversarial verifiers: two independent lenses (code truth, impact) for every critical/high finding, and one skeptical batch check for medium/low. The lead's final, deduplicated severities are in [`REVIEW.md`](../REVIEW.md).

## Summary

BikeBuddy's backend is small, consistent and well commented. Each function in functions/src/&lt;Name&gt;/index.js follows the same auth → validate → load-owned → act pattern. Ownership is enforced through the partition key in lib/ownedTour.js and lib/db.js, and the frontend keeps a clean split between lib/ (pure logic) and ui/ (DOM). The main architectural problems are in lifecycle and deployment design rather than code style. First, the service worker serves the whole app shell cache-first and only refreshes when someone remembers to bump a hand-maintained version string. Git history shows three shell-changing commits since the last bump, so returning users are running stale JS/CSS right now. Second, deletion is incomplete: deleting a tour never removes its photo blobs. Third, the GDPR deletion queue deletes the Entra identity unconditionally, so any data written after the purge, or left behind by a failed purge, is orphaned for good with no owner. Beyond that there is drift between infrastructure and code: OpenTofu manages an unused 'images' container while the app creates and uses 'tour-images' itself. Production auth also fails open when the Entra repo variables are unset. The error contract mixes i18n keys and English prose, and client/server limits are defined twice. Docs lag the code: they still describe Leaflet.heat, an SWA proxy and sessionStorage, the API table is missing 4 endpoints, and the deletions container is not listed.

## Strengths noted

- Uniform handler shape across all 12 functions; tour-scoped endpoints share lib/ownedTour.js, so ownership is enforced in one place: a point read inside the caller's partition, where another user's tour is simply not found.
- lib/db.js queryUserItems always binds the partition key to the caller's userId, so API queries never cross partitions (matches design-decisions.md).
- Careful write ordering is documented and deliberate: UploadTour writes the blob first and rolls back if the Cosmos create fails; DeleteTour/DeleteImage delete the document first; EditTour/UploadImage use atomic patch ops; DeleteImage retries on an ETag conflict.
- Validation is centralised in lib/validation.js (zod) and UUID route-param checks run before any DB access; responses are explicitly projected (toTourResponse, and the GetMe/GetTours projections).
- Frontend lib/ modules are pure (no DOM) and unit-tested; ui/ holds the DOM code; the URL-state mapping (lib/url.js) is split from the history wiring (ui/router.js).
- The precache list is guarded by a test (frontend/test/sw.test.js) that fails when a lib/ui/locale file is missing from it.
- Vendored Leaflet and the Archivo font record their source and SRI hash in .leaflet-source/.archivo-source; the CSP keeps script-src 'self'.
- buddy.sh is one self-documenting entry point; maintenance scripts lint clean; no TODO/FIXME debt in first-party code.
- The privileged Graph credential is kept out of the internet-facing Function App (out-of-band deletion job): a sound separation of privilege.

## Findings overview

Reviewer-assigned counts: 0 critical, 3 high, 8 medium, 20 low, 0 info.

| ID       | Reviewer severity | Title                                                                                                                                                            | Location                                         | Verification                                                                   |
| -------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------ |
| ARCH-01  | high              | Service worker serves the whole app shell cache-first behind a hand-bumped CACHE\_NAME that is already out of date, so returning users run stale JS/CSS          | `frontend/src/sw.js:10`                          | code-truth: partially-confirmed → medium; impact: partially-confirmed → medium |
| ARCH-02  | high              | DeleteTour never deletes the tour's photo blobs (full images and thumbnails): personal photos persist until account deletion                                     | `functions/src/DeleteTour/index.js:26`           | code-truth: partially-confirmed → medium; impact: partially-confirmed → medium |
| ARCH-03  | high              | Account-deletion pipeline deletes the Entra identity unconditionally and records only the oid, so data written after or left by the purge is orphaned forever    | `functions/src/DeleteAccount/index.js:41`        | code-truth: partially-confirmed → medium; impact: partially-confirmed → medium |
| ARCH-04  | medium            | IaC/code drift: OpenTofu provisions an unused 'images' container while the app creates and uses an unmanaged 'tour-images' container at runtime                  | `infrastructure/storage.tf:34`                   | confirmed → low                                                                |
| ARCH-05  | medium            | Production auth mode is derived from 'Entra variables are empty': a missing repo variable deploys an open, shared-account API and frontend                       | `infrastructure/functions.tf:37`                 | confirmed → medium                                                             |
| ARCH-06  | medium            | API error contract is half i18n keys, half English prose: non-English users get untranslated errors                                                              | `functions/src/UploadImage/index.js:53`          | partially-confirmed → low                                                      |
| ARCH-G01 | medium            | A failed container init is cached as a rejected promise, so one storage error breaks every blob endpoint on that instance until it is recycled                   | `functions/src/lib/blobStorage.js:34`            | confirmed → medium                                                             |
| ARCH-G02 | medium            | GPX-derived tour names skip the validation layer: numeric or attributed &lt;name&gt; is stored as a number or object, which breaks GetTour and the frontend list | `functions/src/UploadTour/index.js:64`           | partially-confirmed → low                                                      |
| ARCH-G03 | medium            | All user data is keyed on the app-scoped (pairwise) `sub` claim, and the tenant-stable `oid` is never stored with it                                             | `functions/src/middleware/authMiddleware.js:103` | partially-confirmed → low                                                      |
| ARCH-G04 | medium            | Frontend token layer: silent-renewal failure falls back to a popup outside any user gesture, concurrently, and a 401 never triggers re-authentication            | `frontend/src/ui/auth.js:160`                    | confirmed → medium                                                             |
| ARCH-G05 | medium            | Production deploy is not gated on CI, and Dependabot PRs of every update type are auto-merged straight into that deploy                                          | `.github/workflows/deploy.yml:5`                 | confirmed → medium                                                             |
| ARCH-07  | low               | Client/server contract (size limits, photo cap, text lengths, language list) is defined twice by hand                                                            | `functions/src/lib/validation.js:45`             | confirmed → low                                                                |
| ARCH-08  | low               | Tour DTO has no single shape: toTourResponse passes storage fields through, so EditTour returns unsigned blob URL and blobNames plus 5k points                   | `functions/src/lib/tourResponse.js:13`           | confirmed → low                                                                |
| ARCH-09  | low               | No schema versioning for stored documents; migrations are unrecorded, untested one-off scripts, so legacy shims can never be removed                             | `functions/scripts/backfillTourStats.js:69`      | confirmed → low                                                                |
| ARCH-10  | low               | Write endpoints handle partial failure and concurrency inconsistently (orphaned photo blobs, a check-then-act cap, 500s on concurrent delete or first login)     | `functions/src/UploadImage/index.js:77`          | confirmed → low                                                                |
| ARCH-11  | low               | Handler boilerplate: positional-parameter dependency injection and no shared wrapper for auth or errors                                                          | `functions/src/GetMapData/index.js:46`           | confirmed → low                                                                |
| ARCH-12  | low               | REST surface inconsistencies: verb-in-path upload route, a different id field in the create response, no pagination or versioning                                | `functions/src/UploadTour/index.js:112`          | confirmed → low                                                                |
| ARCH-13  | low               | Map pipeline is still built around a removed heat layer (MAX\_GAP\_METERS justification, dangling heatmapZoom.js reference, 'heatmap' naming)                    | `functions/src/GetMapData/index.js:24`           | confirmed → low                                                                |
| ARCH-14  | low               | Frontend ui/ modules form import cycles around a shared mutable state and tour objects with overloaded fields                                                    | `frontend/src/lib/mapData.js:29`                 | confirmed → low                                                                |
| ARCH-15  | low               | Docs out of sync with the code (API table, containers, SWA proxy, token storage, required secrets)                                                               | `docs/reference/architecture.md:26`              | confirmed → low                                                                |
| ARCH-16  | low               | Vendored MSAL is pinned manually and old (3.28.1, Jan 2025), with no update tracking; Dependabot ignores frontend/ and e2e/                                      | `frontend/src/vendor/.msal-source:1`             | partially-confirmed → low                                                      |
| ARCH-17  | low               | Optimistic 'undo' delete runs only in a browser setTimeout, so deletions are silently dropped if the tab or PWA closes within 6 s                                | `frontend/src/ui/tour-detail.js:180`             | confirmed → low                                                                |
| ARCH-18  | low               | GDPR export returns raw Cosmos documents with system fields and storage references, but not the user's GPX files or photos                                       | `functions/src/ExportData/index.js:21`           | confirmed → low                                                                |
| ARCH-G06 | low               | Release is not ordered or atomic: the frontend ships even if the backend publish fails, and the publish tool is unpinned in deploy but pinned in CI              | `.github/workflows/deploy.yml:88`                | confirmed → low                                                                |
| ARCH-G07 | low               | The committed dev settings template makes every authenticated API call return 500, contradicting the getting-started docs                                        | `functions/local.settings.json.example:10`       | confirmed → low                                                                |
| ARCH-G08 | low               | ensureDetail treats a failed detail fetch as loaded and keeps the partial /api/map data for 45 minutes                                                           | `frontend/src/ui/sidebar.js:96`                  | confirmed → low                                                                |
| ARCH-G09 | low               | The JWKS client is cached forever for the first jwks\_uri, so the documented 1-hour OIDC metadata refresh has no effect on keys                                  | `functions/src/middleware/authMiddleware.js:38`  | confirmed → low                                                                |
| ARCH-G10 | low               | destroy.yml passes an undeclared `package_path` variable, a leftover of the removed run-from-package design, so teardown fails                                   | `.github/workflows/destroy.yml:41`               | confirmed → low                                                                |
| ARCH-G11 | low               | Deploy inputs are not reproducible: the provider lock file and .funcignore are both gitignored                                                                   | `.gitignore:73`                                  | confirmed → low                                                                |
| ARCH-G12 | low               | The history-depth router is not reconciled after a reload, so Back needs two presses and Forward never reopens a layer                                           | `frontend/src/ui/router.js:60`                   | confirmed → low                                                                |
| ARCH-G13 | low               | Tour metadata (up to 2,000-char description) goes in the upload URL query string, unlike every other write, which uses a JSON body                               | `functions/src/UploadTour/index.js:34`           | confirmed → low                                                                |

## Findings

### ARCH-01: Service worker serves the whole app shell cache-first behind a hand-bumped CACHE\_NAME that is already out of date, so returning users run stale JS/CSS

- **Severity (reviewer):** high
- **Category:** frontend-deployment · **Effort:** S · **Confidence:** high
- **Location:** `frontend/src/sw.js:10`
- **Also:** `frontend/src/sw.js:16`, `frontend/src/sw.js:122`, `frontend/src/ui/dom.js:3`, `frontend/test/sw.test.js:33`, `.github/workflows/deploy.yml:150`

**Evidence:**

```text
// Bump this on any change to the precached shell ... it's the
// only thing that invalidates a previously installed cache.
const CACHE_NAME = 'bikebuddy-shell-v9';
...
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
```

**Description.** Every same-origin, non-navigation GET is answered from the precache first: app.js, all ui/\*.js and lib/\*.js modules, style.css, config.js and the locales. The browser only reinstalls the worker, and refreshes that cache, when sw.js's bytes change, so correctness depends on a human remembering to bump CACHE\_NAME. Nothing in CI checks this: sw.test.js only checks that files are listed. Git history shows it being forgotten. The last bump (v9) was b27e779. Since then 42a19ee (style.css, ui/modal.js, ui/routes.js, ui/sidebar.js, ui/tour-detail.js: 'fix modal scroll-through'), 07bfdad (ui/sidebar.js) and aff8ef1 (index.html) shipped with no bump. Earlier, 8e914bd, d1866fb, 3f589f3, e948d9b and 310748b did the same. Navigations are network-first, so users also get a mixed version: a fresh index.html with stale cached modules. ui/dom.js resolves roughly 100 element ids at module evaluation, so a future HTML change that renames or removes an id would make the stale dom.js/app.js throw on `null.addEventListener` and blank the app. config.js is also cached cache-first, so a changed apiBaseUrl or Entra client id never reaches installed clients either.

**Impact.** Returning visitors and installed-PWA users on production are running the v9 shell right now, without the fixes from at least 3 releases. Any future frontend security or bug fix is silently not delivered, and an HTML/JS id mismatch can blank the app for exactly the most engaged users.

**Recommendation.** Stop depending on a manual bump. Either (a) derive CACHE\_NAME at deploy time from the git SHA or a content hash, written into sw.js by the same step that generates config.js; or (b) make same-origin shell assets stale-while-revalidate or network-first, keeping cache-first only for vendor/ and icons. Also add a CI check that fails when frontend/src changes without a CACHE\_NAME change. Exclude config.js from cache-first.

**Verification (two adversarial lenses):**

- _code-truth_: **partially-confirmed**, severity → **medium**, reachable in production: yes.
- _impact_: **partially-confirmed**, severity → **medium**, reachable in production: yes.

<details><summary>code-truth verifier: reasoning, evidence and reproduction</summary>

Core claim: confirmed. Every same-origin non-navigation GET is served from the precache with no revalidation. The browser only reinstalls the worker when sw.js's bytes change, and those bytes only change when a human bumps CACHE\_NAME. CI does not enforce the bump, and the deploy step does not stamp a version. Git history shows three commits after the v9 bump that changed JS and CSS with no bump, and all of them reached main, which deploys on push. So returning visitors whose worker installed v9 keep running the v9 ui/modal.js, routes.js, sidebar.js, tour-detail.js and style.css indefinitely, without the "fix modal scroll-through" and tour-toggle changes. They get the current index.html, because navigations are network-first. config.js is cache-first too, so a changed apiBaseUrl or Entra client id (for example after destroy.yml plus re-provisioning) would not reach installed clients until the next bump.

Overstated parts, which is why this is partially confirmed and medium rather than high:
(1) Nothing is broken right now. The only HTML change since v9 (aff8ef1) swaps an SVG icon, no ids changed, and dom.js is unchanged. The v9 JS runs correctly against today's index.html. The "blank the app" scenario is hypothetical and needs a future id rename.
(2) The fixes being missed are UI polish, not security or data-integrity fixes. The frontend makes no authorization decisions; those happen server-side.
(3) The older commits cited (8e914bd, d1866fb, 3f589f3, e948d9b, 310748b) were stale only until later bumps (314697a to v8, b27e779 to v9) superseded them. That is a recurring pattern, not a set of fixes still missing.
(4) All precached modules are fetched together in one install, so JS modules never mix versions with each other. Only index.html can differ from the JS.
Each bump fully fixes affected clients, because the update check for sw.js bypasses the HTTP cache by default.

Rubric fit: this is a real, recurring defect ("maintainability issue that is actively producing bugs": shipped fixes are not delivered). The blast radius is limited to stale UI for returning users, with no security, data-loss or outage impact today. That makes it medium, not high.

Evidence:

```text
frontend/src/sw.js:7-10: "Bump this on any change to the precached shell ... it's the only thing that invalidates a previously installed cache. const CACHE_NAME = 'bikebuddy-shell-v9';"
frontend/src/sw.js:122: "event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));" (cache-first, no revalidation, for app.js, config.js, style.css, lib/*, ui/*, locales listed at sw.js:12-69)
frontend/src/sw.js:111-118: navigations are network-first ("fetch(request).catch(() => caches.match('index.html')...").
frontend/src/app.js:308: "navigator.serviceWorker.register('sw.js')". Module imports carry no version query string (e.g. app.js:90 "import { renderSidebar, ... } from './ui/sidebar.js'"), so the cached entries always match.
.github/workflows/deploy.yml:3-5 deploys on every push to main, and deploy.yml:105-114 generates config.js and uploads frontend/src/ as-is. Nothing rewrites sw.js or CACHE_NAME. .github/workflows/gate.yml has no sw/CACHE_NAME check.
frontend/test/sw.test.js:33-54 only checks that the precache list is complete and that each listed file exists. It never checks for a version bump.
git: `git log -L10,10:frontend/src/sw.js` shows the last bump v8->v9 in b27e779. `git diff b27e779 HEAD --stat -- frontend/src` shows index.html, style.css, ui/modal.js, ui/routes.js, ui/sidebar.js and ui/tour-detail.js changed afterwards (42a19ee, 07bfdad, aff8ef1), all on main (`git branch -a --contains 07bfdad` lists main).
`git diff b27e779 HEAD -- frontend/src/index.html` changes only one SVG icon (path to polygon/lines). No element ids changed, and ui/dom.js is unchanged since v9.
```

Reproduction:

```text
No browser reproduction: Playwright and e2e runs are out of scope. I checked the behaviour with git and code reading instead.
`git log --format='%h %s' -L10,10:frontend/src/sw.js` shows the last CACHE_NAME change is b27e779 (v8 to v9).
`git show --stat` on 42a19ee, 07bfdad and aff8ef1 shows changes to style.css, ui/modal.js, ui/routes.js, ui/sidebar.js, ui/tour-detail.js and index.html, none of which touch sw.js.
`git diff b27e779 HEAD --stat -- frontend/src` reports 6 files changed (+64/-17), and sw.js is not among them.
`git diff b27e779 HEAD -- frontend/src/index.html` is an SVG-only change.
`git branch -a --contains 07bfdad` lists main and remotes/origin/main.
deploy.yml triggers on push to main, and its frontend job only generates config.js and uploads frontend/src/.
```

</details>

<details><summary>impact verifier: reasoning, evidence and reproduction</summary>

The facts in the report hold. The fetch handler serves the JS/CSS/config shell cache-first. The browser reinstalls the worker only when sw.js's bytes change. Deploys publish frontend/src as-is, with no hash injection. The manual bump was skipped for 42a19ee and 07bfdad, which are the latest frontend commits. So returning users with the v9 worker installed are still running the old JS/CSS for those fixes right now. This is reachable in production and hits every returning user.

I am downgrading it from high to medium:
(1) The harm today is small. The missed changes are mobile UI polish: the modal body-scroll lock, closing detail when the open tour is clicked again, and hiding the in-view filter on mobile. None is a security, data-integrity or availability fix.
(2) aff8ef1 changed only index.html. Navigations are network-first, so users get that change fresh. The report's claim of "at least 3 releases" missed is really 2 releases of JS/CSS.
(3) No id mismatch exists today. The only index.html change since v9 is an SVG icon edit, so the mixed-version failure (stale dom.js throwing on a missing id) is a plausible future scenario, not a current outage.
(4) The problem heals itself. The next CACHE\_NAME bump (the maintainer has done 9 so far) deletes the old caches and delivers everything. A force reload or clearing site data also recovers.
(5) The config.js concern is speculative: apiBaseUrl and the Entra client id rarely change.

Under the rubric this is "a maintainability issue that is actively producing bugs" with limited blast radius (stale UI behaviour, no data or security impact), which is medium. It is not "serious... critical-path behaviour that is wrong", because the tour CRUD and auth paths work. The recommendation (a deploy-time hash or SHA in CACHE\_NAME, or stale-while-revalidate for first-party assets, plus a CI guard) is sound and cheap, so this belongs in the top-10 fixes, but at medium.

Evidence:

```text
frontend/src/sw.js:7-10 "Bump this on any change to the precached shell ... it's the only thing that invalidates a previously installed cache. const CACHE_NAME = 'bikebuddy-shell-v9';"
frontend/src/sw.js:122 "event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));" (cache-first for every same-origin non-navigation GET, including app.js, ui/*.js, lib/*.js, style.css and config.js at lines 15-17 and 32-61).
frontend/src/sw.js:111-118: navigations are network-first ("Network-first so a signed-in user always gets a fresh shell"), so index.html is fresh while the modules are stale.
.github/workflows/deploy.yml: "run: ./buddy.sh infrastructure generate-config", then "upload-pages-artifact ... path: frontend/src/". Nothing rewrites sw.js at deploy time, and grep finds CACHE_NAME only in sw.js.
frontend/test/sw.test.js:33-45 only checks that lib/, ui/ and locale files appear in PRECACHE_URLS. Nothing checks the version.
git log: b27e779 is the last commit touching sw.js (the v9 bump). Later frontend commits leave sw.js alone: 42a19ee (style.css, ui/modal.js, ui/routes.js, ui/sidebar.js, ui/tour-detail.js), 07bfdad (ui/sidebar.js) and aff8ef1 (index.html only).
frontend/src/ui/dom.js:3-15: "export const $ = (id) => document.getElementById(id); ... export const elTourList = $('tour-list');" resolves ids at module evaluation with no null guard.
```

Reproduction:

```text
I ran read-only commands only.
- `git log --oneline -- frontend/src` compared with `git log -- frontend/src/sw.js` showed b27e779 as the last sw.js change, followed by aff8ef1, 42a19ee and 07bfdad.
- `git show --stat` on those three listed the changed files quoted above.
- `git log -S"bikebuddy-shell-v"` confirmed the mechanism is a manual bump.
- A grep across the repo for CACHE_NAME/sw.js found no deploy-time rewrite.
- Reading deploy.yml confirmed it uploads frontend/src directly.
I did not attempt a browser reproduction, because running Playwright is out of scope.
```

</details>

Lead re-verified: **confirmed, downgraded to medium**. The last `CACHE_NAME` bump is b27e779. Since then 42a19ee, 07bfdad and aff8ef1 changed 6 files under `frontend/src` (+64/-17) with no bump. Returning users therefore run stale JS/CSS. The missed changes are UI polish, and nothing is broken today.

### ARCH-02: DeleteTour never deletes the tour's photo blobs (full images and thumbnails): personal photos persist until account deletion

- **Severity (reviewer):** high
- **Category:** data-lifecycle · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/DeleteTour/index.js:26`
- **Also:** `functions/src/UploadImage/index.js:73`, `functions/src/DeleteImage/index.js:31`, `functions/src/DeleteAccount/index.js:15`

**Evidence:**

```text
// DELETE /api/tours/{tourId} — removes the tour document and its GPX blob.
...
  await getToursContainer().item(tourId, userId).delete();

  const container = await getGpxContainer();
  await container.getBlockBlobClient(`${userId}/${tourId}.gpx`).deleteIfExists();
```

**Description.** Photos are stored at `${userId}/${tourId}/${imageId}.jpg` plus `_thumb.jpg` in the images container (UploadImage/index.js:73). DeleteTour does not even take an images container as a dependency, so deleting a tour removes the document and the GPX file but leaves up to 40 image blobs per tour behind. Once the document is gone nothing references them: they are not exported, not listed, and no SAS URL can be minted for them. The only thing that ever removes them is the prefix sweep in DeleteAccount. The DeleteImage comment ('reaped wholesale by DeleteAccount') shows orphaned blobs being accepted as a design choice, but here it applies to the normal success path, not a failure path. Unit tests don't cover it. Probe: deleteTour on a tour with one image deleted only the Cosmos doc and the .gpx blob; image blobs touched: 0. The multi-select delete in tour-detail.js:617 fans this out over many tours.

**Impact.** Every tour a user deletes keeps its photos in storage indefinitely. The user believes they are erased, but they are retained (GDPR Art. 17 erasure only happens if the whole account is deleted), and storage cost keeps growing for data nobody can reach.

**Recommendation.** In DeleteTour, after deleting the document, delete by prefix `${userId}/${tourId}/` in the images container. Reuse DeleteAccount's deleteBlobsByPrefix, moved into lib/blobStorage.js. Add a unit test. Run a one-off reconciliation that lists images-container prefixes whose tourId has no Cosmos doc and deletes them.

**Verification (two adversarial lenses):**

- _code-truth_: **partially-confirmed**, severity → **medium**, reachable in production: yes.
- _impact_: **partially-confirmed**, severity → **medium**, reachable in production: yes.

<details><summary>code-truth verifier: reasoning, evidence and reproduction</summary>

The core claim is true. DeleteTour does not depend on the images container and never touches it. Every photo uploaded to a tour (full image plus thumbnail, up to 20 x 2 = 40 blobs) stays in the private `images` container after the tour is deleted. I checked every place that could clean them up and none does. The frontend sends a single DELETE and does not remove images one by one first. There is no blob lifecycle or management policy in storage.tf. No maintenance script in functions/scripts reaps them (backfillImageThumbnails, backfillTourStats, init-cosmos, process-deletions). Only DeleteAccount's `${userId}/` prefix sweep removes them. Unit tests do not cover this. The bug is reachable on every normal tour deletion in production.

Where the finding overstates things:
(1) Severity. No other user and no attacker can reach the data. The container is private. The tour document holding blobName and the photo's lat/lon is deleted, so no new SAS can be minted. A SAS already issued expires within 1 hour. The retained JPEGs are also re-encoded without EXIF (UploadImage/index.js:68 "The resize re-encodes and drops EXIF"), so the location data in the photos is not what persists. The real impact is a broken user-facing erasure promise: the confirm dialog says the tour is deleted, but its photos stay until the account is deleted. That is a GDPR Art. 17 / data-minimisation compliance issue, plus slow storage growth that costs cents at this user base. It is not a significant security weakness with an attack path, and it is not data loss or corruption. Under the shared rubric that makes it a real defect with limited blast radius and a test gap on an important path: medium, not high. Also, DeleteAccount does reap these blobs, so full account erasure still works.
(2) Detail. The multi-delete call site is tour-detail.js:185, not :617.
The recommendation is sound: move deleteBlobsByPrefix into lib/blobStorage.js, call it with `${userId}/${tourId}/` on the images container after the document delete, add a test, and run a one-off orphan sweep.

Evidence:

```text
functions/src/DeleteTour/index.js:9 "// DELETE /api/tours/{tourId} — removes the tour document and its GPX blob."; :10-15 signature takes only (request, auth, getToursContainer, getGpxContainer), with no images container; :26 "await getToursContainer().item(tourId, userId).delete();"; :29 "await container.getBlockBlobClient(`${userId}/${tourId}.gpx`).deleteIfExists();".
functions/src/UploadImage/index.js:16 "const MAX_TOUR_IMAGES = 20;"; :73 "const blobName = `${userId}/${tourId}/${imageId}.jpg`;"; :76 "thumbBlobName(blobName)", so each image writes 2 blobs and a tour can hold up to 40.
functions/src/DeleteAccount/index.js:15-21 "async function deleteBlobsByPrefix(container, prefix)" and :52 "await deleteBlobsByPrefix(await getImages(), prefix);". This is the only code path that deletes image blobs in bulk.
functions/src/DeleteImage/index.js:57-58 deletes the image and its thumb, but only when one photo is removed on its own.
infrastructure/storage.tf:4-37 has no azurerm_storage_management_policy or lifecycle rule; the images container is just "container_access_type = \"private\"". A grep for lifecycle, management_policy or orphan across infrastructure/, functions/scripts and docs found no reaper.
frontend/src/ui/tour-detail.js:185 "await apiFetch(`/api/tours/${id}`, { method: 'DELETE' });". Nothing deletes the images first. The file is 291 lines, so the reviewer's reference to line 617 is wrong.
functions/src/DeleteTour/index.test.js only mocks the tours and gpx containers and never asserts anything about images.
functions/src/lib/blobStorage.js:5 "const SAS_TTL_MS = 60 * 60 * 1000; // 1 hour".
```

Reproduction:

```text
I wrote /tmp/claude-0/-home-user-BikeBuddy/ba198852-09c2-5d10-a6cd-4f788c2502d9/scratchpad/verify-arch02/probe.js. It stubs '@azure/functions' via Module._load, requires the real functions/src/DeleteTour/index.js, and calls deleteTour({params:{tourId:'11111111-1111-4111-8111-111111111111'}}, auth->{userId:'u1'}, toursContainer returning a tour with images:[{id:'i1', blobName:'u1/<tourId>/i1.jpg'}], gpxContainer recording calls). I ran it with `cd functions && node probe.js`. Output:
status 204
[ 'cosmos:delete 11111111-1111-4111-8111-111111111111/u1', 'gpx:deleteIfExists u1/11111111-1111-4111-8111-111111111111.gpx' ]
deleteTour.length (params): 1
Only the Cosmos document and the GPX blob were deleted. No image or thumbnail blob was touched, and the handler has no images-container parameter. My first run used a non-UUID tourId and returned 400 from loadOwnedTour validation, which is unrelated.
```

</details>

<details><summary>impact verifier: reasoning, evidence and reproduction</summary>

The fact is confirmed. On the normal success path, DeleteTour deletes the Cosmos document and the GPX blob and never touches the images container. So every full-size photo and thumbnail of a deleted tour stays in storage until the user deletes their account. It happens in production every time someone deletes a tour that has photos, including the multi-select delete.

Why I downgrade from high to medium under the shared rubric:
(1) Nothing is exposed and there is no cross-user impact. The containers are private and no API path can mint a SAS for an orphaned blob, because SAS generation depends on the tour document. Neither the user nor other users can reach the photos; only someone holding storage-account credentials (the maintainer or the platform) can.
(2) No data is lost or corrupted. This is the opposite problem: data is kept too long.
(3) Cost is negligible. Images are re-encoded and resized server-side, the user base is small, and at most about 40 images fit in one tour.
(4) Account deletion still erases the data (DeleteAccount's prefix sweep), so a full erasure path exists.

What remains is a real defect: a privacy and data-minimisation problem (GDPR Art. 17 for per-tour erasure; the UI tells users deletion is irreversible, which implies erasure) plus an untested gap on a user-facing path. It is limited to the user's own data at rest and is invisible to everyone except the operator, which fits "real defect with limited blast radius". It does not fit "significant security weakness with a realistic attack path" or "data corruption/loss". The fix and the one-off reconciliation in the recommendation are still right. Note: the orphaned photos keep the resized JPEGs without EXIF, but the tour.images entries that held the lat/lon are deleted with the document, so no GPS stays alongside the orphaned blobs.

Evidence:

```text
functions/src/DeleteTour/index.js:9 "// DELETE /api/tours/{tourId} — removes the tour document and its GPX blob." and lines 26-29 "await getToursContainer().item(tourId, userId).delete(); ... await container.getBlockBlobClient(`${userId}/${tourId}.gpx`).deleteIfExists();". The function has no images-container dependency (lines 10-15 take only auth, getToursContainer, getGpxContainer).
functions/src/UploadImage/index.js:73 "const blobName = `${userId}/${tourId}/${imageId}.jpg`;" plus a thumbnail via thumbBlobName(blobName).
functions/src/DeleteImage/index.js:31-33 "The leftover from failing here is an orphaned blob: invisible, cheap, and reaped wholesale by DeleteAccount". This accepts orphans only on the failure path.
frontend/src/ui/tour-detail.js:185 "apiFetch(`/api/tours/${id}`, { method: 'DELETE' })": the client does not delete images first. The locale confirm text says the action is irreversible ("L'operazione non può essere annullata").
Mitigations that limit blast radius: infrastructure/storage.tf:30/36/43 "container_access_type = \"private\"". Images are reachable only through SAS URLs minted from tour.images entries, and those entries go away with the document.
```

Reproduction:

```text
I wrote /tmp/claude-0/-home-user-BikeBuddy/ba198852-09c2-5d10-a6cd-4f788c2502d9/scratchpad/arch02v/p.js. It require()s functions/src/DeleteTour/index.js and calls deleteTour with stubbed auth (userId 'user-1'), a tours container whose tour has images:[{id:'i1',blobName:'user-1/<tourId>/i1.jpg'}], and a recording GPX container. I ran `node p.js` and got: { status: 204 } [ [ 'cosmos.delete', '11111111-1111-4111-8111-111111111111', 'user-1' ], [ 'gpx.delete', 'user-1/11111111-1111-4111-8111-111111111111.gpx' ] ]. The images container is never touched, and the function has no parameter through which one could be passed.
```

</details>

Lead re-verified: **confirmed, downgraded to medium** (same root cause as QA-01 and PERF-G01).

### ARCH-03: Account-deletion pipeline deletes the Entra identity unconditionally and records only the oid, so data written after or left by the purge is orphaned forever

- **Severity (reviewer):** high
- **Category:** data-lifecycle · **Effort:** M · **Confidence:** medium
- **Location:** `functions/src/DeleteAccount/index.js:41`
- **Also:** `functions/scripts/process-deletions.js:357`, `functions/src/GetMe/index.js:17`, `functions/src/UpdateProfile/index.js:39`, `docs/explanation/design-decisions.md:46`, `.github/workflows/process-deletions.yml:8`

**Evidence:**

```text
  if (userOid) {
    await getDeletions().items.upsert({ id: userOid, requestedAt: new Date().toISOString() });
  }
```

**Description.** The deletion record is written first and holds only the Entra object id, not the app userId (sub). process-deletions.js (lines 357-361) then deletes the directory user and the queue entry without checking whether the app data is actually gone, and it has no way to check. The identity stays usable until the next 03:00 UTC run. In that window: (1) a user who signs in again 'to check' goes through GetMe, which creates a new user doc on read (GetMe/index.js:17-19), and they can even upload tours; (2) another open device can keep calling UploadTour/UpdateProfile, which create data without any user-doc precondition; (3) if DeleteAccount failed part-way (Promise.all over tours, then blob prefixes, then the user doc) and the user doesn't retry, the leftovers remain. At 03:00 the identity is deleted, and all of that personal data (name, email, GPS tracks, photos) can no longer be reached by the user or found by any process: no userId is recorded and there is no reconciliation. design-decisions.md:46 claims DELETE 'purges all app data immediately'; that holds only for data that existed at that moment and only when every step succeeds.

**Impact.** A realistic path (delete, then sign in again the same day) leaves the user's name and email, and possibly tracks, retained indefinitely after a GDPR erasure request, with no owner able to remove them and no job that will ever find them.

**Recommendation.** Store {id: oid, userId: sub} in the deletion record. In process-deletions.js, re-run the full app-data purge for that userId (tours by partition, both blob prefixes, the user doc) before deleting the identity, and only dequeue once both are done. Also have GetMe/UpdateProfile refuse to recreate a user that has a pending deletion record, or return 410. Put the purge logic in a shared lib module used by both DeleteAccount and the job, and add tests for the job, which currently has none.

**Verification (two adversarial lenses):**

- _code-truth_: **partially-confirmed**, severity → **medium**, reachable in production: yes.
- _impact_: **partially-confirmed**, severity → **medium**, reachable in production: yes.

<details><summary>code-truth verifier: reasoning, evidence and reproduction</summary>

The core mechanism is real and I reproduced it.

- DeleteAccount queues only the Entra oid, before the purge runs.
- The daily job deletes the directory user and dequeues the record purely on Graph status 204/404. It never touches or checks app data, and it cannot, because oid does not map to the sub-keyed userId.
- No handler checks the deletions container. So in the window before 03:00 UTC, a re-sign-in (GetMe), a PATCH /me, or an UploadTour from another open device that still holds a valid access token recreates personal data under the same sub.
- After the job runs, that data is keyed to an identity that no longer exists. The user can never reach it again, and no process looks for it.
- If DeleteAccount fails part-way (for example, a transient Cosmos or Blob error after the queue upsert), the identity is still deleted at 03:00 unless the user retries successfully before then. That also orphans the leftovers.

Mitigations that limit scope and severity:

- The frontend signs the user out right after a successful delete, so the orphaning path needs either a deliberate re-login within hours of an erasure request, or another device or tab actively writing within the access-token lifetime.
- A failed delete shows an error toast, which invites a retry. Only the user doc is idempotently re-deletable, but the whole endpoint is safely re-runnable while the identity exists.
- The orphaned data is not exposed to anyone. Nobody else can authenticate as that sub. It is retained, not leaked, and the maintainer has full DB access and could purge it manually if asked (for example, a users doc still holds the email). So "no owner able to remove them" is overstated. It is more accurate to say that no automated process will find it.

Other inaccuracies in the report:

- process-deletions.js:357 does not exist. The relevant lines are 57-61.
- In the re-sign-in path the user actively re-created the data, which blurs the "retained after erasure" framing, although the later silent identity deletion is still a real defect.

Against the rubric: this is a real data-lifecycle and GDPR defect, but it needs unusual conditions (re-login or concurrent writes inside a window of up to about 24h, or a partial failure with no retry), and the blast radius is limited to that user's own data being retained. That fits medium, not high.

Evidence:

```text
functions/src/DeleteAccount/index.js:41-42 "if (userOid) {\n    await getDeletions().items.upsert({ id: userOid, requestedAt: new Date().toISOString() });" (only the oid is stored, and it is queued before the purge steps at 45-55: tours Promise.all, gpx prefix, images prefix, user doc).
functions/src/middleware/authMiddleware.js:103-105 "userId: payload.sub, ... userOid: payload.oid ?? null" (the app key is sub and the deletion key is oid; the queue record never links them).
functions/scripts/process-deletions.js:57-61 (the file has 75 lines, so the reviewer's citation of line 357 is wrong) "for (const { id } of resources) { const status = await deleteUser(token, id); if (status === 204 || status === 404) { await container.item(id, id).delete();" (no check that app data is gone, and no reconciliation).
functions/src/GetMe/index.js:16-19 "let doc = await readItem(container, userId, userId); if (!doc) { doc = { id: userId, name: userName, email: userEmail, ... }; ... container.items.create(doc)" (recreates the user doc on read and does not check the deletions container).
functions/src/UpdateProfile/index.js:38-49 (upserts a new doc when it is missing). functions/src/UploadTour/index.js:31,59-63 (writes under userId with no user-doc precondition).
No file under functions/src reads 'deletions' except DeleteAccount (a grep of functions/src finds it only in DeleteAccount and lib/db.js).
.github/workflows/process-deletions.yml: cron "0 3 * * *".
frontend/src/ui/profile.js:139-144: after a successful DELETE the client calls signOut() (MSAL logoutPopup), but nothing stops a fresh sign-in, because the Entra identity is still valid until the next job run.
docs/explanation/design-decisions.md: "`DELETE /api/account` purges all app data immediately (tours, blobs, user doc)".
The process-deletions job has no tests (a grep for process-deletions outside node_modules finds only scripts/maintenance/delete-users.sh).
```

Reproduction:

```text
I ran /tmp/claude-0/-home-user-BikeBuddy/ba198852-09c2-5d10-a6cd-4f788c2502d9/scratchpad/arch03/probe.js from functions/. It loads the real deleteAccount and getMe handlers with in-memory fake Cosmos containers and blob containers, and auth returning {userId:'sub-123', userOid:'oid-abc'}. It seeds a user doc, calls deleteAccount, then calls getMe (simulating a re-sign-in).

Output:
"delete: 204
after delete users: [] deletions: [ { id: 'oid-abc', requestedAt: '2026-09-24T11:30:41.189Z' } ]
re-login GetMe: 200 {"id":"sub-123","name":"Alice","email":"a@b.c","createdAt":"2026-09-24T11:30:41.191Z"}
users now: [ { id: 'sub-123', name: 'Alice', email: 'a@b.c', ... } ]"

This confirms that the deletion record holds only the oid and that GetMe silently recreates the name/email doc after deletion. I did not run the Graph job, because it needs cloud credentials. From reading it, it dequeues on 204/404 without inspecting app data.
```

</details>

<details><summary>impact verifier: reasoning, evidence and reproduction</summary>

The core mechanism is correct. The deletion queue stores only the Entra oid, and it is written before the purge. The scheduled job deletes the identity and dequeues it without checking or re-running the app-data purge, and it cannot do so because the app keys data on `sub`, not `oid`. GetMe and UpdateProfile recreate a user doc for any valid token, with no check for a pending deletion. So both orphaning paths are real and reachable in production: (a) the user signs in again before 03:00 UTC, which recreates name and email from the token and lets them upload tours; (b) DeleteAccount throws part-way (a Cosmos or blob error), the frontend shows an error toast, and the user doesn't retry.

Why I downgrade from high to medium:

1. Both paths need uncommon conditions. For (a), the user has to deliberately sign back in to an account they just deleted, within a window of less than 24h. The frontend signs them out right after a successful delete. For (b), a transient backend failure is needed and the user then has to give up; the error toast invites a retry, and a retry is idempotent.
2. The blast radius is one user's own data. Nothing is exposed to anyone else, and nobody can access it cross-user. The problem is retention: data may outlive an erasure request. It is not a breach.
3. In path (a), the data retained after the purge was newly created by the user after the erasure had already completed. The erasure itself did happen as the docs describe.
4. "Found by no process" is overstated. The single maintainer has full Cosmos and blob access and can still see orphaned `users` docs and `${sub}/` blob prefixes. What is missing is automated reconciliation and a sub-to-deletion mapping, so the cleanup would be manual.

The rubric's "high" means data loss or corruption risk, or a serious and plausible production failure. This is instead a real GDPR-lifecycle defect with a limited blast radius that needs unusual conditions, which matches "medium". The doc drift at design-decisions.md:46 is minor: the claim holds on the success path. The finding also cites a non-existent line (process-deletions.js:357); the actual logic is at lines 57-61. The recommendation is sound: store `{id: oid, userId: sub}`, have the job purge before deleting the identity, and have GetMe return 410 while a deletion is pending. The note that the job has no tests is also accurate.

Evidence:

```text
functions/src/DeleteAccount/index.js:41-42: "if (userOid) {\n    await getDeletions().items.upsert({ id: userOid, requestedAt: new Date().toISOString() });" (only the oid is queued, before the purge). The purge that follows (lines 45-55) is sequential awaits with no try/catch: "await Promise.all(tours.map((tour) => toursC.item(tour.id, userId).delete()));" ... "if (userDoc) await getUsers().item(userId, userId).delete();".
functions/scripts/process-deletions.js:57-61 (the file is 75 lines long, so the cited line 357 does not exist): "for (const { id } of resources) {\n    const status = await deleteUser(token, id);\n    if (status === 204 || status === 404) {\n      await container.item(id, id).delete();". The job never checks or purges app data, and it has no way to, because no userId (sub) is stored.
functions/src/GetMe/index.js:16-19: "let doc = await readItem(container, userId, userId);\n  if (!doc) {\n    doc = { id: userId, name: userName, email: userEmail, ... };\n    ({ resource: doc } = await container.items.create(doc));" (recreates the user doc on read, with no check for a pending deletion).
functions/src/UpdateProfile/index.js:38-49: creates the doc with an upsert if it is missing.
functions/src/middleware/authMiddleware.js:103-105: "userId: payload.sub, ... userOid: payload.oid ?? null" (the app key and the queued key are different claims).
.github/workflows/process-deletions.yml:8: "- cron: \"0 3 * * *\" # daily at 03:00 UTC", so the identity stays valid for up to about 24h.
frontend/src/ui/profile.js:139-144: on success it calls "await signOut();". On failure it only shows "toast(t('toast.accountDeleteError'), 'error');", and the oid is already queued.
docs/explanation/design-decisions.md:46: "`DELETE /api/account` purges all app data immediately (tours, blobs, user doc)".
```

Reproduction:

```text
I did not run a live reproduction because it would need Cosmos, Graph and Entra. I verified the finding by reading the code: `wc -l functions/scripts/process-deletions.js` gives 75 lines, which confirms the cited line 357 is wrong and the logic is at 57-61. I also traced the code path: DeleteAccount queues the oid first, then runs the unguarded purge steps; the frontend signs out only on success; GetMe creates the doc on read; and the job deletes by oid only.
```

</details>

Lead re-verified: **confirmed, downgraded to medium**. `DeleteAccount` queues only `oid`. `process-deletions.js:57-61` deletes the directory user and dequeues without touching app data, and `GetMe` recreates the user doc on read. Orphaning needs a re-login before 03:00 UTC or a partial failure that nobody retries.

### ARCH-04: IaC/code drift: OpenTofu provisions an unused 'images' container while the app creates and uses an unmanaged 'tour-images' container at runtime

- **Severity (reviewer):** medium
- **Category:** infrastructure-drift · **Effort:** S · **Confidence:** high
- **Location:** `infrastructure/storage.tf:34`
- **Also:** `functions/src/lib/blobStorage.js:35`, `functions/scripts/backfillImageThumbnails.js:57`, `docs/reference/architecture.md:10`, `docs/cost-report.md:91`

**Evidence:**

```text
resource "azurerm_storage_container" "images" {
  name                  = "images"
```

**Description.** lib/blobStorage.js:35 uses `containerOnce('tour-images')` with createIfNotExists, and the backfill script and cost-report.md:91 also say 'tour-images'. But storage.tf declares `images`, and architecture.md:10 lists 'gpx-files, images, deployments'. So every production photo lives in a container that OpenTofu doesn't know about: it was created by the Function App's account-key connection on first upload. The IaC-managed container is empty. Any future container-level setting added in IaC (lifecycle or retention policy, soft delete, immutability, access type, a least-privilege role assignment for a managed identity) would silently apply to the wrong container. The runtime createIfNotExists also keeps a container-create permission requirement in the request path and hides the mismatch.

**Impact.** The personal photo store is outside infrastructure-as-code: config changes and audits target an empty container, and moving to managed identity or data-plane RBAC scoped to the declared containers would break photo upload/read in production.

**Recommendation.** Pick one name. The least disruptive option is to rename the tofu resource to name = "tour-images" and `tofu import` the existing container. Then remove the runtime createIfNotExists (or keep it for Azurite only) and fix architecture.md.

**Verification.** confirmed, severity → low. The drift is real. infrastructure/storage.tf:33-34 declares `name = "images"`, while functions/src/lib/blobStorage.js:35 and functions/scripts/backfillImageThumbnails.js:57 use 'tour-images', and nothing in \*.tf declares 'tour-images'. There is no current functional impact: account-level settings (CORS, TLS, private access) cover every container, and no container-level policy exists yet. The harm only happens on some future IaC change, so it is low.

### ARCH-05: Production auth mode is derived from 'Entra variables are empty': a missing repo variable deploys an open, shared-account API and frontend

- **Severity (reviewer):** medium
- **Category:** config-design · **Effort:** S · **Confidence:** high
- **Location:** `infrastructure/functions.tf:37`
- **Also:** `functions/src/middleware/authMiddleware.js:52`, `scripts/infrastructure/provision.sh:9`, `frontend/src/ui/auth.js:39`, `docs/reference/configuration.md:36`

**Evidence:**

```text
    SKIP_AUTH              = var.entra_client_id == "" ? "true" : "false"
```

**Description.** The same switch serves both dev and prod. provision.sh passes `${ENTRA_CLIENT_ID:-}` (empty if the repo variable is unset, renamed, or moved to an environment scope). tofu then sets SKIP\_AUTH=true, and skipAuthIfDev() only refuses the bypass when ENTRA\_CLIENT\_ID or ENTRA\_TENANT\_ID is set, so with both empty every caller becomes 'local-dev-user'. generate-config.sh emits an empty entraClientId, and ui/auth.js:39-40 then switches the frontend to dev auth too. configuration.md:36 documents this as intended ('unset = no-auth'). The guard described in configuration.md:15-18 only catches the half-configured case, not the fully unconfigured one.

**Impact.** One variable misconfiguration in GitHub settings silently turns the public production site into a single shared account. Every internet visitor could read and write every stored GPS track and photo, with no failing deploy step to warn anyone.

**Recommendation.** Make production explicit and fail closed. Add an `environment`/`allow_skip_auth` variable that defaults to false, and have tofu (a validation or precondition) and the deploy workflow fail when the Entra vars are empty. Never set SKIP\_AUTH in the Function App from tofu. Have generate-config.sh refuse devMode or empty Entra values when run in CI.

**Verification.** confirmed, severity → medium. infrastructure/functions.tf:37 sets SKIP\_AUTH="true" when entra\_client\_id is "". provision.sh:14 passes `${ENTRA_CLIENT_ID:-}`, and authMiddleware.js:52-57 refuses the bypass only when an ENTRA\_\* var is set, otherwise returning 'local-dev-user'. On the frontend, generate-config.sh:20 plus auth.js:39-40 switch to dev auth. The deploy.yml:41-45 infrastructure job has no `environment:`, so env-scoped vars would silently be empty. It fails open, but only after a maintainer misconfiguration, so medium.

### ARCH-06: API error contract is half i18n keys, half English prose: non-English users get untranslated errors

- **Severity (reviewer):** medium
- **Category:** api-contract · **Effort:** M · **Confidence:** high
- **Location:** `functions/src/UploadImage/index.js:53`
- **Also:** `functions/src/lib/parseMultipart.js:34`, `functions/src/UploadTour/index.js:54`, `functions/src/UpdateProfile/index.js:32`, `functions/src/lib/ownedTour.js:19`, `frontend/src/ui/images.js:439`, `frontend/src/ui/profile.js:286`, `frontend/src/lib/upload.js:500`, `frontend/src/lib/i18n.js:49`

**Evidence:**

```text
    return error(400, 'This tour already has the maximum of 20 photos.');
```

**Description.** lib/validation.js:19-21 states the rule: 'The frontend renders an error body verbatim, so these are i18n keys, not prose'. Only the tour-meta errors follow it. Everything else returns English sentences: UploadImage ('Only JPEG or PNG images are accepted', the 20-photo limit, which already exists as key errors.tourImageLimit in en.json:152), parseMultipart ('File exceeds 10 MB limit', 'Invalid multipart request'), UploadTour ('Could not parse GPX file'), UpdateProfile, loadOwnedTour ('Tour not found', 'Invalid tourId'). The frontend is inconsistent as well: tApi passes unknown strings through (i18n.js:49-55), images.js:439 shows err.message without tApi, profile.js:286 uses no tApi, and lib/upload.js hardcodes English ('Upload failed.', 'Network error during upload.'). Uncaught exceptions return the runtime's default 500 with no `{error}` body.

**Impact.** German, French and other users see English error text on the photo and GPX upload paths and when saving their profile. Each new endpoint has to pick a convention ad hoc, and there is no machine-readable error code.

**Recommendation.** Standardise on `{ error: '<i18n key>' }` (or `{ code, message }`) for every 4xx in lib/http.js. Map parseMultipart and UploadImage errors to the existing keys (errors.gpxSize, errors.imageType, errors.tourImageLimit, ...), route every error display through tApi, and add a test asserting every backend error string is a key present in en.json.

**Verification.** partially-confirmed, severity → low. Confirmed English bodies: UploadImage/index.js:53,65; parseMultipart.js:34,48; UploadTour/index.js:47,54; UpdateProfile/index.js:32; ownedTour.js:19. images.js:439 shows err.message without tApi, and profile.js:68,92 use parseErrorMessage without tApi. Two cited lines don't exist: profile.js has 148 lines and lib/upload.js has 45 (the English strings are at upload.js:31,40). Client pre-validation (lib/files.js:26-39, upload-modal.js:60) means most server strings are rarely reached, so this is a small i18n inconsistency: low.

### ARCH-G01: A failed container init is cached as a rejected promise, so one storage error breaks every blob endpoint on that instance until it is recycled

- **Severity (reviewer):** medium
- **Category:** resilience · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/lib/blobStorage.js:34`
- **Also:** `functions/src/lib/blobStorage.js:27`

**Evidence:**

```text
gpxContainer: () => (gpxContainerPromise ??= containerOnce('gpx-files')),
  imagesContainer: () => (imagesContainerPromise ??= containerOnce('tour-images')),
```

**Description.** containerOnce() returns `c.createIfNotExists().then(() => c)` and the module stores that promise with `??=`. If the first createIfNotExists call on a warm instance rejects (a storage blip or throttling that lasts longer than the SDK's own retries), the rejected promise is kept. Because `??=` only reassigns null/undefined, every later call gets the same rejection back and never tries again. The probe confirmed it: the second gpxContainer() call returned the identical promise object (p1 === p2: true) and rejected ECONNREFUSED without a new attempt. The memo design treats 'initialised' and 'initialisation failed' as the same state.

**Impact.** Until Flex recycles the instance, every GPX/photo endpoint it serves returns 500: UploadTour, GetTour (for any tour with photos or a GPX), UploadImage, DeleteImage, DeleteTour, GetMapData (when there are pins) and DeleteAccount. Under steady traffic an instance can live for hours, so one transient fault becomes a partial outage that retries cannot clear.

**Recommendation.** Cache the promise only on success: `p = containerOnce(name).catch(err => { p = undefined; throw err; })`. Better, drop the runtime createIfNotExists (the containers should be IaC-managed, see ARCH-04) and just return getContainerClient(name).

**Verification.** confirmed, severity → medium. blobStorage.js:25-28,34-35 memoises `c.createIfNotExists().then(() => c)` with `??=`, so a rejection is cached. A scratchpad probe with an unreachable endpoint printed 'first: ECONNREFUSED', 'same promise: true' and 'second: ECONNREFUSED ms 0', meaning there was no retry. After one storage failure at first use, every blob endpoint on that warm instance returns 500 until it recycles. That needs an unusual trigger but is a real partial outage: medium.

### ARCH-G02: GPX-derived tour names skip the validation layer: numeric or attributed &lt;name&gt; is stored as a number or object, which breaks GetTour and the frontend list

- **Severity (reviewer):** medium
- **Category:** validation-boundary · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/UploadTour/index.js:64`
- **Also:** `functions/src/lib/parseGpx.js:101`, `functions/src/lib/parseGpx.js:142`, `functions/src/GetTour/index.js:47`, `frontend/src/lib/tours.js:10`

**Evidence:**

```text
name: metaParsed.data.name ?? parsed.name ?? 'Untitled Tour',
```

**Description.** tourMetaSchema (stripHtml, 1-200 chars, string) is only applied to the `name` query parameter. When that parameter is absent, which happens when the user clears the prefilled name field or when any non-UI client calls the API, the name is taken straight from fast-xml-parser. That parser type-coerces tag values by default. Probe output: `<name>2024</name>` gives the number 2024, `<name lang="de">Alpen</name>` gives an object {"#text":"Alpen","@\_lang":"de"}, and a 309-char name containing '&lt;b&gt;' is kept as is, bypassing both the max(200) limit and stripHtml. Every consumer assumes a string.

**Impact.** For such a tour, GetTour throws at `(tour.name || 'tour').replace(...)`, so opening the tour or downloading its GPX returns 500. On the frontend, `(a.name || '').localeCompare` in SORTERS and `.toLowerCase()` in matchScore throw a TypeError, so sorting by name or searching breaks rendering of the user's whole tour list. The user can only recover by renaming the tour through EditTour, which they cannot reach from the broken UI.

**Recommendation.** Validate the effective name, not only the query value: `nameSchema.safeParse(String(parsed.name ?? ''))`, falling back to 'Untitled Tour'. Also set `parseTagValue: false` (or pick '#text') in parseGpx's XMLParser so metadata fields are always strings. Add a parseGpx unit test for numeric and attributed &lt;name&gt;.

**Verification.** partially-confirmed, severity → low. The probe confirms that parseGpx.js:101,142 yields number 2024, object {"#text","@\_lang"}, boolean, and a 303-char '&lt;b&gt;' string. UploadTour/index.js:64 stores that unvalidated, and GetTour/index.js:47 `.replace` then throws a 500. But the trigger needs the user to clear the prefilled name (upload-modal.js:69,77) and only affects their own tour. The default sort is date-desc (state.js), so the list and detail panel still render and openEdit (tour-detail.js:115) can rename it. The 'cannot recover' claim is wrong.

### ARCH-G03: All user data is keyed on the app-scoped (pairwise) `sub` claim, and the tenant-stable `oid` is never stored with it

- **Severity (reviewer):** medium
- **Category:** data-model · **Effort:** M · **Confidence:** medium
- **Location:** `functions/src/middleware/authMiddleware.js:103`
- **Also:** `functions/src/GetMe/index.js:18`, `functions/src/DeleteAccount/index.js:42`, `infrastructure/variables.tf:23`

**Evidence:**

```text
userId: payload.sub,
      // Directory object id — needed to delete the user via Graph (GDPR).
      userOid: payload.oid ?? null,
```

**Description.** userId, which is the tours partition key (/userId), the users doc id (/id) and the blob prefix `${userId}/`, is the access token's `sub`. In the Microsoft identity platform `sub` is pairwise: it is unique per user per application (audience). ENTRA\_CLIENT\_ID is used as both the SPA client and the token audience (variables.tf 'Application (client) ID of the API/SPA app registration. Also the token audience'). If the app registration is ever replaced, or split into separate SPA and API registrations (the usual hardening step), every user's `sub` changes. The only stable identifier, `oid`, is written only to the deletions queue, never to the user doc, so there is no mapping to migrate with. Neither architecture.md nor design-decisions.md records this identity choice.

**Impact.** Changing the app registration makes every existing user appear as a new empty account. Their tours, GPX files and photos are orphaned under the old sub, cannot be migrated reliably (email is the only join key) and cannot be purged by DeleteAccount, which works by the current sub. That is a latent data-loss and privacy trap in an ordinary identity-maintenance operation.

**Recommendation.** Store `oid` (and `tid`) on the user doc now, in GetMe/UpdateProfile. That gives a migration key while it is cheap. Document the key choice in design-decisions.md. For new data, consider partitioning by oid, or keep sub but write a documented remap script keyed by oid.

**Verification.** partially-confirmed, severity → low. Facts confirmed: authMiddleware.js:103 has userId = payload.sub, and oid is only written to deletions (DeleteAccount/index.js:42). GetMe/index.js:18 stores no oid, and variables.tf:22 uses one client id as SPA and audience. The harm requires a future maintainer action (replacing or splitting the app registration), with no reachable production path today. Per the rubric that is at most low.

### ARCH-G04: Frontend token layer: silent-renewal failure falls back to a popup outside any user gesture, concurrently, and a 401 never triggers re-authentication

- **Severity (reviewer):** medium
- **Category:** auth-architecture · **Effort:** M · **Confidence:** medium
- **Location:** `frontend/src/ui/auth.js:160`
- **Also:** `frontend/src/ui/auth.js:214`, `frontend/src/ui/sidebar.js:45`, `frontend/src/ui/images.js:403`, `frontend/src/ui/upload-modal.js:80`

**Evidence:**

```text
try {
    return (await msalClient.acquireTokenSilent({ ...LOGIN_SCOPES, account })).accessToken;
  } catch {
    return (await msalClient.acquireTokenPopup({ ...LOGIN_SCOPES, account })).accessToken;
```

**Description.** getAccessToken() is called by every apiFetch. On page load it is also reached without any user gesture: initAuth -&gt; setUserFromAccount -&gt; renderSignedIn -&gt; loadTours() + refreshUser(), and loadTours fires /api/map and /api/tours in parallel. SPA refresh tokens last 24 h. After that, silent renewal needs third-party cookies on ciamlogin.com (blocked by default in Safari/iOS, including the installed PWA). Each concurrent call then falls into acquireTokenPopup. The popup is blocked because there is no user activation, and the second concurrent call hits MSAL's interaction\_in\_progress. No code path treats a 401 or InteractionRequired as 'session expired': apiFetch returns the Response and callers only check !res.ok. Uploads also capture one token up front (images.js:403, upload-modal.js:80), and tile retries reuse it indefinitely.

**Impact.** A returning user more than 24 h later, which is the normal case for a ride log, sees the app say they are signed in while showing 'Couldn't load your tours' and an empty map. Retry does not help on Safari because the popup opens after an await, outside the gesture. Recovery requires knowing to sign out and back in. Photo-upload retries after about an hour fail permanently with 401.

**Recommendation.** Centralise the transport in one API client module. Catch InteractionRequiredAuthError once, single-flight it, and switch the UI to a 're-sign-in required' state whose button calls acquireTokenPopup/loginRedirect directly inside the click handler (or use acquireTokenRedirect). Treat a 401 from the API the same way. Fetch a fresh token per upload attempt rather than per batch.

**Verification.** confirmed, severity → medium. auth.js:157-161 falls back from acquireTokenSilent to acquireTokenPopup after an await. It is reached without a gesture via initAuth → setUserFromAccount → renderSignedIn (:177-183), which calls loadTours (sidebar.js:45-49, concurrent /api/map and /api/tours) and refreshUser. apiFetch (:213-218) never treats a 401 specially, and errors only produce the toursLoadError toast while state.user stays set. images.js:403 captures one token for all uploads and retries. Runtime behaviour is browser-dependent and was not executed.

### ARCH-G05: Production deploy is not gated on CI, and Dependabot PRs of every update type are auto-merged straight into that deploy

- **Severity (reviewer):** medium
- **Category:** ci-cd · **Effort:** S · **Confidence:** high
- **Location:** `.github/workflows/deploy.yml:5`
- **Also:** `.github/workflows/dependabot-auto-merge.yml:15`, `.github/workflows/gate.yml:3`

**Evidence:**

```text
on:
  push:
    branches: ["main"]
  workflow_dispatch:
```

**Description.** deploy.yml and gate.yml are sibling workflows that both trigger on push to main. deploy has no `workflow_run`/`needs` dependency on the gate, so `tofu apply -auto-approve`, the Functions publish and the Pages deploy start in parallel with the tests and do not wait for them. dependabot-auto-merge.yml runs `gh pr merge --auto --merge` for every Dependabot PR (no fetch-metadata filter on semver-major), and every such merge is a push to main. Whether anything is tested before production therefore depends entirely on branch-protection settings that live outside the repo and are not documented in docs/how-to/infrastructure.md or CONTRIBUTING.

**Impact.** A direct push or an admin merge with a red gate still deploys to production. A Dependabot major bump that breaks runtime behaviour (for example zod, @azure/cosmos or sharp) ships automatically with nobody in the loop. There is also no plan review of infrastructure changes, because every push runs `tofu apply -auto-approve`.

**Recommendation.** Trigger deploy via `workflow_run` on 'CI Gate' completed with conclusion == success on main, or fold deploy into gate.yml as a final job with `needs:` on all test jobs. Restrict auto-merge to minor/patch using dependabot/fetch-metadata. Document the required branch-protection checks.

**Verification.** confirmed, severity → medium. deploy.yml:3-6 triggers on push to main with no workflow\_run or needs link to gate.yml:3-6, so the two run in parallel. dependabot-auto-merge.yml:11-15 runs `gh pr merge --auto --merge` for every Dependabot PR with no update-type filter. Any gating rests on branch protection, which is neither in the repo nor documented (a grep for 'branch protection' or 'required check' finds nothing).

### ARCH-07: Client/server contract (size limits, photo cap, text lengths, language list) is defined twice by hand

- **Severity (reviewer):** low
- **Category:** contract-duplication · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/lib/validation.js:45`
- **Also:** `functions/src/UploadImage/index.js:16`, `frontend/src/lib/files.js:6`, `functions/src/lib/parseMultipart.js:6`, `frontend/src/lib/i18n.js:6`, `frontend/src/index.html:832`

**Evidence:**

```text
// Kept in step by hand with frontend/src/lib/i18n.js's SUPPORTED_LOCALES:
// separate deployables, no shared module.
const SUPPORTED_LANGUAGE_CODES = ['en', 'de', 'es', 'fr', 'it', 'nl', 'pt'];
```

**Description.** Each of these exists independently in two places: the 20-photo cap (UploadImage/index.js:16 MAX\_TOUR\_IMAGES and frontend/src/lib/files.js:9 MAX\_TOUR\_IMAGES), the 10 MB limit (parseMultipart.js:6 and files.js:6-7), the name/description lengths (validation.js:9-10 and index.html maxlength=200/2000), and the locale list. Nothing tests that they agree. docs/how-to/adding-a-language.md has to tell contributors to edit both.

**Impact.** Changing a limit on one side makes the client allow something the server rejects (with an English error, see ARCH-06) or block something the server would accept. Adding a language means a coordinated edit across two deployables.

**Recommendation.** Move the limits into one JSON (e.g. shared/limits.json). The functions can require it; generate-config.sh or a small copy step can publish it for the frontend. At minimum, add a unit test in functions that reads frontend/src/lib/files.js and i18n.js and asserts the values match.

**Verification.** confirmed, severity → low. The limits are duplicated with no agreement test: UploadImage/index.js:16 vs frontend/src/lib/files.js:9, parseMultipart.js:6 vs files.js:6-7, validation.js:9-10 vs index.html:629,691,832,840, and validation.js:45-47 vs i18n.js:6. One correction makes it worse: docs/how-to/adding-a-language.md:26-28 says SUPPORTED\_LOCALES is the 'single list... nothing else needs wiring' and never mentions validation.js. A contributor following it would add a locale whose preference PATCH /api/me rejects.

### ARCH-08: Tour DTO has no single shape: toTourResponse passes storage fields through, so EditTour returns unsigned blob URL and blobNames plus 5k points

- **Severity (reviewer):** low
- **Category:** leaky-abstraction · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/lib/tourResponse.js:13`
- **Also:** `functions/src/EditTour/index.js:48`, `functions/src/UploadTour/index.js:66`, `functions/src/GetTour/index.js:45`

**Evidence:**

```text
  heatmapData: tour.heatmapData,
  images: tour.images,
  gpxFileUrl: tour.gpxFileUrl,
```

**Description.** toTourResponse assumes its caller has already swapped storage fields for signed URLs; GetTour does this, EditTour does not. So PATCH /api/tours/{id} returns images as `{id, blobName:'<entra sub>/<tourId>/<img>.jpg', lat, lon}` with no url/thumbUrl, the raw persisted gpxFileUrl (an absolute unsigned blob URL containing the storage account host), and all heatmap points. Probe: a name-only edit returned 65,065 bytes including 5,000 points. That contradicts the module's own stated goal of keeping the Entra subject id server-side. The root cause is that UploadTour persists `gpxFileUrl: blockBlob.url`, which is used only as a truthy flag (GetTour/index.js:45 recomputes the path), while images persist a relative blobName. There are two storage-reference conventions in one document. The frontend currently ignores these fields (tour-detail.js:583 copies only name/description/createdAt), so nothing breaks today.

**Impact.** Any client that trusts the PATCH response (or a future reuse of toTourResponse) gets broken image and GPX links. Renaming or moving the storage account leaves stale absolute URLs in every stored doc and in exports. Edit responses are about 50x larger than needed.

**Recommendation.** Have EditTour return the same lean summary as GetTours (id, name, description, distance, createdAt). Split toTourResponse into toTourSummary and toTourDetail, where detail takes the signer as a dependency so unsigned output is impossible. Store only the relative blob name, or a boolean, for the GPX file instead of an absolute URL.

**Verification.** confirmed, severity → low. EditTour/index.js:45,48 returns toTourResponse(raw doc). tourResponse.js:13-15 passes heatmapData, images (with blobName) and gpxFileUrl through unsigned. UploadTour/index.js:66 persists the absolute `blockBlob.url`, which GetTour/index.js:45-49 only uses as a flag before re-deriving the path. The frontend reads only name/description/createdAt (tour-detail.js:148-153). Nothing crosses users, so this is low.

### ARCH-09: No schema versioning for stored documents; migrations are unrecorded, untested one-off scripts, so legacy shims can never be removed

- **Severity (reviewer):** low
- **Category:** data-model · **Effort:** M · **Confidence:** high
- **Location:** `functions/scripts/backfillTourStats.js:151` (lead correction: the cited line is out of range or off; the code is at `functions/scripts/backfillTourStats.js:69`)
- **Also:** `functions/scripts/backfillImageThumbnails.js:59`, `functions/src/UploadImage/index.js:89`, `functions/src/lib/tourResponse.js:16`, `frontend/src/ui/images.js:53`, `.pre-commit-config.yaml:52`

**Evidence:**

```text
  const { resources: tours } = await container.items.query('SELECT * FROM c').fetchAll();
  const pending = tours.filter((tour) => tour.elevationGain === undefined);
```

**Description.** Tour docs carry no schemaVersion. Migration state is inferred from sentinels (undefined vs null elevationGain; existence of a \_thumb blob). The backfill scripts live outside src/, are outside the ESLint/Prettier hook scope (^functions/(src|test)/), have no tests, aren't wired into buddy.sh or any workflow, and nothing records whether they ran against production. They also load every full document across partitions into memory. Because no one can tell whether old-shape docs still exist, fallbacks stay in the hot paths forever: UploadImage's 400-retry for tours without `images` (UploadImage/index.js:89-94), the `?? null` normalisation in toTourResponse, and the thumbnail-404 fallbacks in images.js:53-59 and pins.js:154-157.

**Impact.** Each schema change adds another permanent branch in both backend and frontend, and a future migration of about the same size risks exceeding script memory, with no audit trail.

**Recommendation.** Add `schemaVersion` to new docs and have migrations query `WHERE NOT IS_DEFINED(c.schemaVersion) OR c.schemaVersion < N`, paginated per partition. Record runs, for example in a `migrations` container or a workflow\_dispatch job with logs. Bring functions/scripts under lint and test. Delete the shims once a version query returns 0.

**Verification.** confirmed, severity → low. The evidence is real but sits at functions/scripts/backfillTourStats.js:68-69, not :151 (the file has 88 lines). It runs `SELECT * FROM c` with fetchAll and uses an `elevationGain === undefined` sentinel. There is no schemaVersion anywhere in src. The lint and prettier hooks are scoped to `^functions/(src|test)/` (.pre-commit-config.yaml:52,62), and package.json lint only covers src/ and test/. The shims exist at UploadImage/index.js:89-94 and tourResponse.js:16-22.

### ARCH-10: Write endpoints handle partial failure and concurrency inconsistently (orphaned photo blobs, a check-then-act cap, 500s on concurrent delete or first login)

- **Severity (reviewer):** low
- **Category:** consistency · **Effort:** M · **Confidence:** high
- **Location:** `functions/src/UploadImage/index.js:77`
- **Also:** `functions/src/UploadImage/index.js:52`, `functions/src/UploadImage/index.js:88`, `functions/src/EditTour/index.js:47`, `functions/src/GetMe/index.js:19`, `functions/src/UploadTour/index.js:89`

**Evidence:**

```text
  await Promise.all([
    blockBlob.uploadData(full, { blobHTTPHeaders: { blobContentType: 'image/jpeg' } }),
    thumbBlockBlob.uploadData(thumbnail, { blobHTTPHeaders: { blobContentType: 'image/jpeg' } }),
  ]);
```

**Description.** UploadTour carefully rolls back its blob when the Cosmos write fails; UploadImage does not. If the tour is deleted, or the patch fails, after the two blobs are written, they are orphaned and the patch's 404 surfaces as a 500. The 20-photo cap is checked against a snapshot read before a multi-second parse and resize, while the frontend uploads 3 files at a time (images.js:446), so two tabs or devices can exceed it. EditTour reads, then patches, so a concurrent DeleteTour turns the patch's 404 into a 500. GetMe creates on read with items.create, so two first-login requests race and one gets a 409 that becomes a 500. UpdateProfile uses upsert for the same job. Each handler solved these edge cases independently.

**Impact.** Occasional orphaned personal photos (on top of ARCH-02), spurious 500s, and tours above the documented photo limit. None is severe alone, but the inconsistency makes the next endpoint likely to repeat them.

**Recommendation.** Add a lib helper for 'write blobs, then patch, rolling back blobs on failure'. Enforce the cap inside the patch with a Cosmos conditional patch (filterPredicate `ARRAY_LENGTH(c.images) < 20`). Map a 404 from patch/replace to error(404). Use upsert or a 409-tolerant create in GetMe.

**Verification.** confirmed, severity → low. UploadImage/index.js:77-94 writes both blobs and then patches with no rollback. A patch 404 (tour deleted meanwhile) is rethrown at :92 and surfaces as a 500 with orphaned blobs. The cap is checked against the pre-parse snapshot at :52. EditTour/index.js:38,47 reads and then patches without handling a 404. GetMe/index.js:19 uses items.create, so a first-login race gets a 409 and then a 500. By contrast, UploadTour/index.js:89-95 does roll back.

### ARCH-11: Handler boilerplate: positional-parameter dependency injection and no shared wrapper for auth or errors

- **Severity (reviewer):** low
- **Category:** maintainability · **Effort:** M · **Confidence:** high
- **Location:** `functions/src/GetMapData/index.js:46`
- **Also:** `functions/src/UploadImage/index.js:36`, `functions/src/DeleteAccount/index.js:26`, `functions/src/GetTours/index.js:11`, `functions/src/UploadTour/index.js:29`

**Evidence:**

```text
async function getMapData(
  request,
  auth = authenticate,
  getContainer = toursContainer,
  getImagesContainer = imagesContainer,
  totalPointBudget = TOTAL_POINT_BUDGET,
  maxGapMeters = MAX_GAP_METERS,
  heatmapCache = defaultHeatmapCache,
) {
```

**Description.** Testability comes from long positional default parameters (7 in GetMapData and UploadImage, 7 in DeleteAccount). Tests have to pass `undefined` placeholders in the right order, and inserting a dependency shifts every call site. Every handler repeats `const user = await auth(request); if (!user) return unauthorized();` and the `app.http(... /* v8 ignore next */ handler: (request) => fn(request))` registration. Error handling is absent: an Entra outage (authMiddleware rethrows by design), a Cosmos 429 after retries, or any unexpected throw goes to the host's default 500 with no JSON body and no correlation id.

**Impact.** Adding an endpoint means copying roughly 10 lines of ceremony where forgetting the auth line is a security bug. Cross-cutting changes such as request logging, error shaping (ARCH-06) or rate limiting mean editing 12 files.

**Recommendation.** Add lib/handler.js: `authed((req, ctx, deps) => ...)` which authenticates, catches, maps known errors to `{error}` bodies, and logs with the invocation id. Pass dependencies as one object (`deps = defaultDeps`) instead of positionally.

**Verification.** confirmed, severity → low. Positional DI is confirmed: GetMapData/index.js:46-54, UploadImage/index.js:36-44 and DeleteAccount/index.js:26-34 each take 6 injectable parameters after `request`. Every handler repeats `auth(request)`/`unauthorized()`. There is no try/catch wrapper, and authMiddleware.js:115-116 rethrows by design, so the host returns its default 500.

### ARCH-12: REST surface inconsistencies: verb-in-path upload route, a different id field in the create response, no pagination or versioning

- **Severity (reviewer):** low
- **Category:** api-design · **Effort:** M · **Confidence:** high
- **Location:** `functions/src/UploadTour/index.js:112`
- **Also:** `functions/src/UploadTour/index.js:100`, `functions/src/lib/db.js:31`, `frontend/src/lib/tours.js:277`, `frontend/src/ui/upload-modal.js:84`

**Evidence:**

```text
  route: 'tours/upload',
```

**Description.** Tours are created with `POST /api/tours/upload`, while images use the resource-style `POST /api/tours/{id}/images`. The create response returns `tourId` where every other tour payload uses `id`, has no Location header, and echoes the unusable unsigned gpxFileUrl. GET /api/tours, GET /api/map and GET /api/me/export return every document in one response (db.js fetchAll drains all continuations), and the frontend paginates client-side (tours.js PAGE\_SIZE = 10), so there is no server pagination contract to grow into. There is no API version prefix, which matters because stale cached frontends (ARCH-01) coexist with the newest API.

**Impact.** Small today, but a breaking API change cannot be rolled out safely while old service-worker-cached clients are in the field, and very active riders hit unbounded response sizes on the list, map and export endpoints.

**Recommendation.** Add `POST /api/tours` as an alias, return `id` plus a Location header, and deprecate `tours/upload`. Add optional `?continuationToken`/`limit` on GET /api/tours and /api/map, even if the frontend requests everything for now. Consider a /api/v1 prefix or an `X-Api-Version` compatibility check that the frontend reads.

**Verification.** confirmed, severity → low. UploadTour/index.js:112 has `route: 'tours/upload'`. :99-105 returns `tourId` and the unsigned gpxFileUrl, and upload-modal.js:84 consumes `tourId`. db.js:31-37 fetchAll drains every continuation, and PAGE\_SIZE=10 is client-side at tours.js:102 (not :277). There is no version prefix. Impact is small: the GetTours payload is 5 fields per tour (GetTours/index.js:17), so low.

### ARCH-13: Map pipeline is still built around a removed heat layer (MAX\_GAP\_METERS justification, dangling heatmapZoom.js reference, 'heatmap' naming)

- **Severity (reviewer):** low
- **Category:** dead-design · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/GetMapData/index.js:24`
- **Also:** `functions/src/lib/simplify.js:28`, `frontend/src/ui/routes.js:472`, `docs/reference/architecture.md:5`, `docs/explanation/design-decisions.md:10`

**Evidence:**

```text
// Under the heat layer's dot footprint even at max zoom (see
// heatmapZoom.js), so simplified straight stretches still read as a
// continuous trail instead of breaking into dots.
const MAX_GAP_METERS = 50;
```

**Description.** The frontend draws routes as `L.polyline` (ui/routes.js:472); no heat layer or heatmapZoom.js exists, and git history (`-S heatLayer`) shows it was removed. The gap constraint only made sense for dots. With polylines it forces a point every 50 m on straight stretches, which by the code's own comment ('can make the result exceed targetCount') undermines the TOTAL\_POINT\_BUDGET the simplification exists to enforce. The stored field, cache and endpoint are all still called heatmap\*, and architecture.md and design-decisions.md still describe a vendored Leaflet.heat.

**Impact.** Larger /api/map payloads and more simplification CPU than needed for heavy users. Misleading names and comments steer future changes toward a design that no longer exists.

**Recommendation.** Drop maxGapMeters (or set it to Infinity) for polyline rendering, fix the comment, and rename toward `track`/`points` in code (the stored field can stay, mapped in the DTO layer). Remove Leaflet.heat from the docs.

**Verification.** confirmed, severity → low. GetMapData/index.js:24-27 cites heatmapZoom.js, which does not exist. The frontend draws `L.polyline` (routes.js:25, not :472), and there is no Leaflet.heat in frontend/src/vendor. simplify.js:28-32 and :61-63 say the gap constraint exists for a heat layer and can exceed targetCount. architecture.md:5 and design-decisions.md:10 still mention Leaflet.heat. The budget only applies above 100k total points (GetMapData:21,31), so low.

### ARCH-14: Frontend ui/ modules form import cycles around a shared mutable state and tour objects with overloaded fields

- **Severity (reviewer):** low
- **Category:** frontend-coupling · **Effort:** M · **Confidence:** medium
- **Location:** `frontend/src/lib/mapData.js:334` (lead correction: the cited line is out of range or off; the code is at `frontend/src/lib/mapData.js:29`)
- **Also:** `frontend/src/ui/state.js:5`, `frontend/src/ui/sidebar.js:11`, `frontend/src/ui/tour-detail.js:453`, `frontend/src/ui/images.js:26`, `frontend/src/ui/auth.js:19`

**Evidence:**

```text
    // Only the pinnable photos come back here, so a tour that had the full
    // gallery loaded no longer does — the next detail fetch has to run again.
    tour.images = entry?.images || [];
    tour.detailLoaded = false;
```

**Description.** ui/ modules import each other cyclically: auth&lt;-&gt;sidebar, auth&lt;-&gt;routes, sidebar&lt;-&gt;tour-detail, images-&gt;sidebar-&gt;tour-detail-&gt;images, pins&lt;-&gt;images. They all mutate the singleton `state` and the tour objects inside `state.tours`. The same `tour.images` field means either 'pinnable subset from /api/map' or 'full gallery from /api/tours/{id}', told apart only by an ad-hoc `detailLoaded` flag plus `fetchedAt` stamped onto API objects. When the selected tour's data goes stale (45 min) and any action triggers renderAllRoutes, the open gallery keeps showing the full set while the lightbox click handler (images.js:48-51) reads the pinned-only array: wrong photo or index 0. The cycles work only because no module uses an import at top level during evaluation; ui/ has no unit tests.

**Impact.** Changes in one ui module have non-local effects (the reason for the 'user switched while loading' guards scattered through routes.js, tour-detail.js and images.js), and subtle stale-state bugs like the one above are hard to test without a DOM.

**Recommendation.** Keep map-summary data and detail data in separate maps (`mapDataById`, `detailById`) instead of overwriting tour fields. Break the cycles by having sidebar/tour-detail communicate through a small event bus or callbacks passed in from app.js. Make app.js the only composition root.

**Verification.** confirmed, severity → low. The cycles are real: auth.js:19 imports sidebar, sidebar.js:9-11 imports auth and tour-detail, tour-detail.js:19-20 imports sidebar and images, images.js:21-26 imports auth, pins and sidebar, and pins.js:8 imports images. The overloaded field is at lib/mapData.js:26-29 (the cited :334 does not exist; the file has 32 lines). ensureMapData refreshes stale tours with pin-only images while images.js:47-51 resolves the clicked photo from tour.images and falls back to index 0. frontend/test has no ui/ tests.

### ARCH-15: Docs out of sync with the code (API table, containers, SWA proxy, token storage, required secrets)

- **Severity (reviewer):** low
- **Category:** doc-drift · **Effort:** S · **Confidence:** high
- **Location:** `docs/reference/architecture.md:26`
- **Also:** `docs/reference/architecture.md:10`, `docs/reference/configuration.md:24`, `docs/reference/configuration.md:35`, `docs/cost-report.md:20`, `docs/how-to/developer-guide.md:59`, `frontend/src/sw.js:106`

**Evidence:**

```text
| `GET /api/me`                             | GetMe — returns/creates the caller's user doc         |
```

**Description.** architecture.md's function table omits PATCH /api/me (UpdateProfile), GET /api/me/export (ExportData), DELETE /api/account (DeleteAccount) and GET /api/health. Its diagram omits the `deletions` container and names the photo container `images` (actual: tour-images) and lists Leaflet.heat. configuration.md:24 says 'SWA proxies /api' for production and lists secrets without the GRAPH\_TENANT\_ID/GRAPH\_CLIENT\_ID/GRAPH\_CLIENT\_SECRET the deletion workflow needs. cost-report.md:20,38 budgets a Static Web App the deployment doesn't use. developer-guide.md:59 says the MSAL session is cached in sessionStorage, but ui/auth.js:94 uses localStorage, which is security-relevant because tokens persist across tab close. sw.js:106-108 justifies the /api/ exclusion with an SWA proxy that doesn't exist in production.

**Impact.** The GDPR, export and account endpoints and the Graph-credential dependency are invisible to anyone onboarding from the reference docs. The token-storage statement is wrong for a security reviewer.

**Recommendation.** Update the architecture table, the diagram, configuration.md (secrets, apiBaseUrl), the cost report and the developer guide. Consider a unit test that checks every app.http route appears in architecture.md.

**Verification.** confirmed, severity → low. The architecture.md:23-35 table omits PATCH /api/me, /api/me/export, /api/account and /api/health, although all are registered (UpdateProfile:66, ExportData:34, DeleteAccount:63, Health:15). architecture.md:10 says 'images', configuration.md:24 mentions an SWA proxy, and cost-report.md:20,38 budgets an SWA. developer-guide.md:59-60 says sessionStorage, but auth.js:94 uses localStorage. The GRAPH\_\* secrets are used only at process-deletions.yml:43-45 and are not in configuration.md:35.

### ARCH-16: Vendored MSAL is pinned manually and old (3.28.1, Jan 2025), with no update tracking; Dependabot ignores frontend/ and e2e/

- **Severity (reviewer):** low
- **Category:** dependency-management · **Effort:** S · **Confidence:** high
- **Location:** `frontend/src/vendor/.msal-source:1`
- **Also:** `.github/dependabot.yml:16`, `frontend/src/vendor/.leaflet-source:5`

**Evidence:**

```text
https://cdn.jsdelivr.net/npm/@azure/msal-browser@3.28.1/lib/msal-browser.min.js
```

**Description.** The auth library that handles the tokens is a hand-copied file. Unlike .leaflet-source and .archivo-source, .msal-source records no SRI or integrity hash for verification. dependabot.yml covers only the /functions npm tree, GitHub Actions and pre-commit. frontend/package.json (vitest) and e2e/package.json (Playwright, @azure/cosmos) get no updates, and nothing alerts when MSAL or Leaflet publish security releases.

**Impact.** Security fixes to the token-handling library have to be noticed and applied by hand by a single maintainer. The vendored bytes can't be re-verified against a recorded hash.

**Recommendation.** Add Dependabot npm entries for /frontend and /e2e. Declare @azure/msal-browser and leaflet as frontend dependencies and copy them from node\_modules into vendor/ with a checked script, so Dependabot proposes bumps. Record the SRI hash in .msal-source.

**Verification.** partially-confirmed, severity → low. Confirmed: .msal-source (1 line, msal-browser@3.28.1, header dated 2025-01-14) records no hash, unlike .leaflet-source, and dependabot.yml:17-18 schedules npm version updates only for /functions. But 'Dependabot ignores frontend/' is overstated: security updates do reach /frontend (commit fbb2dfb 'Bump @vitest/mocker and vitest in /frontend', merged as #525). No CVE is shown for MSAL 3.28.1, so low.

### ARCH-17: Optimistic 'undo' delete runs only in a browser setTimeout, so deletions are silently dropped if the tab or PWA closes within 6 s

- **Severity (reviewer):** low
- **Category:** data-lifecycle · **Effort:** M · **Confidence:** high
- **Location:** `frontend/src/ui/tour-detail.js:614` (lead correction: the cited line is out of range or off; the code is at `frontend/src/ui/tour-detail.js:180`)
- **Also:** `frontend/src/ui/images.js:334`

**Evidence:**

```text
  const timer = setTimeout(async () => {
    const succeeded = [];
    const failed = [];
    await runWithConcurrency(ids, 3, async (id) => {
```

**Description.** Tour and photo deletes (images.js:334 as well) are removed from the UI immediately, but the DELETE request is only sent after a 6-second in-page timer. Closing the tab, backgrounding or killing the mobile PWA, reloading, or signing out in that window means the request is never sent. The user saw a 'deleted' toast, but the GPS track or photo still exists and reappears on the next load. There is no server-side soft delete to make the undo durable.

**Impact.** Users who delete sensitive tracks and immediately leave the app, a common mobile pattern, keep that data without realising it.

**Recommendation.** Send the DELETE immediately and implement undo server-side (a soft-delete flag with deletedAt plus a restore endpoint, purged by a scheduled job), or at least flush pending deletes on `pagehide`/`visibilitychange` with `fetch(..., {keepalive:true})`.

**Verification.** confirmed, severity → low. The deferred DELETE is at tour-detail.js:166,180-203 (not :614; the file has 291 lines) and at images.js:306,334-345. No pagehide, visibilitychange, beforeunload or keepalive handler exists anywhere in frontend/src. The comment at tour-detail.js:163-165 confirms the design has no server-side restore. The data reappears on next load, so the user can notice: low.

### ARCH-18: GDPR export returns raw Cosmos documents with system fields and storage references, but not the user's GPX files or photos

- **Severity (reviewer):** low
- **Category:** api-contract · **Effort:** M · **Confidence:** high
- **Location:** `functions/src/ExportData/index.js:21`
- **Also:** `functions/src/lib/tourResponse.js:6`, `functions/src/UploadTour/index.js:66`

**Evidence:**

```text
    queryUserItems(getTours(), userId, 'SELECT * FROM c WHERE c.userId = @userId'),
```

**Description.** The export dumps stored documents verbatim (\_rid, \_self, \_etag, \_ts, userId, the absolute unsigned gpxFileUrl, blobName strings) as the portability format. Its shape is coupled to internal storage, and it changes whenever the stored document does. The originally uploaded GPX files and the photos, which are the user's actual content, are not included, not even as signed links, and heatmapData is a downsampled copy of at most 5,000 points.

**Impact.** The portability export doesn't let a user take their rides and photos elsewhere. Any internal field rename becomes a change to the user-facing export format.

**Recommendation.** Define an explicit, versioned export DTO (`exportVersion`). Include signed download URLs for each GPX and image, or build a zip asynchronously into a user-scoped blob and return a SAS link.

**Verification.** confirmed, severity → low. ExportData/index.js:21 uses `SELECT * FROM c`, which returns Cosmos system fields, userId, the absolute unsigned gpxFileUrl and blobNames. No GPX or photo content or signed links are included. This is a deliberate choice: tourResponse.js:5-6 says 'ExportData stays off this on purpose: the full stored document is the point there.' It is a portability-quality gap, so low.

### ARCH-G06: Release is not ordered or atomic: the frontend ships even if the backend publish fails, and the publish tool is unpinned in deploy but pinned in CI

- **Severity (reviewer):** low
- **Category:** ci-cd · **Effort:** S · **Confidence:** high
- **Location:** `.github/workflows/deploy.yml:88`
- **Also:** `.github/workflows/deploy.yml:79`, `.github/workflows/gate.yml:258`

**Evidence:**

```text
  deploy-frontend:
    name: Deploy Frontend (GitHub Pages)
    needs: infrastructure
```

**Description.** deploy-functions and deploy-frontend both depend only on `infrastructure` and run in parallel, so a failed Functions publish still ships the new frontend. The API has no versioning (ARCH-12), so a UI that needs a new or changed endpoint then runs against the old backend. The most likely cause of such a failure is in the same file: deploy.yml:79 installs `azure-functions-core-tools@4` (currently 4.15.1), while gate.yml:253-258 pins 4.13.0 with a comment that 4.14.0 was broken by a shrinkwrap pointing at Microsoft's internal feed. Production is therefore published with a Core Tools version CI never uses, one the repo itself records as having broken once.

**Impact.** A recurrence of the Core Tools breakage, or any publish failure, produces a half-deployed release: new frontend, old API, with nothing in the pipeline to roll back. Because the service worker caches modules (ARCH-01), the mismatched frontend then stays on clients.

**Recommendation.** Make deploy-frontend `needs: [infrastructure, deploy-functions]`. Pin the same Core Tools version in deploy.yml and gate.yml, via one env var or a shared composite action.

**Verification.** confirmed, severity → low. deploy.yml:86-88 has deploy-frontend `needs: infrastructure` only, parallel to deploy-functions (:54-56). deploy.yml:79 installs `azure-functions-core-tools@4` unpinned, while gate.yml:253-258 pins 4.13.0 with a comment that 4.14.0's shrinkwrap was broken.

### ARCH-G07: The committed dev settings template makes every authenticated API call return 500, contradicting the getting-started docs

- **Severity (reviewer):** low
- **Category:** config-drift · **Effort:** S · **Confidence:** high
- **Location:** `functions/local.settings.json.example:10`
- **Also:** `scripts/development/setup.sh:31`, `docs/tutorials/getting-started.md:19`, `docs/how-to/developer-guide.md:69`, `functions/src/middleware/authMiddleware.js:53`

**Evidence:**

```text
"ENTRA_TENANT_ID": "<your-tenant-guid>",
    "ENTRA_CLIENT_ID": "<your-app-client-id>",
    "SKIP_AUTH": "true"
```

**Description.** scripts/development/setup.sh:31 copies this template verbatim to local.settings.json. The docs (getting-started.md:19 'The defaults run in no-auth mode'; developer-guide.md:69 'This is the default from the config templates') say it works as is. But authMiddleware.skipAuthIfDev throws whenever ENTRA\_CLIENT\_ID or ENTRA\_TENANT\_ID is non-empty, and the placeholders are non-empty. Probe: loading the template's Values into env and calling authenticate() gives 'THROWS: SKIP\_AUTH must not be set when Entra auth is configured'. CI never notices because gate.yml sets its own env vars and never uses the template, and start-all.sh's readiness probe (`curl -s .../api/me`) accepts a 500.

**Impact.** Every new contributor who follows the documented setup gets an API where GetMe, GetTours and the others return 500. The frontend quietly falls back to SYNTHETIC\_USER and then shows 'Couldn't load your tours'. That is a confusing first run with no pointer to the cause.

**Recommendation.** Leave the ENTRA\_\* values empty in the template, as the docs describe, and put the placeholder hints in a comment or the docs. Make start-all/start-backend probe /api/health and fail on non-2xx.

**Verification.** confirmed, severity → low. functions/local.settings.json.example:10-12 sets non-empty ENTRA\_TENANT\_ID and ENTRA\_CLIENT\_ID placeholders with SKIP\_AUTH "true". setup.sh copies it verbatim. authMiddleware.js:54-55 throws whenever either placeholder is set, so every authed endpoint returns 500. That contradicts getting-started.md:17-19 and developer-guide.md:67-68. The readiness probes (start-all.sh:48, start-backend.sh:17) accept any status.

### ARCH-G08: ensureDetail treats a failed detail fetch as loaded and keeps the partial /api/map data for 45 minutes

- **Severity (reviewer):** low
- **Category:** state-management · **Effort:** S · **Confidence:** high
- **Location:** `frontend/src/ui/sidebar.js:96`
- **Also:** `frontend/src/lib/mapData.js:28`

**Evidence:**

```text
  tour.heatmapData = tour.heatmapData || [];
  tour.images = tour.images || [];
  tour.detailLoaded = true;
  markFetched(tour);
```

**Description.** On a non-OK response (401, 404 or 5xx) or a network error, ensureDetail skips the assignment but still sets detailLoaded = true and markFetched(). By then the tour object usually holds /api/map data: simplified points and only the geotagged photos (mapData.js:28), with no gpxFileUrl. The cache therefore records a failure as a successful detail load until SAS\_CACHE\_TTL\_MS (45 min) expires.

**Impact.** After one transient error, the gallery for the next 45 minutes shows only geotagged photos (non-geotagged ones look deleted). The client-side photo quota check counts too few images, the elevation, duration and speed fields stay empty, and 'Download GPX' reports an error, all without a retry.

**Recommendation.** Set detailLoaded/markFetched only when res.ok. On failure keep detailLoaded false so the next selection retries, and show the error state instead of the partial data.

**Verification.** confirmed, severity → low. In sidebar.js:74-98, a non-ok response or a throw skips the assignment at :78-90, but :94-97 still sets `detailLoaded = true` and calls markFetched. The early return at :75 then suppresses retries for SAS\_CACHE\_TTL\_MS = 45 min (sasCache.js:8), leaving the pin-only images from mapData.js:28 and no gpxFileUrl, so tour-detail.js:284-286 shows a download error.

### ARCH-G09: The JWKS client is cached forever for the first jwks\_uri, so the documented 1-hour OIDC metadata refresh has no effect on keys

- **Severity (reviewer):** low
- **Category:** auth-architecture · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/middleware/authMiddleware.js:38`
- **Also:** `functions/src/middleware/authMiddleware.js:19`

**Evidence:**

```text
function defaultJwksClient(jwksUri) {
  if (!cachedJwksClient) {
    cachedJwksClient = jwksRsa({ jwksUri, cache: true, rateLimit: true });
  }
  return cachedJwksClient;
```

**Description.** getOpenIdConfig re-reads issuer and jwks\_uri every hour. The comment at line 19 says 'The TTL is there because a warm instance can live long enough to miss a change to either'. But defaultJwksClient ignores its jwksUri argument after the first call, so a refreshed jwks\_uri is never used. The code contradicts its own design comment.

**Impact.** If Entra moves the tenant's jwks\_uri, warm instances keep querying the old endpoint. The result is SigningKeyNotFoundError or fetch errors, which means 401s or 500s for every user until instances recycle. The event is rare, but the TTL was written specifically to handle it.

**Recommendation.** Key the cache by URI: keep a Map from jwksUri to client, or recreate the client when jwksUri differs from the cached one.

**Verification.** confirmed, severity → low. authMiddleware.js:36-42 creates cachedJwksClient once and ignores later jwksUri arguments. getOpenIdConfig (:25-34) refreshes jwks\_uri hourly, and the comment at :18-20 says that refresh exists to catch changes. A jwks\_uri move is rare, so low.

### ARCH-G10: destroy.yml passes an undeclared `package_path` variable, a leftover of the removed run-from-package design, so teardown fails

- **Severity (reviewer):** low
- **Category:** iac-drift · **Effort:** S · **Confidence:** high
- **Location:** `.github/workflows/destroy.yml:41`
- **Also:** `infrastructure/storage.tf:39`, `infrastructure/variables.tf:1`

**Evidence:**

```text
run: tofu destroy -auto-approve -var="package_path=$GITHUB_WORKSPACE/func.zip"
```

**Description.** variables.tf declares location, the entra\_\* variables and the budget\_\* variables, but no `package_path`. OpenTofu rejects a CLI `-var` for an undeclared variable ('Value for undeclared variable'), so the documented teardown (developer-guide.md 'destroy.yml (manual) tears the infrastructure down') fails at the destroy step. The placeholder-zip step and its comment are from the Y1/WEBSITE\_RUN\_FROM\_PACKAGE era, and storage.tf:39 still describes the deployments container as 'runs via WEBSITE\_RUN\_FROM\_PACKAGE', which contradicts functions.tf:17.

**Impact.** The one documented automated teardown path does not work. Stale comments about the deployment mechanism mislead anyone changing the Flex setup.

**Recommendation.** Remove the placeholder-package step and the -var from destroy.yml, and fix the storage.tf comment. Consider adding a concurrency group shared with deploy.yml.

**Verification.** confirmed, severity → low. destroy.yml:41 passes `-var="package_path=..."`, but variables.tf declares only location, entra\_\* and budget\_\*, and a grep finds package\_path nowhere else. OpenTofu rejects undeclared CLI -var values, so the destroy step fails. storage.tf:39 still says WEBSITE\_RUN\_FROM\_PACKAGE, contradicting functions.tf:17.

### ARCH-G11: Deploy inputs are not reproducible: the provider lock file and .funcignore are both gitignored

- **Severity (reviewer):** low
- **Category:** reproducibility · **Effort:** S · **Confidence:** high
- **Location:** `.gitignore:73`
- **Also:** `.gitignore:16`, `infrastructure/main.tf:5`

**Evidence:**

```text
infrastructure/.terraform.lock.hcl
```

**Description.** design-decisions.md says 'OpenTofu, reproducibly', but .terraform.lock.hcl is ignored, so every CI `tofu init` resolves the newest azurerm within `~> 4.0` and applies it with -auto-approve. The fast-moving azurerm\_function\_app\_flex\_consumption resource is exactly where provider minors change behaviour. `.gitignore:16` also ignores `functions/.funcignore`, so the CI publish (`func azure functionapp publish` from a fresh checkout) has no ignore list and packages the whole functions/ folder: test/, scripts/ (including the Graph deletion job), src/\*\*/index.test.js, stryker/eslint/vitest configs.

**Impact.** Two deploys of the same commit can produce different infrastructure. Unreviewed provider upgrades reach production silently, and the deployed package contains test and maintenance code that is never meant to run there.

**Recommendation.** Commit infrastructure/.terraform.lock.hcl and let Dependabot's terraform ecosystem bump it. Commit a functions/.funcignore that excludes test/, scripts/, \*\*/\*.test.js, coverage/, reports/, \*.config.\* and local.settings.json.

**Verification.** confirmed, severity → low. .gitignore:73 ignores infrastructure/.terraform.lock.hcl and .gitignore:16 ignores functions/.funcignore, and neither file exists in the checkout. main.tf:5-7 uses `~> 4.0` with -auto-approve applies (provision.sh:11). publish-functions.sh runs from functions/ with no ignore list. Test files are not loaded by the host (main glob `src/**/index.js`), so this is only bloat and non-reproducibility: low.

### ARCH-G12: The history-depth router is not reconciled after a reload, so Back needs two presses and Forward never reopens a layer

- **Severity (reviewer):** low
- **Category:** frontend-architecture · **Effort:** S · **Confidence:** medium
- **Location:** `frontend/src/ui/router.js:60`
- **Also:** `frontend/src/ui/router.js:54`, `frontend/src/ui/sidebar.js:66`

**Evidence:**

```text
    while (layerStack.length > depth) layerStack.pop()();
```

**Description.** layerStack is in-memory, while history.state.depth survives reloads. When a page with an open tour (#/tour/X, state {depth:1}) is reloaded, the deep link calls selectTour, which calls pushLayer and pushes another {depth:1} entry. Pressing Back lands on the reloaded {depth:1} entry: layerStack.length (1) is not greater than depth (1), so nothing closes, although the URL changes. A second Back is needed. Forward navigation never re-opens anything because popstate only ever pops.

**Impact.** Back-button and gesture behaviour on mobile (the stated purpose of #443) is inconsistent after any reload or deep-link open: the first Back seems to do nothing, and the history is polluted with duplicate entries.

**Recommendation.** On a deep-link open, use replaceState with the correct depth instead of pushState when history.state.depth already reflects the layer, or reset history.state to depth 0 in readInitialUrl before reopening. Add an e2e test for reload followed by Back.

**Verification.** confirmed, severity → low. router.js:9 keeps layerStack in memory, :52-55 always pushes, and :58-61 only pops. On reload of a {depth:1} entry, sidebar.js:64-66 calls selectTour, which calls pushLayer and adds a second {depth:1}, so the first Back closes nothing. Two minor inaccuracies: the URL does not change on that first Back (both entries share it), and fresh external deep links work because history.state is null (depth 0).

### ARCH-G13: Tour metadata (up to 2,000-char description) goes in the upload URL query string, unlike every other write, which uses a JSON body

- **Severity (reviewer):** low
- **Category:** api-design · **Effort:** M · **Confidence:** medium
- **Location:** `functions/src/UploadTour/index.js:34`
- **Also:** `functions/src/lib/parseMultipart.js:44`, `frontend/src/ui/upload-modal.js:87`

**Evidence:**

```text
    name: request.query.get('name') ?? undefined,
    description: request.query.get('description') ?? undefined,
```

**Description.** parseMultipart forbids form fields ('No form fields: tour metadata travels in the query'), so UploadTour reads free text from the URL, while EditTour and UpdateProfile read a JSON body. Percent-encoded non-ASCII text grows 6-12x (é becomes %C3%A9, an emoji becomes 12 chars). A description within the 2,000-char schema limit can therefore exceed typical request-line limits (8 KB is Kestrel's default MaxRequestLineSize), and the request is rejected before the handler runs. The frontend then shows its generic English 'Upload failed.' from lib/upload.js. Personal free text in URLs also ends up in any access or proxy log.

**Impact.** The documented description limit cannot be reached for non-Latin or emoji-heavy text at upload time, though it can be via EditTour. That is an inconsistent contract with an unhelpful failure mode. It is low only because typical descriptions are short.

**Recommendation.** Accept name/description as multipart fields (allow `fields: 2` in busboy) and run the same tourMetaSchema over them, or create the tour with a JSON body and upload the file in a second request.

**Verification.** confirmed, severity → low. UploadTour/index.js:33-36 reads name and description from request.query. parseMultipart.js:44-45 forbids fields, while EditTour and UpdateProfile read JSON bodies. upload-modal.js:77-78,84-85 builds the URL with URLSearchParams. All 7 supported locales use Latin script, so a request line over about 8 KB needs heavy non-Latin or emoji text. Low, and the exact host limit is unverified.

## Second-pass disputes of first-pass findings

The independent second pass checked the first pass's findings against the code. Where it disagreed on the facts or the rating, it recorded a dispute:

- **ARCH-05**, suggested severity **high**: The trigger is more than a missing repo variable. The documented manual procedure produces it. docs/how-to/infrastructure.md:20 tells the maintainer to run a bare `tofu apply`, and infrastructure.md:40 states that 'Local runs and CI share this same remote state'. provision.sh:12-14 passes `${ENTRA_SUBDOMAIN:-}` etc., so `./buddy.sh infrastructure provision` without exported vars behaves the same way. Either path sets ENTRA\_\* to "" and SKIP\_AUTH="true" on the production app (functions.tf:115). skipAuthIfDev (authMiddleware.js:51-57) then returns 'local-dev-user' before it even reads the Authorization header. The Pages config.js is untouched, so real users still sign in, and every one of them, plus any anonymous caller, is served the same shared partition. Tours or photos uploaded by one user become visible to all others until the next CI deploy. A documented maintainer action leading to cross-user data exposure meets 'serious and plausible', not medium.
- **ARCH-02**, suggested severity **medium**: The behaviour is confirmed: DeleteTour/index.js:26-29 deletes only the doc and `${userId}/${tourId}.gpx`. But there is no access path to the leftover photos. The tour-images container is private (storage.tf:30, allow\_nested\_items\_to\_be\_public=false; createIfNotExists defaults to private), and SAS URLs are minted only from blobNames on a tour doc that no longer exists (GetTour/index.js:29-31, GetMapData/index.js:79-80), with already-issued SAS URLs expiring within 1 h (blobStorage.js SAS\_TTL\_MS). DeleteAccount's prefix purge (DeleteAccount/index.js:52) removes them eventually. The effect is retention against user expectation plus storage cost, not an exploitable exposure or data loss, which fits 'real defect with limited blast radius'.
- **ARCH-03**, suggested severity **medium**: The orphaning needs a partial failure after the queue write (DeleteAccount/index.js:41-55), and the user must not retry before the 03:00 UTC run (process-deletions.yml:8). The Cosmos SDK already retries 429s, and the blob/doc deletes are idempotent, so a retry by the user completes the purge. Alternatively it needs a concurrent write from another tab inside the purge window. Nothing that is left over is reachable by anyone: it sits in private containers and partitions keyed by a sub that can no longer sign in. This is an unusual-conditions privacy-retention defect, so medium rather than high.
- **ARCH-04**, suggested severity **low**: The drift is real (storage.tf:34 'images' versus blobStorage.js:35 'tour-images'), but it has no functional or security consequence today. createIfNotExists() creates the container private by default, the account-level allow\_nested\_items\_to\_be\_public=false still applies, and the unused 'images' container costs nothing. It is hardening/consistency (low). Its only real operational effect, a runtime create call on the hot path, is covered by ARCH-G01.

## Coverage

<details><summary>Files and areas read</summary>

- functions/src/\*/index.js (all 12 handlers: DeleteAccount, DeleteImage, DeleteTour, EditTour, ExportData, GetMapData, GetMe, GetTour, GetTours, Health, UpdateProfile, UploadImage, UploadTour)
- functions/src/lib/\*.js (blobStorage, db, extractGps, heatmapCache, http, ownedTour, parseGpx, parseMultipart, resizeImage, simplify, thumbBlobName, tourResponse, validation)
- functions/src/middleware/authMiddleware.js
- functions/scripts/\*.js (backfillImageThumbnails, backfillTourStats, check-coverage, init-cosmos, process-deletions)
- functions/package.json, host.json, local.settings.json.example, vitest.config.js, eslint.config.js
- infrastructure/\*.tf (budget, cosmos, functions, main, outputs, storage, variables)
- .github/workflows/deploy.yml, process-deletions.yml, gate.yml (first 200 lines); .github/dependabot.yml; .pre-commit-config.yaml (lint hooks)
- buddy.sh, scripts/infrastructure/\*.sh, scripts/maintenance/delete-users.sh
- frontend/src/sw.js, app.js, ui/state.js, ui/router.js, ui/auth.js, ui/profile.js, ui/upload-modal.js, ui/sidebar.js, ui/tour-detail.js, ui/images.js, ui/routes.js, ui/map.js, ui/pins.js, ui/statsModal.js, ui/dom.js (head)
- frontend/src/lib/\*.js (i18n, url, tours, sasCache, mapData, upload, files, concurrency, stats)
- frontend/src/vendor/.msal-source, .leaflet-source, .archivo-source (provenance only), frontend/src/locales/en.json error keys, frontend/src/index.html (CSP/script tags/maxlength)
- frontend/test/sw.test.js, frontend/package.json, e2e/package.json
- docs/reference/architecture.md, docs/reference/configuration.md, docs/explanation/design-decisions.md, docs/explanation/security.md, docs/cost-report.md (grep), docs/how-to/developer-guide.md (grep), README.md
- functions/src/\*/index.js (all 13 handlers) re-read for cross-file behaviour
- functions/src/lib/{db,http,ownedTour,tourResponse,heatmapCache,blobStorage,validation,thumbBlobName,parseMultipart,parseGpx,simplify}.js
- functions/src/middleware/authMiddleware.js (OIDC/JWKS caching)
- functions/scripts/{process-deletions,init-cosmos,backfillTourStats,backfillImageThumbnails}.js
- functions/package.json, host.json, local.settings.json.example, eslint.frontend.config.js
- infrastructure/{cosmos,functions,storage,main,variables,outputs}.tf
- .github/workflows/{deploy,destroy,process-deletions,dependabot-auto-merge,gate}.yml (gate fully), .github/dependabot.yml, .gitignore, .pre-commit-config.yaml
- buddy.sh and every scripts/\*\*/\*.sh (development, infrastructure, maintenance, quality, test)
- frontend/src/app.js, sw.js, config.js.example, 404.html, manifest.webmanifest, index.html (CSP/scripts)
- frontend/src/ui/{auth,state,router,sidebar,tour-detail,upload-modal,images,profile,menus,statsModal}.js
- frontend/src/lib/{i18n,url,tours,mapData,sasCache,upload,files,stats}.js, locales/\*.json key parity
- frontend/test/sw.test.js; e2e/playwright.fullstack.config.ts, e2e/global-setup.ts, e2e/serve.mjs
- docs/reference/{architecture,configuration}.md, docs/explanation/design-decisions.md, docs/how-to/{infrastructure,developer-guide}.md, docs/tutorials/getting-started.md
- git history of frontend/src/sw.js vs later frontend changes (verification of ARCH-01)

</details>

<details><summary>Commands and probes run</summary>

- git ls-files (layout survey, 252 tracked files)
- git log --format -- frontend/src/sw.js plus a loop over shell-changing commits since badc0aa to check for CACHE\_NAME bumps. Result: 07bfdad, 42a19ee and aff8ef1 (all after the last bump to v9 in b27e779) changed ui/\*.js, style.css or index.html without bumping the cache; so did 8e914bd, d1866fb, 3f589f3, e948d9b, 310748b and others earlier
- git show --stat 42a19ee: style.css, ui/modal.js, ui/routes.js, ui/sidebar.js and ui/tour-detail.js changed; sw.js not touched
- node scratchpad/arch/probe-deletetour.js (calls deleteTour with fakes on a tour that has 1 image). Output: calls = \['cosmos.delete &lt;id&gt;', 'gpx.deleteIfExists u1/&lt;id&gt;.gpx'\]; image blobs touched: 0
- node scratchpad/arch/probe-edittour.js (calls editTour with a stored doc; name-only PATCH). Output: status 200, 65065 bytes; gpxFileUrl is the raw unsigned <https://bikebuddyfilesxyz.blob.core.windows.net/>... URL; images=\[{id,blobName:'entra-sub-abc/&lt;tourId&gt;/img1.jpg',lat,lon}\] with no url/thumbUrl; heatmap points 5000
- Import-graph extraction over frontend/src/ui/\*.js with grep. Cycles found: auth&lt;-&gt;sidebar, auth&lt;-&gt;routes, sidebar&lt;-&gt;tour-detail, images-&gt;sidebar-&gt;tour-detail-&gt;images, pins&lt;-&gt;images
- grep for 'heatmapZoom|leaflet.heat|heatLayer': only a dangling reference in functions/src/GetMapData/index.js:25; no heat-layer code or vendor file exists
- grep for container names: code uses 'tour-images' (lib/blobStorage.js:35, backfillImageThumbnails.js:57, cost-report.md:91); infrastructure/storage.tf:34 declares 'images'
- npx eslint scripts/ (in functions/): clean; scripts are outside the lint/prettier hooks' ^functions/(src|test)/ scope and have no tests
- grep TODO/FIXME/HACK across first-party code: none
- git ls-files; wc -l over first-party sources
- git log/diff b27e779..HEAD -- frontend/src (confirms 3 commits changed index.html/style.css/ui/\*.js after the last CACHE\_NAME bump)
- node scratchpad/arch2/probe-skipauth.js -&gt; loads local.settings.json.example Values into env and calls authenticate(): output 'THROWS: SKIP\_AUTH must not be set when Entra auth is configured'
- node scratchpad/arch2/probe-gpxname.js -&gt; parseGpx with &lt;name&gt;2024&lt;/name&gt; yields typeof name 'number' (2024); &lt;name lang="de"&gt;Alpen&lt;/name&gt; yields object {"#text":"Alpen","@\_lang":"de"}; a 309-char name containing '&lt;b&gt;' passes through unchanged; GetTour's filename expression throws '(name || "tour").replace is not a function'; frontend SORTERS throw '(2024 || "").localeCompare is not a function'
- node scratchpad/arch2/probe-container.js -&gt; with an unreachable BLOB endpoint, gpxContainer() rejects ECONNREFUSED and a later gpxContainer() call returns the SAME rejected promise object (p1 === p2: true) without retrying
- npm view azure-functions-core-tools dist-tags / @4 version -&gt; latest 4.15.1 (what deploy.yml's floating @4 installs; gate.yml pins 4.13.0)
- node one-liner comparing locale key sets (all 7 locales 169 keys, no drift) and t()/i18n keys used in code vs en.json (none missing)
- npx prettier --check on frontend/src/ui and functions/scripts (ui clean; 2 scripts unformatted, outside the hook globs)
- eslint (frontend config) over frontend/src frontend/test: clean

</details>
