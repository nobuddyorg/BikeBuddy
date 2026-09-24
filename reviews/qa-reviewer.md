# QA review: qa-reviewer

Raw findings from the **qa-reviewer** role of the 2026-09-24 five-lens review of BikeBuddy (`main` at `b0bde68`). It ran two passes: a first pass over the whole repo, then an independent second pass that looked for missed issues (IDs `QA-Gnn`) and disputed first-pass claims. Vendored code (`frontend/src/vendor/`), lockfiles and generated output were out of scope.

Severity scale (shared by all reviewers): **critical**: exploitable now, severe; **high**: serious and plausible in production; **medium**: real defect, limited blast radius; **low**: hardening or minor; **info**: observation.

The findings below are the reviewer's own claims, as returned. The _Verification_ lines come from the adversarial verifiers: two independent lenses (code truth, impact) for every critical/high finding, and one skeptical batch check for medium/low. The lead's final, deduplicated severities are in [`REVIEW.md`](../REVIEW.md).

## Summary

The backend is small and carefully written. Unit tests are thorough at the level of single functions, and i18n key parity is clean in all 7 locales. The substantive defects sit at the edges of the system:

- \*\*Deletion semantics:\*\* DeleteTour never deletes the tour's photos. DeleteAccount can leave data orphaned forever. The client-only 6 s undo timer drops deletes if the page unloads.
- \*\*GPX parsing edge cases (all reproduced with probes):\*\*
  - Non-string names make GetTour return 500 and break list search and name sort.
  - Multi-segment files gain phantom distance across the gaps.
  - More than ~125k points overflows the stack in Math.min(...).
  - Files with only `<rte>` are stored as empty 0 km tours.
- \*\*Frontend state and robustness:\*\*
  - GET /me overwrites a user-chosen display name.
  - A malformed deep-link hash leaves the app stuck on the loading skeleton.
  - The edit-date field is off by one day for non-UTC users.
  - A failed /api/map call shows "No tours to display" and caches that for 45 min.
  - The service worker serves cached files first under a manually bumped version that has already been missed.
- \*\*Test quality:\*\* the suites would not catch most of these. None of the ~2.7k lines in frontend/src/ui/\* has a unit test and none is measured for coverage. The e2e delete tests only check the optimistic UI. The profile "persists" test never reloads. The integration suite has 5 tests, even though db.js and blobStorage.js are excluded from coverage and mutation testing on the grounds that integration tests cover them.

No critical issues were found. DeleteTour leaving personal photos behind is the one high-severity finding.

## Strengths noted

- Ownership is enforced structurally: every tour read/query goes through the caller's partition key (lib/ownedTour.js, db.queryUserItems), and IDs are UUID-validated before use.
- Careful partial-failure ordering with written rationale: UploadTour writes the blob first and rolls it back if the Cosmos create fails; DeleteTour/DeleteImage delete the document before the blob.
- Concurrency is handled deliberately: UploadImage appends with an atomic '/images/-' patch, EditTour uses per-field patch, and DeleteImage uses ETag IfMatch with bounded retries.
- parseMultipart enforces the 10 MB limit while streaming (it does not trust Content-Length), maps malformed bodies to 400, and has a unit test for the exact 10 MB boundary.
- parseGpx filters NaN and out-of-range coordinates and keeps null (unknown) separate from 0 for elevation and duration; tests cover these cases.
- i18n: all 7 locales have identical key sets (169 keys) and consistent {placeholder} names; a unit test enforces key parity and checks that the API's error keys exist in every locale. My scratch diff found no missing or unused keys.
- The frontend's pure logic (tours.js, format.js, stats.js, url.js, upload.js, concurrency.js, sasCache.js) is factored out and unit-tested; a test keeps the service worker's precache list in sync with files on disk.
- The functions coverage gate (check-coverage.js, 90% line and branch per package) and Stryker mutation testing (break at 85%) are real CI gates; Codecov is only informational.
- Auth middleware separates client token errors (401) from verification-infrastructure failures (thrown, so 5xx) and refuses to run SKIP\_AUTH when Entra is configured.
- e2e uses page objects with web-first assertions; the fixed sleeps that remain are documented and confined to CDP touch-gesture helpers.

## Findings overview

Reviewer-assigned counts: 0 critical, 1 high, 18 medium, 25 low, 0 info.

| ID     | Reviewer severity | Title                                                                                                                                                                           | Location                                    | Verification                                                                   |
| ------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------ |
| QA-01  | high              | DeleteTour never deletes the tour's photos (full-size and thumbnail blobs)                                                                                                      | `functions/src/DeleteTour/index.js:29`      | code-truth: partially-confirmed → medium; impact: partially-confirmed → medium |
| QA-02  | medium            | GET /api/me overwrites a user-chosen display name with the token's name claim                                                                                                   | `functions/src/GetMe/index.js:20`           | confirmed → medium                                                             |
| QA-03  | medium            | Tour name taken from the GPX file skips validation: numbers, booleans and objects are stored as the name and break GetTour and the list                                         | `functions/src/lib/parseGpx.js:142`         | confirmed → low                                                                |
| QA-04  | medium            | All tracks and segments are joined into one line, adding phantom distance and moving time across gaps                                                                           | `functions/src/lib/parseGpx.js:149`         | confirmed → medium                                                             |
| QA-05  | medium            | Math.min(...elevations) overflows the stack on large GPX files that are within the 10 MB limit, so valid uploads are rejected                                                   | `functions/src/lib/parseGpx.js:49`          | partially-confirmed → low                                                      |
| QA-06  | medium            | GPX files with only &lt;rte&gt; routes, or with no valid points, are silently stored as empty 0 km tours                                                                        | `functions/src/lib/parseGpx.js:138`         | confirmed → medium                                                             |
| QA-07  | medium            | A malformed #/tour/ deep link throws a URIError at startup and leaves the app stuck on the loading skeleton                                                                     | `frontend/src/lib/url.js:13`                | partially-confirmed → low                                                      |
| QA-08  | medium            | The service worker serves the app shell cache-first under a manually bumped version; bumps have been missed, so users keep stale JavaScript                                     | `frontend/src/sw.js:122`                    | confirmed → medium                                                             |
| QA-09  | medium            | The tour-date editor is off by one day for users outside UTC                                                                                                                    | `frontend/src/ui/tour-detail.js:116`        | confirmed → medium                                                             |
| QA-10  | medium            | No handling for 401s or expired tokens: a returning user sees 'Couldn't load your tours' instead of being asked to sign in                                                      | `frontend/src/ui/auth.js:160`               | confirmed → medium                                                             |
| QA-11  | medium            | When /api/map fails, the map says 'No tours to display' and caches the empty result for 45 minutes                                                                              | `frontend/src/lib/mapData.js:25`            | confirmed → low                                                                |
| QA-12  | medium            | DeleteAccount queues the Entra identity for deletion before purging data; a later failure orphans the data permanently                                                          | `functions/src/DeleteAccount/index.js:42`   | confirmed → medium                                                             |
| QA-13  | medium            | Tour and photo deletes run on a client-side 6 s timer and are lost if the page is closed, reloaded or signed out first                                                          | `frontend/src/ui/tour-detail.js:180`        | confirmed → medium                                                             |
| QA-14  | medium            | Frontend UI logic (about 2.7k lines in ui/\*) has no unit tests or coverage, and the e2e tests on the key flows check only optimistic UI                                        | `frontend/vitest.config.js:6`               | confirmed → medium                                                             |
| QA-15  | medium            | db.js and blobStorage.js are excluded from coverage and mutation testing on the grounds that integration tests cover them, but the integration suite is only 5 happy-path tests | `functions/vitest.config.js:19`             | partially-confirmed → low                                                      |
| QA-16  | medium            | With two dialogs open, Escape and the focus trap act on the one underneath (the first open overlay in page order, not the topmost)                                              | `frontend/src/ui/modal.js:44`               | confirmed → low                                                                |
| QA-17  | medium            | The data export leaves out the uploaded GPX files and photos, and the gpxFileUrl it includes cannot be opened                                                                   | `functions/src/ExportData/index.js:21`      | confirmed → medium                                                             |
| QA-G01 | medium            | Signing in again between DeleteAccount and the nightly Entra purge recreates an account whose data is then orphaned permanently                                                 | `functions/src/GetMe/index.js:17`           | confirmed → medium                                                             |
| QA-G02 | medium            | Tour duration goes negative when timestamps are not in file order                                                                                                               | `functions/src/lib/parseGpx.js:78`          | confirmed → low                                                                |
| QA-18  | low               | Deploy runs on every push to main without depending on the CI gate                                                                                                              | `.github/workflows/deploy.yml:4`            | confirmed → low                                                                |
| QA-19  | low               | A corrupt image with a valid JPEG/PNG header returns 500 instead of 400                                                                                                         | `functions/src/UploadImage/index.js:70`     | confirmed → low                                                                |
| QA-20  | low               | The 20-photo limit per tour is checked on a stale read and can be exceeded by concurrent uploads                                                                                | `functions/src/UploadImage/index.js:52`     | confirmed → low                                                                |
| QA-21  | low               | Races on Cosmos 404 and 409 surface as 500s instead of being handled idempotently                                                                                               | `functions/src/DeleteTour/index.js:26`      | confirmed → low                                                                |
| QA-22  | low               | API errors written as English prose, client-side upload messages and number/duration formats are not localised                                                                  | `frontend/src/lib/format.js:14`             | confirmed → low                                                                |
| QA-23  | low               | Tour date comes from the file's metadata time or the first point only; one bad &lt;time&gt; rejects the whole file                                                              | `functions/src/lib/parseGpx.js:146`         | confirmed → low                                                                |
| QA-24  | low               | EditTour and UploadTour return raw stored image records and an unsigned gpxFileUrl, unlike GetTour and contrary to the docs                                                     | `functions/src/lib/tourResponse.js:14`      | confirmed → low                                                                |
| QA-25  | low               | Unguarded localStorage read while state.js loads crashes the app when storage is blocked                                                                                        | `frontend/src/lib/lineStyle.js:48`          | confirmed → low                                                                |
| QA-26  | low               | Retrying a failed photo upload reuses the token captured at the start of the batch                                                                                              | `frontend/src/ui/images.js:403`             | confirmed → low                                                                |
| QA-27  | low               | Fixed sleeps in e2e gesture helpers are a flakiness risk                                                                                                                        | `e2e/pages/main-page.ts:264`                | partially-confirmed → low                                                      |
| QA-28  | low               | The architecture doc's API table is missing four routes                                                                                                                         | `docs/reference/architecture.md:26`         | confirmed → low                                                                |
| QA-29  | low               | Maintenance scripts are untested; backfillTourStats aborts the whole run on one missing tour                                                                                    | `functions/scripts/backfillTourStats.js:54` | confirmed → low                                                                |
| QA-G03 | low               | A list refetch during the 6-second undo window brings deleted tours back as ghost entries (and Undo then duplicates them)                                                       | `frontend/src/ui/sidebar.js:51`             | partially-confirmed → low                                                      |
| QA-G04 | low               | Content-Length pre-check rejects GPX/photo files of exactly 10 MB that the frontend and busboy limit accept; the unit test hides it by omitting the header                      | `functions/src/lib/parseMultipart.js:33`    | confirmed → low                                                                |
| QA-G05 | low               | UploadImage leaves the full-size and thumbnail blobs behind when the Cosmos append fails, unlike UploadTour's rollback                                                          | `functions/src/UploadImage/index.js:88`     | confirmed → low                                                                |
| QA-G06 | low               | Closing a dialog or the detail panel with its button leaves its history entry behind, so Back presses do nothing                                                                | `frontend/src/ui/modal.js:31`               | confirmed → low                                                                |
| QA-G07 | low               | Pressing Escape in the language picker also closes the whole Profile dialog                                                                                                     | `frontend/src/app.js:277`                   | confirmed → low                                                                |
| QA-G08 | low               | A failed tour-detail fetch is cached as loaded for 45 minutes, leaving the gallery empty and stats blank with no retry                                                          | `frontend/src/ui/sidebar.js:96`             | confirmed → low                                                                |
| QA-G09 | low               | After signed URLs go stale, a map refresh swaps the open gallery's photo list for pin-only photos, so clicking a thumbnail opens the wrong photo                                | `frontend/src/lib/mapData.js:28`            | confirmed → low                                                                |
| QA-G10 | low               | Stryker excludes parseMultipart.js with an incorrect rationale; ignoreStatic also exempts every limit and schema constant from mutation                                         | `functions/stryker.config.mjs:22`           | confirmed → low                                                                |
| QA-G11 | low               | GetMapData's module-level heatmap cache is shared across unit tests and ignores the budget arguments, so some tests pass on cached results                                      | `functions/src/GetMapData/index.js:12`      | partially-confirmed → low                                                      |
| QA-G12 | low               | Terraform provisions an unused 'images' container while photos go to an unmanaged, runtime-created 'tour-images' container                                                      | `infrastructure/storage.tf:34`              | confirmed → low                                                                |
| QA-G13 | low               | GPX magic-byte check rejects well-formed XML that starts with a comment or whitespace                                                                                           | `functions/src/UploadTour/index.js:18`      | confirmed → low                                                                |
| QA-G14 | low               | GPX download filename turns every non-ASCII letter into '\_' (e.g. 'Départ' becomes 'D\_part.gpx'; Cyrillic or CJK names become '\_.gpx')                                       | `functions/src/GetTour/index.js:47`         | confirmed → low                                                                |
| QA-G15 | low               | Delete confirmations say 'This cannot be undone' and then offer Undo; plural strings have no singular form                                                                      | `frontend/src/locales/en.json:181`          | partially-confirmed → low                                                      |

## Findings

### QA-01: DeleteTour never deletes the tour's photos (full-size and thumbnail blobs)

- **Severity (reviewer):** high
- **Category:** data-retention · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/DeleteTour/index.js:29`
- **Also:** `functions/src/UploadImage/index.js:77 (blobs are uploaded before the patch; if the tour was deleted in between, the patch 404s and the blobs are orphaned)`, `functions/src/DeleteTour/index.test.js:26 (no assertion about image blobs)`

**Evidence:**

```text
// DELETE /api/tours/{tourId} — removes the tour document and its GPX blob.
...
  await container.getBlockBlobClient(`${userId}/${tourId}.gpx`).deleteIfExists();
```

**Description.** Photos are stored at `${userId}/${tourId}/${imageId}.jpg` plus `_thumb.jpg` in the tour-images container (UploadImage). DeleteTour deletes only the tour document and the GPX blob. Once the document is gone nothing references the image blobs, so no API path can ever list or delete them. They stay until the whole account is deleted. The unit tests (DeleteTour/index.test.js) only check the GPX blob, and the integration and e2e tests only check that the tour disappears from the list.

**Impact.** A user who deletes a tour, expecting its personal photos to be gone, keeps them in storage indefinitely. This is a storage-limitation/erasure problem for sensitive personal data, plus steadily growing storage cost. Tours deleted through bulk delete or swipe delete have the same problem.

**Recommendation.** In DeleteTour, after deleting the document, delete every blob under the prefix `${userId}/${tourId}/` in the images container (reuse the prefix-deletion helper from DeleteAccount), or iterate tour.images and delete each blob and its thumbnail. Add a unit test asserting the image blobs are deleted, and a one-off script that removes image blobs whose tourId no longer exists.

**Verification (two adversarial lenses):**

- _code-truth_: **partially-confirmed**, severity → **medium**, reachable in production: yes.
- _impact_: **partially-confirmed**, severity → **medium**, reachable in production: yes.

<details><summary>code-truth verifier: reasoning, evidence and reproduction</summary>

The core claim holds. DeleteTour has no access to the images container, so deleting a tour removes the Cosmos document and the GPX blob and leaves every full-size photo and thumbnail under `${userId}/${tourId}/`. After the document is gone, nothing in the API references those blobs. GetTour, GetMapData and ExportData all go through tour.images, so the photos are never served, exported or deleted until DeleteAccount's prefix sweep runs. Every tour deletion in production hits this, including single, bulk and swipe deletes, which all go through scheduleTourRemoval -&gt; DELETE /api/tours/{id}. The tests really don't cover it.

I'm lowering the severity from high to medium under the shared rubric. The orphaned blobs sit in a private container ('allow\_nested\_items\_to\_be\_public = false', container\_access\_type private). No new SAS URL is ever issued for them, and any old SAS link expires within an hour (SAS\_TTL\_MS = 1h). So there is no path for another user or an attacker to reach them. The data is not lost or corrupted. The user's intent to delete is simply not carried out. Account deletion (GDPR erasure) still removes them through the `${userId}/` prefix sweep. Cost is negligible: at most 20 resized JPEGs plus thumbnails per tour, on a small user base. This is a real erasure/storage-limitation defect with limited blast radius and a test gap, which is medium, not a "serious security weakness with a realistic attack path" or a data-loss risk.

The recommendation is sound: prefix-delete `${userId}/${tourId}/` in the images container after the document delete. That keeps the existing doc-first ordering, and deleteIfExists/prefix deletion are idempotent. The race in the otherLocations entry is also real but low-probability.

Side observation outside this finding: infrastructure/storage.tf:34 provisions a container named "images", but the code uses 'tour-images', which is created at runtime by createIfNotExists. That is doc/infra drift.

Evidence:

```text
functions/src/DeleteTour/index.js:9 "// DELETE /api/tours/{tourId} — removes the tour document and its GPX blob."; :10-15 the function's only injected dependencies are auth, getToursContainer and getGpxContainer. It never imports imagesContainer (line 6: "const { gpxContainer } = require('../lib/blobStorage');"). :26 "await getToursContainer().item(tourId, userId).delete();" and :29 "await container.getBlockBlobClient(`${userId}/${tourId}.gpx`).deleteIfExists();" are the only deletes.
functions/src/UploadImage/index.js:73 "const blobName = `${userId}/${tourId}/${imageId}.jpg`;" and :76 thumbBlobName(blobName). Both go into the 'tour-images' container (functions/src/lib/blobStorage.js:35 "imagesContainer: () => (imagesContainerPromise ??= containerOnce('tour-images'))").
Mitigations checked, none of which fix this. infrastructure/storage.tf:4-44 has no azurerm_storage_management_policy or lifecycle rule. functions/scripts/ has no orphan reaper (backfillImageThumbnails, backfillTourStats, init-cosmos, process-deletions, check-coverage). frontend/src/ui/tour-detail.js:185 only calls "apiFetch(`/api/tours/${id}`, { method: 'DELETE' })" and never deletes each photo first. The only thing that cleans up is functions/src/DeleteAccount/index.js:49-52: "const prefix = `${userId}/`; ... await deleteBlobsByPrefix(await getImages(), prefix);". That removes the orphans only when the whole account is deleted.
functions/src/DeleteTour/index.test.js:17-40 mocks only a gpx container, and nothing asserts on image blobs.
Secondary race (otherLocations): UploadImage/index.js:77-93 uploads the blobs before running patch(). If the tour is deleted in between, patch throws 404, and because "if (err.code !== 400) throw err;" re-throws it, the blobs are left orphaned.
```

Reproduction:

```text
Ran /tmp/claude-0/-home-user-BikeBuddy/ba198852-09c2-5d10-a6cd-4f788c2502d9/scratchpad/qa01/repro.js. It require()s the real functions/src/DeleteTour/index.js and calls deleteTour with a mock auth (userId u1), a mock tours container returning a tour with images:[{id:'img1',blobName:'u1/<TID>/img1.jpg'}], and a mock gpx container that records every call. Output:
status 204
[["read","1111...","u1"],["docDelete","1111...","u1"],["gpxDelete","u1/1111....gpx"]]
The function only accepts (request, auth, getToursContainer, getGpxContainer), and no image blob delete (full or _thumb) is attempted. I did not exercise real Azure storage.
```

</details>

<details><summary>impact verifier: reasoning, evidence and reproduction</summary>

The underlying fact is correct. DeleteTour deletes only the Cosmos document and the GPX blob. Every photo and thumbnail under `${userId}/${tourId}/` in the tour-images container stays behind, and neither the frontend nor any script or lifecycle policy cleans them up. This happens on every production tour delete that has photos (single, bulk and swipe all go through deleteTourById, then scheduleTourRemoval, then the DELETE API). It needs no attacker and no unusual conditions.

I downgrade it from high to medium for these reasons:
(1) Nothing is exposed. The container is private (createIfNotExists defaults to private, and the account sets allow\_nested\_items\_to\_be\_public = false). After the tour document is gone, no API can mint a SAS for those blobs, and SAS URLs issued earlier expire within 1 hour. No other user and no anonymous party can reach the photos. Only a storage-account key holder (the operator) can.
(2) The data is not lost or corrupted. The opposite happens: data is kept for too long.
(3) The retention is bounded, not indefinite. DeleteAccount removes everything under `${userId}/` in both containers, so the orphans are erased when the account is deleted, and the user's full-erasure path still works.
(4) Cost is small in this deployment. Photos are re-encoded or resized JPEGs, capped at 20 per tour (MAX\_TOUR\_IMAGES), for a small hobby user base on blob storage costing cents per GB-month.

What is left is a real defect with limited blast radius. The per-tour erasure the UI promises ("irreversible") does not happen for sensitive personal photos, and no test covers it. That is a storage-limitation/GDPR Art. 17 compliance gap and a slow storage leak, not a serious security weakness or a data-loss risk, so medium under the shared rubric.

One nuance on the photos themselves: UploadImage re-encodes them, which drops EXIF, and the extracted GPS lives only in the (deleted) tour document. So the orphaned blobs no longer carry embedded GPS, which lowers their sensitivity a bit further.

The otherLocations note on UploadImage:77 (upload/delete race orphaning blobs) is valid, but it needs a concurrent delete during an upload, so it is low on its own and shares the same root cause. The fix recommendation (prefix-delete `${userId}/${tourId}/` in DeleteTour, and reuse deleteBlobsByPrefix from DeleteAccount) is correct and small.

Evidence:

```text
functions/src/DeleteTour/index.js:9 "// DELETE /api/tours/{tourId} — removes the tour document and its GPX blob."; :26 "await getToursContainer().item(tourId, userId).delete();"; :29 "await container.getBlockBlobClient(`${userId}/${tourId}.gpx`).deleteIfExists();". The function has no images-container dependency at all.
functions/src/UploadImage/index.js:73 "const blobName = `${userId}/${tourId}/${imageId}.jpg`;"; :76 "container.getBlockBlobClient(thumbBlobName(blobName))". Photos and thumbnails are stored under the tour prefix in 'tour-images'.
functions/src/DeleteAccount/index.js:50-52 "const prefix = `${userId}/`; ... await deleteBlobsByPrefix(await getImages(), prefix);". Deleting the account does remove the orphans.
functions/src/lib/blobStorage.js:5 "const SAS_TTL_MS = 60 * 60 * 1000; // 1 hour"; :27 "c.createIfNotExists()". The container is private and read access is only through short-lived SAS URLs.
infrastructure/storage.tf:12 "allow_nested_items_to_be_public = false". No lifecycle or management policy exists in infrastructure/*.tf, and no orphan-reaper script exists in functions/scripts (backfillImageThumbnails.js, backfillTourStats.js, check-coverage.js, init-cosmos.js, process-deletions.js).
frontend/src/locales/fr.json:179 "Supprimer « {name} » ? Cette action est irréversible." The UI presents tour deletion as final, and frontend/src/ui/tour-detail.js:223-250 (single and bulk delete) never calls DeleteImage for each photo first.
```

Reproduction:

```text
No code was executed. I confirmed the finding by reading the code. I read DeleteTour/index.js in full: it has no images-container parameter or call. I read UploadImage/index.js in full (blob naming), the DeleteAccount prefix deletion (grep), blobStorage.js (container names, private createIfNotExists, 1h SAS TTL) and infrastructure/storage.tf (private containers, no lifecycle policy). I listed functions/scripts: there is no orphan cleanup script. I also checked the frontend delete flow (tour-detail.js:223-250): it makes no per-image DeleteImage calls before the tour delete.
```

</details>

Lead re-verified: **confirmed, downgraded to medium** (duplicate of ARCH-02 and PERF-G01). `DeleteTour` takes no images container and deletes only the document and the `.gpx`. The photos stay in a private container with no SAS path, until the account is deleted.

### QA-02: GET /api/me overwrites a user-chosen display name with the token's name claim

- **Severity (reviewer):** medium
- **Category:** correctness · **Effort:** S · **Confidence:** medium
- **Location:** `functions/src/GetMe/index.js:20`
- **Also:** `functions/src/GetMe/index.test.js:114`, `e2e/tests-fullstack/journeys.spec.ts:95`

**Evidence:**

```text
} else if ((userName && userName !== doc.name) || (userEmail && userEmail !== doc.email)) {
    ...
    doc.name = userName || doc.name;
```

**Description.** UpdateProfile lets the user set a display name that BikeBuddy owns. But whenever the access token has a `name` claim that differs from the stored name, GetMe overwrites the stored name with the claim and upserts. The frontend calls GET /me on every sign-in and page load (auth.js refreshUser, devSignIn), so a rename is undone on the next load. My probe reproduced it: PATCH name='Alpine Rider', then the next GET /me returned 'Local Dev' and the stored doc was overwritten. The unit test 'backfills name only' (GetMe/index.test.js:114) locks this behaviour in. The e2e test 'edit display name ... persists' (journeys.spec.ts:83) only reopens the modal and never reloads, so it cannot catch it.

**Impact.** Always happens under SKIP\_AUTH (dev and full-stack e2e). In production it happens whenever External ID puts a name/displayName claim in the access token: the profile rename appears to work, then reverts on the next visit.

**Recommendation.** Only backfill the name when doc.name is empty (`if (!doc.name && userName)`). Once the user has set a name, never overwrite it from the token. Fix the unit test and add a reload step to the e2e test.

**Verification.** confirmed, severity → medium. GetMe/index.js:20-25 overwrites doc.name whenever the token's name claim differs, and authMiddleware.js:47,57 supplies payload.name (or 'Local Dev' under SKIP\_AUTH), so a PATCH /me rename (UpdateProfile/index.js:47) is undone on the next GET /me from auth.js:189. The unit test GetMe/index.test.js:114 locks this in, and journeys.spec.ts:95-99 never reloads the page.

### QA-03: Tour name taken from the GPX file skips validation: numbers, booleans and objects are stored as the name and break GetTour and the list

- **Severity (reviewer):** medium
- **Category:** input-validation · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/lib/parseGpx.js:142`
- **Also:** `functions/src/UploadTour/index.js:64`, `functions/src/GetTour/index.js:47`, `frontend/src/lib/tours.js:10`, `frontend/src/lib/tours.js:45`

**Evidence:**

```text
const name = gpx.metadata?.name || tracks[0]?.name || null;
```

**Description.** fast-xml-parser converts numeric and boolean text by default, and an element with attributes becomes an object. So `<name>2024</name>` gives the number 2024, `<name>007</name>` gives 7, `<name>true</name>` gives true, `<name lang="de">Tour</name>` gives {"#text":"Tour","@\_lang":"de"}, and `<name>0</name>` is dropped. UploadTour stores parsed.name directly (`metaParsed.data.name ?? parsed.name ?? 'Untitled Tour'`) without nameSchema, so it also skips stripHtml and the 200-character limit. Consequences, reproduced by probe: GetTour throws `(tour.name || "tour").replace is not a function`, so the detail view gets a 500 on every request. On the frontend, visibleTours throws in matchScore (`(text || '').toLowerCase`) whenever the search box has text, and in the name-asc/desc sorters (`localeCompare`), so the whole tour list fails to render. A GPX name longer than 200 characters also blocks every later edit, because the edit modal sends it back and gets 400 errors.tourName.

**Impact.** Through the UI this needs the user to clear the prefilled name field; through the API it needs a plain upload without ?name=. After that the tour's detail view returns 500, and searching or name-sorting breaks the list for that user until they rename the tour.

**Recommendation.** Pass the GPX name through the same schema: coerce #text or objects to String, then apply nameSchema.safeParse and fall back to 'Untitled Tour' when it fails. Alternatively configure XMLParser with parseTagValue:false (or a tag allow-list) so text is never type-converted. Make GetTour's filename code defensive (`String(tour.name ?? 'tour')`). Add parseGpx and UploadTour tests for numeric, attributed and over-long names.

**Verification.** confirmed, severity → low. Probe: &lt;name&gt;2024&lt;/name&gt; gives the number 2024, &lt;name lang="de"&gt; gives an object, and &lt;name&gt;0&lt;/name&gt; gives null. UploadTour/index.js:64 stores parsed.name without nameSchema, and GetTour/index.js:47 `.replace` or tours.js:10/45 `.localeCompare`/`.toLowerCase` then throw. Downgraded because the UI prefills the name from the filename (upload-modal.js:69,77), so it only happens when the user clears the field and the GPX name is also numeric, attributed or longer than 200 characters.

### QA-04: All tracks and segments are joined into one line, adding phantom distance and moving time across gaps

- **Severity (reviewer):** medium
- **Category:** correctness · **Effort:** M · **Confidence:** high
- **Location:** `functions/src/lib/parseGpx.js:149`
- **Also:** `functions/src/lib/parseGpx.js:26`, `functions/src/lib/parseGpx.js:81`, `frontend/src/ui/routes.js:24`, `functions/src/lib/parseGpx.test.js:129`

**Evidence:**

```text
  const validPoints = tracks
    .flatMap((trk) =>
      toArray(trk.trkseg).flatMap((seg) =>
```

**Description.** processPoints and computeDurationStats treat the flattened point list as one continuous line. The haversine distance between the last point of one &lt;trkseg&gt;/&lt;trk&gt; and the first point of the next is added to distanceKm. The time between them is counted as moving whenever the implied speed is at least 1 km/h. A probe with two segments (Munich, then Berlin the next day) gave distanceKm 468.3 and movingSeconds 86520 (24 h) for two 1.1 km rides. The frontend draws one polyline per tour (routes.js), so a straight line is also drawn across the gap. The existing multi-track test only asserts `distanceKm > 0`, so it would not catch this.

**Impact.** Multi-day or multi-activity GPX files, and recordings resumed after a transfer (train or ferry), get inflated distance, moving time and average speed. The inflated distance also flows into the stats modal totals and the 'longest tour' figure.

**Recommendation.** Compute distance and moving time within each segment and sum them, without joining across segment boundaries. Keep segments separate in heatmapData (or insert a break) so the map does not draw the connecting line. Add a test with two far-apart segments asserting the exact distance.

**Verification.** confirmed, severity → medium. parseGpx.js:148-159 flattens all trk/trkseg points, and processPoints (:25) and computeDurationStats (:81-91) join across segment boundaries. Probe: two short segments in Munich and Berlin a day apart gave 505.6 km and movingSeconds 86580. routes.js:23-25 draws one polyline per tour's heatmapData, so the connecting line is also drawn.

### QA-05: Math.min(...elevations) overflows the stack on large GPX files that are within the 10 MB limit, so valid uploads are rejected

- **Severity (reviewer):** medium
- **Category:** correctness · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/lib/parseGpx.js:49`
- **Also:** `functions/src/UploadTour/index.js:54`

**Evidence:**

```text
  const minElevation = Math.min(...elevations);
  const maxElevation = Math.max(...elevations);
```

**Description.** Spreading an array into Math.min/max passes every element as an argument. At about 125k elevations V8 throws 'RangeError: Maximum call stack size exceeded' (probe: the limit is about 124,907; a realistic 130k-point file with ele and time throws at parseGpx.js:49). UploadTour catches this and returns 400 'Could not parse GPX file', although the file is valid and under the 10 MB limit. Compact files (a planned route with ele but no time, about 60 bytes per point) reach 125k points well below 10 MB. The existing 'downsamples when points exceed 5000' test uses only about 5k points.

**Impact.** Long high-resolution recordings or planned routes are rejected with a misleading 'could not parse' message, and the user cannot fix it.

**Recommendation.** Compute min and max inside the existing loop (or with reduce) instead of spreading. Add a test with at least 150k points.

**Verification.** partially-confirmed, severity → low. parseGpx.js:49-50 does throw a RangeError from the spread: 130k ele-only points (6.94 MB) throw and 120k pass. But the 'realistic file with ele and time' claim fails: 126k points with ele+time, compactly formatted, are already 11.9 MB and get rejected by the 10 MB limit first. Only very dense time-less routes can hit this.

### QA-06: GPX files with only &lt;rte&gt; routes, or with no valid points, are silently stored as empty 0 km tours

- **Severity (reviewer):** medium
- **Category:** correctness · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/lib/parseGpx.js:138`
- **Also:** `functions/src/UploadTour/index.js:52`, `functions/src/lib/parseGpx.test.js:142`

**Evidence:**

```text
  if (!gpx) throw new Error('Not a valid GPX file');

  // GPX allows multiple <trk>, <trkseg> and <trkpt> elements.
  const tracks = toArray(gpx.trk);
```

**Description.** Only &lt;trk&gt;/&lt;trkseg&gt;/&lt;trkpt&gt; are read. A route exported from a planner as &lt;rte&gt;/&lt;rtept&gt; (or &lt;wpt&gt; only), or a file whose points all fail validation, parses to distanceKm 0 and heatmapData \[\] (probe: 'rte only' gives 0 km and 0 points). UploadTour then creates a tour and returns 201. The unit tests ('returns zero distance and empty heatmap when there are no trackpoints', 'handles a GPX file with no &lt;trk&gt;') make accepting this the expected behaviour.

**Impact.** The user sees an 'uploaded' tour with 0 km and nothing on the map, and gets no feedback that the file was not understood. Common planner and route exports are affected.

**Recommendation.** Parse &lt;rte&gt;/&lt;rtept&gt; as an extra point source. If no valid points remain, return 400 with an i18n key such as errors.gpxNoTrack instead of creating the tour. Update the tests accordingly.

**Verification.** confirmed, severity → medium. parseGpx.js:141 reads only gpx.trk. A probe with only &lt;rte&gt;/&lt;rtept&gt; returned 0 km and 0 points, and UploadTour/index.js:50-78 creates the tour and returns 201 with no check for empty points. Route-based (rte) exports are common from motorcycle navigation tools, which matters for this app's users.

### QA-07: A malformed #/tour/ deep link throws a URIError at startup and leaves the app stuck on the loading skeleton

- **Severity (reviewer):** medium
- **Category:** error-handling · **Effort:** S · **Confidence:** high
- **Location:** `frontend/src/lib/url.js:13`
- **Also:** `frontend/src/app.js:110`

**Evidence:**

```text
    tourId: match ? decodeURIComponent(match[1]) : null,
```

**Description.** decodeURIComponent throws on a stray or truncated percent escape (probe: '#/tour/100%' and '#/tour/%E0%A4%A' both throw URIError: URI malformed). parseAppUrl runs through readInitialUrl() at the top of the app.js module (line 110), before any listener is attached and before the i18n init that removes body.i18n-loading. The module evaluation aborts, so the page stays on the skeleton. Reloading keeps the same URL, so the user is stuck until they edit the address. url.test.js has no malformed-input case.

**Impact.** A truncated or mangled shared link (messengers often cut off at '%') bricks the app for that URL.

**Recommendation.** Wrap the decode in try/catch and return tourId null on failure. Also validate `sort` against SORTERS. Add unit tests for malformed escapes.

**Verification.** partially-confirmed, severity → low. The crash is real: url.js:13 decodeURIComponent throws URIError on '#/tour/100%' (probe), and it runs at module top level via app.js:110 before the i18n init at app.js:290-301, so the skeleton stays. But the app only writes UUID tour ids (buildAppUrl url.js:26), which never contain '%', so a truncated real share link cannot trigger it; only a hand-crafted URL can, and opening the base URL fixes it.

### QA-08: The service worker serves the app shell cache-first under a manually bumped version; bumps have been missed, so users keep stale JavaScript

- **Severity (reviewer):** medium
- **Category:** correctness · **Effort:** M · **Confidence:** high
- **Location:** `frontend/src/sw.js:122`
- **Also:** `frontend/src/sw.js:10`, `frontend/src/sw.js:81`

**Evidence:**

```text
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
```

**Description.** Every same-origin GET except navigations (app.js, ui/\*.js, lib/\*.js, style.css, locales, config.js) is served from the precache whenever it is there. The cache is only invalidated when CACHE\_NAME changes (line 10). Git history shows this has already failed: after the v9 bump in b27e779, commits aff8ef1, 42a19ee and 07bfdad changed shell files (index.html, style.css, ui/modal.js, sidebar.js, tour-detail.js, routes.js) without a bump; 8e914bd and d1866fb did the same after v8. Navigations are network-first, so an installed client gets a fresh index.html with stale modules, and dom.js lookups can then hit elements that no longer exist. Install also uses cache.add(url), which can be served from the HTTP cache, so even a bumped version can precache stale files. sw.test.js checks the file list but not that the version changes with content.

**Impact.** After a deploy, returning users keep running old frontend code, including old bug fixes and security fixes, indefinitely, and may get a broken UI from an HTML/JS mismatch.

**Recommendation.** Use stale-while-revalidate or network-first for JS/CSS/JSON, or generate CACHE\_NAME from a content hash in the deploy workflow. Use `new Request(url, {cache: 'reload'})` when precaching. Add a CI check that fails when shell files change but CACHE\_NAME does not.

**Verification.** confirmed, severity → medium. sw.js:122 serves same-origin assets cache-first, and only the CACHE\_NAME constant (sw.js:10, 'v9') invalidates them. git shows 42a19ee (modal.js, routes.js, sidebar.js, tour-detail.js, style.css) and 07bfdad (sidebar.js) after the v9 bump in b27e779 with no bump. deploy.yml uploads frontend/src unchanged, with no automated versioning.

### QA-09: The tour-date editor is off by one day for users outside UTC

- **Severity (reviewer):** medium
- **Category:** correctness · **Effort:** S · **Confidence:** high
- **Location:** `frontend/src/ui/tour-detail.js:116`
- **Also:** `frontend/src/lib/tours.js:98`, `frontend/src/lib/format.js:5`

**Evidence:**

```text
  elEditDate.value = tour.createdAt ? tour.createdAt.slice(0, 10) : '';
```

**Description.** The detail panel shows the date in local time (format.js uses toLocaleDateString), but the edit field is prefilled with the UTC date, and withUpdatedDate (tours.js:98) writes the chosen day with setUTCFullYear. Probe with TZ=Europe/Berlin and createdAt 2026-05-01T22:30Z: the panel shows 2.5.2026, the edit field shows 2026-05-01, and after the user 'corrects' it to 2026-05-02 the panel shows 3.5.2026. The e2e date test uses 10:00Z, and the unit tests run without a pinned TZ, so neither exposes this.

**Impact.** Evening and night rides (common in the Americas), and tours without &lt;time&gt; uploaded around midnight, show one date and edit as another. The date-correction feature then saves the wrong day.

**Recommendation.** Prefill from local date parts (getFullYear/getMonth/getDate) and apply the new date with setFullYear(y, m-1, d) in local time, keeping the local time of day. Add unit tests that run under a non-UTC TZ.

**Verification.** confirmed, severity → medium. tour-detail.js:116 prefills the UTC date, format.js:5 displays the local date, and tours.js:98 writes the day with setUTCFullYear. Probe with TZ=Europe/Berlin and 2026-05-01T22:30Z: the panel shows '2. Mai', the edit field shows 2026-05-01, and after choosing 2026-05-02 the panel shows '3. Mai 2026'.

### QA-10: No handling for 401s or expired tokens: a returning user sees 'Couldn't load your tours' instead of being asked to sign in

- **Severity (reviewer):** medium
- **Category:** error-handling · **Effort:** M · **Confidence:** medium
- **Location:** `frontend/src/ui/auth.js:160`
- **Also:** `frontend/src/ui/auth.js:213`, `frontend/src/ui/sidebar.js:45`

**Evidence:**

```text
  try {
    return (await msalClient.acquireTokenSilent({ ...LOGIN_SCOPES, account })).accessToken;
  } catch {
    return (await msalClient.acquireTokenPopup({ ...LOGIN_SCOPES, account })).accessToken;
```

**Description.** When silent renewal fails (the SPA refresh token has expired, or third-party cookies block the hidden-iframe renewal), getAccessToken falls back to acquireTokenPopup. On page load this runs without a user gesture, so the popup is blocked. loadTours also starts /api/map, /api/tours and refreshUser's /api/me in parallel, so the second and third popups fail with MSAL's interaction\_in\_progress. apiFetch never looks at a 401 and never offers to sign in again. Everything ends in sidebar.js's generic 'toast.toursLoadError' while the UI still looks signed in. ui/auth.js has no unit tests, and e2e always runs in devMode, so none of this is tested.

**Impact.** A user returning after the token has expired lands in an error state, with a retry button that may itself race into interaction\_in\_progress. The only reliable fix for them is to sign out and back in.

**Recommendation.** Share one in-flight token promise across callers. On InteractionRequiredAuthError, show a 'Session expired, sign in again' prompt that calls loginPopup or acquireTokenPopup from a click. Handle 401 in apiFetch the same way. Add unit tests with a stubbed msal client.

**Verification.** confirmed, severity → medium. auth.js:157-161 falls back to acquireTokenPopup with no user gesture, reached from renderSignedIn → loadTours/refreshUser (auth.js:181-182, sidebar.js:45-49) in parallel. apiFetch (auth.js:213-218) never handles 401, and sidebar.js:52-55 turns every failure into toast.toursLoadError. ui/auth.js has no unit tests, and e2e runs in devMode.

### QA-11: When /api/map fails, the map says 'No tours to display' and caches the empty result for 45 minutes

- **Severity (reviewer):** medium
- **Category:** error-handling · **Effort:** S · **Confidence:** high
- **Location:** `frontend/src/lib/mapData.js:25`
- **Also:** `frontend/src/ui/routes.js:61`

**Evidence:**

```text
    tour.heatmapData = entry?.heatmapData || [];
    ...
    tour.detailLoaded = false;
    markFetched(tour);
```

**Description.** If /api/map fails (500, network error, cold-start timeout) while /api/tours succeeds, ensureMapData gives every tour empty data and marks it as freshly fetched, so isStale() blocks another request for 45 minutes. renderAllRoutes shows the load-error overlay only when state.toursLoadFailed is true, so it shows the empty-state overlay 'No tours to display / Upload a GPX file…' instead (routes.js:61-62). The 'In view' filter then hides every tour. There is no retry until the page is reloaded or tours are opened one by one.

**Impact.** A transient backend error on the heavier map request tells a user who has tours that they have none, and the map stays blank for up to 45 minutes.

**Recommendation.** On failure, leave the tours unmarked (no markFetched), set a mapLoadFailed flag, and show the load-error overlay with its retry button. Extend mapData.test.js to assert that tours are not marked fresh after a failure.

**Verification.** confirmed, severity → low. mapData.js:15-31 sets empty data and marks tours fetched when /api/map fails, and routes.js:61-62 shows elMapEmpty rather than the load-error overlay because toursLoadFailed is false. Downgraded: this is a documented trade-off (mapData.js:7-8), the state is only in memory so a reload fixes it, the list still shows the tours, and selecting a tour refetches detail (detailLoaded=false).

### QA-12: DeleteAccount queues the Entra identity for deletion before purging data; a later failure orphans the data permanently

- **Severity (reviewer):** medium
- **Category:** partial-failure · **Effort:** M · **Confidence:** medium
- **Location:** `functions/src/DeleteAccount/index.js:42`
- **Also:** `functions/src/DeleteAccount/index.js:47`, `functions/scripts/process-deletions.js:57`, `frontend/src/ui/profile.js:139`

**Evidence:**

```text
    await getDeletions().items.upsert({ id: userOid, requestedAt: new Date().toISOString() });
```

**Description.** The oid is queued first. The tour deletes (Promise.all, line 47), the two blob-prefix deletes and the user-doc delete follow, and any of them can throw (Cosmos 429 or 5xx, a 404 from a concurrent delete, a storage error), which returns a 500 to the client. The nightly process-deletions job (03:00 UTC) then deletes the Entra user whatever happened. After that no identity can reach the leftover tours, blobs or user doc, and nothing reconciles them. The frontend only shows toast.accountDeleteError, and the confirm button is not disabled during the request, so a double-click sends two concurrent DELETE requests and the second one fails on 404s.

**Impact.** The GDPR erasure request is left incomplete. The user's personal GPS data and photos stay in Cosmos and Blob storage indefinitely, with no owner and no cleanup path.

**Recommendation.** Make every step idempotent (treat a 404 on delete as success) and queue the Entra deletion only after the data purge succeeds, or have process-deletions purge Cosmos and Blob data by userId before deleting the identity. Disable the confirm button while the request is in flight. Add a test where a blob delete fails.

**Verification.** confirmed, severity → medium. DeleteAccount/index.js:41-43 queues the oid before the purge (:45-55), and any later throw returns 500. process-deletions.js:57-61 deletes the Entra user whether or not the purge finished. profile.js:137-147 does not disable the confirm button, and it leaves the user signed in on error, so recovery depends on the user retrying before the 03:00 UTC run.

### QA-13: Tour and photo deletes run on a client-side 6 s timer and are lost if the page is closed, reloaded or signed out first

- **Severity (reviewer):** medium
- **Category:** correctness · **Effort:** M · **Confidence:** high
- **Location:** `frontend/src/ui/tour-detail.js:180`
- **Also:** `frontend/src/ui/images.js:334`, `frontend/src/ui/tour-detail.js:166`

**Evidence:**

```text
  const timer = setTimeout(async () => {
    ...
        const res = await apiFetch(`/api/tours/${id}`, { method: 'DELETE' });
```

**Description.** The UI removes the tour at once and shows 'Tour deleted', but the DELETE request only goes out after DELETE\_GRACE\_MS (6000 ms), from a setTimeout in the page. There is no pagehide/visibilitychange flush and no server-side soft delete. Closing the tab, reloading, pressing the logo (which reloads) or backgrounding a mobile PWA within 6 s cancels the delete without any notice. Photo deletion (images.js:334) works the same way. Signing out within the window makes the request go out with no token, so it gets a 401 and the tour is pushed back into state after sign-out.

**Impact.** Deletes of sensitive data the user confirmed can silently not happen; the item reappears on the next visit.

**Recommendation.** Send the DELETE right away and implement undo as a restore (a soft-delete flag with a TTL), or at least flush pending deletes on pagehide using fetch keepalive. Cover this with e2e (see QA-14).

**Verification.** confirmed, severity → medium. tour-detail.js:166,180-203 and images.js:306,334-345 send the DELETE only from a 6 s setTimeout, with no pagehide/keepalive flush. The logo reloads the page (app.js:260). After a real sign-out, getAccessToken returns null (auth.js:155-156), so the delayed request goes out unauthenticated and the failure path pushes the tour back into state (tour-detail.js:194).

### QA-14: Frontend UI logic (about 2.7k lines in ui/\*) has no unit tests or coverage, and the e2e tests on the key flows check only optimistic UI

- **Severity (reviewer):** medium
- **Category:** test-gap · **Effort:** M · **Confidence:** high
- **Location:** `frontend/vitest.config.js:6`
- **Also:** `e2e/tests-fullstack/tours.spec.ts:35`, `e2e/tests-fullstack/account.spec.ts:40`, `e2e/tests-fullstack/journeys.spec.ts:95`

**Evidence:**

```text
    include: ['test/**/*.test.js'],
```

**Description.** Frontend unit tests import only lib/\* and sw.js. None of the 17 ui/\*.js files is tested (auth.js token and 401 paths, router.js popstate stack, tour-detail.js deferred delete and undo, images.js upload retry and quota, profile.js), and frontend coverage is not measured at all. The e2e tests that are supposed to protect these flows stop short: tours.spec.ts:35-36 and multi-select-delete.spec.ts only assert the row disappeared (the DELETE is 6 s later and is never observed); no test clicks Undo; account.spec.ts:40 checks only the users container, not tours or blobs; journeys.spec.ts:83 'persists' never reloads (this is why QA-02 goes unnoticed). Static e2e tests stub the API with page.route, so they cannot detect contract drift.

**Impact.** Regressions in deletion, auth and persistence reach production while every suite passes. QA-02, QA-07, QA-09, QA-10, QA-11 and QA-13 all fall in these gaps.

**Recommendation.** Add @vitest/coverage-v8 with jsdom/happy-dom for ui/\* (with auth and apiFetch stubbed). In the full-stack e2e, wait for the DELETE response (page.waitForResponse) or query Cosmos after the grace period, test Undo, reload after the profile rename, and assert that tours and blobs are gone after account deletion.

**Verification.** confirmed, severity → medium. frontend/vitest.config.js:6 includes only test/\*\*, and frontend/test/ has only lib/\* and sw tests. No coverage provider is configured (frontend/package.json has vitest only). No e2e test clicks Undo or waits for a DELETE, tours.spec.ts:35-36 asserts only that the row is gone, account.spec.ts:40 checks only users, and journeys.spec.ts:95-99 never reloads.

### QA-15: db.js and blobStorage.js are excluded from coverage and mutation testing on the grounds that integration tests cover them, but the integration suite is only 5 happy-path tests

- **Severity (reviewer):** medium
- **Category:** test-gap · **Effort:** M · **Confidence:** high
- **Location:** `functions/vitest.config.js:19`
- **Also:** `functions/stryker.config.mjs:22`, `functions/test/integration/tours.test.js:25`, `codecov.yml:3`

**Evidence:**

```text
        // Infrastructure files exercised by Azurite integration tests, not unit tests:
        'src/lib/db.js',
        'src/lib/blobStorage.js',
```

**Description.** The integration suite covers only /health, GET /me, and upload, list, get and delete of one tour; it does not check that the blob was removed. Cosmos behaviours that the handlers rely on are verified only against hand-written mocks: patch 'add /images/-' and the fallback on a 400 (UploadImage:88), ETag IfMatch replace and 412 retry (DeleteImage), per-field patch (EditTour), readItem's 404 normalisation, and listBlobsFlat prefix cascades (DeleteAccount). Nothing covers ExportData or GetMapData. The same two files, plus parseMultipart.js, are excluded from Stryker even though parseMultipart has a unit test file. The reported 99.85% coverage therefore overstates how well the real data layer is verified.

**Impact.** A change in SDK or emulator semantics, or a wrong mock assumption (for example about which status code Cosmos returns for a patch on a missing path), passes CI and fails in production.

**Recommendation.** Extend the integration tests to image upload and delete (concurrent uploads, then an assertion on the images count), tour edit, account deletion (assert the blobs are gone), export and map. Remove parseMultipart.js from the Stryker exclusions.

**Verification.** partially-confirmed, severity → low. The integration suite is thin (test/integration: health, me, tours with 3 tests), and db.js/blobStorage.js are excluded from coverage (vitest.config.js:19-20, codecov.yml:3-4). But the full-stack e2e suite runs against the Cosmos emulator and Azurite in CI (gate.yml:260-266) and exercises image upload and delete (photo-management.spec.ts:27), edit (journeys.spec.ts:22), export and account delete (account.spec.ts:21) and /api/map pins (photo-pins.spec.ts), so 'nothing covers ExportData or GetMapData' and 'only hand-written mocks' are wrong.

### QA-16: With two dialogs open, Escape and the focus trap act on the one underneath (the first open overlay in page order, not the topmost)

- **Severity (reviewer):** medium
- **Category:** accessibility · **Effort:** S · **Confidence:** high
- **Location:** `frontend/src/ui/modal.js:44`
- **Also:** `frontend/src/app.js:280`, `frontend/src/app.js:286`, `frontend/src/ui/modal.js:22`

**Evidence:**

```text
export const openModalEl = () => document.querySelector('.modal-overlay:not(.hidden)');
```

**Description.** Two flows open a second dialog on top of a first: profile (index.html:583) then delete-account (881), and lightbox (728) then confirm (858). querySelector returns whichever open overlay comes first in the page, i.e. the one underneath. So in app.js:276-286, Escape closes the profile dialog or the lightbox behind the dialog the user is looking at, and trapFocus(e, open) traps focus in the covered dialog, so Tab from the delete-account input leaves the aria-modal dialog. modalReturnFocus is a single global, so closing the outer dialog afterwards does not return focus to its opener.

**Impact.** Keyboard and screen-reader users lose focus containment in the destructive delete-account dialog, and Escape does not cancel the dialog they see.

**Recommendation.** Keep a stack of open modals in openModal and closeModal, and use its top for Escape, trapFocus and return focus (one return-focus entry per level).

**Verification.** confirmed, severity → low. modal.js:44 returns the first open overlay in DOM order. Profile (index.html:583) stays open under delete-account (881, profile.js:118-125 does not close it), and the lightbox (728) stays under confirm (858), so app.js:276-286 Escape/trapFocus act on the covered dialog. Downgraded: keyboard-only nuisance, the destructive action still needs the typed DELETE phrase, and this is the same class as QA-G07 (rated low).

### QA-17: The data export leaves out the uploaded GPX files and photos, and the gpxFileUrl it includes cannot be opened

- **Severity (reviewer):** medium
- **Category:** correctness · **Effort:** M · **Confidence:** medium
- **Location:** `functions/src/ExportData/index.js:21`

**Evidence:**

```text
    queryUserItems(getTours(), userId, 'SELECT * FROM c WHERE c.userId = @userId'),
```

**Description.** The GDPR export returns only the Cosmos documents: the downsampled heatmapData (5,000 points at most), image records with blobName, and gpxFileUrl, which is the raw unsigned blob URL of a private container and so is denied if opened. The original GPX files and the photos the user uploaded are neither included nor linked with signed URLs.

**Impact.** The 'export your data' feature does not return the files the user actually provided. Downloading the original GPX is still possible one tour at a time from the detail panel, but photos cannot be downloaded in bulk.

**Recommendation.** Add short-lived SAS URLs for each tour's GPX and photos to the export, or build a zip, and document what the export contains.

**Verification.** confirmed, severity → medium. ExportData/index.js:19-27 returns only the Cosmos documents: heatmapData, image records with blobName, and the unsigned private gpxFileUrl set at UploadTour/index.js:66. No GPX or photo content and no SAS links are included, although architecture.md:43 frames it as the portability export.

### QA-G01: Signing in again between DeleteAccount and the nightly Entra purge recreates an account whose data is then orphaned permanently

- **Severity (reviewer):** medium
- **Category:** data-lifecycle · **Effort:** M · **Confidence:** high
- **Location:** `functions/src/GetMe/index.js:17`
- **Also:** `functions/src/DeleteAccount/index.js:42`, `functions/src/UpdateProfile/index.js:39`, `functions/scripts/process-deletions.js:60`, `.github/workflows/process-deletions.yml:8`

**Evidence:**

```text
if (!doc) {
    doc = { id: userId, name: userName, email: userEmail, createdAt: new Date().toISOString() };
    ({ resource: doc } = await container.items.create(doc));
```

**Description.** DeleteAccount purges Cosmos and blob data and only queues the Entra oid (DeleteAccount/index.js:42). The Entra identity is deleted later by a daily cron at 03:00 UTC. Until then the identity still works. GetMe (and UpdateProfile at UpdateProfile/index.js:39) re-provisions a user doc for any authenticated caller without checking the `deletions` queue. A user who signs back in within that window (for example after changing their mind, or on another device or tab) gets a fresh account and can upload tours and photos. The cron then deletes the Entra user and removes the queue entry (scripts/process-deletions.js:60). The new user doc, tours and blobs are now keyed to a `sub` that can never authenticate again, and no process will ever purge them.

**Impact.** Personal GPS tracks and photos are retained indefinitely after a GDPR erasure request, with no in-app way to delete them. The window is up to 24 h after each deletion.

**Recommendation.** In GetMe, UpdateProfile and UploadTour, check the `deletions` container for the caller's oid. Either refuse with 403 'account pending deletion', or dequeue the entry and treat it as a cancelled deletion. Alternatively, have process-deletions re-run the data purge by sub before deleting the Entra user (store sub alongside oid in the queue).

**Verification.** confirmed, severity → medium. DeleteAccount/index.js:41-43 only queues the oid, and the identity lives until the 03:00 UTC cron (process-deletions.yml:8). GetMe/index.js:17-19 and UpdateProfile/index.js:38-49 re-provision a user doc without checking the deletions container, and process-deletions.js:58-60 then deletes the identity and the queue entry. Anything created in between is orphaned under a sub that can no longer authenticate.

### QA-G02: Tour duration goes negative when timestamps are not in file order

- **Severity (reviewer):** medium
- **Category:** correctness · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/lib/parseGpx.js:78`
- **Also:** `functions/src/lib/parseGpx.js:145`, `frontend/src/lib/format.js:24`

**Evidence:**

```text
const elapsedSeconds = (timed[timed.length - 1].time - timed[0].time) / 1000;
```

**Description.** Elapsed time is last-in-file minus first-in-file, not max minus min, and points are never sorted. A GPX whose &lt;trk&gt; blocks are stored newest-first, or whose clock jumps backwards (GPS time reset), produces a negative durationSeconds. The same file also gets its tour date from the first track, which is the later ride. Probe: two tracks, 2024-06-02 then 2024-06-01, give durationSeconds -86100 and movingSeconds 600. The frontend then renders formatDuration(-86100) as '-24h -55m'. This is a separate root cause from QA-04 (joining tracks): even a single track with a clock reset hits it.

**Impact.** Some uploads show a nonsensical negative duration in the tour detail. The same wrong value is written by backfillTourStats.js, which reuses parseGpx.

**Recommendation.** Compute elapsed as max(time) minus min(time), or sort timed points or compute per segment. Take the tour date from the minimum timestamp. Add a parseGpx test with out-of-order tracks.

**Verification.** confirmed, severity → low. parseGpx.js:78 computes last-in-file minus first-in-file. Probe with newest-first tracks gave durationSeconds -86100, and formatDuration (format.js:24-29) renders it as '-24h -55m'. Downgraded: it needs out-of-order tracks, or a last timestamp earlier than the first, which is rare, and the damage is a wrong stat display (moving time is unaffected because dt&lt;=0 is skipped at :85).

### QA-18: Deploy runs on every push to main without depending on the CI gate

- **Severity (reviewer):** low
- **Category:** ci-cd · **Effort:** S · **Confidence:** medium
- **Location:** `.github/workflows/deploy.yml:4`
- **Also:** `.github/workflows/dependabot-auto-merge.yml:16`

**Evidence:**

```text
on:
  push:
    branches: ["main"]
  workflow_dispatch:
```

**Description.** deploy.yml does not depend on gate.yml (no workflow\_run trigger and no needs on test jobs). A push to main deploys infrastructure, functions and the frontend in parallel with, and regardless of, unit, e2e, integration and mutation results. Whether PRs are gated depends on branch-protection settings that are not in the repo. dependabot-auto-merge.yml enables auto-merge for every Dependabot PR, including major versions.

**Impact.** A regression that the suites catch can still reach production through a direct push or an admin merge, or through an auto-merged dependency bump if the required checks are not configured.

**Recommendation.** Trigger deploy on workflow\_run of 'CI Gate' with conclusion == success (or call the gate as a reusable workflow), and restrict Dependabot auto-merge to patch and minor updates.

**Verification.** confirmed, severity → low. deploy.yml:3-6 triggers on push to main with no workflow\_run or needs on gate.yml, and dependabot-auto-merge.yml:14-15 runs `gh pr merge --auto` for every Dependabot PR regardless of semver level. Whether PRs are gated depends on branch protection, which is not in the repo.

### QA-19: A corrupt image with a valid JPEG/PNG header returns 500 instead of 400

- **Severity (reviewer):** low
- **Category:** error-handling · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/UploadImage/index.js:70`

**Evidence:**

```text
  const [gps, { full, thumbnail }] = await Promise.all([readGps(file.buffer), resize(file.buffer)]);
```

**Description.** Only the magic bytes are checked. sharp then throws on a truncated or corrupt body, or on one above limitInputPixels. Probe: 'Input buffer has corrupt header: VipsJpeg: premature end of JPEG image' is thrown out of the handler, so the host returns a 500. The frontend marks the tile as retryable, and every retry fails the same way.

**Impact.** Client errors are reported as server errors (noisy telemetry, misleading retry UI).

**Recommendation.** Wrap resize in try/catch and return 400 with an i18n key (for example errors.imageCorrupt); make that tile non-retryable on the client.

**Verification.** confirmed, severity → low. UploadImage/index.js:64 checks only the magic bytes, and :70 awaits resize with no try/catch. Probe: resizeImage on a JPEG truncated to 200 bytes throws 'Input buffer has corrupt header: VipsJpeg: premature end of JPEG image', which escapes the handler as a 500. extractGps swallows its own errors (extractGps.js:35-40), but resize does not.

### QA-20: The 20-photo limit per tour is checked on a stale read and can be exceeded by concurrent uploads

- **Severity (reviewer):** low
- **Category:** concurrency · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/UploadImage/index.js:52`

**Evidence:**

```text
  if ((tour.images || []).length >= MAX_TOUR_IMAGES) {
```

**Description.** The count comes from the read made at the start of the request, but the append is an unconditional patch. Concurrent requests (two tabs, API clients, or the frontend's 3-way upload pool combined with a second batch) each see fewer than 20 and all append. The client-side check (files.js) is only advisory.

**Impact.** A tour can grow past 20 photos; the effect is limited to cost and document size.

**Recommendation.** Use a conditional patch (Cosmos patch with a filter predicate such as `FROM c WHERE ARRAY_LENGTH(c.images) < 20`) and map the resulting 412 to the limit error.

**Verification.** confirmed, severity → low. UploadImage/index.js:52 checks the count on the initial read, and :88 appends with an unconditional patch, so concurrent requests can pass the check together. The frontend quota check (images.js:405-422, files.js validateImageQuota) is per batch and advisory.

### QA-21: Races on Cosmos 404 and 409 surface as 500s instead of being handled idempotently

- **Severity (reviewer):** low
- **Category:** error-handling · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/DeleteTour/index.js:26`
- **Also:** `functions/src/DeleteImage/index.js:51`, `functions/src/GetMe/index.js:19`, `functions/src/DeleteAccount/index.js:47`

**Evidence:**

```text
  await getToursContainer().item(tourId, userId).delete();
```

**Description.** Several concurrent-request paths fail with an unhandled exception: DeleteTour's delete gets a 404 if another request deleted the tour after the ownership read; DeleteImage's 412 retry re-reads with readItem, which returns undefined if the tour is gone, and then throws a TypeError on `tour.images.filter`; GetMe's items.create gets a 409 when two tabs provision the same user at once; DeleteAccount's parallel deletes 404 on a double submit. In each case the frontend treats the 500 as a failure. For DeleteTour, the tour is then put back in the list even though it is gone.

**Impact.** Rare, but it leaves the UI showing the wrong state, and 5xx noise in telemetry.

**Recommendation.** Treat a 404 on delete as success (return 204), return 404 when the DeleteImage re-read is undefined, and on a 409 from create in GetMe re-read the document.

**Verification.** confirmed, severity → low. DeleteTour/index.js:26 deletes without handling a 404. DeleteImage/index.js:51 re-reads with readItem, which returns undefined for a missing tour (db.js:13-21), and the loop at :40 then throws a TypeError on tour.images. GetMe/index.js:19 items.create has no 409 handling, and DeleteAccount/index.js:47 races on a double submit.

### QA-22: API errors written as English prose, client-side upload messages and number/duration formats are not localised

- **Severity (reviewer):** low
- **Category:** i18n · **Effort:** S · **Confidence:** high
- **Location:** `frontend/src/lib/format.js:14`
- **Also:** `frontend/src/lib/upload.js:31`, `frontend/src/ui/profile.js:68`, `frontend/src/ui/images.js:439`, `frontend/src/lib/format.js:29`

**Evidence:**

```text
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
```

**Description.** Only the four tour-metadata errors are sent as i18n keys. Other backend errors are English sentences, shown as-is: 'Could not parse GPX file', 'File exceeds 10 MB limit', 'Only JPEG or PNG images are accepted', 'This tour already has the maximum of 20 photos.', and the profile's 'A name (1–200 characters)…' (profile.js:68 does not even pass through tApi). Client-side xhrUpload messages are hard-coded English ('Upload failed.', 'Network error during upload.'). format.js always uses '.' as the decimal separator and English 'h'/'m' units, although dates follow the active locale.

**Impact.** German and other non-English users see mixed-language errors and '12.3 km' instead of '12,3 km'.

**Recommendation.** Return i18n keys for every 4xx the backend sends, and add them to the locales and the API\_ERROR\_KEYS test. Localise the xhrUpload messages. Use Intl.NumberFormat with dateLocale() in format.js.

**Verification.** confirmed, severity → low. Backend errors such as UploadTour/index.js:47,54 and UploadImage/index.js:53,65 are English prose, and tApi (i18n.js:52-55) passes unknown strings through unchanged. profile.js:68 and :92 show parseErrorMessage without tApi, images.js:439 shows err.message raw, upload.js:31,40 hard-codes English, and format.js:14,29 uses a fixed '.' and 'h'/'m'.

### QA-23: Tour date comes from the file's metadata time or the first point only; one bad &lt;time&gt; rejects the whole file

- **Severity (reviewer):** low
- **Category:** correctness · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/lib/parseGpx.js:146`
- **Also:** `functions/src/lib/parseGpx.js:144`

**Evidence:**

```text
  const date = time ? new Date(time).toISOString() : null;
```

**Description.** Here `time` is metadata/time (in GPX 1.1, the file's creation time, which planners set to the export time) or else the &lt;time&gt; of the very first point of the first track. If that one point has no time, the date falls back to the upload time, even when every other point has one (probe: 'first pt no time' gives date null). If that single &lt;time&gt; is unparsable, new Date(...).toISOString() throws a RangeError, so the whole upload gets 400 'Could not parse GPX file' (probe: 'bad time' throws).

**Impact.** Tours can be misdated, and some otherwise valid files are rejected.

**Recommendation.** Use the first finite timestamp among the valid points (already computed in computeDurationStats), falling back to metadata/time, and ignore unparsable values instead of throwing.

**Verification.** confirmed, severity → low. parseGpx.js:144-146 takes metadata/time or the first point's time only. Probes: first point without &lt;time&gt; gives date null, and &lt;time&gt;garbage&lt;/time&gt; makes new Date().toISOString() throw 'RangeError: Invalid time value', which UploadTour/index.js:53-54 turns into 400 'Could not parse GPX file'.

### QA-24: EditTour and UploadTour return raw stored image records and an unsigned gpxFileUrl, unlike GetTour and contrary to the docs

- **Severity (reviewer):** low
- **Category:** api-contract · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/lib/tourResponse.js:14`
- **Also:** `functions/src/UploadTour/index.js:101`, `functions/src/EditTour/index.js:45`

**Evidence:**

```text
  images: tour.images,
  gpxFileUrl: tour.gpxFileUrl,
```

**Description.** GetTour replaces images and gpxFileUrl with SAS URLs before projecting. EditTour runs toTourResponse on the raw patched document, so its response carries `images[].blobName` (which starts with the userId) and the unsigned private blob URL; UploadTour returns the unsigned gpxFileUrl too. docs/reference/architecture.md says userId stays server-side. The frontend currently reads only name, description and createdAt from these responses, so nothing breaks today.

**Impact.** The same resource has a different shape per endpoint, and an internal id leaks, contrary to the stated contract. Any future client use of these fields would break.

**Recommendation.** Leave images and gpxFileUrl out of the EditTour and UploadTour responses (or sign them as GetTour does), and add a contract test.

**Verification.** confirmed, severity → low. tourResponse.js:14-15 passes images and gpxFileUrl through, and EditTour/index.js:45,48 projects the raw doc (images\[\].blobName starting with userId, unsigned URL). UploadTour/index.js:101 returns the unsigned gpxFileUrl. This goes against architecture.md:41-42, but the only 'leak' is the caller's own id, and the frontend ignores these fields (tour-detail.js:149-153).

### QA-25: Unguarded localStorage read while state.js loads crashes the app when storage is blocked

- **Severity (reviewer):** low
- **Category:** error-handling · **Effort:** S · **Confidence:** medium
- **Location:** `frontend/src/lib/lineStyle.js:48`
- **Also:** `frontend/src/ui/auth.js:84`

**Evidence:**

```text
  return parseLineStyle(localStorage.getItem(STORAGE_KEY));
```

**Description.** state.js calls loadLineStyle() while the module is loading. When storage access throws (a SecurityError with site data blocked, or in some embedded or private contexts), every module that imports state.js fails, so the app stays on the skeleton. i18n.js wraps its own localStorage access in try/catch for exactly this reason. auth.js's dev-mode getItem and lineStyle's saveLineStyle are also unguarded.

**Impact.** The app is blank instead of degrading gracefully in storage-restricted browsers. MSAL may also fail there, but the map and help should still render.

**Recommendation.** Wrap the reads and writes in try/catch and fall back to DEFAULT\_LINE\_STYLE.

**Verification.** confirmed, severity → low. lineStyle.js:48 calls localStorage.getItem without a guard, and state.js:11 runs it at module load. By contrast, i18n.js:92-96 wraps its read in try/catch, and auth.js:77,113,126 and lineStyle.js:52 are also unguarded.

### QA-26: Retrying a failed photo upload reuses the token captured at the start of the batch

- **Severity (reviewer):** low
- **Category:** error-handling · **Effort:** S · **Confidence:** high
- **Location:** `frontend/src/ui/images.js:403`

**Evidence:**

```text
  const token = await getAccessToken();
```

**Description.** uploadImages fetches one access token per batch, and each tile's onRetry closure reuses it. If the user clicks retry after the token has expired (for example a tile left in its error state for over an hour), every retry fails with 401 'Unauthorized', and the tile stays retryable.

**Impact.** Retry can never succeed; the user has to dismiss the tile and pick the file again.

**Recommendation.** Call getAccessToken() inside uploadOne, per attempt.

**Verification.** confirmed, severity → low. images.js:403 fetches the token once per batch, and the retry closure at :443 reuses it via uploadOne (:429-434), so a retry after the token expires sends the stale token.

### QA-27: Fixed sleeps in e2e gesture helpers are a flakiness risk

- **Severity (reviewer):** low
- **Category:** test-quality · **Effort:** M · **Confidence:** medium
- **Location:** `e2e/pages/main-page.ts:264`
- **Also:** `e2e/pages/main-page.ts:278`, `e2e/pages/main-page.ts:378`, `e2e/tests-fullstack/swipe-detail.spec.ts:34`, `e2e/playwright.fullstack.config.ts:13`

**Evidence:**

```text
      await page.waitForTimeout(500);
```

**Description.** waitForTimeout is used 8 times (tapTour, longPressTour, swipeTour, zoomIn/zoomOut, plus the swipe-detail and long-press specs). The comments already record CI-only timing failures. The full-stack suite also relies on workers:1, fullyParallel:true and a clearTours/clearUsers wipe of the shared emulator in beforeEach, so raising the worker count would make tests interfere with each other.

**Impact.** Intermittent CI failures, currently hidden by retries: 1.

**Recommendation.** Wait for observable state instead (for example expect.poll on the row's transform or class, or map 'zoomend' via page.waitForFunction). Namespace test data per test instead of wiping global containers.

**Verification.** partially-confirmed, severity → low. There are 8 waitForTimeout calls (main-page.ts:264,278,284,309,378,385, swipe-detail.spec.ts:34, long-press-select.spec.ts:96), with workers:1, fullyParallel and retries:1 (playwright.fullstack.config.ts:12-15). Several are deliberate, though: they wait out the app's 400 ms ghost-click window to assert that nothing happens (main-page.ts:279-283 comment), which a state poll cannot replace.

### QA-28: The architecture doc's API table is missing four routes

- **Severity (reviewer):** low
- **Category:** doc-drift · **Effort:** S · **Confidence:** high
- **Location:** `docs/reference/architecture.md:26`

**Evidence:**

```text
| Route                                     | Function                                              |
```

**Description.** The route table lists 9 endpoints but leaves out PATCH /api/me (UpdateProfile), GET /api/me/export (ExportData), DELETE /api/account (DeleteAccount) and GET /api/health (Health). The GDPR endpoints in particular are the ones reviewers look for.

**Impact.** Misleading reference docs; the operations that touch the most sensitive data are the undocumented ones.

**Recommendation.** Add the four routes to the table.

**Verification.** confirmed, severity → low. The table at architecture.md:26-36 lists 9 routes, but UpdateProfile (route 'me', PATCH), ExportData ('me/export'), DeleteAccount ('account') and Health ('health') are all registered (grep of route: in functions/src/\*/index.js).

### QA-29: Maintenance scripts are untested; backfillTourStats aborts the whole run on one missing tour

- **Severity (reviewer):** low
- **Category:** test-gap · **Effort:** S · **Confidence:** high
- **Location:** `functions/scripts/backfillTourStats.js:54`
- **Also:** `functions/scripts/process-deletions.js:55`

**Evidence:**

```text
  await container.item(tour.id, tour.userId).patch(operations);
```

**Description.** Download and parse errors are caught per tour, but the patch is not. A tour deleted between the SELECT \* and its patch throws a 404, and the process stops with 'Backfill failed'. Only already-processed tours stay migrated; the run is re-runnable, so this is recoverable. The functions/scripts/\* files (backfills, process-deletions, check-coverage) are outside vitest's include and have no tests, although process-deletions runs every night against production.

**Impact.** Maintenance runs can stop part-way; the nightly job's logic is not verified before it runs against production.

**Recommendation.** Catch errors per tour around the patch and count them as failed. Add small unit tests for process-deletions (with fetch and the Cosmos client stubbed) and the backfills.

**Verification.** confirmed, severity → low. backfillTourStats.js:55 (not :54) awaits the patch outside the per-tour try/catch, so a 404 propagates to main().catch at :85-88 and aborts the run. functions/vitest.config.js:10 includes only src/\*\*, so the functions/scripts/\* files have no tests.

### QA-G03: A list refetch during the 6-second undo window brings deleted tours back as ghost entries (and Undo then duplicates them)

- **Severity (reviewer):** low
- **Category:** correctness · **Effort:** S · **Confidence:** high
- **Location:** `frontend/src/ui/sidebar.js:51`
- **Also:** `frontend/src/ui/tour-detail.js:194`, `frontend/src/ui/tour-detail.js:215`, `frontend/src/ui/images.js:328`, `frontend/src/ui/upload-modal.js:180`

**Evidence:**

```text
state.tours = await res.json();
```

**Description.** scheduleTourRemoval removes tours from state.tours optimistically and sends the DELETE only after 6 s. loadTours replaces state.tours wholesale from the server, which still holds the tour. loadTours runs after every successful upload (upload-modal.js) and from the retry buttons. A tour deleted just before an upload therefore reappears. The timer then deletes it server-side, but nothing removes it from the UI again. Clicking the ghost gives empty detail (GetTour 404 is swallowed), and deleting it again gets a 404 that is treated as a failure, so the tour is pushed back with an error toast (tour-detail.js:194). If Undo is pressed after the refetch, `state.tours.push(...tours)` (tour-detail.js:215) inserts duplicates. Photos behave the same way via ensureDetail during the photo undo window (images.js:328).

**Impact.** Ghost or duplicate tours and photos with misleading error toasts until a reload. Realistic trigger: delete a wrong upload and immediately upload the correct file.

**Recommendation.** Keep a set of pending-deletion ids and filter them out of any loadTours/ensureDetail result. Make Undo idempotent (skip ids already present). Treat a 404 from DELETE as success.

**Verification.** partially-confirmed, severity → low. The tour ghost and duplicate case holds: sidebar.js:51 replaces state.tours while tour-detail.js:180 still has the DELETE pending, and the Undo at :215 pushes without a dedupe check. The photo half is overstated: the restore at images.js:328 is idempotent (`!tour.images.some(...)`), so photos cannot duplicate. The cited upload-modal.js:180 does not exist; the loadTours call is at upload-modal.js:95.

### QA-G04: Content-Length pre-check rejects GPX/photo files of exactly 10 MB that the frontend and busboy limit accept; the unit test hides it by omitting the header

- **Severity (reviewer):** low
- **Category:** contract-mismatch · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/lib/parseMultipart.js:33`
- **Also:** `frontend/src/lib/files.js:22`, `functions/src/lib/parseMultipart.test.js:91`

**Evidence:**

```text
if (Number.isFinite(contentLength) && contentLength > MAX_FILE_BYTES) {
    throw badRequest('File exceeds 10 MB limit');
```

**Description.** Content-Length measures the whole multipart body, which includes the boundaries and part headers (about 120 or more bytes), not the file. The code deliberately sets busboy's limit to MAX+1 so that a file of exactly 10 MB passes, and the frontend accepts it too (files.js:22 rejects only `size > MAX`). Browsers always send Content-Length for XHR FormData, so such files are rejected by the pre-check. The unit test 'accepts a file exactly at the limit' (parseMultipart.test.js:91) builds the request without a Content-Length header, so it never reaches the pre-check. Probe: a body with a 10,485,760-byte file and Content-Length 10485882 gives '400 File exceeds 10 MB limit'.

**Impact.** Files in the last ~few hundred bytes below 10 MB fail with a size error the client promised would not happen. The window is narrow, but it shows the test does not model real requests.

**Recommendation.** Compare Content-Length against MAX\_FILE\_BYTES plus a fixed multipart-overhead allowance (e.g. 16 KB) and let busboy's fileSize limit remain the real check. Add Content-Length to the at-limit test.

**Verification.** confirmed, severity → low. parseMultipart.js:32-34 compares the whole-body Content-Length against MAX\_FILE\_BYTES, while busboy allows MAX+1 (:45) and files.js:22 accepts size == MAX. The at-limit test (parseMultipart.test.js:91-96) sends no Content-Length. The affected window is only a few hundred bytes.

### QA-G05: UploadImage leaves the full-size and thumbnail blobs behind when the Cosmos append fails, unlike UploadTour's rollback

- **Severity (reviewer):** low
- **Category:** error-handling · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/UploadImage/index.js:88`
- **Also:** `functions/src/UploadImage/index.test.js:339`

**Evidence:**

```text
await tourItem.patch([{ op: 'add', path: '/images/-', value: image }]);
```

**Description.** Both blobs are written first, then the tour document is patched. If the patch throws, the error propagates with no cleanup. That happens with 404 when the tour was deleted during the upload (the photo form sits in the detail panel of a tour the user can delete), 429, or any non-400 error. UploadTour explicitly rolls back its blob in this situation (UploadTour/index.js:93). The test 'rethrows a non-400 error from the images/- patch' (UploadImage/index.test.js:339) asserts only the rethrow and not the cleanup.

**Impact.** Photos the user never successfully uploaded persist in storage until account deletion, and the caller gets a 500.

**Recommendation.** Wrap the patch in try/catch and best-effort deleteIfExists both blobs before rethrowing. Map a 404 to a 404 response. Assert the cleanup in the test.

**Verification.** confirmed, severity → low. UploadImage/index.js:77-80 writes both blobs, and :87-94 rethrows any non-400 patch error with no deleteIfExists cleanup, unlike UploadTour/index.js:89-95. The test at UploadImage/index.test.js:339-356 asserts only the rethrow.

### QA-G06: Closing a dialog or the detail panel with its button leaves its history entry behind, so Back presses do nothing

- **Severity (reviewer):** low
- **Category:** ux-correctness · **Effort:** M · **Confidence:** high
- **Location:** `frontend/src/ui/modal.js:31`
- **Also:** `frontend/src/ui/tour-detail.js:74`, `frontend/src/ui/confirm.js:16`, `frontend/src/app.js:148`

**Evidence:**

```text
pushLayer(onHistoryClose || (() => closeModal(modal)));
```

**Description.** Every openModal, selectTour (tour-detail.js:74) and confirmDialog pushes a history entry. The explicit close paths call closeModal or closeDetailPanel directly and never call history.back(). This covers the ✕ buttons (app.js:148), save/submit, and confirm OK/Cancel (confirm.js:16). Each explicit close therefore leaves a stale layer. After deleting three tours (three confirm dialogs) and closing a detail panel with ✕, the Android/iOS Back gesture needs four or more presses that visibly do nothing before it acts. A code comment in modal.js acknowledges the leftover layer, but no test covers the Back-after-explicit-close journey.

**Impact.** The Back gesture seems broken in the installed PWA on mobile, where Back is the main navigation.

**Recommendation.** On explicit close, pop the layer with history.back() and let the popstate handler run the closer, or mark the layer consumed and skip it in popstate by calling history.go(-n). Add an e2e test that opens and closes via ✕ and then presses Back.

**Verification.** confirmed, severity → low. openModal pushes a layer (modal.js:31), and selectTour pushes one (tour-detail.js:74). The explicit close paths (app.js:148 closeDetailPanel, confirm.js:15-16 finish → closeModal) never pop history, so Back later runs no-op closers. modal.js:14-16 acknowledges the leftover layer.

### QA-G07: Pressing Escape in the language picker also closes the whole Profile dialog

- **Severity (reviewer):** low
- **Category:** accessibility · **Effort:** S · **Confidence:** high
- **Location:** `frontend/src/app.js:277`
- **Also:** `frontend/src/ui/menus.js:92`

**Evidence:**

```text
if (e.key === 'Escape') {
    if (open === elLightbox) return closeLightbox();
    if (open === elConfirmModal) return cancelConfirm();
    return closeModal(open);
```

**Description.** The language menu is a popup inside the Profile modal with its own document-level Escape handler (menus.js:92). The global handler in app.js also fires on the same keydown and closes the Profile modal, because it does not check whether an inner popup consumed the key. A keyboard user who opens the language list and presses Escape to dismiss it loses the whole dialog, and focus jumps back to the page.

**Impact.** Keyboard and screen-reader users cannot dismiss the language list without closing the Profile dialog.

**Recommendation.** In the popup handlers, call e.stopPropagation() or set e.defaultPrevented when they close a menu, and have app.js ignore Escape when e.defaultPrevented is set.

**Verification.** confirmed, severity → low. #lang-menu sits inside the profile overlay (index.html:583, 601-618). The global keydown in app.js:273-280 (registered first) closes openModalEl() = the profile modal, and menus.js:91-93 separately closes the menu, and neither stops propagation.

### QA-G08: A failed tour-detail fetch is cached as loaded for 45 minutes, leaving the gallery empty and stats blank with no retry

- **Severity (reviewer):** low
- **Category:** error-handling · **Effort:** S · **Confidence:** high
- **Location:** `frontend/src/ui/sidebar.js:96`
- **Also:** `frontend/src/ui/sidebar.js:81`

**Evidence:**

```text
tour.detailLoaded = true;
  markFetched(tour);
```

**Description.** ensureDetail sets detailLoaded and fetchedAt even when the response is not ok (401, 5xx, 404) or the network throws. Every later selectTour, downloadSelectedGpx and focusTourOnMap then skips the fetch for SAS\_CACHE\_TTL\_MS (45 min). The detail panel shows no photos, '—' for elevation, duration and speed, and 'GPX download failed' on every click, with no retry control, because the broken-image retry only appears for tiles that exist. This is the same pattern as QA-11 but in a different function, with its own impact on the detail panel.

**Impact.** A single transient backend error (cold start or throttling) makes a tour's photos and GPX unreachable for 45 minutes unless the user reloads.

**Recommendation.** Mark the tour fetched only on res.ok, and surface an inline error with a retry in the detail panel otherwise.

**Verification.** confirmed, severity → low. sidebar.js:94-97 sets detailLoaded=true and markFetched unconditionally, even when res.ok is false or the fetch threw, so ensureDetail skips refetching for SAS\_CACHE\_TTL\_MS (sasCache.js:8, 45 min) until a reload.

### QA-G09: After signed URLs go stale, a map refresh swaps the open gallery's photo list for pin-only photos, so clicking a thumbnail opens the wrong photo

- **Severity (reviewer):** low
- **Category:** correctness · **Effort:** S · **Confidence:** medium
- **Location:** `frontend/src/lib/mapData.js:28`
- **Also:** `frontend/src/ui/images.js:51`

**Evidence:**

```text
tour.images = entry?.images || [];
```

**Description.** ensureMapData refills every stale tour (fetched more than 45 min ago) from /api/map. That endpoint returns only geotagged photos, and the refill overwrites tour.images even for the tour whose full gallery is on screen. The rendered tiles are not re-rendered. A tile's click handler looks its image up in tour.images (images.js:51). A non-geotagged photo is not found, so the index falls back to 0 and the lightbox opens a different photo, which the lightbox delete button would then target. uploadImages also counts quota from the truncated list. Trigger: the detail panel is open for more than 45 minutes and then any renderAllRoutes runs, such as deleting another tour from the list on desktop.

**Impact.** The wrong photo opens, and a user can delete a different photo from the one they clicked.

**Recommendation.** Do not overwrite images on a tour whose detail is loaded or selected; refresh via ensureDetail instead. Alternatively, make the tile's click handler use the image object it was built with rather than looking it up by id.

**Verification.** confirmed, severity → low. mapData.js:12,28 overwrites tour.images of every stale tour with /api/map's geotagged-only list (GetMapData/index.js:15,76). The tile click handler at images.js:48-51 looks the image up by id in tour.images and falls back to index 0, so a non-geotagged tile opens a different photo, and the lightbox delete button targets that one.

### QA-G10: Stryker excludes parseMultipart.js with an incorrect rationale; ignoreStatic also exempts every limit and schema constant from mutation

- **Severity (reviewer):** low
- **Category:** test-gap · **Effort:** S · **Confidence:** high
- **Location:** `functions/stryker.config.mjs:22`
- **Also:** `functions/src/lib/parseMultipart.test.js:91`

**Evidence:**

```text
// Infrastructure files exercised only by Azurite integration tests — not unit-tested
    '!src/lib/db.js',
    '!src/lib/blobStorage.js',
    '!src/lib/parseMultipart.js',
```

**Description.** parseMultipart.js has a dedicated unit test file (src/lib/parseMultipart.test.js) and holds the upload size enforcement, yet it is excluded from mutation testing under a comment that says it is not unit-tested. Mutation testing would likely have flagged QA-G04, where the at-limit test never exercises the Content-Length branch. `ignoreStatic: true` separately skips every mutant evaluated at module load. That includes nameSchema/descriptionSchema .max(200)/.max(2000), MAX\_POINTS, MAX\_TOUR\_IMAGES, MAX\_FILE\_BYTES and SAS\_TTL\_MS, so the 85% break threshold says nothing about whether the limits are tested. QA-15 covers db.js and blobStorage.js only.

**Impact.** The mutation score overstates test strength on the upload/validation boundary, which is security-relevant.

**Recommendation.** Remove parseMultipart.js from the exclusion list. Export the limit constants and assert boundaries in tests, or document which static mutants are knowingly unguarded.

**Verification.** confirmed, severity → low. stryker.config.mjs:19-22 excludes parseMultipart.js with the comment 'not unit-tested', yet functions/src/lib/parseMultipart.test.js exists, and ignoreStatic: true (:28) skips module-load mutants such as validation.js:9-10 .max(200)/.max(2000) and the limit constants.

### QA-G11: GetMapData's module-level heatmap cache is shared across unit tests and ignores the budget arguments, so some tests pass on cached results

- **Severity (reviewer):** low
- **Category:** test-quality · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/GetMapData/index.js:12`
- **Also:** `functions/src/GetMapData/index.test.js:153`, `functions/src/lib/heatmapCache.js:12`

**Evidence:**

```text
const defaultHeatmapCache = createHeatmapCache();
```

**Description.** Tests call getMapData without injecting a cache, so every test sharing userId 'u1' and the same tour ids and lengths reads the previous test's result. 'leaves heatmapData untouched when the combined point count is within budget' (index.test.js:153) is served from the first test's cache entry and never runs budgetHeatmapData. The cache signature excludes totalPointBudget and maxGapMeters. Probe: two calls with budgets 200 and then 100000 both return \[65,65\] points. No GetMapData test asserts that adding or deleting a tour invalidates the cached result, which is the property that matters in production.

**Impact.** Tests are order-dependent and partly tautological. A regression in cache invalidation or budgeting could pass CI.

**Recommendation.** Inject a fresh createHeatmapCache() in each test, or reset it in beforeEach. Add a test that a changed tour set recomputes the result.

**Verification.** partially-confirmed, severity → low. GetMapData/index.js:12,53 uses a module-level cache keyed only by id:length (heatmapCache.js:9-11). The test at index.test.js:153 reuses the TOURS signature from the first test, so it is served from cache. The claim that nothing tests invalidation is wrong: heatmapCache.test.js:32 ('recomputes when a tour is added or removed') and :49 cover it.

### QA-G12: Terraform provisions an unused 'images' container while photos go to an unmanaged, runtime-created 'tour-images' container

- **Severity (reviewer):** low
- **Category:** config-drift · **Effort:** S · **Confidence:** high
- **Location:** `infrastructure/storage.tf:34`
- **Also:** `functions/src/lib/blobStorage.js:35`, `docs/reference/architecture.md:10`

**Evidence:**

```text
name                  = "images"
```

**Description.** The code writes photos to `tour-images` (blobStorage.js:35: `containerOnce('tour-images')`), created lazily by createIfNotExists. The IaC-managed `images` container is never used, and docs/reference/architecture.md:10 also names `images`. The `tour-images` container is outside OpenTofu state, so any future policy added in TF for 'images' (retention, immutability, access) would silently miss the real photos. The Functions identity also needs container-create rights just to boot the first photo upload.

**Impact.** Infrastructure and docs misdescribe where the most sensitive user data lives. Changes made in IaC do not reach it.

**Recommendation.** Rename the TF resource to `tour-images` (import the existing container), or point the code at `images` with a migration. Fix architecture.md.

**Verification.** confirmed, severity → low. storage.tf:33-37 provisions an 'images' container, but blobStorage.js:35 writes to 'tour-images' via createIfNotExists (:25-28). architecture.md:10 names 'images', while cost-report.md:91 names 'tour-images'.

### QA-G13: GPX magic-byte check rejects well-formed XML that starts with a comment or whitespace

- **Severity (reviewer):** low
- **Category:** correctness · **Effort:** S · **Confidence:** medium
- **Location:** `functions/src/UploadTour/index.js:18`

**Evidence:**

```text
return header.startsWith('<?xml') || header.startsWith('<gpx');
```

**Description.** The check looks only at the first 5 bytes after an optional BOM. A document with no XML declaration may begin with whitespace or a comment (`<!-- exported by … --><gpx …>`) and still be well-formed. The parser handles it: parseGpx returns 1.112 km for the probe file. UploadTour nonetheless returns 400 'File does not appear to be a valid GPX/XML file'.

**Impact.** Some legitimately exported GPX files are refused, with an English-only error.

**Recommendation.** Skip leading whitespace and XML comments before the check, or drop the magic check and rely on parseGpx requiring a &lt;gpx&gt; root.

**Verification.** confirmed, severity → low. UploadTour/index.js:14-18 checks only the first 5 bytes after a BOM. Probe: '&lt;!-- exported --&gt;&lt;gpx ...&gt;' fails the magic check, but parseGpx returns 1.112 km for it. Almost all exporters emit '&lt;?xml' first, so this is rare.

### QA-G14: GPX download filename turns every non-ASCII letter into '\_' (e.g. 'Départ' becomes 'D\_part.gpx'; Cyrillic or CJK names become '\_.gpx')

- **Severity (reviewer):** low
- **Category:** i18n · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/GetTour/index.js:47`
- **Also:** `functions/src/GetTour/index.test.js:82`

**Evidence:**

```text
const filename = `${(tour.name || 'tour').replace(/[^a-z0-9-_]+/gi, '_')}.gpx`;
```

**Description.** The app ships de/es/fr/it/nl/pt locales, where accented tour names are normal. The sanitiser keeps only ASCII letters and digits, so downloaded files get mangled names, and names entirely in a non-Latin script collapse to '\_.gpx'. The unit test at GetTour/index.test.js:82 locks in this behaviour.

**Impact.** Downloaded GPX files for non-English users have garbled names that are hard to tell apart.

**Recommendation.** Emit `filename*=UTF-8''<percent-encoded name>` alongside an ASCII fallback in the SAS contentDisposition. Only strip path separators, quotes and control characters.

**Verification.** confirmed, severity → low. GetTour/index.js:47 replaces every run of characters outside \[a-z0-9-\_\] with '\_', so 'Départ' becomes 'D\_part.gpx' and all-non-Latin names become '\_.gpx'. The e2e test tours.spec.ts:54 also asserts the same sanitiser.

### QA-G15: Delete confirmations say 'This cannot be undone' and then offer Undo; plural strings have no singular form

- **Severity (reviewer):** low
- **Category:** i18n · **Effort:** S · **Confidence:** high
- **Location:** `frontend/src/locales/en.json:181`
- **Also:** `frontend/src/locales/en.json:179`, `frontend/src/locales/en.json:183`, `frontend/src/ui/tour-detail.js:245`

**Evidence:**

```text
"confirm.deleteToursMessage": "Delete {count} tours? This cannot be undone.",
```

**Description.** All three delete confirmations (deleteTourMessage :179, deleteToursMessage :181, deletePhotoMessage :183) state that the action cannot be undone. The next thing shown is a toast with an Undo button (tour-detail.js:205, images.js:347). deleteToursMessage and toast.toursDeleted interpolate {count} into a fixed plural, so a one-tour selection reads 'Delete 1 tours?'. The same applies across all 7 locales, and there is no plural mechanism in i18n.js.

**Impact.** Contradictory and ungrammatical copy on destructive actions in every language.

**Recommendation.** Reword to 'You can undo for a few seconds' or drop the sentence. Add singular/plural keys, or use Intl.PluralRules in t().

**Verification.** partially-confirmed, severity → low. en.json:179,181,183 say 'This cannot be undone', yet tour-detail.js:205-219 and images.js:347-355 offer Undo, and deleteSelectedTours (tour-detail.js:243-245) shows 'Delete 1 tours?' for a one-tour selection. The toast.toursDeleted half is wrong: tour-detail.js:206 already uses the singular toast.tourDeleted when ids.length === 1.

## Second-pass disputes of first-pass findings

The independent second pass checked the first pass's findings against the code. Where it disagreed on the facts or the rating, it recorded a dispute:

- **QA-01**, suggested severity **medium**: The defect is real: DeleteTour/index.js:98-101 deletes only the document and the GPX blob. But the photos are left in a private container (infrastructure/storage.tf:36 and runtime-created tour-images). The only reference to them is gone with the document, so no API can serve them, and SAS links already issued expire within 1 h (blobStorage.js SAS\_TTL\_MS). They are also removed on account deletion, because blob names are `${userId}/${tourId}/${imageId}.jpg` (UploadImage/index.js:73) and DeleteAccount purges the `${userId}/` prefix (DeleteAccount/index.js:52). The impact is data retention and a small storage cost, with no exposure, corruption or loss. Under the shared rubric that is 'real defect with limited blast radius' (medium), not 'serious and plausible with realistic attack path / data loss'.
- **QA-07**, suggested severity **low**: The crash is real: app.js:110 calls readInitialUrl() at module top level, outside the try/finally, so a URIError from url.js:13 aborts app.js. But the app only ever produces this hash via encodeURIComponent of a UUID (url.js:26), so it needs a hand-crafted or corrupted link. The effect is limited to that one page load, and removing the hash recovers. Per the rubric, an issue without a realistic production path is at most low; a try/catch around decodeURIComponent is the whole fix.

## Coverage

<details><summary>Files and areas read</summary>

- functions/src/lib/\*.js (parseGpx, simplify, validation, http, db, blobStorage, ownedTour, tourResponse, heatmapCache, thumbBlobName, extractGps, resizeImage, parseMultipart)
- functions/src/middleware/authMiddleware.js
- functions/src/\*/index.js for all 13 functions (UploadTour, UploadImage, EditTour, DeleteTour, DeleteImage, DeleteAccount, GetTours, GetTour, GetMapData, GetMe, UpdateProfile, ExportData, Health)
- functions/src/GetMe/index.test.js, DeleteTour/index.test.js, DeleteAccount/index.test.js (part), lib/parseGpx.test.js (case list and multi-track case)
- functions/test/integration/\* and vitest.integration.config.js
- functions/vitest.config.js, scripts/check-coverage.js, stryker.config.mjs, package.json, codecov.yml
- functions/scripts/backfillTourStats.js, backfillImageThumbnails.js, process-deletions.js, init-cosmos.js (part)
- frontend/src/app.js, sw.js, index.html (forms/dialogs), 404.html
- frontend/src/lib/\*.js (tours, stats, format, files, upload, mapData, pinLayout, concurrency, sasCache, url, i18n, lineStyle)
- frontend/src/ui/\*.js (auth, profile, modal, confirm, router, state, sidebar, tour-detail, upload-modal, images, routes, pins, statsModal, toast; menus.js skimmed)
- frontend/test/\* (case lists for url, tours, i18n; sw.test.js), frontend/vitest.config.js
- frontend/src/locales/\*.json (all 7, via a scratch diff script)
- e2e/playwright\*.config.ts, global-setup.ts, pages/main-page.ts, pages/profile-modal.ts, tests-fullstack/{journeys,account,registration,tours,multi-select-delete,swipe-detail,long-press-select}.spec.ts, usersDb.ts; grep across all e2e specs for sleeps and route stubs
- .github/workflows/gate.yml, deploy.yml (trigger and jobs), dependabot-auto-merge.yml, process-deletions.yml (cron); .pre-commit-config.yaml
- docs/reference/architecture.md, docs/how-to/user-guide.md, docs/explanation/design-decisions.md (deletion sections); git history of frontend/src/sw.js vs shell files
- functions/src/lib: parseGpx.js, simplify.js, validation.js, http.js, db.js, blobStorage.js, heatmapCache.js, ownedTour.js, tourResponse.js, parseMultipart.js (+test helpers), extractGps.js, resizeImage.js, thumbBlobName.js
- functions/src/\*/index.js for all 13 functions, with cross-function interplay (GetMe/UpdateProfile vs DeleteAccount vs process-deletions; UploadImage vs DeleteTour; DeleteImage ETag loop)
- functions test case lists for GetMapData, EditTour, DeleteImage, UploadImage, UploadTour, GetTours, GetTour, UpdateProfile, ExportData; GetMapData/index.test.js in full; parseMultipart.test.js helpers + 'exactly at limit' case
- functions/scripts: process-deletions.js, backfillTourStats.js, backfillImageThumbnails.js, check-coverage.js, init-cosmos.js (indexing policy)
- functions/vitest.config.js, vitest.integration.config.js, stryker.config.mjs, package.json, host.json, codecov.yml; test/integration/\* (setup + case list)
- .github/workflows/gate.yml (all jobs), process-deletions.yml; .pre-commit-config.yaml hook scopes
- infrastructure/storage.tf, cosmos.tf (container names and indexing vs code)
- frontend/src/app.js, sw.js, index.html (dialogs, inputs, edit/upload forms)
- frontend/src/lib: url.js, tours.js, stats.js, format.js, files.js, upload.js, mapData.js, sasCache.js, concurrency.js, pinLayout.js, i18n.js, lineStyle.js
- frontend/src/ui: auth.js, router.js, state.js, modal.js, confirm.js, tour-detail.js, sidebar.js, images.js, routes.js, pins.js, map.js, profile.js, upload-modal.js, statsModal.js, toast.js, menus.js
- frontend/test case lists (mapData, upload, files, format, sw, stats, tours withUpdatedDate)
- frontend/src/locales/\*.json: key parity, placeholder parity, server-emitted i18n keys, plural strings
- e2e: playwright configs, global-setup.ts, buddy-test.ts, fixture/isolation grep across tests-fullstack
- docs/reference/architecture.md, explanation/design-decisions.md (deletion), how-to/user-guide.md vs code
- vendored MSAL version header (to reason about the popup flow only)

</details>

<details><summary>Commands and probes run</summary>

- node scratchpad/qa/gpx1.js: parseGpx edge cases. &lt;name&gt;2024&lt;/name&gt; gives name 2024 (number); &lt;name&gt;true&lt;/name&gt; gives true (boolean); &lt;name lang="de"&gt; gives the object {"#text":"Tour","@\_lang":"de"}; a file with only &lt;rte&gt; gives distanceKm 0 and 0 points with no error; an invalid first &lt;time&gt; throws RangeError; two segments 468 km apart give distanceKm 468.3 and movingSeconds 86520; an HTML-entity name decodes to the raw &lt;img ...&gt;; a 5000-char name is kept.
- node scratchpad/qa/gpx2.js and gpx3.js: 100k points parse OK. 150k points (7.6 MB) and a realistic 130k-point file (ele + time) throw 'RangeError: Maximum call stack size exceeded at computeElevationStats (parseGpx.js:49)'. The spread limit in Math.min is about 124,907 arguments (local Node v22).
- node scratchpad/qa/gettour.js: getTour with tour.name 2024 or an attribute object throws 'TypeError: (tour.name || "tour").replace is not a function', which the host returns as a 500.
- node scratchpad/qa/namerevert.js: after updateProfile({name:'Alpine Rider'}), the next getMe with token userName 'Local Dev' returns name 'Local Dev', and the stored doc is overwritten too.
- node scratchpad/qa/url.mjs: parseAppUrl('#/tour/100%') and '#/tour/%E0%A4%A' throw URIError; visibleTours with a numeric-name tour throws TypeError for search 'al' and for sort name-asc; with TZ=Europe/Berlin and createdAt 2026-05-01T22:30Z the page shows 2.5.2026 but the edit field shows 2026-05-01, and setting 2026-05-02 then displays 3.5.2026.
- node scratchpad/qa/img.js: uploadImage with a JPEG magic header followed by garbage throws 'Input buffer has corrupt header' from sharp, so the host returns a 500 rather than a 400.
- node scratchpad/qa/i18n.mjs: all 7 locales have 169 keys; nothing missing or extra, no placeholder mismatches, no used-but-undefined or unused keys (one false positive: 'app.js' in sw.js).
- cd frontend && npx vitest run: 15 files and 167 tests pass.
- git log -L on CACHE\_NAME in frontend/src/sw.js: v9 was bumped in b27e779; later commits aff8ef1, 42a19ee and 07bfdad changed ui/\*.js, style.css and index.html without bumping it. 8e914bd and d1866fb also changed the shell after the v8 bump without bumping.
- grep over e2e: no test waits past the 6 s delete grace period or checks a server-side DELETE; undo is untested; waitForTimeout is used in 8 places (touch helpers and zoom).
- git ls-files (filtered, excluding vendor/lockfiles/binaries)
- node scratchpad/qa2/i18n.mjs: diffed all 7 locales against en.json for missing/extra keys, {placeholder} parity, and HTML parity, and checked that the server's errors.\* keys exist. Result: no missing keys and no placeholder mismatches (the one reported mismatch was my regex misreading sidebar.tourItemAria)
- node scratchpad/qa2/gpx.js: parseGpx on two &lt;trk&gt; blocks stored newest-first gives durationSeconds -86100, movingSeconds 600 and date '2024-06-02T10:00:00.000Z'
- node scratchpad/qa2/fmt.mjs: formatDuration(-86100) gives '-24h -55m'; formatDistance(9.96) gives '10.0 km' while 10.4 gives '10 km'
- node scratchpad/qa2/mp.js: an exactly-10 MB file sent with a real Content-Length header is rejected: 'rejected 400 File exceeds 10 MB limit content-length= 10485882'
- node scratchpad/qa2/minmax.js: Math.min spread works at 125000 elements and throws RangeError at 130000; a 150k-point 8.44 MB GPX makes parseGpx throw RangeError (confirms QA-05)
- node scratchpad/qa2/cache.js: getMapData called twice for the same user, first with budget 200 then 100000, returns \[65,65\] points both times (the second call should return 300,300). The module-level cache ignores the budget and is shared across calls
- node scratchpad/qa2/magic.js: parseGpx accepts a GPX with a leading comment or newline (1.112 km), but uploadTour returns 400 'File does not appear to be a valid GPX/XML file' for it
- functions/node\_modules/.bin/eslint --config functions/eslint.config.js functions/scripts (clean)
- npx prettier --check on frontend/src/ui/\*\*/\*.js (clean)
- grep/sed reads across repo for line numbers and evidence

</details>
