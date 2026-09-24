# Reference: Testing

How BikeBuddy instantiates the [test strategy playbook](../../TEST_STRATEGY.md):
which layer owns what, which tools and thresholds are in force, and which risks
are covered, partly covered, or not covered yet. The playbook stays generic;
real paths, numbers and issues live here. Commands are in the
[Developer guide](../how-to/developer-guide.md); load testing has its own
[guide](../how-to/load-testing.md).

## The shape

| Playbook piece            | BikeBuddy                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| Static frontend           | `frontend/src/` on GitHub Pages under `/BikeBuddy/`, service worker `sw.js`              |
| Serverless API            | Azure Functions (Flex Consumption), one handler per folder in `functions/src/`           |
| Auth middleware           | `functions/src/middleware/authMiddleware.js`, Entra External ID, `SKIP_AUTH` dev bypass  |
| Partition-scoped read     | `functions/src/lib/ownedTour.js`: reads the tour from the caller's `/userId` partition   |
| Document DB               | Cosmos DB: `tours` by `/userId`, `users` by `/id`, `deletions` queue                     |
| Blob store + signed URLs  | Azure Blob, `${userId}/` prefixes, read-only SAS from `functions/src/lib/blobStorage.js` |
| Out-of-band deletion job  | `.github/workflows/process-deletions.yml` → `functions/scripts/process-deletions.js`     |
| Local stack (integration) | Cosmos emulator + Azurite + `func` host, `.github/actions/start-local-stack`             |

## Who owns what

| Behaviour                                                       | Layer                        | Where                                                                                                            |
| --------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Token validation (issuer, audience, alg, expiry, key id)        | Middleware unit, test-signed | `functions/src/middleware/authMiddleware.test.js` (local RSA key pair, injected JWKS)                            |
| Status paths, write ordering, 404 outside the caller's tour     | Handler unit                 | `functions/src/<Name>/index.test.js`, handlers called with injected `auth` and containers                        |
| GPX parsing, simplification, validation, EXIF GPS               | Unit + property + mutation   | `functions/src/lib/*.test.js`, `*.property.test.js` (fast-check)                                                 |
| Frontend pure logic (URL state, stats, upload queue, SAS cache) | Unit + property + mutation   | `frontend/test/*.test.js`, `frontend/test/properties.test.js`                                                    |
| HTTP lifecycle through the real host                            | Integration                  | `functions/test/integration/*.test.js` against Cosmos emulator + Azurite + `func`                                |
| Hot-query shape and payload bounds                              | Integration (cost guards)    | `query-cost.test.js` (single partition, bounded pages), `map-budget.test.js` (point and byte budget)             |
| Base path, theme, URL state, empty and error states             | E2E static, API mocked       | `e2e/tests/` with `page.route`                                                                                   |
| Journeys: upload, edit, photos, delete, account, language       | E2E full stack               | `e2e/tests-fullstack/`, page objects in `e2e/pages/` reached through `on(page)`                                  |
| Accessibility                                                   | Runtime, in both E2E suites  | `e2e/axe.ts` via `on(page).a11y.check()`; `frontend/test/contrast.test.js` pins colour-token contrast            |
| Frontend lab performance                                        | Lighthouse CI                | `e2e/lighthouse/lighthouserc.signed-out.json`, `lighthouserc.signed-in.json`                                     |
| Headers, CORS, error disclosure                                 | DAST, passive                | `scripts/quality/zap.sh`, rules in `.zap/rules-frontend.tsv`, `.zap/rules-api.tsv`, API from `.zap/openapi.yaml` |
| Latency and backend statistics                                  | Manual load test             | `load/` (k6), `.github/workflows/k6-load-test.yml` (manual only)                                                 |
| Module boundaries, dead code, SAST, smells, IaC, workflows      | Static analysis              | dependency-cruiser, Knip, OpenGrep, ESLint + SonarJS, TFLint + Trivy, zizmor + actionlint                        |

Default locator strategy: element ids (`page.locator('#btn-upload')`) inside
the page objects. There are no `data-testid`s and no role or label locators; see the
gaps below.

## Tools and thresholds

Numbers live in the files named here; this table only points at them. Raised
when a change makes room, never lowered.

| Gate                   | Tool                | Threshold                                                                                                                                          | Source                                                                            |
| ---------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Unit coverage          | Vitest (v8)         | 99 % global (statements, branches, functions, lines) per package; 100 % per file on the mutation list; no `autoUpdate`                             | `functions/vitest.config.js`, `frontend/vitest.config.js`                         |
| Mutation scope + floor | Stryker             | 24 functions modules, 13 frontend modules; the same list sets the 100 % per-file floor                                                             | `mutation-targets.mjs`                                                            |
| Mutation score         | Stryker             | break 95 % functions (measured 96.46 %), 83 % frontend (measured 84.76 %)                                                                          | `functions/stryker.config.mjs`, `frontend/stryker.config.mjs`                     |
| E2E coverage           | V8 via monocart     | static 55 % lines / 47 % functions; full stack 73 % / 72 %                                                                                         | `e2e/coverage.ts`                                                                 |
| Property tests         | fast-check          | 200 runs per property; replay with `FC_SEED` / `FC_PATH`                                                                                           | `functions/test/fast-check.setup.js`, `frontend/test/fast-check.setup.js`         |
| Accessibility          | axe-core            | zero violations, WCAG 2.x A/AA + best practice; no exclusions                                                                                      | `e2e/axe.ts`                                                                      |
| Lighthouse, signed out | Lighthouse CI       | performance ≥ 0.8, accessibility = 1, best practices ≥ 0.9, SEO ≥ 0.9, LCP ≤ 5000 ms, TBT ≤ 600 ms, CLS ≤ 0.1, median of 3                         | `e2e/lighthouse/lighthouserc.signed-out.json`                                     |
| Lighthouse, signed in  | Lighthouse CI       | performance ≥ 0.6, accessibility = 1, best practices ≥ 0.9, SEO ≥ 0.9, LCP ≤ 8000 ms, TBT ≤ 600 ms, CLS ≤ 0.25, median of 3                        | `e2e/lighthouse/lighthouserc.signed-in.json`                                      |
| DAST                   | OWASP ZAP (passive) | FAIL only on the listed rules (error disclosure, permissive CORS, cookie flags); header rules the static host cannot meet are IGNORE with a reason | `.zap/rules-frontend.tsv`, `.zap/rules-api.tsv`                                   |
| Load                   | k6                  | not a gate; per-scenario p95 limits at the `normal` profile, calibrated in the guide                                                               | `load/lib/options.js`, [load-testing guide](../how-to/load-testing.md#thresholds) |
| Cost guards            | Vitest integration  | tour list: caller's partition on every page, `ceil(n / MAX_ITEMS_PER_REQUEST)` round trips; map: point budget, ≤ 4 MiB                             | `functions/test/integration/query-cost.test.js`, `map-budget.test.js`             |

## Risk table

Every open security or data-loss issue, with the layer that should catch it
and what catches it today. **Covered**: a test fails if the risk comes back.
**Partly**: some of it is pinned. **Not**: nothing fails today.

| Issue | Risk                                                                                 | Owning layer                       | Status    | Evidence                                                                                                                                                                               |
| ----- | ------------------------------------------------------------------------------------ | ---------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #567  | Cross-user read/write by tour or image id (IDOR)                                     | Integration, two identities        | Partly    | Handler unit tests return 404 "not in the caller partition", but through a faked read; integration and E2E run as one `SKIP_AUTH` user                                                 |
| #569  | An ID token is accepted as an access token (no `scp` check)                          | Middleware unit + integration      | Not       | `authenticate` checks audience, issuer and RS256 only; no test presents an ID token                                                                                                    |
| #545  | Empty Entra variables deploy the production API with `SKIP_AUTH=true`                | Middleware unit + deploy check     | Partly    | The middleware throws if `SKIP_AUTH` meets a configured tenant (unit-tested); `infrastructure/functions.tf` still sets it when the client id is empty                                  |
| #537  | Unauthenticated requests drain the JWKS rate limiter → 500 for everyone              | Middleware unit (injected JWKS)    | Not       | `rateLimit: true` on the shared jwks-rsa client; no test                                                                                                                               |
| #571  | JWKS URI pinned forever, hard failure at metadata TTL, no fetch timeout              | Middleware unit                    | Partly    | Metadata TTL and 5xx-not-401 are unit-tested; a unit test _pins_ the forever-cached client; no timeout test                                                                            |
| #562  | MSAL tokens in `localStorage` on the shared origin                                   | Design decision, not a test        | Not       | `cacheLocation: 'localStorage'` in `frontend/src/ui/auth.js`                                                                                                                           |
| #557  | Frontend does not handle 401 / expired tokens                                        | DOM-layer unit                     | Not       | `frontend/src/ui/` has no unit tests                                                                                                                                                   |
| #558  | Function App lacks `https_only`; production CORS allows `http://localhost:4280`      | IaC scan + review                  | Not       | ZAP's CORS rule only sees the local host, not the production allow-list                                                                                                                |
| #560  | Production CSP too wide                                                              | DAST + review                      | Partly    | Meta CSP exists; ZAP rule 10038 is IGNORE because the static host cannot send headers                                                                                                  |
| #561  | Long-lived subscription-wide SP secret readable by every deploy job                  | CI/CD review                       | Not       | `ARM_CLIENT_SECRET` at workflow level in `deploy.yml`                                                                                                                                  |
| #563  | Deploy not gated on CI, not ordered, no smoke test                                   | Pipeline structure                 | Not       | `deploy.yml` runs on every push to `main`; frontend needs only `infrastructure`; no smoke job                                                                                          |
| #539  | Auto-merged Dependabot PRs never deploy                                              | Pipeline structure                 | Not       | Merges made with `GITHUB_TOKEN` (`gh pr merge --auto`) trigger no `deploy.yml` run                                                                                                     |
| #543  | Stateful resources lack destroy guards under `tofu apply -auto-approve`              | IaC scan                           | Not       | TFLint's `missing_prevent_destroy` rule is disabled pending this issue (`.tflint.hcl`)                                                                                                 |
| #541  | No backup/restore for user data                                                      | Restore drill                      | Not       | Default Cosmos backup, no blob soft delete                                                                                                                                             |
| #568  | Photos live in an unmanaged `tour-images` container                                  | IaC                                | Not       | Not in OpenTofu state, so no scan or guard reaches it                                                                                                                                  |
| #575  | GPX edge cases: `Math.min` stack overflow, bad timestamp, negative duration, comment | Unit + property                    | Partly    | Stack overflow fixed (min/max loop) and pinned in `parseGpx.test.js` and `parseGpx.property.test.js`; the other cases are open                                                         |
| #576  | GPX parsing blocks the event loop                                                    | Manual load test                   | Not gated | Visible only as event-loop delay in the k6 backend report                                                                                                                              |
| #546  | `/api/map` point budget not enforced                                                 | Integration cost guard + unit      | Partly    | `map-budget.test.js` pins the budget for ~20 km tracks; longer tracks still exceed it (50 m gap rule), and 13 Douglas-Peucker passes per tour cost ~0.9 s on a noisy 2,000-point track |
| #550  | Upload size limit does not bound memory (no HTTP streaming)                          | Integration, real host             | Not       | `parseMultipart.js`'s streaming limit is unit-tested, but the host buffers the body first                                                                                              |
| #572  | 20-photo cap bypassable by concurrent uploads; exactly-10 MB files rejected          | Integration (concurrent) + unit    | Not       | The cap is unit-tested sequentially only                                                                                                                                               |
| #553  | Deleting a tour leaves its photos and thumbnails                                     | Handler unit + integration         | Not       | `DeleteTour` deletes the GPX blob only                                                                                                                                                 |
| #573  | Inconsistent partial-failure handling (orphaned blobs, 500s on races)                | Handler unit, failing fakes        | Partly    | `UploadTour` rollback and `DeleteImage` ordering and 412 retry are tested; other handlers are not                                                                                      |
| #555  | A failed blob container init is cached forever                                       | Unit                               | Not       | `blobStorage.js` is excluded from unit coverage                                                                                                                                        |
| #538  | Account deletion can orphan data (queue keyed by oid, `GetMe` recreates the user)    | Integration                        | Partly    | `DeleteAccount` cascade unit-tested with fakes; no integration test, no test of re-creation                                                                                            |
| #540  | Data export omits GPX files and photos                                               | Integration                        | Not       | `ExportData` unit test pins user doc + tours only                                                                                                                                      |
| #570  | Deletion job deletes blind, leaves Entra soft delete, logs object ids                | Unit on the job + dry run          | Not       | `process-deletions.js` has no tests                                                                                                                                                    |
| #565  | Full-stack E2E cleanup wipes whatever `COSMOS_CONNECTION_STRING` points to           | E2E fixture guard                  | Not       | `e2e/tests-fullstack/usersDb.ts` deletes every tour and user without an endpoint check                                                                                                 |
| #577  | No schema versioning; backfill scripts lack dry run and batching                     | Handler unit (old shape) + dry run | Partly    | One legacy-shape case (`UploadImage`, tour without `images`); `functions/scripts/backfill*.js` have no dry run                                                                         |
| #549  | No per-user quotas or rate limiting                                                  | Design + cost guards               | Partly    | Per-request cost is bounded by the two guards; per-user volume is not                                                                                                                  |
| #544  | Service worker serves stale JS/CSS                                                   | Unit                               | Not       | `frontend/test/sw.test.js` checks the shell file list, not that a content change changes `CACHE_NAME`                                                                                  |
| #559  | Undo-able deletes are lost when the tab closes                                       | DOM-layer unit + E2E               | Not       | No test clicks Undo or closes the page during the grace period                                                                                                                         |
| #574  | Contract duplication and DTO drift                                                   | Contract check                     | Not       | Static E2E mocks and `.zap/openapi.yaml` are hand-written                                                                                                                              |
| #556  | Account keys instead of managed identity                                             | Design, not a test                 | Not       | Revisit the playbook's §0 when it lands                                                                                                                                                |

## Known gaps

Measured against the playbook. Each has an issue unless marked **no issue**.

- **Integration runs as one identity through the bypass flag** (#567). The
  playbook's §6/§7 ideal is two identities with tokens signed by a local key
  pair, served as a local JWKS, so `authenticate` runs unmodified. Today
  `.github/actions/start-local-stack` sets `SKIP_AUTH=true` and every request
  is `local-dev-user`. The middleware's own unit tests already sign real JWTs;
  the missing piece is a configurable OIDC metadata location.
- **The auth rules without a test**: ID tokens (#569), JWKS drain (#537),
  timeouts and key rotation (#571), `SKIP_AUTH` at deploy time (#545).
- **`frontend/src/ui/` has no unit tests** (#567, #557, #559).
- **No post-deploy smoke test** (#563).
- **Contract** (#574): nothing checks the static suite's mocks or
  `.zap/openapi.yaml` against the handlers.
- **Deletion job** (#570): no tests, and **no dry-run mode** (**no issue** for
  the dry run itself).
- **Cleanup guard** (#565): only for E2E. **No issue**: the integration tests'
  `afterAll` deletes also trust `COSMOS_CONNECTION_STRING`; they only touch
  their own random user id or tour ids, so the blast radius is small.
- **Direct DB seeding** (**no issue**, deliberate): `query-cost.test.js` seeds
  150 tours straight into Cosmos under a throwaway user, to measure the
  adapter. The full-stack specs read Cosmos back to assert what persisted,
  which the playbook allows.
- **Retries** (**no issue**): both Playwright configs set `retries: 1` on CI;
  the playbook allows retries only for a post-deploy smoke test.
- **Unexpected console errors** (**no issue**): no fixture fails a spec on a
  `pageerror` or `console.error`.
- **Locators** (**no issue**): page objects use element ids and CSS classes;
  three specs name a selector directly (`theme.spec.ts`,
  `photo-pins.spec.ts`, `long-press-select.spec.ts`).
- **Sleeps** (#584): `waitForTimeout` in `e2e/pages/main-page.ts` and two
  full-stack specs.
- **Shared data in E2E** (#584): full-stack specs clear whole containers and
  run with `workers: 1` instead of one identity per spec.
- **Throttling** (**no issue**): no test injects a Cosmos 429 after the SDK's
  retries.
- **Blob SAS scope across users** (**no issue**, part of the #567 fix): no
  test asserts that a SAS URL is read-only and limited to one blob under the
  owner's prefix.
- **Mutation blind spots** (#567): `ignoreStatic` skips top-level limit
  constants; `parseMultipart.js`, `db.js` and `blobStorage.js` are outside the
  mutation list and the integration suite does not reach all their paths.
