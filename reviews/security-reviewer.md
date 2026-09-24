# Security review: security-reviewer

Raw findings from the **security-reviewer** role of the 2026-09-24 five-lens review of BikeBuddy (`main` at `b0bde68`). It ran two passes: a first pass over the whole repo, then an independent second pass that looked for missed issues (IDs `SEC-Gnn`) and disputed first-pass claims. Vendored code (`frontend/src/vendor/`), lockfiles and generated output were out of scope.

Severity scale (shared by all reviewers): **critical**: exploitable now, severe; **high**: serious and plausible in production; **medium**: real defect, limited blast radius; **low**: hardening or minor; **info**: observation.

The findings below are the reviewer's own claims, as returned. The _Verification_ lines come from the adversarial verifiers: two independent lenses (code truth, impact) for every critical/high finding, and one skeptical batch check for medium/low. The lead's final, deduplicated severities are in [`REVIEW.md`](../REVIEW.md).

## Summary

The core authorization model holds. Every data endpoint authenticates in code, and every Cosmos read, query and patch uses the caller's token `sub` as the partition key. Route ids are UUID-validated, and blob names are built on the server and never taken from the client, so I found no IDOR or cross-user path. The frontend escapes output consistently (textContent everywhere; the only markup comes from static locales) and the CSP is script-src 'self'. The most serious issue is availability: jwks-rsa's per-instance rate limiter can be drained by a few unauthenticated requests carrying random `kid` values. After that, legitimate users on cold instances, and on warm ones every 10 minutes when the cached key expires, get a 500 from auth (probe confirmed). Medium issues: CI/supply chain (ARM service-principal secret exposed to every deploy job, and Dependabot PRs auto-merged with no gating into a pipeline that deploys and holds privileged secrets); a fail-open auth switch (an empty ENTRA\_CLIENT\_ID variable turns on SKIP\_AUTH in production); account deletion that is not durable (data recreated after deletion is orphaned forever); no per-user quotas or rate limiting, so any self-registered account can run up cost; and GPX-derived tour names skipping the name validation, which permanently breaks that tour's detail endpoint. The rest is hardening: key-based auth with no managed identity, CSP wildcards, localStorage tokens on a shared Pages origin, service-worker update propagation, and incomplete export.

## Strengths noted

- Ownership is enforced by construction: readItem/queryUserItems always pass the token-derived userId as the Cosmos partition key (db.js queryUserItems, ownedTour.js loadOwnedTour), and all queries are parameterised; no SQL string concatenation of user input.
- Every function except the intentionally I/O-free Health endpoint calls authenticate() before touching data; authLevel 'anonymous' is compensated by in-code JWT checks (RS256 pinned, issuer from OIDC metadata, audience = client id, exp/nbf enforced by jsonwebtoken).
- Auth errors are classified: client token faults -&gt; 401, infrastructure faults -&gt; 5xx; logs contain only error name/message, never the token or claims.
- tourId/imageId route params are strictly UUID-validated; blob names are always server-constructed (`${userId}/${tourId}/${uuid}.jpg`), so there is no path traversal or cross-user blob naming.
- SKIP\_AUTH refuses to run when any ENTRA\_\* value is configured (throws rather than falling through).
- Upload hardening: busboy streaming limits (fileSize 10MB+1, files 1, fields 0), magic-byte check for JPEG/PNG and XML, sharp limitInputPixels 100MP, images always re-encoded to JPEG so EXIF (incl. GPS) is stripped from served files; fast-xml-parser 5.11.1 rejects external entities, \_\_proto\_\_ names and deep nesting, and does not recursively expand nested internal entities (probed).
- SAS URLs are read-only, per-blob, 1h expiry, Content-Disposition signed for GPX; containers private; allow\_nested\_items\_to\_be\_public=false; min TLS 1.2 and HTTPS-only on storage.
- Frontend never renders user data through HTML sinks: tour names/descriptions/profile/error messages all go through textContent; Leaflet divIcon uses an element not a string; deep-link tour ids are only honoured if they match a loaded tour id; 404.html redirects to a fixed path (no open redirect).
- Service worker never caches cross-origin (SAS/tiles) or /api/ responses.
- CI: all actions SHA-pinned, persist-credentials: false, default permissions contents: read, no pull\_request\_target/workflow\_run, no github.event expressions interpolated into run: blocks; Graph 'delete user' credential kept out of the public API and used only by a scheduled job.
- No real secrets committed (only the public Cosmos emulator key); logs carry no GPS/PII; npm audit --omit=dev reports 0 vulnerabilities in functions, and 0 in frontend/e2e.

## Findings overview

Reviewer-assigned counts: 0 critical, 1 high, 7 medium, 17 low, 2 info.

| ID      | Reviewer severity | Title                                                                                                                                                                                    | Location                                         | Verification                                                       |
| ------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| SEC-01  | high              | Unauthenticated JWKS rate-limit exhaustion causes an API-wide auth outage (500s)                                                                                                         | `functions/src/middleware/authMiddleware.js:39`  | code-truth: confirmed → high; impact: partially-confirmed → medium |
| SEC-02  | medium            | Deploy workflow exposes the long-lived Azure SP secret and TF state key to every job, including one running an unpinned global npm install                                               | `.github/workflows/deploy.yml:17`                | confirmed → medium                                                 |
| SEC-03  | medium            | Dependabot PRs are auto-merged unconditionally into a pipeline that deploys and holds privileged secrets                                                                                 | `.github/workflows/dependabot-auto-merge.yml:11` | confirmed → medium                                                 |
| SEC-04  | medium            | Fail-open auth: an empty/missing ENTRA\_CLIENT\_ID repo variable deploys production with SKIP\_AUTH=true                                                                                 | `infrastructure/functions.tf:37`                 | partially-confirmed → low                                          |
| SEC-05  | medium            | Account deletion is not durable: data recreated after DELETE /api/account is orphaned permanently                                                                                        | `functions/src/DeleteAccount/index.js:41`        | confirmed → medium                                                 |
| SEC-06  | medium            | No per-user quotas or rate limiting on uploads: any self-registered account can drive unbounded cost                                                                                     | `functions/src/UploadTour/index.js:86`           | confirmed → medium                                                 |
| SEC-07  | medium            | Tour name taken from the GPX file bypasses name validation (type, stripHtml, 200-char limit)                                                                                             | `functions/src/UploadTour/index.js:64`           | partially-confirmed → low                                          |
| SEC-G01 | medium            | CI service principal is Contributor on the whole subscription and is reused by the daily deletion job; cost alert only watches the app resource group                                    | `docs/how-to/infrastructure.md:47`               | partially-confirmed → low                                          |
| SEC-08  | low               | Access-token checks accept any token for the audience: no scp/token-type check, so ID tokens work as API tokens                                                                          | `functions/src/middleware/authMiddleware.js:96`  | confirmed → low                                                    |
| SEC-09  | low               | Key-based auth everywhere: account keys in plain app settings, account-key SAS, no managed identity, no blob recovery                                                                    | `infrastructure/functions.tf:29`                 | confirmed → low                                                    |
| SEC-10  | low               | Production CORS allows <http://localhost:4280> and the Function app does not enforce HTTPS                                                                                               | `infrastructure/functions.tf:47`                 | confirmed → low                                                    |
| SEC-11  | low               | CSP allows wildcard Azure hosts and a plaintext localhost emulator in production                                                                                                         | `frontend/src/index.html:14`                     | confirmed → low                                                    |
| SEC-12  | low               | MSAL tokens (incl. refresh token) in localStorage on an origin shared with every other nobuddy.org Pages site                                                                            | `frontend/src/ui/auth.js:94`                     | confirmed → low                                                    |
| SEC-13  | low               | Service worker serves app JS cache-first and only updates on a manual CACHE\_NAME bump, so security fixes may never reach installed clients                                              | `frontend/src/sw.js:10`                          | confirmed → low                                                    |
| SEC-14  | low               | Unpinned tooling in privileged/CI paths: OpenTofu provider lock file gitignored; opengrep installed via curl\|bash from main                                                             | `.gitignore:73`                                  | confirmed → low                                                    |
| SEC-15  | low               | GDPR export omits the uploaded GPX files and photos and returns unusable raw blob URLs                                                                                                   | `functions/src/ExportData/index.js:19`           | confirmed → low                                                    |
| SEC-16  | low               | IaC/code drift: the photo container the code uses ('tour-images') is not managed by OpenTofu                                                                                             | `infrastructure/storage.tf:33`                   | confirmed → low                                                    |
| SEC-17  | low               | Vendored MSAL Browser 3.28.1 (Jan 2025) is outside any automated update path                                                                                                             | `frontend/src/vendor/.msal-source:1`             | confirmed → low                                                    |
| SEC-G02 | low               | Deletion job blindly deletes any directory object id found in the Cosmos 'deletions' container, contradicting the documented privilege boundary                                          | `functions/scripts/process-deletions.js:48`      | confirmed → low                                                    |
| SEC-G03 | low               | Entra identity deletion is only a soft delete: name/email stay in the directory recycle bin for 30 days                                                                                  | `functions/scripts/process-deletions.js:34`      | confirmed → low                                                    |
| SEC-G04 | low               | GPX parsing blocks the event loop for 2.5-4.8 s per 10 MB upload, stalling every other request on the instance                                                                           | `functions/src/lib/parseGpx.js:136`              | confirmed → low                                                    |
| SEC-G05 | low               | Per-tour 20-photo cap is a non-atomic check-then-append and can be bypassed with concurrent uploads                                                                                      | `functions/src/UploadImage/index.js:52`          | confirmed → low                                                    |
| SEC-G06 | low               | GetMe stores unvalidated token name/email and overwrites the user's chosen profile name on every load                                                                                    | `functions/src/GetMe/index.js:20`                | confirmed → low                                                    |
| SEC-G07 | low               | Account-deletion workflow logs into Azure before `npm ci` runs dependency install scripts, putting the ARM session and later the Graph secret within reach of any compromised dependency | `.github/workflows/process-deletions.yml:28`     | confirmed → low                                                    |
| SEC-G08 | low               | No security telemetry in production: host.json configures Application Insights but no connection string is deployed                                                                      | `infrastructure/functions.tf:28`                 | confirmed → low                                                    |
| SEC-18  | info              | Dev-only npm audit findings (brace-expansion high, qs moderate) via Stryker                                                                                                              | `functions/package.json:34`                      | not verified (info)                                                |
| SEC-G09 | info              | Verified positives: parser and upload hardening hold, EXIF is stripped, and the vendored libraries match upstream byte for byte                                                          | `functions/src/lib/parseGpx.js:101`              | not verified (info)                                                |

## Findings

### SEC-01: Unauthenticated JWKS rate-limit exhaustion causes an API-wide auth outage (500s)

- **Severity (reviewer):** high
- **Category:** dos · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/middleware/authMiddleware.js:39`
- **Also:** `functions/src/middleware/authMiddleware.js:64`, `functions/src/middleware/authMiddleware.js:115`, `functions/src/middleware/authMiddleware.js:95`

**Evidence:**

```text
cachedJwksClient = jwksRsa({ jwksUri, cache: true, rateLimit: true });
```

**Description.** The JWKS client is created with rateLimit: true, which defaults to 10 JWKS fetches per minute per instance, and the key cache defaults to cacheMaxAge 10 min. The cache is keyed by `kid` and stores only successful lookups. Any request with a syntactically valid JWT (signature irrelevant) carrying an unknown `kid` therefore uses up a rate-limit token. Once the limiter is empty, every cache miss throws JwksRateLimitError. That name is not in CLIENT\_TOKEN\_ERRORS (lines 64-69), so authenticate() rethrows (lines 115-116) and the handler returns 500. Legitimate users miss the cache on every cold Flex instance and on every instance every 10 minutes when the cached key expires, so ~10 junk requests per minute per instance keep auth failing. Probe: after 10 junk-kid tokens, a correctly signed token -&gt; 'THROWS JwksRateLimitError Too many requests to the JWKS endpoint'.

**Impact.** Anyone on the internet, with no account, can make every endpoint answer 500 for signed-in users at a cost of a few requests per minute. Flex Consumption scales to zero and adds instances, so cold, empty caches are common, and 40 instances x 10 req/min is still trivial for an attacker.

**Recommendation.** Do not let unknown kids reach the network per request. Fetch the JWKS yourself (or use jwks-rsa's getSigningKeys) on a timer, and keep the last known key set with a long max age plus cacheMaxAgeFallback. Resolve the kid locally. For an unknown kid, allow at most one forced refresh per few minutes, then return 401 (treat JwksRateLimitError / unknown kid as a client error, not a 5xx). Also rebuild the cached client when getOpenIdConfig returns a different jwksUri (defaultJwksClient currently keeps the first URI forever).

**Verification (two adversarial lenses):**

- _code-truth_: **confirmed**, severity → **high**, reachable in production: yes.
- _impact_: **partially-confirmed**, severity → **medium**, reachable in production: yes.

<details><summary>code-truth verifier: reasoning, evidence and reproduction</summary>

The code does what the reviewer says. The JWKS client is a per-instance singleton with the default token bucket of 10 per minute. The rate limiter sits inside the per-kid cache, so every request carrying a new, unknown kid uses up a token. No signature, account or valid kid is needed, only a decodable JWT. Once the bucket is empty, any cache miss throws JwksRateLimitError. That error is not classed as a client error, so the endpoint returns 500 (by design, for fetch failures). Legitimate users miss the cache on every fresh Flex instance and whenever the cached key's 10-minute TTL expires. An attacker who keeps each instance's bucket empty (about 10 or more junk requests per minute per instance, spread over at most 40 instances) therefore turns every authenticated endpoint into a 500 within about 10 minutes, and keeps it that way for as long as the attack runs. Nothing in front of the app mitigates this: there is no WAF or APIM, the functions use authLevel anonymous, and host.json has no throttling. CORS and the CSP do not apply to direct curl traffic. One detail the reviewer only hinted at: a warm instance keeps serving the cached good key until its TTL runs out, so the outage builds up over at most 10 minutes rather than starting instantly. The junk requests also begin returning 500s themselves, which adds error-log noise. The recommendation to add cacheMaxAgeFallback would not help here: that fallback only triggers on isEndpointUnavailable, and JwksRateLimitError does not set that flag. Treating JwksRateLimitError / unknown kid as a 401 and resolving kids against a periodically refreshed local key set is the right fix. Severity stays high under the rubric: a realistic, unauthenticated, cheap attack path to an API-wide auth outage. It is not critical because it causes no data exposure or loss and it stops when the attack stops.

Evidence:

```text
functions/src/middleware/authMiddleware.js:39 `cachedJwksClient = jwksRsa({ jwksUri, cache: true, rateLimit: true });` (no jwksRequestsPerMinute, cacheMaxAge or cacheMaxAgeFallback set, so the library defaults apply).
functions/src/middleware/authMiddleware.js:86-95: the token is only `jwt.decode`d, and then `await client.getSigningKey(decoded.header.kid)` runs. So an attacker-chosen kid reaches the JWKS layer before any signature check.
functions/src/middleware/authMiddleware.js:64-69: CLIENT_TOKEN_ERRORS = JsonWebTokenError, TokenExpiredError, NotBeforeError, SigningKeyNotFoundError. JwksRateLimitError is not in the set, so lines 115-116 run `console.error(...)` and `throw err`.
Installed jwks-rsa 4.1.0, node_modules/jwks-rsa/src/wrappers/rateLimit.js: `function rateLimitWrapper(client, { jwksRequestsPerMinute = 10 })` ... `if (remaining < 0) { ... reject(new JwksRateLimitError('Too many requests to the JWKS endpoint'))`.
wrappers/cache.js: `cacheMaxAge = 600000` and a memoizer keyed by `hash: (kid) => kid`. Only successful loads are memoized.
JwksClient.js applies rateLimit first and then cache, so a cache hit skips the limiter and every cache miss (junk kid, cold instance, expired key) uses up one token.
Handlers call it with no try/catch, e.g. functions/src/GetTours/index.js:11 `const user = await auth(request);`, so the throw becomes a runtime 500. All 13 non-health HTTP functions use `authenticate`.
infrastructure/functions.tf:26 `maximum_instance_count = 40`. The infrastructure has no Front Door, APIM or IP restriction (grep found none).
```

Reproduction:

```text
Ran /tmp/claude-0/-home-user-BikeBuddy/ba198852-09c2-5d10-a6cd-4f788c2502d9/scratchpad/sec01/repro.js. It uses the real authMiddleware.authenticate plus defaultJwksClient against a local HTTP JWKS server with one RS256 key (kid 'good'), and sends 10 HS256 tokens with junk kids j0..j9, then a correctly signed RS256 token. Output (auth: log lines filtered):
junk 0..9 -> null
good THROWS JwksRateLimitError Too many requests to the JWKS endpoint
jwks hits 10
Variant repro2.js, where the good key was cached first:
warm good -> { userId: 'u0', ... }
junk 0..8 -> null
junk 9 THROWS JwksRateLimitError
good -> { userId: 'user1', ... } (the cache hit skips the limiter until the 10-minute TTL expires)
jwks hits 10
No repository files were modified.
```

</details>

<details><summary>impact verifier: reasoning, evidence and reproduction</summary>

The facts in the finding are correct. The kid in the unverified header decides whether the request misses the cache. The first 10 misses per minute on each instance use up the limiter. After that, any miss, including a legitimate user's miss for the real kid, throws JwksRateLimitError, which is re-thrown and becomes a 500. No account, no victim interaction and no knowledge of IDs is needed. The API URL is public in the frontend, and CORS does not stop non-browser clients.

Why I downgrade from high to medium:
(1) The finding says auth keeps failing, but that is only true on some instances. Where the real kid is already cached, users are unaffected for up to 10 minutes: my probe, scenario A, still succeeded after the junk flood. The outage covers cold instances and instances whose 10-minute cache entry expired while the attack is running.
(2) Impact is availability only: no data exposure, no data loss, no cost blow-up. It stops as soon as the attacker stops, and even during the attack a legitimate retry can sometimes win a refilled token (one per 6 s).
(3) It needs a motivated attacker who keeps sending traffic against a small hobby app with no obvious incentive. Normal traffic cannot trigger it, because legitimate requests hit the cache and key rotation causes only one fetch.
(4) Any unauthenticated flood can already degrade a Flex app capped at 40 instances. This bug makes the attack much cheaper (about 10 req/min per instance instead of a volumetric flood), but it does not create a new class of harm.

Under the shared rubric it fits "real defect with limited blast radius or needing unusual conditions". A cheap, targeted, unauthenticated DoS is still a real defect worth fixing. Two cheap fixes: map JwksRateLimitError / unknown kid to 401 (or 503 with Retry-After), and add cacheMaxAgeFallback / a longer cacheMaxAge. A lead could argue for high because it affects all users and costs the attacker almost nothing. I would not argue for critical, and my own call is medium given the preconditions and the nuisance-only impact. The side note about the stale jwksUri in defaultJwksClient is correct but separate and low.

Evidence:

```text
functions/src/middleware/authMiddleware.js:39 `cachedJwksClient = jwksRsa({ jwksUri, cache: true, rateLimit: true });`
functions/src/middleware/authMiddleware.js:64-69 `const CLIENT_TOKEN_ERRORS = new Set([ 'JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError', 'SigningKeyNotFoundError', ]);` (JwksRateLimitError is not in the set)
functions/src/middleware/authMiddleware.js:95 `const key = await client.getSigningKey(decoded.header.kid);` (the kid comes from an unverified header; jwt.decode at :86 does not check the signature)
functions/src/middleware/authMiddleware.js:115-116 `console.error(`auth: unable to verify token ...`); throw err;`. Handlers do not catch it, for example functions/src/GetMe/index.js:10 `const user = await auth(request);`, so the runtime returns 500.
functions/node_modules/jwks-rsa (v4.1.0) src/JwksClient.js: rateLimit is applied first and cache wraps it (`if (this.options.rateLimit) {...rateLimitSigningKey} if (this.options.cache) {...cacheSigningKey}`). Cache hits therefore skip the limiter, and every miss uses a token. wrappers/rateLimit.js: `jwksRequestsPerMinute = 10` ... `reject(new JwksRateLimitError('Too many requests to the JWKS endpoint'))`. wrappers/cache.js: `cacheMaxEntries = 5, cacheMaxAge = 600000`, and the memoizer stores only successful loads, so unknown kids are never cached.
infrastructure/functions.tf:26 `maximum_instance_count = 40`. I found no WAF, Front Door, APIM or IP restriction in infrastructure/*.tf.
```

Reproduction:

```text
Script at /tmp/claude-0/-home-user-BikeBuddy/ba198852-09c2-5d10-a6cd-4f788c2502d9/scratchpad/sec01v/p.js. It starts a local JWKS server with one RSA key (kid 'good'), builds real jwks-rsa clients with {cache:true, rateLimit:true} and calls the repo's authenticate(). Output:
A good first: {"userId":"u",...}   (1 token used)
junk 9 THROWS JwksRateLimitError / junk 10 THROWS ... / junk 11 THROWS ...   (junk 0-8 returned null = 401)
A good after junk (cached): {"userId":"u",...}   <- a warm instance with the key cached is NOT affected
B good THROWS JwksRateLimitError Too many requests to the JWKS endpoint   <- fresh client (cold instance / TTL expiry) after 10 junk-kid tokens: a correctly signed token fails and would be a 500
fetches 20
```

</details>

Lead re-verified: **confirmed, kept at high**. I read `jwks-rsa@4.1.0` (the rate limiter sits inside the per-kid cache, 10 requests/min by default, and it rejects immediately) and reproduced the attack with the real `authenticate()`: 10 unsigned HS256 tokens with random `kid`s, then a correctly signed RS256 token, throws `JwksRateLimitError`, which becomes an HTTP 500. No account is needed.

### SEC-02: Deploy workflow exposes the long-lived Azure SP secret and TF state key to every job, including one running an unpinned global npm install

- **Severity (reviewer):** medium
- **Category:** ci-cd · **Effort:** M · **Confidence:** high
- **Location:** `.github/workflows/deploy.yml:17`
- **Also:** `.github/workflows/deploy.yml:79`, `.github/workflows/deploy.yml:67`, `.github/workflows/destroy.yml:72`, `.github/workflows/process-deletions.yml:46`, `.github/zizmor.yml:4`

**Evidence:**

```text
env:
  ARM_CLIENT_ID: ${{ secrets.ARM_CLIENT_ID }}
  ARM_CLIENT_SECRET: ${{ secrets.ARM_CLIENT_SECRET }}
...
  ARM_ACCESS_KEY: ${{ secrets.TF_BACKEND_ACCESS_KEY }}
```

**Description.** ARM\_CLIENT\_SECRET and ARM\_ACCESS\_KEY (the TF backend key, whose state holds the Cosmos and storage keys) are set in the workflow-level env, so every job gets them. That includes deploy-frontend, which only runs the Pages actions and generate-config, and deploy-functions, which runs `npm install -g azure-functions-core-tools@4 --unsafe-perm true` (line 79): no version pin, no lockfile, with install scripts. The gate workflow already pins 4.13.0 because a 4.x release was broken. Auth uses a long-lived client secret (azure/login creds JSON) instead of OIDC federation. zizmor's adhoc-packages rule is suppressed for deploy.yml.

**Impact.** A compromised or typosquatted release of azure-functions-core-tools, or of any action in these jobs, can read a subscription-level service-principal secret and the state-backend key. Those give full control of the prod resources and every user's GPS tracks and photos.

**Recommendation.** Move the ARM\_\* env to the infrastructure job only (the frontend job needs none). Pin azure-functions-core-tools to an exact version, or use a checksummed install. Switch azure/login and the azurerm backend to OIDC (id-token: write, use\_oidc) with a federated credential limited to main/an environment, then delete the client secret. Put the deploy jobs behind a protected 'production' environment.

**Verification.** confirmed, severity → medium. deploy.yml:17-22 sets ARM\_CLIENT\_SECRET/ARM\_ACCESS\_KEY at workflow level, so deploy-frontend (deploy.yml:86-119) gets them without needing them, and deploy-functions runs azure/login (:67) then an unpinned `npm install -g azure-functions-core-tools@4 --unsafe-perm true` (:79), while gate.yml:253-258 pins 4.13.0. Moving the env alone would not protect deploy-functions, because the az session exists before the install; pinning is the key fix. Two otherLocations are wrong: destroy.yml has 42 lines (its env is at :9-14) and process-deletions.yml has 45 (credentials at :28-34 and :43-45).

### SEC-03: Dependabot PRs are auto-merged unconditionally into a pipeline that deploys and holds privileged secrets

- **Severity (reviewer):** medium
- **Category:** supply-chain · **Effort:** S · **Confidence:** high
- **Location:** `.github/workflows/dependabot-auto-merge.yml:11`
- **Also:** `.github/dependabot.yml:17`, `.github/workflows/process-deletions.yml:55`

**Evidence:**

```text
if: github.event.pull_request.user.login == 'dependabot[bot]'
...
        run: gh pr merge --auto --merge "$PR_URL"
```

**Description.** Every Dependabot PR is auto-merged. That covers npm runtime dependencies (sharp, jsonwebtoken, fast-xml-parser, etc.), major version bumps (only minor/patch are grouped, and majors still open PRs), and GitHub Actions SHA bumps. There is no dependabot/fetch-metadata update-type check and no human review. The only gate is the 7-day cooldown plus whatever branch protection exists, which is not visible in the repo. A merge to main triggers deploy.yml (ARM secrets). process-deletions.yml runs `npm ci` of the same lockfile daily with ARM credentials and a Graph secret that has User.ReadWrite.All.

**Impact.** A malicious upstream release of a runtime dependency or action ships to production automatically, where it can read Cosmos/Blob keys and all users' location data, and runs in CI jobs that hold subscription and tenant-admin-level credentials.

**Recommendation.** Gate on dependabot/fetch-metadata: auto-merge only semver-patch/minor for devDependencies, and require manual review for runtime deps, majors and github-actions. Make sure branch protection requires the CI Gate checks. Run `npm ci --ignore-scripts` in process-deletions (it does not need sharp).

**Verification.** confirmed, severity → medium. dependabot-auto-merge.yml:11-15 runs `gh pr merge --auto --merge` on every Dependabot PR with no fetch-metadata update-type gate. dependabot.yml:21-27 groups only minor/patch, so majors and github-actions bumps are auto-merged too, and git log (b0bde68, 669fe94) shows these merges landing on main, which triggers deploy.yml:3-5. The 7-day cooldown (dependabot.yml:31-32) and any required gate checks only partly mitigate this. The cited process-deletions.yml:55 does not exist; `npm ci` is at :37.

### SEC-04: Fail-open auth: an empty/missing ENTRA\_CLIENT\_ID repo variable deploys production with SKIP\_AUTH=true

- **Severity (reviewer):** medium
- **Category:** auth · **Effort:** S · **Confidence:** high
- **Location:** `infrastructure/functions.tf:37`
- **Also:** `scripts/infrastructure/provision.sh:14`, `.github/workflows/deploy.yml:45`, `functions/src/middleware/authMiddleware.js:52`, `frontend/src/ui/auth.js:39`

**Evidence:**

```text
SKIP_AUTH              = var.entra_client_id == "" ? "true" : "false"
```

**Description.** provision.sh passes `-var="entra_client_id=${ENTRA_CLIENT_ID:-}"` from `${{ vars.ENTRA_CLIENT_ID }}`. If the variable is deleted, renamed or empty, the push-to-main deploy sets SKIP\_AUTH=true with all ENTRA\_\* empty. skipAuthIfDev() then returns the synthetic 'local-dev-user' for every request with no token at all. generate-config emits an empty entraClientId, so the SPA also switches to USE\_DEV\_AUTH. Nothing fails the deploy.

**Impact.** The public API becomes an anonymous, shared account: anyone can upload, read and delete 'local-dev-user' data, and uploads from different visitors are visible to each other. Real users are silently unable to sign in. Existing users' data stays partitioned under their `sub`, so it is not exposed.

**Recommendation.** Make no-auth mode explicit and impossible in prod. Fail provision/deploy on main when any ENTRA\_\* var is empty (e.g. `: "${ENTRA_CLIENT_ID:?}"`), and set SKIP\_AUTH only from a separate opt-in variable that CI never sets. Optionally make authenticate() refuse SKIP\_AUTH when WEBSITE\_SITE\_NAME (Azure-hosted) is present.

**Verification.** partially-confirmed, severity → low. functions.tf:37 does derive SKIP\_AUTH only from entra\_client\_id, but authMiddleware.js:54-56 throws when ENTRA\_TENANT\_ID is still set. Losing just the ENTRA\_CLIENT\_ID var (deploy.yml:45) therefore fails closed as 500s, not open. Anonymous access needs both ENTRA\_CLIENT\_ID and ENTRA\_TENANT\_ID (deploy.yml:44) to be emptied by maintainer error, and provision.sh:3 documents empty vars = no-auth mode, so this is fail-safe hardening rather than a reachable bypass.

### SEC-05: Account deletion is not durable: data recreated after DELETE /api/account is orphaned permanently

- **Severity (reviewer):** medium
- **Category:** privacy · **Effort:** M · **Confidence:** high
- **Location:** `functions/src/DeleteAccount/index.js:41`
- **Also:** `functions/src/GetMe/index.js:16`, `functions/scripts/process-deletions.js:57`, `frontend/src/ui/auth.js:187`

**Evidence:**

```text
if (userOid) {
    await getDeletions().items.upsert({ id: userOid, requestedAt: new Date().toISOString() });
  }
```

**Description.** DeleteAccount wipes Cosmos and blobs immediately. The Entra identity is only queued, and is deleted at the next 03:00 UTC run. Until then the user's existing access/refresh tokens and sign-in keep working, e.g. on another device or a PWA tab that calls refreshUser() -&gt; GET /api/me on load. GetMe recreates the user doc with name/email (GetMe/index.js:16-19), and uploads create new tours/blobs. process-deletions.js only deletes the Entra user and never touches Cosmos/Blob, so anything recreated in that window stays forever, and once the identity is gone no one can delete it. If the token has no `oid`, the Entra deletion is skipped silently while the API still returns 204.

**Impact.** A user who invoked GDPR erasure can end up with name, email and possibly GPS tracks retained indefinitely without an owner. This is a compliance and privacy failure under ordinary multi-device use.

**Recommendation.** Record the deletion keyed by the `sub`/userId as well as the oid, and have the API reject (401/410) any request whose sub is in the pending-deletions set. Have process-deletions also purge Cosmos/Blob data for that userId after deleting the Entra user. Return an error, or at least log, when oid is missing instead of silently skipping.

**Verification.** confirmed, severity → medium. DeleteAccount/index.js:41-55 wipes data immediately but only queues the oid. The Entra user stays valid until the daily job (process-deletions.yml:8), and only the deleting device signs out (profile.js:139-144). Meanwhile GetMe/index.js:16-19 recreates the user doc on any other device or tab, and process-deletions.js:57-66 never touches Cosmos/Blob, so recreated data is orphaned; a missing oid silently skips the queue (:41).

### SEC-06: No per-user quotas or rate limiting on uploads: any self-registered account can drive unbounded cost

- **Severity (reviewer):** medium
- **Category:** abuse · **Effort:** M · **Confidence:** medium
- **Location:** `functions/src/UploadTour/index.js:86`
- **Also:** `infrastructure/functions.tf:26`, `functions/src/UploadImage/index.js:52`, `infrastructure/budget.tf:1`

**Evidence:**

```text
await blockBlob.uploadData(file.buffer, {
    blobHTTPHeaders: { blobContentType: 'application/gpx+xml' },
  });
```

**Description.** UploadTour accepts an unlimited number of 10 MB GPX uploads per user, and each one is parsed on a 2 GB instance for ~1-3 s (200k points = 1.5 s in probe). The raw file is stored plus a Cosmos doc of up to 5,000 points. UploadImage allows 20 photos per tour, but the check (line 52) is a read-then-patch TOCTOU that concurrent uploads can overshoot, and the number of tours is unbounded. There is no API rate limiting (no APIM/Front Door), Entra External ID allows self-service sign-up, maximum\_instance\_count is 40 x 2048 MB, and the budget resource only sends email alerts.

**Impact.** A single free account running a script can drive Functions GB-s, Cosmos RU and storage far past the ~EUR5/month target: roughly 40 instances x 2 GB running flat out is on the order of several EUR/hour once the free grant is gone. It can also fill storage with junk.

**Recommendation.** Add per-user quotas (max tours, max total bytes, uploads per hour) checked against a counter on the user doc. Lower maximum\_instance\_count to what the user base needs (e.g. 5-10). Consider an action group that stops or scales the app when the budget fires. Enforce the 20-photo limit atomically (a conditional patch with a filter predicate on ARRAY\_LENGTH, or an ETag).

**Verification.** confirmed, severity → medium. UploadTour/index.js:29-95 has no per-user count, byte or rate limit (only the 10 MB per-file cap, parseMultipart.js:6). functions.tf:25-26 allows 40 x 2048 MB instances, and budget.tf:15-30 only emails. The 20-photo check at UploadImage/index.js:52 is a TOCTOU that duplicates SEC-G05. Cost math checks out: 80 GB x 3600 s x ~$0.000026 is about $7.5/h at full scale-out, but sustaining it needs heavy upload bandwidth.

### SEC-07: Tour name taken from the GPX file bypasses name validation (type, stripHtml, 200-char limit)

- **Severity (reviewer):** medium
- **Category:** input-validation · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/UploadTour/index.js:64`
- **Also:** `functions/src/lib/parseGpx.js:142`, `functions/src/GetTour/index.js:47`, `frontend/src/lib/tours.js:10`

**Evidence:**

```text
name: metaParsed.data.name ?? parsed.name ?? 'Untitled Tour',
```

**Description.** When the upload has no ?name= (the user clears the field), the name comes straight from `gpx.metadata?.name || tracks[0]?.name` (parseGpx.js:142). It never goes through nameSchema. fast-xml-parser returns numbers for numeric text, objects for elements with children/attributes, and decoded entities. Probes: `<name>12345</name>` -&gt; number, `<name><b>x</b></name>` -&gt; object, `&lt;img ...&gt;` -&gt; '&lt;img src=x onerror=alert(1)&gt;', a 5 MB name is accepted. GetTour then crashes on `(tour.name || 'tour').replace` (probe: TypeError -&gt; 500) for every later request. The frontend's name sort/search call .localeCompare/.toLowerCase on the value and throw. XSS is not reachable because every name sink uses textContent.

**Impact.** A realistic GPX (many devices name tracks with a date such as 20240512) makes that tour's detail, GPX download and photo endpoints return 500 permanently and breaks list sort/search for the user. Unbounded names also bloat every list and export response.

**Recommendation.** Run the GPX-derived name through the same schema: `nameSchema.safeParse(String(parsed.name ?? ''))`, falling back to 'Untitled Tour' when it fails. Coerce and truncate in parseGpx (only accept string/number, take '#text' for objects). Make GetTour defensive with String(tour.name ?? 'tour').

**Verification.** partially-confirmed, severity → low. Reproduced: parseGpx.js:142 returns number 20240512 for `<name>20240512</name>` and {b:'x'} for nested markup. UploadTour/index.js:64 stores it without nameSchema, and GetTour/index.js:47 then throws `TypeError: (r.name || "tour").replace is not a function`. But upload-modal.js:69 pre-fills the name from the filename, so this path needs the user to clear the field or call the API directly. It is also not permanent: the tour can be renamed through openEdit, which reads the list data (tour-detail.js:112-119), or deleted from the sidebar (sidebar.js:234).

### SEC-G01: CI service principal is Contributor on the whole subscription and is reused by the daily deletion job; cost alert only watches the app resource group

- **Severity (reviewer):** medium
- **Category:** least-privilege · **Effort:** M · **Confidence:** medium
- **Location:** `docs/how-to/infrastructure.md:47`
- **Also:** `.github/workflows/process-deletions.yml:28`, `infrastructure/budget.tf:3`, `.github/workflows/deploy.yml:18`

**Evidence:**

```text
az ad sp create-for-rbac --name bikebuddy-ci --role Contributor \
  --scopes /subscriptions/<SUB_ID>
```

**Description.** The documented (and only) CI identity gets Contributor at subscription scope. The same ARM\_CLIENT\_SECRET is used by deploy.yml, destroy.yml and the scheduled process-deletions.yml job (.github/workflows/process-deletions.yml:28 azure/login with the same secrets). That job only needs to read one Cosmos key, but it runs with full subscription Contributor. The only cost guard rail is azurerm\_consumption\_budget\_resource\_group scoped to bikebuddy-rg (infrastructure/budget.tf:3), so resources created elsewhere in the subscription with this SP raise no alert. SEC-02 and SEC-03 cover how the secret can leak. This finding is about how much a leaked secret can do.

**Impact.** Any leak of ARM\_CLIENT\_SECRET (the SEC-02/SEC-03 paths: a compromised auto-merged dependency, or unpinned global npm tooling in a job that holds the secret) gives the attacker the whole subscription, not just BikeBuddy. They can read every Cosmos/Storage key and all users' GPS tracks and photos. They can also run compute such as crypto-mining VMs in a new resource group that the RG-scoped €5 budget never sees.

**Recommendation.** Pre-create bikebuddy-rg and scope the deploy SP's Contributor to that RG, plus Storage Blob Data Contributor on the tfstate container only. Better still, switch to GitHub OIDC federated credentials (azure/login with client-id and no secret, bound to environment 'production'). Give process-deletions.yml its own identity with only Microsoft.DocumentDB/databaseAccounts/listKeys on the Cosmos account, or a Cosmos data-plane role on the 'deletions' container. Add a subscription-scoped budget alert.

**Verification.** partially-confirmed, severity → low. docs/how-to/infrastructure.md:47-48 documents `--role Contributor --scopes /subscriptions/<SUB_ID>`, and the same SP is reused by process-deletions.yml:28-34, which only needs `az cosmosdb keys list` (delete-users.sh:10-12). budget.tf:3-5 is RG-scoped. This is real, but it only widens the damage after the secret leaks through SEC-02/03. An RG-scoped SP would expose the same user data, so it is least-privilege hardening rated low.

### SEC-08: Access-token checks accept any token for the audience: no scp/token-type check, so ID tokens work as API tokens

- **Severity (reviewer):** low
- **Category:** auth · **Effort:** S · **Confidence:** medium
- **Location:** `functions/src/middleware/authMiddleware.js:96`
- **Also:** `scripts/infrastructure/generate-config.sh:9`

**Evidence:**

```text
const payload = await verifyJwt(token, key.getPublicKey(), {
      audience: process.env.ENTRA_CLIENT_ID,
      issuer,
      algorithms: ['RS256'],
    });
```

**Description.** The SPA and the API share one app registration: ENTRA\_CLIENT\_ID is both the SPA clientId (generate-config.sh) and the API audience. A v2 ID token issued to the SPA has aud = ENTRA\_CLIENT\_ID, the same issuer and RS256, so the API accepts it as a bearer token. Nothing checks that `scp` contains 'access\_as\_user', and nothing rejects app-only tokens (no scp, roles only) issued for the same audience.

**Impact.** Token-confusion hardening gap. ID tokens are handled more loosely (logged in URLs such as id\_token\_hint, stored in the MSAL cache), and they become API credentials for that user. No cross-user impact.

**Recommendation.** Require `payload.scp?.split(' ').includes('access_as_user')` (and optionally payload.ver === '2.0' and the expected tid). Reject tokens without scp.

**Verification.** confirmed, severity → low. authMiddleware.js:96-100 checks only audience = ENTRA\_CLIENT\_ID, the metadata issuer and RS256, with no scp/token-type check. The same client id is both the SPA clientId (auth.js:88) and the API audience (generate-config.sh:11-12, api://&lt;clientId&gt;/access\_as\_user), so a v2 ID token for that client passes. The impact stays within the same user.

### SEC-09: Key-based auth everywhere: account keys in plain app settings, account-key SAS, no managed identity, no blob recovery

- **Severity (reviewer):** low
- **Category:** secrets-management · **Effort:** M · **Confidence:** high
- **Location:** `infrastructure/functions.tf:29`
- **Also:** `infrastructure/functions.tf:21`, `infrastructure/functions.tf:31`, `functions/src/lib/blobStorage.js:10`, `infrastructure/storage.tf:4`

**Evidence:**

```text
COSMOS_CONNECTION_STRING = "AccountEndpoint=${azurerm_cosmosdb_account.main.endpoint};AccountKey=${azurerm_cosmosdb_account.main.primary_key};"
```

**Description.** The Cosmos primary (master) key and the storage primary connection string are plain Function app settings (no Key Vault references, no managed identity or RBAC). The Flex deployment storage also uses the account key (line 21). SAS URLs are signed with the account key (blobStorage.js generateSasUrl), so a leaked SAS can only be revoked by rotating the key that also runs the app. Shared-key access and Cosmos local auth stay enabled, and blob soft delete/versioning is not configured.

**Impact.** Anyone who obtains the app settings, the TF state, or a Contributor-level credential (see SEC-02) gets permanent full read/write/delete on all users' data, with no recovery for deleted blobs.

**Recommendation.** Give the Function app a system-assigned identity with 'Storage Blob Data Contributor' and a Cosmos DB built-in data-contributor role. Use user-delegation SAS. Set shared\_access\_key\_enabled=false and local\_authentication\_disabled=true. Enable blob soft delete (7-14 days).

**Verification.** confirmed, severity → low. functions.tf:29 puts the Cosmos primary key in COSMOS\_CONNECTION\_STRING, :31 the storage primary connection string, and :20-21 uses the account key for deployment storage. blobStorage.js:9-20 signs SAS with the account key from BLOB\_CONNECTION\_STRING. storage.tf:1-25 has no delete\_retention\_policy/versioning and no shared\_access\_key\_enabled=false.

### SEC-10: Production CORS allows <http://localhost:4280> and the Function app does not enforce HTTPS

- **Severity (reviewer):** low
- **Category:** infra-hardening · **Effort:** S · **Confidence:** high
- **Location:** `infrastructure/functions.tf:47`
- **Also:** `infrastructure/storage.tf:18`

**Evidence:**

```text
"http://localhost:4280",
```

**Description.** Both the production Function app CORS and the storage CORS (storage.tf:18) allow the plain-HTTP dev origin <http://localhost:4280>, and storage exposes all headers. azurerm\_function\_app\_flex\_consumption sets no https\_only = true, so the API also answers over HTTP. Basic-auth publishing is left at its default.

**Impact.** Small today, because auth is a bearer header rather than cookies. But any local process serving on :4280 is a trusted origin for the prod API, and a mistyped http:// base URL would send tokens in cleartext.

**Recommendation.** Remove localhost from the prod CORS lists (use a dev-only variable). Set https\_only = true and webdeploy\_publish\_basic\_authentication\_enabled = false on the Function app.

**Verification.** confirmed, severity → low. functions.tf:47 and storage.tf:18 allow <http://localhost:4280> in production CORS, and the Function app resource (functions.tf:10-51) sets no https\_only. The impact is minimal because auth is a bearer header and functions\_url is emitted as https (outputs.tf:3).

### SEC-11: CSP allows wildcard Azure hosts and a plaintext localhost emulator in production

- **Severity (reviewer):** low
- **Category:** csp · **Effort:** S · **Confidence:** high
- **Location:** `frontend/src/index.html:14`

**Evidence:**

```text
connect-src 'self' https://*.ciamlogin.com https://login.microsoftonline.com https://*.azurewebsites.net https://*.blob.core.windows.net http://127.0.0.1:10000
```

**Description.** connect-src and img-src allow any \*.azurewebsites.net and \*.blob.core.windows.net host, both of which any Azure customer can register, plus the Azurite emulator <http://127.0.0.1:10000>. style-src includes 'unsafe-inline'. The deploy uploads frontend/src unchanged, so the dev entries ship to production.

**Impact.** script-src 'self' holds, so this does not create an injection. It does mean an injected script, e.g. from another nobuddy.org page (see SEC-12), could send tokens and GPS data to attacker-owned Azure endpoints without breaking the CSP.

**Recommendation.** Have generate-config (or a small deploy step) write the exact API host and storage account host into the CSP, and drop 127.0.0.1:10000 in the production build.

**Verification.** confirmed, severity → low. The CSP at index.html:14 allows <https://*.azurewebsites.net>, <https://*.blob.core.windows.net> and <http://127.0.0.1:10000> in img-src/connect-src, plus style-src 'unsafe-inline'. deploy.yml:112-115 uploads frontend/src unchanged; generate-config.sh only writes config.js. script-src 'self' still holds, so this is exfiltration-only hardening.

### SEC-12: MSAL tokens (incl. refresh token) in localStorage on an origin shared with every other nobuddy.org Pages site

- **Severity (reviewer):** low
- **Category:** token-storage · **Effort:** M · **Confidence:** medium
- **Location:** `frontend/src/ui/auth.js:94`

**Evidence:**

```text
cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: false },
```

**Description.** The app is served at <https://nobuddy.org/BikeBuddy/>. A GitHub Pages custom domain serves all of the org's project sites under the same origin, which shares localStorage and satisfies script-src 'self'. MSAL keeps its access and refresh tokens in localStorage, so any script running on any nobuddy.org path can read them.

**Impact.** An XSS or a compromised dependency in any other repo published on nobuddy.org becomes a full BikeBuddy account takeover, exposing location history and photos. Needs a second weakness, hence low.

**Recommendation.** Serve BikeBuddy from its own origin (e.g. bikebuddy.nobuddy.org), or use sessionStorage/in-memory caching. Also keep script-src restricted to the app's own path where possible.

**Verification.** confirmed, severity → low. auth.js:94 uses cacheLocation 'localStorage' (MSAL 3.x stores refresh tokens in plaintext there), and the app lives at a path on the shared nobuddy.org origin. Exploiting it needs a second weakness in another same-origin Pages site, so low is right.

### SEC-13: Service worker serves app JS cache-first and only updates on a manual CACHE\_NAME bump, so security fixes may never reach installed clients

- **Severity (reviewer):** low
- **Category:** update-propagation · **Effort:** S · **Confidence:** high
- **Location:** `frontend/src/sw.js:10`
- **Also:** `frontend/src/sw.js:122`

**Evidence:**

```text
const CACHE_NAME = 'bikebuddy-shell-v9';
```

**Description.** All precached modules (app.js, ui/\*.js, config.js, the vendored MSAL/Leaflet) are served with `caches.match(request).then((cached) => cached || fetch(request))`. A deploy that changes only app code, and not sw.js, leaves installed PWAs running the old JavaScript indefinitely. Nothing in CI checks that CACHE\_NAME was bumped.

**Impact.** A frontend security fix, or a config.js change such as a new API host or CSP-relevant setting, can silently fail to reach existing users.

**Recommendation.** Generate CACHE\_NAME from the commit SHA or a content hash at deploy time (e.g. in generate-config.sh), or switch JS/config.js to stale-while-revalidate.

**Verification.** confirmed, severity → low. sw.js:122 serves precached subresources cache-first. Only navigations are network-first (:111-118), and invalidation depends on the manual CACHE\_NAME bump at sw.js:10. No CI or script references CACHE\_NAME (grep finds only sw.js and the PRECACHE test), so app.js and config.js changes can stay stale on returning clients.

### SEC-14: Unpinned tooling in privileged/CI paths: OpenTofu provider lock file gitignored; opengrep installed via curl|bash from main

- **Severity (reviewer):** low
- **Category:** supply-chain · **Effort:** S · **Confidence:** high
- **Location:** `.gitignore:73`
- **Also:** `.pre-commit-config.yaml:161`

**Evidence:**

```text
infrastructure/.terraform.lock.hcl
```

**Description.** With .terraform.lock.hcl ignored, every `tofu init` in deploy/destroy downloads whatever azurerm ~&gt;4.0 / random ~&gt;3.6 build is newest, with no hash pinning. The provider binary then runs with ARM\_CLIENT\_SECRET and the state key. The pre-commit OpenGrep hook runs `curl -fsSL https://raw.githubusercontent.com/opengrep/opengrep/main/install.sh ... && bash` in the CI prek job.

**Impact.** A compromised provider release, or the opengrep install script, runs code in CI. The provider does so with subscription credentials.

**Recommendation.** Commit .terraform.lock.hcl (run `tofu providers lock` for linux\_amd64/darwin) and let Dependabot's terraform ecosystem bump it. Pin opengrep to a release tag and verify its checksum.

**Verification.** confirmed, severity → low. .gitignore:73 ignores infrastructure/.terraform.lock.hcl, and infrastructure/ has no lock file, so provision.sh:10 and destroy.yml:37 `tofu init` resolve providers fresh in jobs that hold ARM secrets. The opengrep curl|bash at .pre-commit-config.yaml:161 runs in gate.yml's prek job (:16-43), which has no secrets, so that half is lower impact.

### SEC-15: GDPR export omits the uploaded GPX files and photos and returns unusable raw blob URLs

- **Severity (reviewer):** low
- **Category:** privacy · **Effort:** M · **Confidence:** high
- **Location:** `functions/src/ExportData/index.js:19`

**Evidence:**

```text
const [userDoc, tours] = await Promise.all([
    readItem(getUsers(), userId, userId),
    queryUserItems(getTours(), userId, 'SELECT * FROM c WHERE c.userId = @userId'),
  ]);
```

**Description.** The export has only the user doc and tour documents: heatmapData downsampled to 5,000 points, image metadata with blobName/lat/lon, and gpxFileUrl as the raw unsigned blob URL, which returns 403. It does not include the original GPX files or the photos, even though these are the data the subject provided.

**Impact.** Data-portability requests are only partly met. Users must download each GPX by hand, and photos cannot be bulk-exported.

**Recommendation.** Include signed download URLs (longer TTL) for every GPX and image in the export, or produce a zip of the blobs. At minimum, document the scope in the UI.

**Verification.** confirmed, severity → low. ExportData/index.js:19-27 returns only the user doc and the `SELECT *` tour docs. gpxFileUrl there is the unsigned blockBlob.url (UploadTour/index.js:66) on a private container, and no GPX or photo blobs or signed URLs are included.

### SEC-16: IaC/code drift: the photo container the code uses ('tour-images') is not managed by OpenTofu

- **Severity (reviewer):** low
- **Category:** iac-drift · **Effort:** S · **Confidence:** high
- **Location:** `infrastructure/storage.tf:33`
- **Also:** `functions/src/lib/blobStorage.js:35`

**Evidence:**

```text
resource "azurerm_storage_container" "images" {
  name                  = "images"
```

**Description.** OpenTofu creates a private container named 'images', but blobStorage.js uses `containerOnce('tour-images')`, which the app creates at runtime with createIfNotExists() (private by default). The container holding all photos is therefore outside IaC, and the managed 'images' container is unused.

**Impact.** No exposure today (SDK default is private). But any future IaC hardening of the images container (immutability, lifecycle, access level) would apply to the wrong container, and the real one's configuration cannot be reviewed from the repo.

**Recommendation.** Rename the TF resource's container to 'tour-images', or point the code at 'images' and migrate. Drop runtime createIfNotExists in prod so a typo cannot create a new container.

**Verification.** confirmed, severity → low. storage.tf:33-34 manages a container named 'images', but blobStorage.js:35 (and backfillImageThumbnails.js:57, cost-report.md:91) use 'tour-images', which is created at runtime via createIfNotExists (blobStorage.js:25-27). The IaC container is unused.

### SEC-17: Vendored MSAL Browser 3.28.1 (Jan 2025) is outside any automated update path

- **Severity (reviewer):** low
- **Category:** dependencies · **Effort:** S · **Confidence:** medium
- **Location:** `frontend/src/vendor/.msal-source:1`
- **Also:** `frontend/src/vendor/.leaflet-source:1`, `.github/dependabot.yml:26`

**Evidence:**

```text
https://cdn.jsdelivr.net/npm/@azure/msal-browser@3.28.1/lib/msal-browser.min.js
```

**Description.** The auth library is vendored at a 20-month-old major line; the header reads '@azure/msal-browser v3.28.1 2025-01-14'. Dependabot covers npm only in /functions, so vendored MSAL and Leaflet (1.9.4) never get update PRs. I know of no CVE against 3.28.1; the concern is missed future security fixes in the component that handles tokens.

**Impact.** Security fixes to token handling are not picked up automatically.

**Recommendation.** Track msal-browser/leaflet as frontend package.json dependencies (copied into vendor/ by a script with checksum verification) so Dependabot raises PRs, and plan the move to the current msal-browser major.

**Verification.** confirmed, severity → low. vendor/.msal-source:1 pins msal-browser@3.28.1 (the file header reads 'v3.28.1 2025-01-14') and .leaflet-source pins leaflet 1.9.4. dependabot.yml:17-18 covers npm only in /functions, so nothing raises update PRs for the vendored libraries. No known CVE was identified.

### SEC-G02: Deletion job blindly deletes any directory object id found in the Cosmos 'deletions' container, contradicting the documented privilege boundary

- **Severity (reviewer):** low
- **Category:** privilege-separation · **Effort:** S · **Confidence:** high
- **Location:** `functions/scripts/process-deletions.js:48`
- **Also:** `docs/explanation/design-decisions.md:53`, `infrastructure/functions.tf:29`

**Evidence:**

```text
const { resources } = await container.items.query('SELECT c.id FROM c').fetchAll();
...
const res = await fetch(`https://graph.microsoft.com/v1.0/users/${oid}`, {
    method: 'DELETE',
```

**Description.** design-decisions.md:52-56 says keeping the User.ReadWrite.All credential in CI 'means a compromise of the web app can't delete arbitrary users' and that 'the job only ever deletes ids the API queued'. The code does not enforce that. The internet-facing Functions app writes the queue with the Cosmos account master key (infrastructure/functions.tf:29), so anything holding that key can upsert any id. The job then deletes it via Graph with no check that the id is a GUID, that it belongs to a BikeBuddy user, or that the matching users/tours data is actually gone. The id is also interpolated unencoded into the Graph URL path.

**Impact.** A compromise of the Functions app or of its COSMOS\_CONNECTION\_STRING can still delete any non-admin identity in the External ID tenant within 24 hours, which is the outcome the out-of-band design was meant to prevent. Admin roles and the 30-day recycle bin limit the damage, so this is rated low: it needs a prior compromise.

**Recommendation.** Have the job validate each id against a GUID regex. Only delete a user when the API recorded a verifiable request, for example a queue entry that also carries the Entra `sub` and a check that no users/{sub} document exists, or an HMAC over the oid using a key the Functions app doesn't hold. Consider having the job re-read the user from Graph and confirm the app-specific attribute before deleting. Correct the claim in design-decisions.md.

**Verification.** confirmed, severity → low. process-deletions.js:48-60 deletes every id in 'deletions' via an unencoded `/users/${oid}` with no GUID or ownership check. The Functions app writes that container with the master key (functions.tf:29), which contradicts design-decisions.md:53-56 ('a compromise of the web app can't delete arbitrary users'). It needs a prior app/key compromise, and the Entra recycle bin limits the damage, so low.

### SEC-G03: Entra identity deletion is only a soft delete: name/email stay in the directory recycle bin for 30 days

- **Severity (reviewer):** low
- **Category:** privacy · **Effort:** S · **Confidence:** medium
- **Location:** `functions/scripts/process-deletions.js:34`
- **Also:** `docs/explanation/design-decisions.md:46`

**Evidence:**

```text
const res = await fetch(`https://graph.microsoft.com/v1.0/users/${oid}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.status; // 204 deleted, 404 already gone (both terminal)
```

**Description.** In Entra, DELETE /users/{id} moves the user into deletedItems, where they can be restored for 30 days. The job treats 204 as terminal and removes the queue entry. It never calls DELETE /directory/deletedItems/{id}, so the identity (email, display name, sign-in identities) is kept for another 30 days. design-decisions.md says the job 'deletes those users from the External ID tenant'.

**Impact.** The GDPR erasure promised to users actually completes up to 30 days plus up to 24 hours after the request. This is doc/code drift on a privacy commitment, not a direct exposure.

**Recommendation.** After a 204 (or 404), also call DELETE <https://graph.microsoft.com/v1.0/directory/deletedItems/{oid}>. Keep the queue entry until that also returns 204 or 404, or document the 30-day retention in the privacy/security docs.

**Verification.** confirmed, severity → low. process-deletions.js:33-39 issues only DELETE /v1.0/users/{oid} and treats 204 as terminal, dropping the queue entry at :59-60. It never purges /directory/deletedItems, so the identity is kept soft-deleted for up to 30 days, while design-decisions.md:46-47 says the job 'deletes those users'. This is doc/code drift on the privacy commitment.

### SEC-G04: GPX parsing blocks the event loop for 2.5-4.8 s per 10 MB upload, stalling every other request on the instance

- **Severity (reviewer):** low
- **Category:** dos · **Effort:** M · **Confidence:** high
- **Location:** `functions/src/lib/parseGpx.js:136`
- **Also:** `functions/src/lib/parseMultipart.js:6`, `functions/src/UploadTour/index.js:52`

**Evidence:**

```text
const doc = parser.parse(gpxInput);
```

**Description.** The XML parser is well hardened: entity expansion, XXE, \_\_proto\_\_ and nesting depth are all refused, as verified in the scratchpad. But parsing is synchronous and runs on the request thread. The GPX size cap is the same 10 MB as photos (parseMultipart.js:6). Measured on crafted 10 MB inputs: 4382 ms for many empty tags, 4758 ms for 500k attributes, 3439 ms for many &lt;ele&gt; elements, 2551 ms for minimal trkpts. During that time the Node worker serves no other request on the instance, including JWT checks for other users. Flex runs many concurrent HTTP requests per instance.

**Impact.** One self-registered account uploading a handful of crafted 10 MB GPX files in parallel adds multi-second latency or timeouts for all users routed to the same instance, and pushes Flex scale-out and cost. It needs an account and deliberate abuse, and scale-out partly mitigates it, hence low. The cost side overlaps SEC-06 (no quotas). This finding is the event-loop blocking itself.

**Recommendation.** Give GPX its own smaller cap (for example 5 MB; real 1 Hz multi-hour tracks fit) separate from photos. Run parseGpx in a worker\_threads pool, or pre-scan and reject files whose tag count exceeds MAX\_POINTS by a large factor. Add per-user rate limiting as proposed for SEC-06.

**Verification.** confirmed, severity → low. parseGpx.js:136 is a synchronous `parser.parse` on up to 10 MB (parseMultipart.js:6). I re-measured with /tmp/.../scratchpad/verify-sec/probe-time.js: 10 MB of minimal trkpts took 2637 ms and trkpts with empty child tags took 3538 ms, which blocks the event loop for other requests on the instance. It needs deliberate abuse by a signed-in user, so low.

### SEC-G05: Per-tour 20-photo cap is a non-atomic check-then-append and can be bypassed with concurrent uploads

- **Severity (reviewer):** low
- **Category:** business-logic · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/UploadImage/index.js:52`
- **Also:** `functions/src/UploadImage/index.js:88`

**Evidence:**

```text
if ((tour.images || []).length >= MAX_TOUR_IMAGES) {
    return error(400, 'This tour already has the maximum of 20 photos.');
  }
```

**Description.** The count is read from the tour snapshot loaded before multipart parsing, resizing and blob upload. The append at line 88 is an unconditional Cosmos patch `{ op: 'add', path: '/images/-' }` with no filter predicate or ETag. Every request that starts while the count is below 20 therefore succeeds.

**Impact.** A user can attach far more than 20 photos to a tour, each adding two blobs and one array entry, until the 2 MB document limit. The cap is the only per-resource storage bound in the API, so it can't be relied on. Impact is limited to cost and the attacker's own documents.

**Recommendation.** Make the append conditional. Use a patch with a filter predicate (`FROM c WHERE ARRAY_LENGTH(c.images) < 20`) or an IfMatch on the \_etag read with the tour, and delete the uploaded blobs when the precondition fails (412).

**Verification.** confirmed, severity → low. UploadImage/index.js:52 checks the count on the snapshot loaded by loadOwnedTour before parse, resize and upload, then :88 appends with an unconditional `op:'add', path:'/images/-'` patch with no filter predicate or ETag, so concurrent requests overshoot 20. The impact is limited to the attacker's own doc and storage cost, and it duplicates the TOCTOU part of SEC-06.

### SEC-G06: GetMe stores unvalidated token name/email and overwrites the user's chosen profile name on every load

- **Severity (reviewer):** low
- **Category:** input-validation · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/GetMe/index.js:20`
- **Also:** `functions/src/GetMe/index.js:18`, `functions/src/UpdateProfile/index.js:47`

**Evidence:**

```text
} else if ((userName && userName !== doc.name) || (userEmail && userEmail !== doc.email)) {
    ...
    doc.name = userName || doc.name;
    doc.email = userEmail || doc.email;
    ({ resource: doc } = await container.items.upsert(doc));
```

**Description.** UpdateProfile enforces nameSchema (strip &lt; &gt;, 1-200 characters) because 'BikeBuddy owns' the display name (UpdateProfile/index.js:18-19). GetMe instead writes the token's `name` claim, which the user controls at External ID sign-up, with no validation and no length limit (lines 18 and 23). It does this on every GET /api/me whenever the claim differs from the stored name. A user who renames themselves in the app therefore has the name silently reverted on the next page load (refreshUser in frontend/src/ui/auth.js calls /api/me on every sign-in render).

**Impact.** Stored profile data bypasses the server's own validation, and a profile edit doesn't stick (an integrity/UX defect). There is no XSS, because the frontend renders names with textContent/title only, and the impact stays within the user's own account.

**Recommendation.** Only seed name/email from claims when the document is created or the stored field is empty. Never overwrite a name the user set via PATCH. Run token-derived values through nameSchema, or truncate and strip them, before storing.

**Verification.** confirmed, severity → low. GetMe/index.js:20-25 overwrites doc.name with the token name claim whenever they differ, with no nameSchema. UpdateProfile/index.js:18-19,47 says BikeBuddy owns the name and validates it, and auth.js:182,187-191 calls /api/me on every signed-in render. A profile rename is therefore reverted whenever the token carries a different `name`. The impact is limited to the user's own data, and names render as text only.

### SEC-G07: Account-deletion workflow logs into Azure before `npm ci` runs dependency install scripts, putting the ARM session and later the Graph secret within reach of any compromised dependency

- **Severity (reviewer):** low
- **Category:** ci-cd · **Effort:** S · **Confidence:** high
- **Location:** `.github/workflows/process-deletions.yml:28`
- **Also:** `.github/workflows/process-deletions.yml:37`, `.github/workflows/process-deletions.yml:45`

**Evidence:**

```text
- uses: azure/login@a641126d1b8aa4d1fa005f4f92df94a3a4c4c906 # v3.1.0
...
        run: npm ci
        working-directory: functions
...
          GRAPH_CLIENT_SECRET: ${{ secrets.GRAPH_CLIENT_SECRET }}
```

**Description.** azure/login (line 28) writes an az CLI session for the subscription-Contributor SP to ~/.azure. Then `npm ci` (line 37) installs the full production and dev tree from functions/package-lock.json with lifecycle scripts enabled. A malicious version of any package (Dependabot PRs are auto-merged, SEC-03) runs its install script with that session. It can also patch node\_modules/@azure/cosmos, which process-deletions.js requires in the next step, where GRAPH\_CLIENT\_SECRET (tenant-wide User.ReadWrite.All) is in the environment. This runs daily on a schedule, with no deploy or review needed. SEC-02 covers deploy.yml's workflow-level env; this is a separate workflow with a separate, more privileged Graph secret.

**Impact.** A supply-chain compromise of any functions dependency leads within 24 hours to theft of the Graph user-admin credential for the External ID tenant and of an Azure subscription session.

**Recommendation.** Run `npm ci --omit=dev --ignore-scripts` (the script needs only @azure/cosmos). Move azure/login after the install, or fetch the Cosmos key in a separate job and pass it along. Use OIDC federation instead of client secrets, and a dedicated least-privilege identity (see SEC-G01).

**Verification.** confirmed, severity → low. process-deletions.yml:28-34 runs azure/login (writing the az session for the SP) before `npm ci` with lifecycle scripts at :36-38. The next step (:40-45) has GRAPH\_CLIENT\_SECRET in its environment and loads @azure/cosmos from that node\_modules (process-deletions.js:11). The root cause largely overlaps SEC-03 (auto-merged deps reaching privileged jobs), but the fix (--ignore-scripts / --omit=dev, log in after install) is distinct.

### SEC-G08: No security telemetry in production: host.json configures Application Insights but no connection string is deployed

- **Severity (reviewer):** low
- **Category:** logging-monitoring · **Effort:** S · **Confidence:** high
- **Location:** `infrastructure/functions.tf:28`
- **Also:** `functions/host.json:4`, `functions/src/middleware/authMiddleware.js:115`

**Evidence:**

```text
app_settings = {
    COSMOS_CONNECTION_STRING = ...
    ...
    SKIP_AUTH              = var.entra_client_id == "" ? "true" : "false"
  }
```

**Description.** host.json:4 sets up applicationInsights sampling, but infrastructure/\*.tf creates no Application Insights or Log Analytics resource and sets no APPLICATIONINSIGHTS\_CONNECTION\_STRING. The only security-relevant signals the code emits are console.warn/error lines for rejected tokens, JWKS failures and malformed multipart (authMiddleware.js:88, 112, 115; parseMultipart.js:63). In production they go nowhere persistent.

**Impact.** Attacks in this review can't be detected or investigated after the fact: the JWKS rate-limit exhaustion (SEC-01), token-guessing or upload abuse (SEC-06, SEC-G04, SEC-G05). There is no audit trail of account deletions or exports for GDPR accountability.

**Recommendation.** Add a workspace-based azurerm\_application\_insights (the free tier fits the cost target) and wire APPLICATIONINSIGHTS\_CONNECTION\_STRING. Log only userId and event type, never tokens or coordinates. Add an alert on the 'auth: unable to verify token' error rate and on 5xx spikes.

**Verification.** confirmed, severity → low. host.json:3-9 configures applicationInsights sampling, but no tf file defines App Insights or Log Analytics, and functions.tf:28-38 app\_settings (TF-managed, so manual additions get reverted) lack APPLICATIONINSIGHTS\_CONNECTION\_STRING. The auth warnings at authMiddleware.js:88,112,115 therefore are not persisted anywhere.

### SEC-18: Dev-only npm audit findings (brace-expansion high, qs moderate) via Stryker

- **Severity (reviewer):** info
- **Category:** dependencies · **Effort:** S · **Confidence:** high
- **Location:** `functions/package.json:34`

**Evidence:**

```text
"@stryker-mutator/core": "^10.0.0",
```

**Description.** npm audit (dev included) reports brace-expansion 5.0.7 (GHSA-mh99-v99m-4gvg, GHSA-rgw5-rvv9-x895) and qs 6.15.3 via typed-rest-client. npm ls shows both come only through @stryker-mutator/core. `npm audit --omit=dev` is clean, and frontend/e2e audits are clean.

**Impact.** Not reachable in production. At most a local/CI mutation-testing DoS.

**Recommendation.** Run `npm audit fix` when convenient; no urgency.

### SEC-G09: Verified positives: parser and upload hardening hold, EXIF is stripped, and the vendored libraries match upstream byte for byte

- **Severity (reviewer):** info
- **Category:** positive · **Effort:** S · **Confidence:** high
- **Location:** `functions/src/lib/parseGpx.js:101`
- **Also:** `functions/src/lib/resizeImage.js:21`, `frontend/src/vendor/.msal-source:1`, `functions/src/lib/ownedTour.js:18`

**Evidence:**

```text
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
```

**Description.** Checked with crafted inputs:

- fast-xml-parser 5.11.1 defaults refuse external entities, cap entity size at 10000, don't expand nested entity references, reject \_\_proto\_\_ tag names, and enforce a nesting limit.
- resizeImage/resizeThumbnail output has no EXIF/XMP/ICC; extractGps still reads GPS from the original.
- Every tour-scoped handler validates UUIDs and reads with the caller's partition key.
- Every function except Health authenticates.
- Frontend user data reaches the DOM only via textContent, attributes or property writes; data-i18n-html uses static locale strings only.
- The vendored msal-browser.min.js (sha256 81fc17a8...) and leaflet.js (sha256 db49d009...) are identical to the npm 3.28.1 and 1.9.4 tarballs.
- npm audit --omit=dev (functions) and npm audit (frontend) report 0 vulnerabilities.
- No real secrets are in the tree or history; only the public Cosmos emulator key appears.

**Impact.** None; recorded so the lead reviewer can rule out duplicate claims in these areas.

**Recommendation.** Keep the fast-xml-parser defaults. If processEntities or DOCTYPE options are ever changed, add explicit maxEntitySize/maxNestedTags regression tests.

## Second-pass disputes of first-pass findings

The independent second pass checked the first pass's findings against the code. Where it disagreed on the facts or the rating, it recorded a dispute:

- **SEC-01**, suggested severity **high**: Confirmed, with a clarification so the severity isn't challenged later. jwks-rsa wraps the rate limiter inside the cache (node\_modules/jwks-rsa/src/JwksClient.js: rateLimit wrapper applied first, cache wrapper second). Legitimate tokens whose kid is cached (cacheMaxEntries=5, cacheMaxAge=600000 ms in wrappers/cache.js) keep working for up to 10 minutes. Unknown-kid tokens are never cached and each consumes a limiter token (10/min). Once the attacker keeps the bucket empty, every legitimate refresh after TTL expiry, and every cold Flex instance, throws JwksRateLimitError. That error is not in CLIENT\_TOKEN\_ERRORS (authMiddleware.js:64-69), so it becomes a 500. The outage is therefore delayed by up to 10 minutes per instance rather than immediate, but it is sustained and unauthenticated. High stands.
- **SEC-07**, suggested severity **medium**: Confirmed and slightly worse than the title implies, so keep medium. GPX files are routinely downloaded from third-party route sites, so the victim uploads the crafted file themselves. Probe: `<name a="1">x</name>` makes parsed.name the object {"#text":"x","@\_a":"1"}. fast-xml-parser also turns a numeric name such as &lt;name&gt;2024&lt;/name&gt; into a Number. Both reach frontend code that assumes a string: frontend/src/lib/tours.js:10 `(a.name || '').localeCompare(...)` and lib/tours.js:68 matchScore(q, tour.name || ''). A 10 MB &lt;name&gt; string makes the Cosmos create fail with a 500. No XSS, because the sinks are textContent.

## Coverage

<details><summary>Files and areas read</summary>

- functions/src/middleware/authMiddleware.js
- functions/src/lib/{http,db,ownedTour,blobStorage,parseGpx,parseMultipart,resizeImage,extractGps,validation,thumbBlobName,tourResponse,heatmapCache}.js
- functions/src/\*/index.js (all 13 function registrations: DeleteAccount, DeleteImage, DeleteTour, EditTour, ExportData, GetMapData, GetMe, GetTour, GetTours, Health, UpdateProfile, UploadImage, UploadTour)
- functions/scripts/{process-deletions,backfillImageThumbnails,backfillTourStats,init-cosmos}.js
- functions/host.json, functions/local.settings.json.example, functions/package.json
- functions/node\_modules/jwks-rsa/src/{JwksClient.js,wrappers/rateLimit.js,wrappers/cache.js} (to understand first-party usage only)
- frontend/src/index.html (CSP/head), 404.html, sw.js, config.js.example
- frontend/src/ui/{auth,router,routes,sidebar,tour-detail,profile,upload-modal,images,pins,confirm,toast,menus}.js
- frontend/src/lib/{i18n,url,sasCache,tours,upload}.js
- frontend/src/vendor/.leaflet-source, .msal-source, .archivo-source and version banners
- infrastructure/{main,variables,storage,functions,cosmos,outputs,budget}.tf
- .github/workflows/{deploy,gate,dependabot-auto-merge,process-deletions,destroy}.yml, .github/zizmor.yml, .github/dependabot.yml
- .pre-commit-config.yaml, .gitignore
- buddy.sh, scripts/infrastructure/\*.sh, scripts/maintenance/delete-users.sh, scripts/development/{setup,start-all,start-azurite}.sh
- e2e/serve.mjs
- docs/explanation/security.md, docs/reference/architecture.md (grep), docs/explanation/design-decisions.md (grep)
- functions/src/middleware/authMiddleware.js (re-read; also traced jwks-rsa JwksClient.js/wrappers cache+rateLimit ordering, cacheMaxEntries=5, cacheMaxAge=10min, to validate SEC-01)
- functions/src/\*/index.js: all 13 registrations re-checked for auth call, UUID param validation, partition-key use
- functions/src/lib/{ownedTour,db,blobStorage,validation,parseMultipart,parseGpx,resizeImage,extractGps,thumbBlobName,tourResponse,heatmapCache,http}.js
- functions/scripts/{process-deletions,backfillImageThumbnails}.js
- functions/package.json, host.json, local.settings.json.example, .gitignore (no .funcignore present)
- frontend/src/app.js (not read by pass 1), ui/map.js, ui/pins.js, ui/confirm.js, ui/toast.js, ui/auth.js, ui/profile.js, ui/router.js, lib/url.js, lib/upload.js, lib/i18n.js (data-i18n-html sinks), sw.js, 404.html, index.html CSP head
- frontend/src/vendor provenance: .leaflet-source/.msal-source/.archivo-source, byte-compared msal-browser.min.js and leaflet.js against npm registry tarballs
- infrastructure/{functions,storage,cosmos,main,outputs,variables,budget}.tf
- .github/workflows/{deploy,gate,process-deletions,dependabot-auto-merge,destroy}.yml, .github/zizmor.yml, .github/dependabot.yml, .pre-commit-config.yaml
- buddy.sh, scripts/infrastructure/{generate-config,publish-functions,provision,setup-state}.sh, scripts/development/{start-backend,start-cosmos,stop}.sh, scripts/maintenance/delete-users.sh
- e2e/global-setup.ts, e2e/playwright\*.config.ts
- docs/explanation/security.md, docs/explanation/design-decisions.md (GDPR deletion rationale), docs/how-to/infrastructure.md (CI SP setup), docs/reference/configuration.md/architecture.md (grep)
- git tree + history grep for committed secrets/config/state files

</details>

<details><summary>Commands and probes run</summary>

- git ls-files (excluding vendor/lockfiles): listed 252 tracked files to scope the review
- grep for innerHTML/insertAdjacentHTML/outerHTML/bindPopup/divIcon in frontend: only static markup, cleared containers, and first-party locale strings via data-i18n-html; all user data goes through textContent
- npm audit --omit=dev (functions): found 0 vulnerabilities
- npm audit (functions, incl. dev): 1 high (brace-expansion) + 2 moderate (qs, typed-rest-client). npm ls shows all come only through @stryker-mutator/core (dev only, not in production)
- npm audit (frontend, e2e): 0 vulnerabilities
- npm ls on runtime deps: fast-xml-parser 5.11.1, busboy 1.6.0, sharp 0.35.4, exif-reader 2.0.3, jsonwebtoken 9.0.3, jwks-rsa 4.1.0, zod 4.6.4
- scratchpad/security/gpx-probe.js (parseGpx with crafted GPX): entity-encoded HTML name -&gt; '&lt;img src=x onerror=alert(1)&gt;' kept verbatim; &lt;name&gt;12345&lt;/name&gt; -&gt; number; &lt;name&gt;&lt;b&gt;x&lt;/b&gt;&lt;/name&gt; -&gt; object; 5MB name accepted (811ms); XXE -&gt; 'External entities are not supported'; nested-entity 'billion laughs' not expanded ('&l9;'); \_\_proto\_\_ -&gt; rejected; 20k-deep nesting -&gt; 'Maximum nested tags exceeded'; 200k points -&gt; 1512ms, downsampled to 5001
- scratchpad/security/gettour-probe.js: GPX &lt;name&gt;20240512&lt;/name&gt; stored as number -&gt; GetTour throws 'TypeError (tour.name || "tour").replace is not a function'
- scratchpad/security/jwks-probe.js (real authenticate() + real jwksRsa({cache:true, rateLimit:true}) against a local JWKS server): 10 unauthenticated requests with junk kids, then a validly signed token -&gt; 'THROWS JwksRateLimitError Too many requests to the JWKS endpoint' (JWKS fetches: 10)
- scratchpad/security/img-probe.js: 100MP solid-colour PNG (311KB) / JPEG (586KB) through extractGps + 2x(resizeImage+resizeThumbnail) concurrently -&gt; PNG 609ms, peak RSS 366MB; JPEG 195ms, peak RSS 360MB (bounded, so not reported)
- git grep / git log -S for AccountKey=, connection strings, JWTs, private keys, client secrets: only the public Cosmos emulator key and templated ${...} values, no real secrets in the tree or history
- grep of console.\*/context.log in functions/src: only 4 log lines (auth rejection name/message, multipart parse error), no GPS/PII
- git ls-files; git grep -nIE 'AccountKey=|SharedAccessSignature|sig=...|client\_secret|-----BEGIN|ghp\_|eyJ...' (only the public Cosmos emulator key and IaC interpolations found); git log --all --name-only (no config.js/local.settings.json/tfstate ever committed)
- cd functions && npm ls fast-xml-parser jsonwebtoken jwks-rsa sharp busboy exif-reader zod ... -&gt; fast-xml-parser@5.11.1, jsonwebtoken@9.0.3, jwks-rsa@4.1.0, sharp@0.35.4, busboy@1.6.0
- cd functions && npm audit --omit=dev -&gt; found 0 vulnerabilities; cd frontend && npm audit -&gt; found 0 vulnerabilities
- scratchpad/sec2/gpx1.js (require functions/src/lib/parseGpx.js): billion-laughs -&gt; 'ok 7ms name:"&e9;"' (not expanded); SYSTEM entity -&gt; 'External entities are not supported'; 100KB entity -&gt; 'Entity "b" size (100000) exceeds maximum allowed size (10000)'; 1M nested tags -&gt; 'Maximum nested tags exceeded'; &lt;\_\_proto\_\_&gt; -&gt; '\[SECURITY\] Invalid name: "\_\_proto\_\_"...'; ({}).polluted -&gt; undefined; &lt;name a="1"&gt;x&lt;/name&gt; -&gt; name:{"#text":"x","@\_a":"1"}
- scratchpad/sec2/gpx3.js: 10 MB adversarial GPX parse times: emptytags 4382 ms, siblings-same 3523 ms, trkpt-min 2551 ms, 500k attrs (5.9MB) 4758 ms, entities-many 3028 ms, ele-many 3439 ms, longtext 2325 ms
- scratchpad/sec2/gpx2.js: 100k trkpt w/ ele+time (8.8MB) ok 1734 ms; node -e Math.min(...N): 125000 ok, 130000 'Maximum call stack size exceeded' (functional issue, left to QA)
- scratchpad/sec2/img1.js: 10000x9999 PNG = 311111 bytes; one upload (extractGps+resize+thumb) 583 ms peak RSS 209 MB; 4 concurrent 1045 ms peak RSS 581 MB
- scratchpad/sec2/exif.js: JPEG with EXIF GPS -&gt; extractGps {lat:47.37, lon:8.53}; resizeImage/resizeThumbnail outputs exif?false xmp?false icc?false (EXIF stripped)
- npm pack @azure/msal-browser@3.28.1 leaflet@1.9.4 (in scratchpad) + sha256sum: vendored msal-browser.min.js 81fc17a8... == npm tarball; vendored leaflet.js db49d009... == npm tarball

</details>
