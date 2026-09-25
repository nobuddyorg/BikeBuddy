# Test strategy playbook

A portable testing strategy for one shape of app: a **static frontend** that
talks to its **own serverless API**, where **every handler enforces
authorization per request**, data lives in a **document database partitioned
per user**, files live in a **private blob store** reached through short-lived
signed URLs, and identity comes from an **external OIDC provider** whose tokens
the API validates itself. It says what each test layer can and cannot prove in
that architecture, and which layer owns which behavior. Copy it into a new
project of the same shape, then localize it (§16). **This file names no real
endpoint, file path, issue, or measured number** — those belong in the
project's own docs.

Two meta-rules: **disagree in the open rather than departing quietly** — if a
task needs something this strategy rules out, say so first — and **update this
file the moment the architecture moves**; a stale strategy produces false
confidence at exactly the layer nobody double-checks.

Vocabulary: _users_ own _resources_ (documents) that may reference _blobs_ (an
uploaded file, an image and its thumbnail). Nothing is shared; the owner's id is
the partition key.

---

## 0. When this applies

- The frontend ships as static files, possibly cached by a service worker. It
  holds **no authorization logic that matters**: it attaches a bearer token.
- The API is **hand-written serverless handlers**. Each authenticates the
  caller, then reads and writes **only inside the caller's partition**, keyed
  by the validated token, never by the request.
- The database has no policies of its own and the API holds its key, so **the
  handlers are the entire defense**.
- Blobs are private; the API signs read-only, short-lived URLs for single blobs
  after checking ownership of the document that names them.
- The API validates OIDC tokens itself: signature via the provider's published
  keys, issuer, audience, algorithm, token type.
- There is no staging; infrastructure and code apply to production on merge.

If authorization moves out of the handlers — database-side policies, a gateway
that validates tokens, a datastore the frontend reaches directly — the central
claim (**only a request through the real middleware and the real
partition-scoped read can catch an authorization bug**) stops holding for that
surface. Rethink this document there; don't patch it.

---

## 1. Purpose

Put each check at the cheapest level that would actually catch the failure it
is aimed at. This needs writing down because authorization is spread across
every handler: one handler that reads by id without the caller's partition key,
or trusts an id from the request body, is caught by nothing else, and the
interface looks normal while showing somebody else's data. A strategy that only
describes what is already green is not a strategy — name the gaps (§16).

---

## 2. System testing context

### Map the shape, for the real project

Write this into the project's own docs with its real pieces:

| Piece                                                    | Testing consequence                                                                                                                                                                    |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Static frontend on a static host                         | Deployment failures are path failures (base path, asset URLs, runtime config file) — needs a real fetch against the deployed origin                                                    |
| Service worker caching the app shell                     | A deploy can keep serving old code; cache invalidation is a tested behavior, not a manual bump                                                                                         |
| Serverless functions host                                | Cold starts, host configuration (body streaming, size limits, timeouts), per-invocation memory — some of it only exists in the real host, so integration runs the real host locally    |
| Auth middleware                                          | The first half of every authorization decision; unit-testable with a local key pair, and must also run unmodified in integration                                                       |
| Document database, partition key = owner                 | The second half: a read outside the caller's partition finds nothing. Request-unit cost, throttling, per-item size limit and cross-partition fan-out are properties of the real engine |
| Private blob store + signed URLs                         | Bytes are a separate surface from the document that names them; blob names carry the owner's prefix; signed URLs carry scope and expiry                                                |
| OIDC provider (discovery, signing keys, issuer/audience) | Interactive sign-in cannot run in CI; a local test key pair and key set stand in for it so tokens are real, signed JWTs                                                                |
| Third-party services called from the browser (map tiles) | Always faked or blocked in tests                                                                                                                                                       |
| CI/CD holding the cloud service principal                | The highest-privilege _code_ is shell in a workflow: it applies infrastructure, publishes code, and reads database keys                                                                |
| Out-of-band job holding the directory credential         | Deletes identities at the provider; a separate trust boundary with its own tests (§12)                                                                                                 |

### Trust boundaries to enumerate

1. **Browser → API, with a bearer token.** The only meaningful test does what
   an attacker could: a direct HTTP request with a real token, bypassing the UI.
2. **One user → another user's resources, by id.** Ids are random but travel in
   URLs, logs and exports; treat them as known. Every id-taking endpoint is an
   insecure-direct-object-reference candidate (§7).
3. **No token → everything.** Every endpoint but an explicit health check
   answers 401, before touching the database.
4. **A token of the wrong kind** — expired, wrong audience or issuer, an ID
   token presented as an access token — fails like a missing one.
5. **The dev bypass → production.** A flag that skips token validation locally
   is a boundary of its own: how could it reach a deployed environment?
6. **CI/CD → production.** Covered by workflow and IaC scanning, deploy
   ordering and review, not by an application test.
7. **Out-of-band deletion job → identity provider.** It acts on ids another
   component wrote; what it trusts about them is a boundary.
8. **App → third-party HTTP.** Always faked; never reached.

---

## 3. Testing principles

1. **Authorization is not testable from the client.** A hidden button is a UX
   property. Authorization tests hold a real token and talk to the real API
   over HTTP.
2. **Never mock the thing that carries the risk.** In an authorization test the
   auth middleware and the partition-scoped read run for real — not the dev
   bypass flag, not a faked read. A faked read proves the handler _asks_ the
   right question; only the real store proves the answer.
3. **Coverage is a signal; mutation score is stronger.** A line ran proves
   nothing about pure, high-consequence logic.
4. **Lowest level with the same confidence.** Track-statistics arithmetic is a
   unit test; _that the UI shows them_ is one browser case, not one per field.
5. **Deterministic or deleted.** No retries except the post-deploy smoke test,
   where a retry distinguishes a broken deploy from a dropped connection. A
   flake is a defect.
6. **Test the failure paths.** Anything that writes twice (a document and its
   blob), retries, or is cancellable carries a data-loss or duplication risk —
   inject failures.
7. **If it is hard to test, fix the design.** Handlers take their identity
   source, containers, clock and id generator as parameters; extract pure
   logic from the I/O beside it; don't fake the world.
8. **Fixtures may not out-privilege the app.** Tests seed through the API as a
   user. The database key in a test opens exactly two doors: reading back what
   the API persisted, and cleaning up the emulator.
9. **One new behavior, one new assertion, at one level.**

---

## 4. Risk model — a template, not a checklist

Rank by expected cost. "Cheapest meaningful test" is the level below which the
risk is uncovered. Replace the rows with the real project's endpoints,
documents and jobs:

| Risk                                                                                                      | Cost                                                                  | Cheapest meaningful test                                                                                         |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Cross-user read or write by id** — a handler reads without the caller's partition key                   | Silent, total confidentiality failure; UI looks fine                  | Integration, two real identities, through the functions host (§7)                                                |
| **A token of the wrong kind is accepted** (ID token as access token, wrong audience)                      | Any token the provider ever issued becomes an API key                 | Middleware unit test with test-signed tokens; one integration case per kind                                      |
| **The auth bypass flag reaches a deployed environment**                                                   | The API serves every request as one shared identity                   | Unit test that the flag refuses to activate when a provider is configured; a deploy-time check that fails closed |
| **Signing-key or metadata outage turns into mass failures** (rate limits drained, no timeout, stale keys) | Every signed-in user sees errors, or is told they are signed out      | Unit tests with injected failing key sources; the 5xx-not-401 rule asserted                                      |
| **A hostile or huge upload** (parser blowup, stack exhaustion, point-count explosion)                     | One request pins a worker or crashes it; stored documents too large   | Property-based tests on the parser; an integration guard on the aggregate response size                          |
| **Upload limits that do not bound memory or can be raced**                                                | Memory exhaustion; a per-resource cap exceeded by concurrent requests | Unit test on the limit; integration with the real host for streaming and concurrent requests                     |
| **Orphaned blobs or partial failure** between a document write and its blob write                         | Bytes nobody can reach or delete; a document pointing at nothing      | Unit tests with an injected failing write; integration for the cascade                                           |
| **Account deletion leaves data behind** (a blob kind, a queue entry, a re-created profile)                | Personal data kept after the user asked for deletion                  | Integration: delete, then look for every document and blob prefix the user ever had                              |
| **Export omits data** the user owns                                                                       | A data-portability request answered incompletely                      | Integration: export lists every document and blob the user created                                               |
| **Cost blow-up per user** (no quota, unbounded fan-out, unbounded payload)                                | A single account drives the bill                                      | Deterministic cost guards against the emulator (§12); quotas are a design decision, not a test                   |
| **Stale service worker** serving old code after a deploy                                                  | Users run code the API no longer matches                              | Unit test that a content change changes the cache key; signed-out browser suite                                  |
| **Infrastructure apply destroys stateful resources**                                                      | Irreversible data loss, unattended                                    | Destroy guards plus IaC scanning; not an application test                                                        |
| **A deploy that is not gated or not ordered**                                                             | Untested code in production; frontend ahead of its API                | Pipeline structure plus a post-deploy smoke test                                                                 |
| **No backup or restore path**                                                                             | Any of the above becomes permanent                                    | A restore drill, not a test                                                                                      |
| **Document-shape change against existing documents**                                                      | Old documents break a handler after deploy                            | Handler unit tests with an old-shape fixture; backfill dry run (§8)                                              |
| **Frontend/API contract drift**                                                                           | Runtime errors or silently missing fields after deploy                | A shared schema checked on both sides (§5)                                                                       |
| **Destructive scheduled-job faults**                                                                      | Irreversible deletion of live identities                              | Dry-run mode, validated input, idempotency — §12                                                                 |
| **Accessibility regressions**                                                                             | Unusable with keyboard or screen reader                               | Runtime accessibility checker in the browser suites — §9                                                         |

Keep 10–20 rows, each marked covered / partly / not covered in the project's
own docs, updated as incidents happen.

---

## 5. Test layers

| Layer                                                     | Verdict                                                    | Why                                                                                                                                                                                |
| --------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit (pure functions)                                     | **Required**                                               | Where extracted logic lives; the only level mutation testing means anything at.                                                                                                    |
| Handler unit (injected identity, fake containers)         | **Required**                                               | Every status path of every handler, fast: 401 before any read, 400 before any read, the read made with the caller's partition key, write ordering, error mapping.                  |
| DOM-layer unit (simulated DOM)                            | **Required where the DOM layer holds state**               | Token expiry handling, retry, undo, routing — logic a browser journey reaches only on its happy path. Pure rendering stays with the browser suites.                                |
| Integration: functions host + DB emulator + blob emulator | **Required, non-negotiable**                               | The only level where the real middleware, the real partition-scoped read, blob naming, host limits and request cost all exist together.                                            |
| API testing                                               | **Required — a real suite**                                | The endpoints are hand-written, so each one can get authorization wrong on its own. The integration suite issuing direct HTTP calls _is_ the API suite, and it grows per endpoint. |
| Contract testing                                          | **Narrow form only**                                       | One schema per response shape, checked by the handler's tests and by the frontend's mocks. A broker is unjustified: both sides ship from one commit.                               |
| Authorization/security                                    | **Required — highest priority**                            | §7.                                                                                                                                                                                |
| Dynamic scanning (DAST)                                   | **Recommended, narrow**                                    | Passive scan of frontend and API; never authorization coverage — §6.                                                                                                               |
| Property-based / fuzzing of parsers                       | **Justified**                                              | The parsers of uploaded files are the project's own code and take hostile input — §10.                                                                                             |
| Mutation                                                  | **Required, scoped**                                       | §11.                                                                                                                                                                               |
| E2E                                                       | **Required, small**                                        | §9.                                                                                                                                                                                |
| Load testing                                              | **Manual only, never a gate**                              | Until an actual throughput SLA exists: a measurement someone asks for, against a local stack by default (§12).                                                                     |
| Concurrency                                               | **Unit level, plus one integration case per enforced cap** | Server-side read-modify-write races (a per-resource limit, an array append) exist because instances scale out; the cap is proven with concurrent requests to the real host.        |
| Failure injection                                         | **Unit level**                                             | Throttling, blob failures mid-write, key-source outages through injected fakes; the real stack adds cost without signal.                                                           |
| Deployment                                                | **Required**                                               | Infrastructure validated and scanned before apply; the functions package starts in the real host; the frontend served under its real base path.                                    |
| Smoke                                                     | **Required**                                               | Signed-out browser suite and an API health call against the deployed origins, after every deploy.                                                                                  |
| Production synthetic                                      | **Optional**                                               | Duplicates smoke. Never signed-in against production.                                                                                                                              |

### Who owns which behavior — and who does not

| Behavior                                                                     | Owning layer                                         | Not this                                                             |
| ---------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------- |
| Pure transforms (parsing, simplification, validation, formatting, URL state) | Unit + property + mutation                           | Not the browser                                                      |
| Token validation rules (issuer, audience, algorithm, expiry, token type)     | Middleware unit tests with test-signed tokens        | Not integration alone, not a mocked verifier                         |
| Status mapping per handler (401, 400, 404, 5xx) and write ordering           | Handler unit tests                                   | Not E2E                                                              |
| Cross-user isolation per endpoint and verb                                   | Integration, second real identity, through the host  | **Never** client code, a handler unit test alone, or the bypass flag |
| Blob scope: prefix, signed-URL permissions and expiry                        | Handler unit (URL composition) + integration (bytes) | Not assumed from the document test                                   |
| Request cost, partition targeting, payload bounds                            | Integration guards against the emulator              | Not a load test                                                      |
| Response shape the frontend depends on                                       | Contract check on both sides                         | Not a hand-written mock nobody validates                             |
| Stateful DOM logic (token expiry, retry, undo, routing)                      | DOM-layer unit                                       | Not only a happy-path journey                                        |
| Base path, service worker, manifest, pre-auth behavior                       | Signed-out browser suite                             | Not unit alone                                                       |
| One complete user journey                                                    | E2E, full stack                                      | Not one case per field                                               |
| Document-shape applicability                                                 | Old-shape fixtures + backfill dry run (§8)           | Not review by eye                                                    |
| Repo tooling outside the bundle                                              | The job that depends on it                           | Not unit tests, not bundle coverage                                  |

---

## 6. Architecture-specific strategy

### The shape of the pyramid

The middle band — HTTP integration against the real host and emulators — is
unusually load-bearing, because authorization lives in handler code that only
the real host wires together:

```text
Layer                   Weight           Runs against
----------------------  ---------------  -----------------------------------------
Unit + handler unit     most of it       fakes; a scoped subset mutation-scored
DOM-layer unit          targeted         simulated DOM, faked API
API-level integration   a wide band      real host + emulators, test-signed tokens,
                                           two identities, no browser
Browser, full stack     one per journey  real stack, real bundle
Browser, static         small            built artifact, API mocked; also
                                           post-deploy (signed out)
```

Two ways it drifts: new endpoints landing without the API band growing
(authorization silently leaving coverage), or the browser bands asserting what
a cheaper level could have settled.

### What must be real, and what may be faked

| Thing                                                         | Unit/handler unit                 | Integration                                                                                   |
| ------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------- |
| Functions host                                                | Absent — handlers called directly | **Real**, started for the run                                                                 |
| Auth middleware                                               | Real, with an injected key source | **Real**, unmodified                                                                          |
| OIDC provider                                                 | Local test key pair               | **Local test key pair and key set**, served where the middleware looks; never the bypass flag |
| Document database                                             | Faked (injected container)        | **Real** emulator                                                                             |
| Blob store                                                    | Faked                             | **Real** emulator, including signed-URL generation                                            |
| Browser-only APIs (service worker, geolocation, file readers) | Faked                             | Real in the browser suites                                                                    |
| Ids, clocks                                                   | Injected                          | Real                                                                                          |
| Database key                                                  | Never                             | **Only** to read back and to clean up the emulator                                            |

The test key pair is the whole trick: the middleware reads its metadata and
keys from a configurable location, the run serves a key set it generated, and
every token is a real signed JWT — so every validation check runs, and a
second identity costs one more signing call.

### Managed-service boundaries

- **Throttling.** Past provisioned throughput the database answers with a
  throttling status the SDK retries a bounded number of times. Test the
  handler when retries run out (an injected fake), not the SDK's loop.
- **Cross-partition fan-out.** A query without the partition key still works —
  it fans out, costs more, and at worst returns other users' documents. Assert
  partition targeting on every hot query, not only the result.
- **Per-item size limit.** Documents embedding variable-size data (track
  points) have a hard ceiling; test the downsampling with the largest
  realistic input.
- **Signed-URL expiry and clock skew.** Pin expiry in unit tests; the frontend
  copes with an expired URL by asking again.
- **Host configuration.** Body streaming, size limits, timeouts and memory are
  host settings: a limit enforced in code while the host buffers the whole
  body first does not bound memory. Only the real host shows this.
- **Emulator vs. real service.** Same query semantics, but nominal request
  charges and no throttling. Trust its correctness; treat its cost numbers as
  order-of-magnitude. Reserve "only provable deployed" for cold starts, CORS at
  the platform edge and real throttling.

### Static analysis layering

Five tools answer five different questions; none stands in for another:

1. **Module-boundary graph.** Only the data adapters import the database and
   blob SDKs; the frontend's pure layer never imports its DOM layer; no cycles,
   no orphans.
2. **Dead code / unused dependencies.** A file referenced only from another
   tool's config gets an explicit entry point.
3. **General-purpose SAST.** Block on error severity, triage the rest; every
   suppression carries its reason, and a claimed fix stops the matcher firing.
4. **Code-smell linter** (cognitive complexity, duplication), tuned against the
   project's own code; a copied default is a guess.
5. **IaC and workflow scanning** (storage exposure, destroy guards, workflow
   permissions). Each accepted finding is written down with its reason.

Measure run time before placement: seconds-scale belongs in a pre-commit gate;
a network fetch or cold binary install belongs in CI only.

### Dynamic scanning (DAST)

A **passive scan** (spider plus passive rules, never an active attack scan) of
the static frontend, and of the API driven by an API description, against an
isolated local stack. It is the only layer that sees a response header
regress, a permissive CORS answer, or a stack trace leak into a response body.

- It says nothing about authorization. An API pass run with the dev bypass to
  get past the 401 is fine for a passive scan, and is why a green run is not §7
  coverage.
- Never against a deployed or production target.
- The API description is part of the contract (§5); unchecked, it drifts.
- A header the static host cannot set stays explicitly ignored, with the reason
  written down. The API _can_ send headers, so there it stays visible.
- Graduated severity: a small blocking set, the rest for triage.

---

## 7. Security and authorization testing

**The highest-value testing in this architecture.** Every handler is its own
authorization decision; a missed partition key fails silently and looks like
success. A frontend test is never evidence that an authorization rule works.

### Rules

1. A **real, signed access token for a real test identity**, sent **directly
   to the API over HTTP**, never through the UI and never through the bypass
   flag.
2. **At least two identities.** A single-identity suite only ever makes allowed
   requests and can never notice a handler that ignores the partition.
3. **Every endpoint, every verb, every identity, every negative.** Identities:
   owner, other user, no token, malformed, expired, wrong audience, wrong
   issuer, disallowed algorithm, unknown signing key, an ID token in place of
   an access token.
4. Assert on the **mechanism**, and write the mapping down:
   - **401** — no identity (missing or rejected token), before any read.
   - **400** — malformed input (an id that is not an id), before any read, so
     it cannot be used to probe.
   - **404** — resource not in the caller's partition. Deliberately
     indistinguishable from "does not exist", so a foreign id reveals nothing.
     This is the chosen "not yours".
   - **403** — a resource the caller can see but may not change. Without
     sharing there is none; one appearing is a design change.
   - **5xx** — verification could not run (key source unreachable). Never 401,
     which tells every signed-in user they are signed out.
5. Request the other user's **known id** and get 404 **while it still exists**
   — then read it back as its owner. A 404 for a deleted resource proves
   nothing.
6. Another user's resource is **absent from every list, map, statistic and
   export**, not only from the by-id read.
7. Write-side tests **read back as the owner** and check that a foreign write
   changed nothing.
8. **Every mirrored surface needs its own test.** A document and the blob it
   names are separate: the signed URL is read-only, single-blob, short-lived
   and under the owner's prefix; a blob name is never taken from the request.

### The widest reach needs the most scrutiny

With no sharing, the widest reach belongs to code that acts for _everyone_: the
account-deletion cascade (a wrong prefix deletes another user's data) and the
job holding the directory credential. Test what each **must** remove and what
it **must not** touch — a second user's data survives the first one's
deletion. The dev bypass flag is the other wide reach: it refuses to activate
when a provider is configured, and a deploy with missing provider settings
fails closed instead of shipping the bypass.

### Two levels of authorization test

- **Unit.** Middleware tests sign tokens with a local key pair and inject the
  key source: every rejection reason, and 5xx-not-401 for infrastructure
  failures. Handler tests inject an identity and a fake container and assert
  the read used **the caller's partition key** — not merely that a faked "not
  found" became 404.
- **Integration through the functions host**, test-signed tokens for two
  identities: the same properties through the real pipeline, and the only
  place blob naming, signed URLs and aggregates are exercised across users.

A change to the middleware, an id-taking endpoint, or an ownership rule ships
an integration case in the same change. A handler unit case does not discharge
this: the failure is invisible, and review by eye misses exactly this bug.

### Out of scope

Penetration testing the platform and the identity provider; sharing and public
links, which do not exist (a new, higher-risk boundary — §16); secret scanning
beyond a dedicated hook and the platform's own tooling.

---

## 8. Integration strategy

### Setup that must not be weakened

- **Seed through the API as the user, never by writing the database
  directly.** A direct write constructs states the API could never produce. The
  one exception is a guard measuring the data adapter itself (§12); it writes
  only under its own throwaway owner id and says so.
- **Isolate data across parallel specs.** Each spec gets its own identity, so
  its own partition and blob prefix. Wiping whole containers between specs
  forces serial runs and hides cross-user bugs.
- **Cleanup must refuse to run against anything but the emulator.** Bulk
  deletes check the endpoint first — production is one exported variable away.
- **Point the frontend at the stack it tests.** The runtime config names the
  API and provider; one pointing elsewhere tests the wrong backend.
- **Clean up in `finally`.** Probe documents and blobs must not survive a
  failed assertion.
- **Fail on an unexpected console or runtime error**, which catches a rejected
  background request hiding behind a passing assertion.
- **Flush browser coverage before every full navigation.** V8 keeps counts
  only for the live document; a reload silently discards everything before it,
  and the gap list lies.
- **Read function coverage, not line coverage, for browser suites.** A
  function at zero calls is a real gap; an uncovered line inside an executed
  function usually is not.

### Document-shape changes against existing documents

A document database has no migrations, so nothing fails at deploy time: a new
required field or a changed type meets old documents at read time, in
production, unattended.

**Policy:** every document carries a shape version, or handlers treat every new
field as optional. A shape change ships a handler unit test with an
**old-shape fixture**. A backfill has a **dry-run mode** (counts and samples,
writes nothing) defaulted on, batches its writes, is idempotent, and runs dry
against production first — with the dry-run output stated in the PR.

### Idempotency and repeated operations

Every repeatable operation gets a _decided_, tested answer:

| Operation                                       | Decide and test                                                                                                                    |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| The same track file uploaded twice              | Two resources, or detection of the repeat — either way decided, and the second upload's blob never overwrites the first's          |
| An image upload retried after a partial failure | No orphaned blob and no dangling reference, driven by a fake that fails between the blob write and the document write              |
| Deleting a resource or an image twice           | The second answers 404 (or 204) without error and deletes nothing else                                                             |
| Concurrent appends to one document              | A per-resource cap holds under concurrent requests; optimistic concurrency retries against a fresh read, a bounded number of times |
| Account deletion called twice                   | Safe; the second finds nothing and succeeds                                                                                        |
| The deletion job re-run                         | Safe to repeat; an id already gone at the provider is terminal, not a failure                                                      |

### Not here

Pure logic already covered at unit level. A unit test finds broken distance
arithmetic in milliseconds; the same point through a browser and a real host
costs orders of magnitude more.

---

## 9. E2E strategy

**Static** — the built frontend with **no backend**, the API mocked at the
network layer. Its signed-out part holds for an anonymous visitor, which makes
it safe against production post-deploy: base path, manifest, service worker,
theme, viewports, the sign-in entry point up to the redirect. Mocks are only as
good as their shapes: validate them against the schema the handlers are checked
against (§5), or the suite passes while the real API has moved.

**Full stack** — whole journeys against the real local host and emulators:
upload, edit and delete the core resource; an image persists, survives reload,
and goes with its resource; search and filter, including hostile input; export
and account deletion, checked in the store, not only in the UI. Sign-in
bypasses the provider's hosted flow: ideally the setup hands the page a
test-signed token so the real middleware runs; the dev bypass is the weaker
substitute, and a project using it names that as a gap.

A UI change gets one E2E case for its journey; field-level detail (disabled
states, validation wording, focus order) belongs in DOM-layer unit tests.
Treat mobile as its own target if layout faults or gestures are
viewport-specific. Poll for expected state wherever the UI debounces, animates,
or waits on a round trip.

### How the browser suite addresses the UI

Pick the locator that matches what the test is about, and record the
project's default:

- **Accessible locators** (role, label) when the test is about what a user
  sees and does; a control they can't find, a screen reader can't either.
- **Stable test ids** (or the stable element ids a vanilla-JS app already
  relies on) for a repeated row, a translated or user-supplied name, an
  attribute-state assertion, a suite that must survive copy edits.
- **Never CSS class or DOM structure.**
- **Text that is the subject is asserted, not located by** — finding an element
  by the text you then assert is circular.
- **A third party's DOM** (a map library) is reached the way it allows, inside
  the page object, with a one-line comment.

**One page object per screen, all hung off one tree.** Each screen exports an
init function returning its root locator as a callable, plus `locators`
(grouped handles) and `do` (whole interactions); a repeated row or card gets a
nested object of the same shape:

```ts
export function initResourceList(page: Page) {
  const root = page.getByRole('main');
  const locators = {
    buttons: { upload: root.getByRole('button', { name: /upload/i }) },
    rows: root.getByTestId('resource-row'),
  };
  const interactions = {
    upload: async (name: string, file: FilePayload) => {
      await locators.buttons.upload.click();
      await page.getByLabel(/file/i).setInputFiles(file);
      await page.getByLabel(/name/i).fill(name);
      await page.getByRole('button', { name: /save/i }).click();
      await expect(locators.rows.filter({ hasText: name })).toBeVisible();
    },
  };
  return Object.assign(() => root, { locators, do: interactions });
}
```

A tree of getters collects the screens, a fixture hands it to every spec, and
a spec reads as the journey it is:

```ts
test('uploads a resource and finds it again', async ({ on, page }) => {
  const app = on(page);
  await app.list.do.upload('Title', sampleFile);
  await expect(app.list.row('Title').locators.name).toHaveText('Title');
});
```

Four rules keep this from decaying:

- **No spec names a selector.** Grep the spec directory for locator calls;
  only document-level elements (`html`, `body`, `meta`, `link`) may show up.
- **`do` holds whole actions; `locators` holds handles.** An action spanning
  two screens belongs to the screen that starts it.
- **Waiting belongs to the page object.** An `open()` returns when the screen
  is there, not when the click landed; a gesture helper waits for the state it
  causes, not for a fixed time. No spec and no page object carries a sleep.
- **Assertions belong to the spec.** A page object asserts only its own
  action's postcondition.

### Accessibility

**Runtime** checks (an automated accessibility checker in both browser suites)
catch contrast, focus order and accessible names on representative states:
every dialog open, an error shown, both colour schemes, the mobile layout.
Without a component framework, **static** checks are thinner; a unit test
pinning the colour tokens' contrast ratios fills part of the gap. An accepted
exclusion is a selector plus its reason, never a disabled rule. A clean run is
"no known regression", not compliance, and the docs say so.

---

## 10. Property-based testing strategy

Justified here: the parsers take arbitrary user files and are the project's
own code. Use it where input is adversarial and a property is easy to state —
**track-file parsing** (finite, non-negative statistics; only the parser's own
error type, never a library's internal error or a stack overflow; very large
inputs finish), **simplification** (ordered subset, endpoints kept, budget
respected, idempotent), **validation** (accepted input meets the rules;
sanitizers idempotent; valid bodies round-trip), **image metadata**
(coordinates in range or absent, never `NaN`), and **URL state** (round-trips;
sorting is a permutation; pages cover every item once).

Seeded and deterministic, one dependency, beside the example tests, inside the
unit suite's time budget. **Replay by seed:** a failure prints its seed and
shrink path, and an environment variable replays exactly that run. A
counterexample that exposes a bug becomes an example test linked to the bug's
issue, before the fix. An invariant still under discussion (a duration when
timestamps go backwards) is not a property yet.

---

## 11. Mutation testing strategy

**Required, scoped — never the whole codebase.**

- One short, explicit file list, shared with the per-file coverage floor so the
  two can't drift.
- Every listed file is pure logic, or I/O reached through an injected
  parameter. Handlers qualify (called directly with fake requests and injected
  containers); the data adapters do not — mutating them measures the fakes. Any
  exclusion carries its reason at the exclusion.
- **Never mutate the DOM layer.** DOM mutants are near-equivalent by the
  thousand. A file that can't split into logic and DOM wiring is the problem.
- Mutants that only run at module load (route registration, top-level limit
  constants) can't be killed by tests importing the module once. If the tool
  skips them, those limits are unguarded: assert them through behavior, or
  write down which are knowingly unguarded.
- Run on every change touching scoped files, incrementally if you like — as
  long as the branch that deploys reruns everything: the tool's diff cannot see
  a changed import or a dependency bump.

A surviving mutant has two honest endings: **a missing assertion** (kill it
with a real behavioral test, usually an unpinned boundary or error path), or
**equivalent** — and then first ask whether the code needs to exist at all (a
guard the type checker discharges, a default spelled out). Deleting it pays for
the exercise. What remains stays visible with its reason written down, never
behind a suppression. Never write a test that can't fail just to kill a mutant.

Two structural survivor classes: a retry count (a fake failing a fixed number
of times pins it; one that always fails does not), and a timeout (a paging fake
answering every page identically — back it with a finite table).

Below threshold fails the build. Above threshold but below full score is not a
pass; every survivor is an open question.

---

## 12. Performance and resilience testing

### Performance

**No numeric backend latency gate without a real throughput SLA** — a
synthetic number against a low-traffic app measures the hosting tier. **Cost is
the SLA-like constraint**: every request is billed, and nothing stops one
account from generating them. Assert cost deterministically against the
emulator, in the integration suite:

- **Partition targeting** on every hot query, asserted on the requests the SDK
  actually sends, never a cross-partition fan-out.
- **Bounded pages**: the round trips for a known seed are asserted.
- **Bounded payloads**: aggregate responses (a map of every track) stay within
  a point budget and a byte ceiling, however much history the user has.
- **Request charge, loosely**: nominal on the emulator, so a bound catches an
  order-of-magnitude change (a lost partition key) and nothing finer.

**Load testing is a measurement, not a gate.** By hand, against a local stack
by default; production only behind a separate opt-in, since real users share
it. Seed to production shape first. Capture the backend's own statistics over
the run (per-handler timings, database requests and charges, blob calls,
event-loop delay, memory): latency says something is slow, the statistics say
which handler and why — a CPU-bound parse shows up as event-loop delay, not as
a slow query. Thresholds are calibrated from repeated baselines with margin.

**The frontend side benefits from a numeric gate** (a lab-performance audit in
CI): the build served as the static host serves it, never a dev server;
signed out, and signed in against a seeded local stack; performance and core
timing metrics, plus accessibility at a perfect score as a second lens on §9;
median of several runs; **thresholds from a measured baseline with margin**,
never the tool's defaults, with the reason written down where one is
surprising.

### Resilience

Failure injection at unit level, through fakes the modules already accept:
**throttling** after the SDK's retries (a retryable error, never a partial
write reported as success); **blob failures mid-upload** (roll the blob back;
decide what a failed thumbnail means; delete ordering never silently
reversed); **key-source failures** (unreachable, slow or rate-limited: a 5xx
with a bounded wait, never a 401, and unauthenticated garbage must not exhaust
the limiter for everyone); **cached failures** (retried on the next call); and
in the frontend an expired token, an expired signed URL, a failed fetch never
cached as success, a tab closed during a deferred action. Injecting into the
real stack is rarely worth it once these branches are reachable with a fake.

### Destructive jobs — the highest-risk logic in the system

The **in-app deletion cascade** deletes everything under the caller's
partition and blob prefix; the **out-of-band deletion job** holds a
directory-wide credential and deletes identities. Both are silent and
irreversible. Mitigations, always:

- **Review their selection logic like an authorization change.** A wrong
  prefix, or an id queued under another key than the job reads, loses or
  retains data.
- **A dry-run mode** that lists what the job would delete and exits before
  fetching the elevated credential, defaulted on for manual runs.
- **Only validated, verifiably queued ids**, never "whatever is in the queue";
  idempotent (an id already gone is terminal); logs carry counts, not ids.
- **Test the cascade for completeness and restraint**: every blob kind and
  document type is gone for the deleted user; a second user's data is intact.

---

## 13. CI/CD execution strategy

1. **Fast hygiene first** — file hygiene, secrets, formatting gate everything
   else, before minutes are spent on browsers and emulators.
2. **Path-filter heavy jobs on PRs.** A job skipped by its own condition
   reports as passing and never weakens branch protection.
3. **Full, unconditional set on the branch that deploys.**
4. **Deploy only what CI passed** — a green commit, not merely a merged one.
5. **Deploy in order, failing safe**: infrastructure, API, frontend, then a
   smoke test against both deployed origins, each depending on the last — the
   frontend never ships ahead of the API it calls.
6. **Unattended infrastructure apply needs guards**: stateful resources carry
   destroy protection; a plan that would replace one fails the apply.
7. **Retry only the deploy-target smoke test.** Everywhere else, zero.
8. **No staging means a heavier PR gate**: the full authorization and
   integration suite on every relevant PR, not nightly.
9. **Pin the emulators and host tooling** through one shared CI action, so CI's
   local stack matches the one developers run.

**Scheduled jobs:** the deletion job (§12); dependency updates — auto-merge
patch-level dev-only bumps at most. A dev dependency reaches the CI runner; a
runtime one reaches every user's browser or the API. That asymmetry is a
security control. An auto-merged update the deploy never picks up is a patch
that exists only in the repository.

**Credentials:** the cloud principal is scoped to what it deploys, readable
only by deploying jobs, short-lived where the platform allows. The directory
credential lives only in the deletion job.

---

## 14. Quality gates

Every gate needs a stated reason; a gate without one gets loosened the first
time it is inconvenient.

| Gate                     | Guidance                                                                                                                                                                                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coverage floor           | A **floor** set from what the suite achieves, with margin — not a target. Raised by hand. One floor per browser suite, since static and full stack reach very different amounts of the app.                                                                    |
| Auto-ratcheting coverage | **No.** It makes a green local run produce a red PR.                                                                                                                                                                                                           |
| Mutation score           | A break threshold just below the measured score, so one new equivalent mutant can't block unrelated work. Survivors above it remain open questions.                                                                                                            |
| Any threshold            | **Never lowered** to pass a build. Redesign, or raise the question.                                                                                                                                                                                            |
| Gate scope               | A gate is required when the diff touches its inputs. Comments, docs and file moves produce no new mutant, bundle or handler, so the gates that read those inputs are not required for such a change; CI's path filter is the executable form of the same rule. |
| Test pass rate           | 100%, zero retries except the deploy-target smoke test.                                                                                                                                                                                                        |
| Authorization            | A middleware, id-taking endpoint or ownership change ships its two-identity integration case in the same change (§7).                                                                                                                                          |
| Contract                 | Response shapes checked on both sides; the API description the scanner reads is kept in step.                                                                                                                                                                  |
| Cost guards              | Partition targeting, page bounds and payload bounds asserted against the emulator for every hot endpoint (§12).                                                                                                                                                |
| Deployment               | Gated on CI, ordered, and post-deploy smoke green against the **live** origins.                                                                                                                                                                                |
| Performance              | No backend latency gate without an SLA; a frontend budget from a measured baseline (§12).                                                                                                                                                                      |
| Static analysis          | Block on real findings, surface the rest (§6).                                                                                                                                                                                                                 |
| Suppressions             | Only with the reason written at the suppression, after understanding the failure.                                                                                                                                                                              |
| New UI                   | An E2E case for the journey, DOM-layer unit tests for stateful detail.                                                                                                                                                                                         |
| New behavior             | A unit test; authorization behavior additionally §7.                                                                                                                                                                                                           |

---

## 15. Test anti-patterns

Each of these passes silently or looks like flake when it is a defect.

1. A client-side check as an authorization test.
2. The auth bypass flag in an authorization test.
3. One identity, or a faked "not found" read, taken as proof of isolation.
4. Mocking the database and calling it an integration test.
5. Seeding by writing the database directly, as an owner the API never saw.
6. Testing the document and assuming the blob.
7. Cleanup that could reach a database other than the emulator.
8. Parallel specs sharing one identity, or wiping each other's containers.
9. Probe documents or blobs left behind on a failed assertion.
10. A signed-in test in the suite that runs against production.
11. Retries or sleeps to paper over a flake.
12. Pure logic re-tested through the browser.
13. A threshold lowered, or a suppression added, to get to green.
14. A test written to touch a line, a branch added to dodge a mutant, a file
    excluded to avoid dealing with it.
15. Mutation scope widened to the DOM layer.
16. Static-suite mocks that no schema validates.
17. A backfill or destructive job run against production without a dry run.
18. A truthiness check on an error object instead of its status or code.
19. An E2E case for a field-level detail.
20. An element located by CSS class, DOM position, or the text the test then
    asserts.

---

## 16. Adapting and maintaining this playbook

**Copying into a new project:** fill §2's table and boundaries; build §4's
risk table with real endpoints, documents and jobs; fill §5's ownership table
once real modules exist; write down §7's status mapping; pick §6's
static-analysis tools and §11's mutation scope; record §9's default locator
strategy; measure §12 and §14's thresholds — never carry another project's
numbers. The instantiation goes in the project's own docs (a testing reference,
architecture, design decisions, CI config, the contributor guide), never into a
copy of this file.

**Update it when:** authorization moves (database-side policies, a gateway,
managed identities for data access, a different token store or token kind in
the browser — any of these can invalidate §0); a new trust boundary appears
(sharing with roles, public links, an admin endpoint, a second identity
provider, a new blob kind or data source); a §5 verdict changes (record the
reasoning); a gate moves (a changed number is a changed justification); a
named gap closes (delete it); or an incident happens — add it to the risk
model and name the level that should have caught it.

When sharing arrives, §7 grows grants in both directions (revocation closes
access **with the resource still present**) and the most permissive role tested
for what it cannot do: delete the resource, manage grants, self-promote, or
write under another user's blob prefix.
