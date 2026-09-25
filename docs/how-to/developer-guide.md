# How-to: Develop, test & deploy

## Local development

Every helper script runs through one entry point — `./buddy.sh <group> <command>`
(`./buddy.sh --help` lists them all). Full stack (Cosmos emulator + Functions +
Azurite + SWA proxy):

```bash
./buddy.sh development start-all   # run `./buddy.sh development setup` first if tools are missing
```

Or piece by piece (these are the same scripts CI runs, so anything CI does you
can reproduce locally):

```bash
./buddy.sh development start-cosmos   # Cosmos emulator
node functions/scripts/init-cosmos.js # create DB + containers
./buddy.sh development start-backend  # Azurite + Functions host (:7071)
./buddy.sh development start-azurite  # only Azurite (what CI starts before the host)
./buddy.sh development stop           # stop everything start-all started
```

`buddy.sh` dispatches to `scripts/<group>/<command>.sh`; `./buddy.sh --help`
lists every command (generated from each script's `# Description:` line).

**Tab completion** (the `kubectl` pattern) — add to `~/.bashrc` or `~/.zshrc`:

```bash
eval "$(./buddy.sh completion)"
```

(`eval`, rather than `source <(...)`, also works in macOS's system bash 3.2.)

## Tests, lint, format

Every gate job is reachable through `buddy.sh` (raw `npm`/`prek` still work too):

```bash
./buddy.sh test all             # fast unit suites (Functions + frontend)
./buddy.sh test unit            # Functions Vitest unit tests
./buddy.sh test frontend        # frontend Vitest unit tests
./buddy.sh test e2e             # Playwright static UI
./buddy.sh test integration     # Functions HTTP tests   (needs Cosmos + Azurite)
./buddy.sh test e2e-fullstack   # Playwright vs backend   (needs `development start-all`)
./buddy.sh test mutation        # Stryker mutation tests
./buddy.sh test load <flow>     # k6 load test (a measurement, not a gate)

./buddy.sh quality hooks        # all lint/format/security hooks (the CI `prek` gate)
./buddy.sh quality check        # the Definition of done in order (--stack: with the local stack)
./buddy.sh quality format       # auto-format with Prettier
./buddy.sh quality opengrep     # SAST with the CI rule packs
./buddy.sh quality iac          # TFLint + Trivy on infrastructure/
./buddy.sh quality zap          # OWASP ZAP passive scans (needs the local stack)
```

CI gates: see the [gate workflow](../../.github/workflows/gate.yml).

### Where to find CI results

CI never writes into a pull request: no bot comments, no extra check runs. The
PR only shows each job's pass/fail status. Everything else is in the Actions run:

- **Summary tab** of the run: one section per job (test results, coverage
  tables, mutation score, and the output of every static check).
- **Artifacts** at the bottom of the Summary tab: the Playwright HTML report
  (only when the run failed) and the Stryker HTML report.
- **Security tab → Code scanning**: SAST and IaC findings (SARIF uploads).

Codecov keeps its commit status (`codecov.yml` has `comment: false`).

### Which jobs run

The `changes` job in `gate.yml` maps a PR's changed paths to areas
(`functions`, `frontend`, `e2e`, `infrastructure`) and each job runs only for
the areas it tests; a docs-only PR runs `prek` alone. `prek` always runs
(hygiene and secret scanning must see every file), a push to `main` runs every
job, and a change to `gate.yml` or `.github/actions/**` counts as every area.
A job skipped by its filter reports success, so required checks stay
satisfiable. Shared setup lives in composite actions under `.github/actions/`
(`setup-node-packages`, `start-local-stack`, `summary-section`,
`playwright-results`); a step repeated a third time becomes one.

## Run the checks CI runs, locally

Every job in [`gate.yml`](../../.github/workflows/gate.yml) runs a command you
can run yourself; CI calls the same `buddy.sh` or `npm` script, with only
reporter flags added. The ordered checklist is the
[Definition of done](../../CLAUDE.md#definition-of-done), and one command runs
it:

```bash
./buddy.sh quality check           # hooks, unit, frontend, static e2e: no services needed
./buddy.sh development start-cosmos && SKIP_AUTH=true ./buddy.sh development start-backend
./buddy.sh quality check --stack   # the above, then integration, full-stack e2e, Lighthouse, ZAP
```

It stops at the first red step. Mutation testing is left out (it is only
required when you changed a file in `mutation-targets.mjs`); run
`./buddy.sh test mutation` for it.

| CI job                 | Local command                                                           | Needs                                             |
| ---------------------- | ----------------------------------------------------------------------- | ------------------------------------------------- |
| `prek`                 | `./buddy.sh quality hooks` (CI skips the hooks that have their own job) | —                                                 |
| `unit`                 | `./buddy.sh test unit`                                                  | —                                                 |
| `frontend`             | `./buddy.sh test frontend`                                              | —                                                 |
| `architecture`         | `cd functions && npm run depcruise && npm run knip`                     | —                                                 |
| `opengrep`             | `./buddy.sh quality opengrep`                                           | the pinned binary ([Run OpenGrep](#run-opengrep)) |
| `iac`                  | `./buddy.sh quality iac`                                                | — (downloads pinned TFLint and Trivy)             |
| `e2e`                  | `E2E_COVERAGE=1 ./buddy.sh test e2e`                                    | Chromium                                          |
| `mutation`             | `./buddy.sh test mutation` (`--force` for a full run, as on `main`)     | —                                                 |
| `integration`          | `./buddy.sh test integration`                                           | Cosmos emulator, Azurite                          |
| `e2e-fullstack`        | `E2E_COVERAGE=1 ./buddy.sh test e2e-fullstack`                          | Cosmos emulator, backend                          |
| `lighthouse`           | `cd e2e && npm run lighthouse -- signed-out` / `-- signed-in`           | backend for `signed-in`                           |
| `zap`                  | `./buddy.sh quality zap`                                                | Docker, backend                                   |
| CodeQL (default setup) | none locally; results under Security → Code scanning                    | —                                                 |
| Load test (manual)     | `./buddy.sh test load <flow>` ([load testing](load-testing.md))         | backend, k6                                       |

## Authentication & tokens

Auth is **Microsoft Entra External ID** (OIDC). How tokens flow:

1. The SPA signs the user in with **MSAL** (popup) and requests the API scope
   `api://<clientId>/access_as_user`.
2. MSAL returns an **access token** (JWT) whose audience (`aud`) is the app's
   client id. MSAL caches the session in `localStorage` (survives refresh and
   tab close; moving it off the shared origin is #562).
3. The frontend sends it as `Authorization: Bearer <token>` on every API call.
4. `functions/src/middleware/authMiddleware.js` validates it: it reads the
   issuer + JWKS URI from the tenant's OIDC discovery document, verifies the
   RS256 signature, and checks `aud == ENTRA_CLIENT_ID`, the issuer and that
   `scp` names `access_as_user` (an ID token for the same client has no `scp`).
5. On the first authenticated call, `GET /api/me` provisions the user's Cosmos doc.

**Local no-auth mode:** set `SKIP_AUTH=true` (backend) + `devMode: true`
(frontend) — the middleware returns a fixed dev user and the SPA skips MSAL.
This is the default from the config templates. It cannot be combined with real
auth: with any `ENTRA_TENANT_ID`/`ENTRA_CLIENT_ID` set, the middleware throws
instead of honouring the bypass.

To run against a **real** tenant locally, fill `ENTRA_*` in
`functions/local.settings.json` and `entraSubdomain`/`entraClientId` in
`frontend/src/config.js`. See [Configuration](../reference/configuration.md).

## Deploy

Push to `main` → `.github/workflows/deploy.yml` runs three jobs: OpenTofu apply,
Functions publish (Flex, remote build), and GitHub Pages. Each job calls a
`buddy.sh` script (`infrastructure provision`, `publish-functions`,
`generate-config`); never run them against production by hand, the workflow is
the only path there (see [Infrastructure](infrastructure.md)).

`destroy.yml` (manual, typed confirmation) runs `tofu destroy`; the destroy
guards make it fail on the data resources by design
([Teardown](infrastructure.md#teardown)).

## Secret scanning

[gitleaks](https://github.com/gitleaks/gitleaks) runs as two pre-commit hooks
(config: [`.gitleaks.toml`](../../.gitleaks.toml)): `gitleaks` scans the staged
changes on every commit, `gitleaks-history` every commit reachable from `HEAD`
(in CI's depth-1 checkout, the full tree of the tested commit). On top of
gitleaks' default rules (including Azure AD client secrets) it has rules for
Cosmos DB connection strings with a hosted endpoint, Storage connection strings
with an account key, and Storage SAS signatures.

```bash
prek run gitleaks-history --all-files   # the CI check
gitleaks git --redact --verbose          # the same, with a local gitleaks binary
```

The Cosmos emulator key is the only allowlisted value, matched by its content.

**A false positive** gets an `[[allowlists]]` entry in `.gitleaks.toml`, scoped
with `targetRules` and matched by content, with a one-line reason. Never
`--no-verify`, never a path-wide exclusion. **A real secret** that reached a
commit is compromised: rotate it first (Azure portal / `az`), then remove it.

## Workflow linting

Two pre-commit hooks check `.github/workflows/` and `.github/actions/`:
[zizmor](https://docs.zizmor.sh) for security (config:
[`.github/zizmor.yml`](../../.github/zizmor.yml)) and
[actionlint](https://github.com/rhysd/actionlint) for correctness (YAML schema,
`${{ }}` expression types, `needs`/`outputs` references, composite-action
inputs, and ShellCheck on every `run:` block when `shellcheck` is installed).

```bash
prek run zizmor --all-files
prek run actionlint --all-files
zizmor --fix .github   # apply zizmor's auto-fixes locally; the hook only reports
```

## Run OpenGrep

[OpenGrep](https://github.com/opengrep/opengrep) (SAST) runs in its own
`opengrep` job in `gate.yml` and as a pre-commit hook, both through one script:

```bash
./buddy.sh quality opengrep   # installs the pinned, checksum-verified release binary on first run
```

- **Rule packs**: `--config auto` (the community rules for the languages
  found) plus `--config p/security-audit` (the audit pack BikeBuddy used
  before). The union is the gate; see the design decision "SAST rule packs".
- **Gate**: CI fails only on **error**-severity findings, with an annotation
  per finding; warnings and infos are report-only. Every finding goes to the job
  summary and to the Security tab (code scanning, category `opengrep`), together
  with any file OpenGrep could only partially parse. Locally, any finding fails.
- **Suppressing**: a path goes into [`.semgrepignore`](../../.semgrepignore)
  with its reason (today only the vendored bundles and generated output). A
  single line gets `// nosemgrep: <rule-id> -- <reason>` on the same line; an
  inline suppression without a reason is not merged. Suppressed findings stay
  visible in code scanning as suppressed.
- No `--autofix`: a fix made in CI is discarded, and a rewrite is reviewed like
  any other change.

## Lint

ESLint runs with `--max-warnings 0` everywhere, as pre-commit hooks and in CI's
`prek` job:

| Package      | Config                                                                | Command                                                                                                                       |
| ------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `functions/` | `functions/eslint.config.js`: recommended, `eslint-plugin-n`, SonarJS | `cd functions && npm run lint`                                                                                                |
| `frontend/`  | `functions/eslint.frontend.config.js`: recommended, SonarJS           | `functions/node_modules/.bin/eslint --config functions/eslint.frontend.config.js --max-warnings 0 frontend/src frontend/test` |
| `e2e/`       | `e2e/eslint.config.js`: typescript-eslint type-checked, Playwright    | `cd e2e && npm run lint`                                                                                                      |

- **SonarJS** (`eslint-plugin-sonarjs`, recommended) checks non-test source for
  code smells; tests are exempt (a test's job is to be exhaustive, not
  non-repetitive). `sonarjs/cognitive-complexity` is set to **11**, the lowest
  value that leaves the code clean when it was introduced. A function above it
  is split, not the number raised.
- **Playwright rules** flag fixed sleeps (`waitForTimeout`) and weak
  assertions. The remaining sleeps are timed touch gestures and Leaflet zoom
  animations, each disabled on its line with the reason.
- **Suppressions**: `// eslint-disable-next-line <rule> -- <reason>`, the
  reason on the same line; never a file-wide or blanket disable.

## Type checks

```bash
cd functions && npm run typecheck   # functions/ (@ts-check files)
cd frontend && npm run typecheck    # frontend/ (@ts-check files)
cd e2e && npm run typecheck         # tsc --noEmit over the whole e2e suite
```

- `e2e/` is TypeScript; Playwright strips types without checking them, so
  `tsc --noEmit` is the only thing that catches a type error in a page object.
- `functions/` and `frontend/` stay plain JavaScript. Their `tsconfig.json`
  (`allowJs`, `checkJs: false`, `noEmit`, `strict`) checks only files that
  opt in with `// @ts-check` on their first line: today every module in
  `functions/src/lib/` and `frontend/src/lib/`. Types come from JSDoc
  (`/** @param {...} */`, `/** @type {...} */ (expr)` casts).
- **Widening**: add `// @ts-check` to the next file and fix what it reports.
  The next strictness step is `noImplicitAny` (off today): turning it on means
  writing the JSDoc parameter types first.
- No `@ts-ignore`/`@ts-expect-error` without the reason on the same line.

All three run as pre-commit hooks and in CI's `prek` job.

## Architecture checks

[dependency-cruiser](https://github.com/sverweij/dependency-cruiser) walks the
module graph of `functions/`, `frontend/` and `e2e/` and enforces the rules in
[`.dependency-cruiser.cjs`](../../.dependency-cruiser.cjs), each with the reason
it exists:

```bash
cd functions && npm run depcruise
```

| Rule                                | Holds that                                                                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `no-circular`                       | no import cycles                                                                                                             |
| `cosmos-only-in-db`                 | only `functions/src/lib/db.js` imports `@azure/cosmos` (`init-cosmos.js`, the e2e cleanup and the query-cost guard excepted) |
| `blob-only-in-blob-storage`         | only `functions/src/lib/blobStorage.js` (and its test) imports `@azure/storage-blob`                                         |
| `handlers-share-through-lib`        | a Function handler never imports another handler                                                                             |
| `backend-lib-is-a-leaf`             | `lib/` and `middleware/` never import a handler                                                                              |
| `frontend-lib-is-pure`              | `frontend/src/lib/` never imports `ui/` or `app.js`                                                                          |
| `vendor-is-script-tags-only`        | nothing imports `frontend/src/vendor/` (classic scripts from `index.html`)                                                   |
| `no-test-code-in-production`        | production code never imports a test or test helper                                                                          |
| `e2e-is-black-box`                  | `e2e/` never imports app code                                                                                                |
| `frontend-and-backend-are-separate` | the two never import each other                                                                                              |
| `no-orphans`, `not-to-unresolvable` | no dead modules, no unresolvable imports                                                                                     |

**Known violations**: the frontend `ui/` import cycles reported in #579 are
recorded in `.dependency-cruiser-known-violations.json` and ignored; any new
violation fails. When a cycle is broken, shrink the baseline (never grow it):

```bash
functions/node_modules/.bin/depcruise --config .dependency-cruiser.cjs \
  --baseline --baseline-mode shrink-only \
  functions/src functions/scripts functions/test frontend/src frontend/test e2e
```

It runs as a pre-commit hook and in CI's `architecture` job (output in the job
summary).

## Dead code (Knip)

[Knip](https://knip.dev) reports unused files, unused exports and unused or
missing dependencies in `functions/`, `frontend/` and `e2e/` (one
`knip.jsonc` per package):

```bash
cd functions && npm run knip   # prints nothing when clean
```

The configs list only what Knip cannot follow statically, each with its reason:
Function handlers (loaded by the Functions host), operator scripts (run by
name), `frontend/src/app.js` and `sw.js` (loaded by `index.html` and the
service-worker registration), `e2e/serve.mjs` (a Playwright `webServer`
command), and global CLIs such as `func` (`ignoreBinaries`). Anything else it
reports is removed, not ignored: an export used only in its own file loses
`export`. Runs as a pre-commit hook and in CI's `architecture` job.

## Infrastructure checks (TFLint + Trivy)

`infrastructure/` is checked beyond `tofu fmt`/`tofu validate` by one script,
used by the pre-commit hook and CI's `iac` job:

```bash
./buddy.sh quality iac   # installs pinned, checksum-verified TFLint and Trivy on first run
```

- **TFLint** ([`.tflint.hcl`](../../.tflint.hcl)) with the `azurerm` ruleset:
  deprecated arguments, invalid SKUs/locations, unused declarations.
- **Trivy config** scans for misconfigurations (TLS, HTTPS-only, public
  access, encryption, logging) and fails on **HIGH/CRITICAL**. It uses the
  checks embedded in the pinned binary, so a result does not change with the
  day it runs.
- **Exceptions**: an accepted finding goes into
  [`.trivyignore.yaml`](../../.trivyignore.yaml) (Trivy) or `.tflint.hcl`
  (TFLint), one entry per finding with its reason and the issue that would
  lift it; never an inline suppression. See the design decision "IaC scan
  exceptions".
- CI uploads both SARIF files to code scanning (categories `iac`,
  `iac-tflint`) and puts both reports in the job summary.
- **What no scanner checks**: Trivy has no check for the Flex Consumption
  Function App, so `tofu test` (the `tofu-test` hook, mock providers) pins
  it instead. `infrastructure/tests/transport.tftest.hcl` fails when the app
  loses `https_only` or TLS 1.2, or when either CORS list gains a
  non-HTTPS origin.

## Coverage

```bash
./buddy.sh test unit       # functions/: Vitest with coverage and its thresholds
./buddy.sh test frontend   # frontend/src/lib: the same
E2E_COVERAGE=1 ./buddy.sh test e2e             # static journeys, V8 JS coverage of the app
E2E_COVERAGE=1 ./buddy.sh test e2e-fullstack   # full-stack journeys
```

- **Unit**: Vitest's own thresholds are the gate: 99 % globally, and **100 %
  per file** for every module in [`mutation-targets.mjs`](../../mutation-targets.mjs),
  the same list Stryker mutates, so coverage floors and mutation scope cannot
  drift. `autoUpdate` is off. The Cosmos/Blob adapters are left to the
  integration suite; `frontend/src/ui/` to Playwright.
- **E2E**: with `E2E_COVERAGE=1`, an automatic fixture in `e2e/pages/buddy-test.ts`
  collects V8 JS coverage of the app's own modules (`app.js`, `lib/`, `ui/`)
  from every test's page, and `e2e/global-teardown.ts` writes the report to
  `e2e/coverage-e2e/<suite>/` (HTML, `coverage-summary.md`) and fails the run
  below the suite's floor in `e2e/coverage.ts`. CI sets it for both suites.
- **Rules**: never lower a threshold or a floor, never auto-ratchet one, no
  `/* v8 ignore */` except the one-line `handler:` wrapper in each
  `app.http()` registration. A gap is closed with a test, or the logic is extracted
  until it can be tested; unreachable code is removed.
- **Reporting**: each job's summary shows the coverage table; Codecov gets the
  lcov files with the flags `functions` and `frontend` (carried forward when a
  path filter skips a suite) and keeps its commit status, without PR comments.

## Mutation testing

[Stryker](https://stryker-mutator.io) mutates the modules listed in
[`mutation-targets.mjs`](../../mutation-targets.mjs) (functions: handlers,
`lib/`, `middleware/`; frontend: `lib/`) and fails below each package's break
threshold:

```bash
./buddy.sh test mutation           # both packages, incremental
./buddy.sh test mutation --force   # both packages, every mutant
cd frontend && npm run mutate      # one package
```

| Package      | Break threshold | Measured (full run) |
| ------------ | --------------- | ------------------- |
| `functions/` | 98 %            | 99.40 %             |
| `frontend/`  | 98 %            | 99.80 %             |

- **Incremental**: results are kept in `reports/stryker-incremental.json`; a
  rerun only tests mutants in changed code or covered by changed tests. CI
  restores `main`'s file on PRs (actions/cache) and runs `--force` on `main`,
  because incremental mode cannot see a change in a module a target imports.
  Measured on an unchanged tree: functions 2 min 36 s → 15 s, frontend
  62 s → 7.5 s.
- **Reports**: the job summary lists every file worst score first
  (`functions/scripts/mutation-summary.mjs`); the HTML report is the
  `mutation-report-<package>` artifact; the Stryker dashboard (badge) is fed
  from `main` only, the frontend as module `frontend`.
- **Rules**: thresholds go up as survivors are killed, never down; no
  `// Stryker disable`. A survivor no test can kill (an equivalent mutant) is
  written down in the design decision "Mutation scope".
- Stryker runs Vitest through `vitest.mutation.config.js` (dot reporter, no
  coverage), so killed mutants do not show up as CI annotations.

## Property tests

[fast-check](https://fast-check.dev) property tests run inside the normal
Vitest suites (`*.property.test.js` in `functions/src/lib/`,
`frontend/test/properties.test.js`), 200 runs per property:

| Module                                   | Properties                                                                                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `functions/src/lib/parseGpx.js`          | finite, non-negative stats; in-order subset within the 5,000-point budget; only its own error on arbitrary text; 150k+ point tracks |
| `functions/src/lib/simplify.js`          | ordered subset keeping first/last; idempotent; point budget respected                                                               |
| `functions/src/lib/validation.js`        | accepted names are 1–200 chars without `<>`; `stripHtml` idempotent; valid DTOs round-trip; UUIDs                                   |
| `functions/src/lib/extractGps.js`        | coordinates in range or absent, never NaN; hemisphere sets the sign                                                                 |
| `frontend/src/lib/stats.js`, `format.js` | totals are sums of parts; formatted values parse back within their rounding                                                         |
| `frontend/src/lib/url.js`, `tours.js`    | URL state round-trips; sorting is a permutation; pages cover every item once                                                        |

### Replay a property-test failure

A failure prints the shrunk counterexample and a line like
`{ seed: 1480771125, path: "29:9", endOnFailure: true }`. Replay exactly that
run, locally or from a CI log:

```bash
cd functions && FC_SEED=1480771125 FC_PATH=29:9 npx vitest run src/lib/parseGpx.property.test.js
```

(`test/fast-check.setup.js` in each package reads `FC_SEED`/`FC_PATH`.) A
counterexample that exposes a bug becomes an example test next to the module's
other tests, linking the bug's issue, before the fix.

## Accessibility (axe-core)

Every Playwright journey checks the page with
[axe-core](https://github.com/dequelabs/axe-core) at each meaningful state:
page loaded, signed out, load error, every modal open, an upload error, the
detail panel, both colour schemes and the mobile layouts. The rules are WCAG
2.x A/AA plus axe's best practices (a dialog without a name, a missing
`<main>` or `<h1>`), and the gate is zero violations.

```ts
await on(page).a11y.check('upload modal with a file error');
```

- The helper is [`e2e/axe.ts`](../../e2e/axe.ts), reached through the page-object
  tree (`on(page).a11y`). A failure lists rule, element and axe's explanation
  (for contrast, the measured ratio) and attaches the full result to the
  Playwright report as `axe-<context>.json`.
- An accepted exclusion is a selector plus its reason in `EXCLUDED` in
  `e2e/axe.ts`; there are none today. Never disable a rule.
- `frontend/test/contrast.test.js` pins the colour tokens' contrast ratios
  (both themes), so a token change fails before any browser runs.

## Run Lighthouse

[Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci) measures the
page users load, served the way GitHub Pages serves it (under `/BikeBuddy/`,
gzip, `max-age=600`) by `e2e/lighthouse/serve-pages.mjs`, never a dev server:

```bash
cd e2e && npm run lighthouse -- signed-out   # no backend needed
./buddy.sh development start-cosmos && SKIP_AUTH=true ./buddy.sh development start-backend
cd e2e && npm run lighthouse -- signed-in    # seeds 12 tours, then measures
cd e2e && npm run lighthouse:summary         # the table CI puts in the job summary
```

- **States**: signed out (a production-shaped `config.js` with MSAL configured
  and nobody signed in) and signed in (`devMode` against the local Functions
  host, proxied at `/api`, with seeded tours of 2,000 points each).
- **Assertions** (`e2e/lighthouse/lighthouserc.<state>.json`), median of three
  runs: performance, accessibility = 100, best practices, SEO, LCP, TBT and
  CLS, set from runner measurements with margin (numbers and reasons in the
  files and the table below). Raised when a change makes room, never lowered to
  let a regression through.
- **Reports**: HTML/JSON under `e2e/lighthouse-reports/<state>/` (the
  `lighthouse-reports` artifact in CI); no LHCI server, no GitHub App, no PR
  comment.

## Run the OWASP ZAP scans

[OWASP ZAP](https://www.zaproxy.org) runs two **passive** scans in CI's `zap`
job (on changes to `frontend/`, `functions/` or `.zap/`) and locally with Docker:

```bash
./buddy.sh development start-cosmos && SKIP_AUTH=true ./buddy.sh development start-backend
./buddy.sh quality zap   # both passes; reports in zap-reports/<pass>/
```

- **Frontend pass**: `zap-baseline.py` against `frontend/src` served as GitHub
  Pages serves it (`e2e/lighthouse/serve-pages.mjs`, base path `/BikeBuddy/`,
  the meta CSP included). Rules: [`.zap/rules-frontend.tsv`](../../.zap/rules-frontend.tsv).
- **API pass**: `zap-api-scan.py -S` (safe mode: no active attacks) over the
  read-only operations in [`.zap/openapi.yaml`](../../.zap/openapi.yaml) on the
  local Functions host. Rules: [`.zap/rules-api.tsv`](../../.zap/rules-api.tsv).
- **Gate**: `-I`, so only a rule promoted to `FAIL` breaks the job: error
  disclosure (a stack trace in a response fails the API pass), CORS
  misconfiguration, cookie flags. Everything else is reported for triage.
  Header rules a static host cannot meet are `IGNORE` for the frontend only,
  each with its reason; the API can send headers, so there they stay `WARN`
  (#558, #560).
- **Reporting**: both tables in the job summary
  (`scripts/quality/zap-summary.mjs`), full reports as the `zap-report-*`
  artifacts. `allow_issue_writing: false`: the actions never open issues or
  comment.
