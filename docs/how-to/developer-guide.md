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

./buddy.sh quality hooks        # all lint/format/security hooks (the CI `prek` gate)
./buddy.sh quality format       # auto-format with Prettier
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

## Authentication & tokens

Auth is **Microsoft Entra External ID** (OIDC). How tokens flow:

1. The SPA signs the user in with **MSAL** (popup) and requests the API scope
   `api://<clientId>/access_as_user`.
2. MSAL returns an **access token** (JWT) whose audience (`aud`) is the app's
   client id. The session is cached in `sessionStorage` (survives refresh,
   cleared on tab close).
3. The frontend sends it as `Authorization: Bearer <token>` on every API call.
4. `functions/src/middleware/authMiddleware.js` validates it: it reads the
   issuer + JWKS URI from the tenant's OIDC discovery document, verifies the
   RS256 signature, and checks `aud == ENTRA_CLIENT_ID` and the issuer.
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
Functions publish (Flex, remote build), and GitHub Pages. To run the same steps
by hand: `./buddy.sh infrastructure provision`, `./buddy.sh infrastructure publish-functions`,
`./buddy.sh infrastructure generate-config` (see [Infrastructure](infrastructure.md)).

`destroy.yml` (manual) tears the infrastructure down.

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
./buddy.sh quality opengrep   # installs the pinned version on first run
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
cd functions && npm run typecheck   # functions/ and frontend/ (@ts-check files)
cd e2e && npm run typecheck         # tsc --noEmit over the whole e2e suite
```

- `e2e/` is TypeScript; Playwright strips types without checking them, so
  `tsc --noEmit` is the only thing that catches a type error in a page object.
- `functions/` and `frontend/` stay plain JavaScript. Their `tsconfig.json`
  (`allowJs`, `checkJs: false`, `noEmit`, `strict`) checks only files that
  opt in with `// @ts-check` on their first line: today every module in
  `functions/src/lib/` and `frontend/src/lib/`. Types come from JSDoc
  (`/** @param {...} */`, `/** @type {...} */ (expr)` casts). frontend/'s check
  runs with functions' TypeScript install, like its ESLint.
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

| Rule                                | Holds that                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `no-circular`                       | no import cycles                                                                                       |
| `cosmos-only-in-db`                 | only `functions/src/lib/db.js` imports `@azure/cosmos` (operator scripts and the e2e cleanup excepted) |
| `blob-only-in-blob-storage`         | only `functions/src/lib/blobStorage.js` imports `@azure/storage-blob` (backfill scripts excepted)      |
| `handlers-share-through-lib`        | a Function handler never imports another handler                                                       |
| `backend-lib-is-a-leaf`             | `lib/` and `middleware/` never import a handler                                                        |
| `frontend-lib-is-pure`              | `frontend/src/lib/` never imports `ui/` or `app.js`                                                    |
| `vendor-is-script-tags-only`        | nothing imports `frontend/src/vendor/` (classic scripts from `index.html`)                             |
| `no-test-code-in-production`        | production code never imports a test or test helper                                                    |
| `e2e-is-black-box`                  | `e2e/` never imports app code                                                                          |
| `frontend-and-backend-are-separate` | the two never import each other                                                                        |
| `no-orphans`, `not-to-unresolvable` | no dead modules, no unresolvable imports                                                               |

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
