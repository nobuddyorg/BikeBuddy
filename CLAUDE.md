# CLAUDE.md

Standing instructions for Claude Code and any other AI assistant working in
this repository ([AGENTS.md](AGENTS.md) points here). Read this file and
[TEST_STRATEGY.md](TEST_STRATEGY.md) before writing anything. Full docs:
[docs/README.md](docs/README.md).

## What this project is

**BikeBuddy** stores GPX rides (cycling or motorcycling), shows them as routes
on a map, and attaches photos. Seven locales. Features:
[README.md](README.md).

- **Frontend**: plain HTML/CSS/JS static site on GitHub Pages, no framework and
  no build step. `frontend/src/`; logic in `lib/`, rendering in `ui/`.
- **Backend**: Azure Functions (Node 24, Flex Consumption), one folder per
  function in `functions/src/<Name>/`, shared code in `functions/src/lib/`.
- **Data**: Cosmos DB Serverless (`users` by `/id`, `tours` and `tracks` by
  `/userId`, `deletions`), Blob Storage (private containers, short-lived SAS
  URLs).
- **Authorization**: in the handlers, and nothing else. Entra External ID
  issues OIDC access tokens; `authMiddleware` validates them per request.
- **Infrastructure**: OpenTofu in `infrastructure/`.
- **Deploy**: `deploy.yml` applies infrastructure and publishes Functions, then
  frontend, for each commit CI Gate passed on `main` (#563). No staging.

## Read before you touch

| Area                                       | Read first                                                                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Handlers, auth, ownership, SAS             | [architecture.md](docs/reference/architecture.md), [security.md](docs/explanation/security.md)                                            |
| Document shape, partitioning, payload size | [design-decisions.md](docs/explanation/design-decisions.md), "Cosmos partitioning & payload hygiene"                                      |
| Infrastructure, state, deploy              | [infrastructure.md](docs/how-to/infrastructure.md)                                                                                        |
| Tests: which layer, what may be faked      | [TEST_STRATEGY.md](TEST_STRATEGY.md) §5–§7, [testing.md](docs/reference/testing.md), [developer-guide.md](docs/how-to/developer-guide.md) |
| Strings, locales                           | [adding-a-language.md](docs/how-to/adding-a-language.md)                                                                                  |
| Dependencies, `npm audit` findings         | design-decisions.md, "Dependency updates and npm audit"                                                                                   |
| Load tests, backend profiling              | [load-testing.md](docs/how-to/load-testing.md)                                                                                            |
| Local setup, the pre-PR checklist          | [CONTRIBUTING.md](CONTRIBUTING.md)                                                                                                        |

## Hard rules

Settled decisions and safety rules. If a task seems to need one reversed, stop
and say so; never work around it quietly. Reasoning lives in
design-decisions.md and the linked issues, not here.

- A frontend check is UX, never authorization. Every endpoint except
  `/api/health` authenticates through `authMiddleware`; every tour-scoped
  endpoint loads the tour through `loadOwnedTour`. The partition key comes
  **from the token, never from the request** (security.md, "Posture").
- Token checks (signature, issuer, audience, the `access_as_user` scope) live
  in `authMiddleware` and are only ever tightened; the scope is what refuses an
  ID token for the same client id, so never rely on the audience check alone.
- `SKIP_AUTH` is local-only and fails closed: the middleware refuses it when
  Entra is configured, and the deployed app never gets it: the Function App's
  precondition refuses empty Entra variables (#545). Never widen it (no
  per-request user override).
- Responses are projected DTOs (`lib/tourResponse.js`), never raw Cosmos
  documents. `heatmapData` stays out of list responses and out of the index
  ("Cosmos partitioning & payload hygiene").
- No cross-partition queries in a request path (same section).
- Originals are never stored; blobs are private and served only through
  short-lived SAS URLs. No public containers ("Images").
- Blobs are written before their document and rolled back if the document
  write fails; a delete removes the document first, then its blobs with
  `deleteIfExists()`. #553 and #573 track the handlers that don't yet.
- `frontend/src/vendor/` stays byte-identical to upstream ("No frontend
  framework").
- Never lower a coverage, mutation, e2e-coverage or Lighthouse threshold, or
  auto-ratchet one (`mutation-targets.mjs`, the Vitest, Stryker, Playwright
  and `lighthouserc` configs). An unreachable threshold is a design problem:
  redesign, or raise it with the user ("Mutation scope").
- The only `/* v8 ignore */` is the one-line `handler:` wrapper in each
  `app.http()` registration; no others, no `// Stryker disable`. No `.skip`,
  ESLint, TypeScript or `nosemgrep` suppression without understanding the
  failure first; the reason goes on the same line. No test gaming
  (developer-guide.md, "Coverage" and "Mutation testing").
- Never commit to `main`, skip hooks (`--no-verify`), force-push over others'
  commits, or rewrite history on a branch you don't own (CONTRIBUTING.md).
- Never modify `.github/workflows/**`, repository secrets, branch protection,
  or `.pre-commit-config.yaml`'s security hooks unless the user explicitly asks;
  the workflows hold the production credentials (#561, #563).
- Never run `npm audit fix --force` or regenerate a lockfile from scratch; use
  targeted `overrides` ("Dependency updates and npm audit").
- Never write real credentials anywhere (Cosmos or Storage keys,
  `ARM_CLIENT_SECRET`, `TF_BACKEND_ACCESS_KEY`, Graph credentials, access
  tokens), not in code, docs, commits or chat, not even as an example. The
  Cosmos **emulator** key and Azurite's account key are public
  (developer-guide.md, "Secret scanning").

## Data and authorization changes

Authorization is hand-written in every handler, so every endpoint is
security-critical.

- A new endpoint ships its authorization cases in the same change: a row in
  `functions/test/integration/endpoints.js` (a unit test fails while a
  registered route is missing there), which runs it with real test-signed
  tokens as owner, another user and every rejected credential.
- A document-shape change states how existing documents are read, bumps
  `functions/src/lib/schemaVersion.js`, and ships or updates a backfill with a
  dry run (design-decisions.md, "Backfills").
- Call out any change to auth, ownership, partitioning or SAS scope in the
  commit message and PR description as security-relevant, with one line on
  what it now allows or denies.

## Destructive jobs

`process-deletions.yml` holds a tenant-wide Graph credential; on a daily cron
it purges each queued user's app data and deletes the directory user. A
deletion cannot be undone from here. It must delete only ids the API queued and
stay idempotent ("Account deletion (GDPR), out-of-band"). Never loosen what it
accepts: it deletes only entries that name an app user whose document is
already gone (#570), and still cannot prove that the API, and not someone else
holding the Cosmos key, queued an id. A change to it is security-relevant (see
above).

## Infrastructure changes

- Locally only `tofu fmt`, `tofu validate`, `tofu plan`, `./buddy.sh quality
iac`. Never `tofu apply` against production by hand; `deploy.yml` does it.
- A plan that destroys or replaces a stateful resource (Cosmos account,
  storage account) is a stop-and-ask. They carry `prevent_destroy`
  guards (#543), which are never removed.
- Call out any change under `infrastructure/**` in the PR with the plan's
  destroy/replace lines. A new scanner exception goes in `.trivyignore.yaml`
  with its reason and in design-decisions.md, "IaC scan exceptions".

## How to work here

- **Smallest necessary change.** Preserve existing behavior unless changing it
  is what was asked. Boy-scout fixes stay inside the function or file you are
  already editing; if something outside it breaks a rule, say so rather than
  widening the diff.
- **When principles collide:** correctness and security, then KISS/YAGNI, then
  clean code, then DRY, then SOLID. No abstraction for a requirement nobody
  has; extract on the third occurrence. SOLID means modules and functions,
  never classes or a DI container. DRY applies to workflows too: a repeated
  step is a composite action in `.github/actions/`.
- **Split by responsibility:** Cosmos only through `functions/src/lib/db.js`,
  Blob Storage only through `functions/src/lib/blobStorage.js`; pure logic in
  `lib/` takes values as parameters and never reaches for `Date.now()`,
  `process.env`, the network or the DOM. Handlers take their collaborators as
  defaulted parameters so tests inject them. In the frontend, logic in
  `frontend/src/lib/`, rendering in `frontend/src/ui/`. Hard-to-reach coverage
  or a stubborn mutant means extract the logic, not force the test. New pure
  logic goes on `mutation-targets.mjs`; the DOM layer stays off it.
- **Clean code, as applied here:** intent-revealing names, no abbreviations;
  small functions with guard clauses; zero to two parameters, else a named
  object, never a boolean flag; no `null`/`undefined` as a signal where an
  empty collection models it; files under ~350 lines (tests under ~600); no
  dead code (Knip); no dependency without clear value over what's here, and
  none deprecated or unmaintained.
- **Comments:** one line, only for a non-obvious constraint, workaround,
  invariant, or external behavior; never to narrate code or record a decision
  (that goes in the commit or PR).
- **Fail fast; measure, don't assume.** Surface errors, never swallow them.
  Performance, payload size, RU and coverage are numbers a tool prints
  (`./buddy.sh test load`, the backend report, the coverage tables).
- **i18n:** every user-facing string goes through the i18n layer and exists in
  **all seven** locales (`frontend/src/locales/{de,en,es,fr,it,nl,pt}.json`)
  in the same change. English is the default locale. An API error body is one
  of the i18n keys in `functions/src/lib/http.js` (`ERROR_KEYS`), never prose;
  a unit test holds each to all seven locales.
- **Tests:** a UI change gets an e2e case for its journey; a functional change
  gets a unit test asserting behavior, not implementation; an authorization
  change gets its integration case. E2E specs reach the app only through the
  page objects in `e2e/pages/`, which locate singletons by id and repeated
  elements (rows, tiles, pins) by `data-testid`. Disagreeing with the playbook
  is fine; departing from it silently is not.
- **Docs sync:** a change to setup, the checklist, architecture,
  configuration, a design decision or a testing assumption updates the
  matching `docs/` file (and `CONTRIBUTING.md`/`README.md`) in the same change.
  TEST_STRATEGY.md stays generic: a BikeBuddy fact landing there is a bug; it
  goes in `docs/reference/testing.md` or here.

## Development commands

```bash
./buddy.sh development setup       # once; installs tools and config templates (Docker must run)
./buddy.sh development start-all   # Cosmos emulator, Azurite, Functions host, frontend → :4280
./buddy.sh test <suite>            # unit, frontend, e2e, integration, e2e-fullstack, mutation, load
./buddy.sh quality <command>       # hooks, check, format, opengrep, iac, zap
./buddy.sh --help                  # everything else
```

## Definition of done

Not done (no "done", no ready PR, no reported success) until every one of these
is green, from the repo root, in this order. `./buddy.sh quality check` runs
steps 1–4; `./buddy.sh quality check --stack` also runs 6–9.

```bash
./buddy.sh quality hooks          # 1. prek run --all-files: hygiene, typos, gitleaks, zizmor,
                                  #    actionlint, lockfile-lint, ESLint + SonarJS, Prettier, tsc,
                                  #    dependency-cruiser, Knip, shellcheck, markdownlint,
                                  #    tofu fmt/validate, TFLint + Trivy, OpenGrep
./buddy.sh test unit              # 2. Functions, 100 % per-file floor on the targets
./buddy.sh test frontend          # 3. frontend lib, same floor
E2E_COVERAGE=1 ./buddy.sh test e2e   # 4. static UI journeys, axe, e2e coverage floor
./buddy.sh test mutation          # 5. if you changed a file in mutation-targets.mjs
./buddy.sh development start-cosmos && node functions/scripts/init-cosmos.js
SKIP_AUTH=true ./buddy.sh development start-backend
./buddy.sh test integration       # 6. own host on :7072 with test-signed tokens, Cosmos, Azurite
E2E_COVERAGE=1 ./buddy.sh test e2e-fullstack   # 7. full-stack journeys
(cd e2e && npm run lighthouse -- signed-out && npm run lighthouse -- signed-in)
                                  # 8. required if you touched frontend/**
./buddy.sh quality zap            # 9. required if you touched headers, CSP, or API errors
```

A load test is a measurement, not a gate: run `./buddy.sh test load` when a
change targets a hot path, and put the comparison in the PR
(load-testing.md, "Run the optimization loop"). A partial run is a status
update, not a stopping point. If a gate blocks finishing, say so; never relax
the gate.
