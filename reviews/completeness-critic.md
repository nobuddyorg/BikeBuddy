# Completeness critic: cross-lens gap sweep

An extra pass added by the lead, beyond the five requested reviewers. After all five reviewers finished, one critic received the combined index of their findings and looked for what they collectively missed: unexamined files, and issues that fall between lenses. Its findings use IDs `LEAD-Gnn`.

Severity scale (shared by all reviewers): **critical**: exploitable now, severe; **high**: serious and plausible in production; **medium**: real defect, limited blast radius; **low**: hardening or minor; **info**: observation.

The findings below are the reviewer's own claims, as returned. The _Verification_ lines come from the adversarial verifiers: two independent lenses (code truth, impact) for every critical/high finding, and one skeptical batch check for medium/low. The lead's final, deduplicated severities are in [`REVIEW.md`](../REVIEW.md).

## Findings overview

Reviewer-assigned counts: 0 critical, 0 high, 3 medium, 4 low, 0 info.

| ID       | Reviewer severity | Title                                                                                                                                                                                                              | Location                                    | Verification                 |
| -------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | ---------------------------- |
| LEAD-G01 | medium            | Upload size limit is not memory-bounded: without enableHttpStream the Functions runtime buffers the whole request body before busboy's 10 MB limit applies                                                         | `functions/src/lib/parseMultipart.js:20`    | confirmed → medium           |
| LEAD-G02 | medium            | Full-stack e2e cleanup deletes every user and tour in whatever Cosmos COSMOS\_CONNECTION\_STRING points to, which is the same variable and default DB name the prod maintenance scripts ask the operator to export | `e2e/tests-fullstack/usersDb.ts:6`          | confirmed → medium           |
| LEAD-G03 | medium            | No privacy notice: a public app storing GPS tracks and geotagged photos never tells users who the controller is, what is processed, or which third parties receive data                                            | `frontend/src/ui/map.js:21`                 | partially-confirmed → medium |
| LEAD-G04 | low               | Every integration and e2e environment runs as the single SKIP\_AUTH identity, so cross-user isolation is never tested against a real store                                                                         | `.github/workflows/gate.yml:236`            | confirmed → low              |
| LEAD-G05 | low               | stripHtml silently deletes every '&lt;' and '&gt;' from tour names and descriptions although no HTML sink renders them                                                                                             | `functions/src/lib/validation.js:6`         | confirmed → low              |
| LEAD-G06 | low               | The 'Add a language' how-to says nothing else needs wiring, but the backend allowlist rejects the new code, so signed-in users can never switch to it                                                              | `docs/how-to/adding-a-language.md:26`       | partially-confirmed → low    |
| LEAD-G07 | low               | GDPR deletion job writes deleted users' Entra object ids and deletion times to public GitHub Actions logs                                                                                                          | `functions/scripts/process-deletions.js:61` | confirmed → low              |

## Findings

### LEAD-G01: Upload size limit is not memory-bounded: without enableHttpStream the Functions runtime buffers the whole request body before busboy's 10 MB limit applies

- **Severity (reviewer):** medium
- **Category:** dos · **Effort:** S · **Confidence:** medium
- **Location:** `functions/src/lib/parseMultipart.js:20`
- **Also:** `functions/src/lib/parseMultipart.js:87`, `functions/src/UploadTour/index.js:41`, `functions/src/UploadImage/index.js:58`, `functions/package.json:23`

**Evidence:**

```text
Streamed into busboy rather than read whole: arrayBuffer() allocated the
 * entire payload before any limit could apply, and Content-Length can't prevent
 * that — chunked requests carry none
```

**Description.** parseMultipart treats request.body as a live network stream and relies on busboy's fileSize limit as 'the real enforcement'. The app never calls app.setup({ enableHttpStream: true }): grep finds no enableHttpStream or app.setup in functions/src or package.json. On that default path, @azure/functions 4.16.2 builds the HttpRequest from the complete RPC payload (dist/azure-functions.js ~L2131: `body = Buffer.from(init.body.bytes)`). So by the time Readable.fromWeb(request.body) runs (line 87), the Functions host and the Node worker already hold the full body, possibly several copies of it, whatever its size. The Content-Length shortcut (line 33) does nothing for chunked requests, which the comment itself notes. The whole body also arrives before the handler runs, so calling auth before parseFile in UploadTour/UploadImage does not stop an unauthenticated sender from making each instance buffer a maximum-size body. None of the existing findings cover this: PERF-G08/QA-G04 are about the Content-Length off-by-one, and SEC-06/PERF-03 are about quotas and the scale ceiling.

**Impact.** Any internet client can send chunked POSTs near the platform's request-size limit (about 100 MB) to /api/tours/upload or /api/tours/{id}/images, with no token. Each request is held in host and worker memory before a 400 or 401 comes back. A few dozen concurrent requests can push a 2 GB Flex instance out of memory, failing every user's requests on it, and drive scale-out toward the 40-instance ceiling (cost). The code comments and the design both say memory is bounded at 10 MB, which is false.

**Recommendation.** Call app.setup({ enableHttpStream: true }) once, in a module every function loads, so request.body really is a stream. Then re-test parseMultipart's limit and abort path against a chunked 50 MB body in the integration suite. Independently, fix the comment. If streaming cannot be enabled, cap the request size at the edge (APIM or Front Door) and document the real bound.

**Verification.** confirmed, severity → medium. No app.setup/enableHttpStream anywhere (functions/src, package.json, host.json), so @azure/functions 4.16.2 builds the request from the full RPC payload (node\_modules/@azure/functions/dist/azure-functions.js:2130-2131 `body = Buffer.from(init.body.bytes)`). A probe that built an HttpRequest from a 30 MB multipart payload added 60 MB of arrayBuffers before parseMultipart (functions/src/lib/parseMultipart.js:33/87) returned 400, so the lines 20-23 comment is false. Two corrections that do not change the severity: only the code comment claims a 10 MB bound (the docs do not), and every POST/PATCH endpoint is exposed, not only the uploads (Flex 2048 MB, max 40 instances, infrastructure/functions.tf:25-26).

### LEAD-G02: Full-stack e2e cleanup deletes every user and tour in whatever Cosmos COSMOS\_CONNECTION\_STRING points to, which is the same variable and default DB name the prod maintenance scripts ask the operator to export

- **Severity (reviewer):** medium
- **Category:** data-loss · **Effort:** S · **Confidence:** high
- **Location:** `e2e/tests-fullstack/usersDb.ts:30` (lead correction: the cited line is out of range or off; the code is at `e2e/tests-fullstack/usersDb.ts:6`)
- **Also:** `e2e/tests-fullstack/usersDb.ts:58`, `e2e/tests-fullstack/journeys.spec.ts:18`, `functions/scripts/backfillTourStats.js:10`, `functions/scripts/backfillImageThumbnails.js:10`, `functions/scripts/init-cosmos.js:11`, `infrastructure/cosmos.tf:74`

**Evidence:**

```text
const CONNECTION_STRING =
  process.env.COSMOS_CONNECTION_STRING ||
  'AccountEndpoint=http://localhost:8081/;AccountKey=C2y6...';
const DATABASE = process.env.COSMOS_DATABASE || 'bikebuddy';
```

**Description.** clearTours() and clearUsers() (lines 58-75) run `SELECT c.id, c.userId FROM c` and delete every document found. journeys, photo-management, multi-select-delete and mobile-map specs call them before each test. The target comes from process.env.COSMOS\_CONNECTION\_STRING, and nothing checks that the endpoint is localhost or the emulator. The prod maintenance scripts functions/scripts/backfillTourStats.js and backfillImageThumbnails.js document 'Env: COSMOS\_CONNECTION\_STRING, COSMOS\_DATABASE, BLOB\_CONNECTION\_STRING. Usage: node scripts/backfillTourStats.js' and have no wrapper that scopes the variable. The operator has to export the production key into their shell, and the production database is also called 'bikebuddy' (infrastructure/cosmos.tf:74). If `./buddy.sh test e2e-fullstack` then runs from that same shell, every production user and tour document is wiped. Blob files are left orphaned. The lens reviews covered the scripts' lack of dry-run and runbook (OPS-18/QA-29) and missing backups (OPS-03), but not this cross-component trap.

**Impact.** One plausible operator sequence for a single maintainer (run a backfill against prod, then run the full-stack suite in the same terminal) irrecoverably deletes every user's tours and profiles. Recovery depends on the default periodic Cosmos backup and a support request (OPS-03).

**Recommendation.** Make the e2e and integration helpers refuse any endpoint that is not <http://localhost> or 127.0.0.1 (and likewise in init-cosmos.js, whose header already says 'never run against prod'). Give the prod scripts a separate variable name (e.g. PROD\_COSMOS\_CONNECTION\_STRING) or a buddy.sh wrapper like delete-users.sh that fetches the key via az and never leaves it in the caller's shell.

**Verification.** confirmed, severity → medium. e2e/tests-fullstack/usersDb.ts:6-9 takes COSMOS\_CONNECTION\_STRING/COSMOS\_DATABASE ('bikebuddy', which is also the prod DB name at infrastructure/cosmos.tf:30) with no localhost guard. clearTours/clearUsers (lines 34-51) delete every document and run in beforeEach in 7 specs (e.g. journeys.spec.ts:18-19). The backfill scripts (backfillTourStats.js:10,17) have the operator export the prod key by hand. It needs an unusual operator sequence, and delete-users.sh:14 scopes its export to a subshell. cosmos.tf sets no backup block, so recovery depends on the azurerm default periodic backup plus a support ticket, as the finding says.

### LEAD-G03: No privacy notice: a public app storing GPS tracks and geotagged photos never tells users who the controller is, what is processed, or which third parties receive data

- **Severity (reviewer):** medium
- **Category:** privacy-gdpr · **Effort:** S · **Confidence:** high
- **Location:** `frontend/src/ui/map.js:21`
- **Also:** `frontend/src/index.html:14`, `frontend/src/locales/en.json:78`, `functions/src/UploadImage/index.js:82`, `docs/explanation/design-decisions.md:44`

**Evidence:**

```text
light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
```

**Description.** The code treats GDPR as in scope: DeleteAccount and ExportData carry '(GDPR)' comments, and design-decisions.md has a GDPR section. But nothing in the repo is a privacy notice. grep for privacy, impressum or datenschutz across md/html/json finds nothing. index.html links to no legal page, and the only account text is help.a2 in the locales. Users are never told who the controller is, the legal basis, retention (e.g. the Entra recycle-bin window, SEC-G03), or the recipients. Those recipients include Microsoft (Entra, Azure in northeurope) and CARTO. Every map view sends tile requests with the user's IP for the exact areas they browse, which are usually their own routes around home and work. Photo GPS is also pulled from EXIF and stored as lat/lon on the tour (UploadImage) with no mention to the user. This is between the lenses: security reviewed the data flows, but nobody checked transparency obligations.

**Impact.** EU users' location and photo data are processed with no Art. 13 information, which is a compliance exposure for the maintainer. Users cannot make an informed choice before uploading data that reveals where they live and their routines, or before their map views leak those areas to a third-party tile CDN.

**Recommendation.** Publish a short privacy notice (controller contact, data categories including extracted photo GPS, purposes and legal basis, processors: Microsoft Azure/Entra, CARTO/OSM tiles, GitHub Pages; retention and deletion timing; export and delete rights). Link it from the sign-in prompt, the profile dialog and the help dialog. Consider a self-hosted or proxied tile source, or at least disclose CARTO.

**Verification.** partially-confirmed, severity → medium. A repo-wide grep for privacy/impressum/datenschutz/imprint/terms finds nothing. index.html links to no legal page, and CARTO tiles are fetched from frontend/src/ui/map.js:21-22, with the app offered in 7 EU languages. One overstatement: frontend/src/locales/en.json:88 (help.a7) does tell users that geotagged photos appear 'where they were taken'. A notice hosted outside the repo (Entra user-flow branding or the nobuddy.org root) also cannot be ruled out from the code.

### LEAD-G04: Every integration and e2e environment runs as the single SKIP\_AUTH identity, so cross-user isolation is never tested against a real store

- **Severity (reviewer):** low
- **Category:** test-gap · **Effort:** M · **Confidence:** high
- **Location:** `.github/workflows/gate.yml:236`
- **Also:** `.github/workflows/gate.yml:305`, `functions/src/middleware/authMiddleware.js:57`, `functions/test/integration/tours.test.js:24`, `functions/src/lib/db.js:11`

**Evidence:**

```text
SKIP_AUTH: "true"
```

**Description.** Tenant isolation rests entirely on passing user.userId as the Cosmos partition key and on blob prefixes (ownedTour.js, db.js queryUserItems). Unit tests only check that mocks were called with the right partition key (e.g. GetTour/index.test.js:34). Both CI jobs that talk to a real emulator (e2e-fullstack, gate.yml:236, and integration, gate.yml:305) set SKIP\_AUTH=true. skipAuthIfDev always returns { userId: 'local-dev-user' } (authMiddleware.js:57), so no test ever creates data as user A and tries to read, patch, delete, map or export it as user B. db.js itself says the emulator behaves differently from real Cosmos for a missing item ('a thrown 404 on real Cosmos and a resolved undefined on the emulator'). QA-15 flags db.js coverage exclusion and a thin happy-path integration suite. The specific gap here is that the design of the test environments makes the product's most important security property untestable.

**Impact.** A regression that drops or confuses the partition key (e.g. a new endpoint using a cross-partition query, or a refactor of queryUserItems) would pass all 288 unit tests, the integration suite and the full-stack e2e, and could ship as cross-user exposure of GPS tracks and photos.

**Recommendation.** Add a test-only auth mode that takes the user id from a header (e.g. X-Test-User, accepted only when SKIP\_AUTH=true and never in prod). Add integration tests that create a tour and photo as user A and assert 404 on GET/PATCH/DELETE/images, absence from /api/tours, /api/map and /api/me/export, and survival after DeleteAccount, all as user B.

**Verification.** confirmed, severity → low. Both emulator-backed CI jobs set SKIP\_AUTH: "true" (.github/workflows/gate.yml:236,305), and skipAuthIfDev always returns the fixed 'local-dev-user' (functions/src/middleware/authMiddleware.js:52-57). Isolation rests on the partition key (lib/ownedTour.js:18, lib/db.js:31-35), and unit tests only assert mock arguments (functions/src/GetTour/index.test.js:34 `expect(item).toHaveBeenCalledWith(TID, 'u1')`). No integration or e2e test exercises a second user.

### LEAD-G05: stripHtml silently deletes every '&lt;' and '&gt;' from tour names and descriptions although no HTML sink renders them

- **Severity (reviewer):** low
- **Category:** data-integrity · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/lib/validation.js:6`
- **Also:** `functions/src/lib/validation.js:9`, `functions/src/lib/validation.js:10`, `functions/src/UpdateProfile/index.js:13`, `frontend/src/ui/sidebar.js:100`

**Evidence:**

```text
const stripHtml = (s) => s.replace(/[<>]/g, '').trim();
```

**Description.** Names, descriptions and profile names go through stripHtml before validation, and the stripped value is what gets stored. The frontend never renders user text as HTML: sidebar.js uses textContent ('never innerHTML: tour names are user-supplied'), and confirm/tour-detail/profile use textContent. grep finds no Leaflet bindTooltip, bindPopup or setContent. So the transform protects nothing and quietly rewrites legitimate text. Probe: tourMetaSchema.parse({name:'Ride &lt;3 with Anna',description:'Munich -&gt; Garmisch, 5 &lt; 10 km climbs'}) returns {"name":"Ride 3 with Anna","description":"Munich - Garmisch, 5 10 km climbs"}, and a name of '&lt;&gt;' is rejected as empty. The UI gives no feedback. (The GPX-name path skipping this, SEC-07/QA-03, is a separate root cause.)

**Impact.** Users' route descriptions and names are changed without notice (arrows, '&lt;3', comparisons). The step also gives a false sense of XSS protection that could make a future HTML sink look safe.

**Recommendation.** Store text verbatim and keep output encoding (textContent) as the XSS control. Add a lint rule or test that forbids innerHTML with user data. If some filtering is wanted, reject control characters instead of rewriting.

**Verification.** confirmed, severity → low. functions/src/lib/validation.js:6 strips every &lt; and &gt; before storage (lines 9-10). My probe reproduced it: {name:'Ride &lt;3 with Anna',...} became {"name":"Ride 3 with Anna","description":"Munich - Garmisch, 5 10 km climbs"}, and '&lt;&gt;' is rejected. No user text reaches an HTML sink: sidebar.js:100, tour-detail.js:256/262 and confirm.js:34 use textContent, name interpolations go to textContent/aria-label, and data-i18n-html (i18n.js:138-139) renders only static locale strings.

### LEAD-G06: The 'Add a language' how-to says nothing else needs wiring, but the backend allowlist rejects the new code, so signed-in users can never switch to it

- **Severity (reviewer):** low
- **Category:** docs-drift · **Effort:** S · **Confidence:** high
- **Location:** `docs/how-to/adding-a-language.md:26`
- **Also:** `functions/src/lib/validation.js:45`, `frontend/src/ui/profile.js:91`, `frontend/src/sw.js:62`

**Evidence:**

```text
Add an entry to `SUPPORTED_LOCALES` in `frontend/src/lib/i18n.js`. That single
list drives the language switcher, browser-language detection, and date
formatting — nothing else needs wiring:
```

**Description.** The language switcher only lives in the signed-in Profile dialog (menus.js, closest('.modal')). selectLanguage persists first with PATCH /api/me {language} and calls i18n.setLanguage only if res.ok (profile.js:84-95). UpdateProfile validates against z.enum(SUPPORTED\_LANGUAGE\_CODES), a hand-maintained copy ('Kept in step by hand with frontend/src/lib/i18n.js's SUPPORTED\_LOCALES'). Following the how-to exactly ships a locale that returns 400 and shows the 'errors.saveLanguage' toast every time it is picked. The how-to also leaves out sw.js PRECACHE\_URLS. ARCH-07 flags the duplicated contract. This finding is the operator doc that states the opposite, which turns the duplication into a guaranteed bug for the next contributor.

**Impact.** The next added language is broken for every signed-in user until someone notices, and it is not cached for offline use. The unit parity test the doc points to passes anyway.

**Recommendation.** Update the how-to to list validation.js SUPPORTED\_LANGUAGE\_CODES and sw.js PRECACHE\_URLS. Better, add a test that reads both lists (and the locales directory) and fails on mismatch.

**Verification.** partially-confirmed, severity → low. Confirmed: docs/how-to/adding-a-language.md:26-28 says 'nothing else needs wiring', but the backend allowlist is a hand-kept copy (functions/src/lib/validation.js:45-48), no test ties it to SUPPORTED\_LOCALES, and profile.js selectLanguage only applies the language when res.ok (a 400 shows the error toast). Refuted: the sw.js part is caught by frontend/test/sw.test.js:42-44 ('includes every locale file'), so the 'not cached offline' impact does not hold. The how-to's own step 3 (pick the new language in the running app, which uses the same allowlist) would also expose the 400, so 'guaranteed bug' is overstated.

### LEAD-G07: GDPR deletion job writes deleted users' Entra object ids and deletion times to public GitHub Actions logs

- **Severity (reviewer):** low
- **Category:** privacy-gdpr · **Effort:** S · **Confidence:** high
- **Location:** `functions/scripts/process-deletions.js:61`
- **Also:** `functions/scripts/process-deletions.js:64`, `.github/workflows/process-deletions.yml:41`

**Evidence:**

```text
console.log(`Deleted Entra user ${id} (status ${status}).`);
```

**Description.** nobuddyorg/BikeBuddy is a public repository (confirmed via the GitHub API), so its Actions run logs can be read by anyone during the log retention period. The daily Account Deletions workflow (.github/workflows/process-deletions.yml:8) runs this script, which prints each deleted user's directory object id, and on failure 'Failed to delete Entra user ${id}'. The oid is a stable pseudonymous identifier: the same value appears in that user's tokens and in the tenant's recycle bin for 30 days (SEC-G03). Logging it next to a timestamp publishes a record of who deleted their account and when, as part of the erasure process itself.

**Impact.** Small privacy leak: a pseudonymous identifier and erasure event for every deleting user is published. It also contradicts the GDPR intent of the job and is avoidable at no cost.

**Recommendation.** Log counts only, or a salted hash or last 4 characters of the id. If per-id tracing is needed, write it to a private store. Consider setting a short log retention for this workflow.

**Verification.** confirmed, severity → low. functions/scripts/process-deletions.js:61 and :64 print each Entra object id. The daily workflow runs it (.github/workflows/process-deletions.yml:41), and the GitHub API reports nobuddyorg/BikeBuddy as "visibility": "public", so the run logs are public. Linkability is limited: the app's userId is the sub claim and the logged value is oid (authMiddleware.js:103-105), so it never appears in blob paths or SAS URLs. That makes this low, bordering on info.

## Coverage

Areas the critic judged under-examined:

- Azure Functions HTTP transport vs. first-party upload parsing: the @azure/functions runtime path used when enableHttpStream is off (node\_modules read only to understand how first-party code uses it)
- e2e/tests-fullstack/usersDb.ts cleanup helpers, looked at next to the prod maintenance scripts' env-var contract (backfillTourStats.js, backfillImageThumbnails.js)
- Privacy/transparency: no privacy notice for a public app that stores GPS tracks and geotagged photos; third-party processors (CARTO tiles, Microsoft) are never disclosed
- Test design: every integration and e2e environment runs with SKIP\_AUTH as a single fixed identity, so multi-user isolation is never exercised against a real store
- Validation semantics: stripHtml silently changes user text, although no HTML sink renders it (checked every innerHTML/Leaflet sink)
- docs/how-to/adding-a-language.md compared with the backend language allowlist
- Public GitHub Actions logs of the GDPR deletion job
- Checked and not reported: e2e/tests/\* static stubs, e2e/serve.mjs, scripts/test|quality|completion, buddy.sh, .github ISSUE/PR templates, SECURITY.md, codecov.yml, lib/pinLayout|debounce|concurrency|lineStyle|format|stats|tours|files|upload, ui/confirm|profile|map|tour-detail|images (upload flow), sharp memory with a 100 MP low-entropy PNG (185 MB peak for 1 upload, 401 MB for 4 concurrent, bounded), eslint over the unlinted functions/scripts (clean), SW cache deletion across the shared nobuddy.org origin (the root site is Next.js; no evidence it uses Cache Storage)

<details><summary>Commands and probes run</summary>

- git ls-files | grep -v vendor/lock/binary (228 first-party files), diffed against the reviewers' read list
- grep -rn innerHTML|insertAdjacentHTML|data-i18n-html|bindTooltip|bindPopup|setContent|html: frontend/src (only static or first-party strings reach HTML sinks; no Leaflet HTML sinks for tour names)
- grep -n enableHttpStream|app.setup functions/src functions/package.json -&gt; no matches
- sed functions/node\_modules/@azure/functions/dist/azure-functions.js (HttpRequest ctor ~L2129: body = Buffer.from(init.body.bytes); setup.enableHttpStream defaults to false at L3296)
- node scratchpad/lead-gap/bomb.js 1 / 4 -&gt; 'png bytes 312296, N 1 ms 514 peak RSS MB 185' / 'N 4 ms 1145 peak RSS MB 401' (image path is bounded, so not reported)
- node -e tourMetaSchema.parse({name:'Ride &lt;3 with Anna',description:'Munich -&gt; Garmisch, 5 &lt; 10 km climbs'}) -&gt; {"name":"Ride 3 with Anna","description":"Munich - Garmisch, 5 10 km climbs"}; safeParse({name:'&lt;&gt;'}).success -&gt; false
- grep -rn COSMOS\_CONNECTION\_STRING docs scripts functions/scripts e2e; grep -rn clearTours|clearUsers e2e
- grep -rniI privacy|carto|impressum|datenschutz across md/html/json (only the CSP line matches)
- grep -n SKIP\_AUTH functions/test .github/workflows functions/local.settings.json.example
- cd functions && npx eslint scripts/ (clean)
- mcp github search\_repositories org:nobuddyorg (BikeBuddy is public; the nobuddy.org root is the Next.js nobuddyorg.github.io repo)
- git log -5 / commit-date activity check (Dependabot merges keep scheduled workflows active)

</details>
