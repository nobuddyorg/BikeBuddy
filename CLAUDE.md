# BikeBuddy — Claude Code Guidelines

## Project Overview

BikeBuddy is an Azure-hosted web app for bike tour management — usable for any ride, cycling or motorcycling. Users upload GPX files, see their rides as interactive heatmaps, and attach photos to tours.

**Stack:** GitHub Pages (frontend) · Azure Functions Node.js 22, Flex Consumption (backend API) · Azure Cosmos DB Serverless (database) · Azure Blob Storage (files) · Microsoft Entra External ID (auth) · Leaflet.js + Leaflet.heat (maps) · OpenTofu (infrastructure)

**Cost target:** < €5/month on the free/serverless tier.

---

## Repository Structure

```text
/
├── frontend/          # GitHub Pages site — plain HTML/CSS/JS, no bundler
│   ├── src/                   # the published site (this dir is what Pages deploys)
│   │   ├── index.html         # loads app.js as <script type="module">
│   │   ├── app.js             # ES-module entry; imports pure helpers from src/lib/
│   │   ├── lib/               # pure, unit-tested helpers: format, tours, files
│   │   ├── style.css
│   │   ├── config.js.example  # committed; src/config.js is generated in CI (gitignored)
│   │   └── vendor/            # vendored MSAL Browser (served locally, not a CDN)
│   └── test/                  # Vitest unit tests for src/lib/
├── functions/         # Azure Functions app (Node.js 22, Flex Consumption)
│   ├── host.json
│   ├── package.json
│   ├── local.settings.json.example   # committed; actual file is gitignored
│   ├── src/
│   │   ├── lib/                       # shared helpers: db, blobStorage, parseGpx, validation, …
│   │   ├── middleware/authMiddleware.js
│   │   ├── <FunctionName>/index.js    # one folder per function (GetTours, UploadTour, …)
│   │   └── <module>.test.js           # Vitest unit tests next to each module
│   └── test/integration/             # HTTP integration tests against a real func host
├── infrastructure/    # OpenTofu (azurerm): Cosmos, Storage, Flex Functions
├── e2e/               # Playwright tests: tests/ (static UI) + tests-fullstack/ (real backend)
├── buddy.sh           # single entry point: ./buddy.sh <group> <command>
├── scripts/           # helper scripts, grouped: development/ infrastructure/ maintenance/
├── docs/
└── CLAUDE.md
```

---

## Development Commands

```bash
# Backend (Azure Functions)
cd functions
npm ci
npm run dev        # starts Azurite emulator + func start (via concurrently)
npm test           # Vitest unit tests (src/**/*.test.js)
npm run test:integration  # HTTP tests vs a real func host (needs Cosmos + Azurite up)
npm run lint       # ESLint
npm run format     # Prettier

# Helper scripts run through one entry point: ./buddy.sh <group> <command>
# (./buddy.sh --help lists every group/command, auto-generated from each script)
./buddy.sh development setup       # one-time: install tools + config templates
./buddy.sh development start-all   # full local stack (Cosmos emulator + Functions + Azurite + SWA proxy)

# Infrastructure (OpenTofu) via buddy.sh, or raw in infrastructure/
./buddy.sh infrastructure setup-state <state-storage-name>   # one-time: create the tofu state backend
./buddy.sh infrastructure provision                          # tofu init && apply (provision/update Azure)

# Frontend unit tests (plain JS, no bundler — Vitest over src/lib/)
cd frontend && npm ci
npm test               # Vitest unit tests

# End-to-end tests (Playwright) — all suites live in e2e/
cd e2e && npm ci
npm test               # static UI tests (serves frontend/src, no backend)
npm run test:fullstack # full stack against a running local stack

# No build step for the site — open frontend/src/index.html directly or via the SWA CLI proxy
```

**Prerequisites:** Node.js 22, Azure Functions Core Tools v4, Azurite (`npm i -g azurite`), OpenTofu, Docker (Cosmos emulator).

---

## Architecture Decisions

- **No framework for frontend.** Plain JS to keep the site static and avoid a build pipeline. Leaflet is loaded from CDN; **MSAL Browser is vendored** in `frontend/src/vendor/` (served locally, not CDN).
- **Node.js, not Python, for Functions.** Faster cold starts; better Azure SDK support for Cosmos DB and Blob Storage. Backend runs on **Flex Consumption** (scale-to-zero, ~€0 idle, no App Service VM quota).
- **Cosmos DB partition key:** `users` → `/id`, `tours` → `/userId`. Never query cross-partition unless absolutely necessary.
- **`heatmapData` is never returned in list endpoints** (`GET /api/tours`). Fetch it only in the detail endpoint to keep list payloads small.
- **GPX files > 5,000 trackpoints are downsampled** before storing `heatmapData`. Keeps Cosmos DB documents under the 2 MB limit.
- **Images are resized (max 2000px)** with `sharp` before storing in Blob Storage. Never store originals.
- **SAS URLs** for serving images — not public Blob containers. Generate short-lived SAS tokens in the API.

---

## Authentication

All API endpoints (except public health checks) require a valid Microsoft Entra External ID JWT in the `Authorization: Bearer <token>` header. Use the shared `authMiddleware.js` — never inline auth logic in individual functions.

The middleware attaches `context.userId` and `context.userEmail` for downstream use.

When `ENTRA_CLIENT_ID` is unset the API runs in **no-auth mode** (`SKIP_AUTH=true`) and the frontend falls back to a shared `local-dev-user` — used for local dev. Real per-user auth is enabled by setting the `ENTRA_*` repo variables (the External ID tenant now exists).

---

## Security Rules

- Validate all user input with `zod` schemas before touching the database or storage.
- Validate file uploads by **magic bytes**, not just extension or Content-Type header.
- Use parameterized Cosmos DB queries (the SDK does this automatically when using the query builder — don't concatenate strings).
- Never log JWTs, connection strings, or user PII.
- `local.settings.json` is gitignored — use `local.settings.json.example` with placeholder values.

---

## Cost Guard Rails

- Always use **Serverless** capacity for Cosmos DB — never provisioned throughput.
- Cosmos DB index policy: exclude `heatmapData` and `images` arrays from indexing (they're not queried).
- Azure Functions: **Flex Consumption (FC1)** only. No Premium plan.
- Blob Storage: LRS redundancy. No GRS.
- Frontend: GitHub Pages (free).
- Microsoft Entra External ID: Free tier (50,000 MAU/month).

---

## Issue Tracking

Issues are organized into epics on GitHub:

| Epic | Issues  | Description                    |
| ---- | ------- | ------------------------------ |
| #2   | #3–#8   | Azure Infrastructure Setup     |
| #9   | #10–#12 | User Auth & Profile            |
| #13  | #14–#20 | Tour Management (GPX)          |
| #21  | #22–#25 | Map & Heatmap                  |
| #26  | #27–#30 | Image Management (later phase) |
| #31  | #32–#34 | CI/CD & Developer Experience   |

Start with epics in order: #2 → #9 → #13 → #21 → #31 → #26.

---

## Code Style

- ESLint `eslint:recommended` + Node.js plugin; Prettier (2-space indent, single quotes).
- No comments unless the **why** is non-obvious (hidden constraint, workaround, subtle invariant).
- Function names: camelCase. Files: camelCase for JS modules, kebab-case for Azure Function folders.
- Prefer `async/await` over `.then()` chains.
- Keep each Azure Function in its own folder (`<FunctionName>/index.js`).

---

## Testing

- Unit tests with Vitest for: GPX parsing logic, auth middleware, input validation.
- No mocking of Cosmos DB or Blob Storage in unit tests — use Azurite for local integration.
- Test file: `<module>.test.js` next to the module.
- **Integration tests** live in `functions/test/integration/` and hit a real `func start` host over HTTP (status codes + payloads). Their vitest globalSetup starts the host and stops it after; Cosmos + Azurite must be up (`./buddy.sh development start-cosmos` + `start-azurite`). Run with `npm run test:integration`.
- **Frontend:** pure logic lives in `frontend/src/lib/*.js` (ES modules) so it's importable; Vitest tests live in `frontend/test/`. Keep DOM/auth/map glue in `app.js`; extract anything testable into `lib/`.

---

## CI / quality gates

One workflow — `gate.yml` — gates every PR with a fail-fast chain of jobs (each runs only if the previous passed):

| Job             | Guarantees                                                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prek`          | All pre-commit hooks: ESLint + Prettier (`functions/`, `frontend/`, `e2e/`), shellcheck, markdownlint, zizmor, file hygiene, **OpenGrep SAST**, and **`tofu fmt` + `tofu validate`**. |
| `unit`          | Functions Vitest unit tests + coverage (Codecov). Needs `prek`.                                                                                                                       |
| `frontend`      | Frontend Vitest unit tests (`frontend/test/` over `src/lib/`). Needs `unit`.                                                                                                          |
| `e2e`           | Playwright static UI tests (`e2e/tests/`, serves `frontend/src`, no backend). Needs `unit`.                                                                                           |
| `e2e-fullstack` | Playwright against the real backend (Functions + Cosmos emulator + Azurite). Needs `unit`.                                                                                            |
| `integration`   | Functions HTTP integration tests; starts a real func host (+ Cosmos + Azurite) and hits the endpoints. Needs `unit`.                                                                  |
| `mutation`      | Stryker mutation tests (`npm run mutate`); fails below the 85% break threshold. Needs `unit`.                                                                                         |

Because `prek` runs the OpenGrep and OpenTofu hooks (the CI job installs the tofu CLI), there's no separate security or infra-check workflow. Run all hooks locally with `prek run --all-files`.

---

## Deployment

One workflow — `.github/workflows/deploy.yml` — deploys everything on push to `main`, in order:

1. **Infra:** `tofu init && tofu apply` provisions/updates Azure resources and outputs the Functions app name + URL.
2. **Functions:** `func azure functionapp publish <name> --build remote --javascript` (Core Tools). Flex Consumption deploys code from a blob package container, **not** `WEBSITE_RUN_FROM_PACKAGE` — do **not** use `azure/functions-action` (its Kudu/zip path targets wwwroot, which Flex ignores → 404). `--build remote` compiles `sharp` for Linux; `--javascript` is required because CI has no `local.settings.json`.
3. **Frontend:** generates `config.js` from the infrastructure outputs + `ENTRA_*` repo variables, then publishes to **GitHub Pages** (<https://nobuddy.org/BikeBuddy/>).

- Every workflow step that does real work calls `./buddy.sh <group> <command>` (the same scripts you run locally); see [docs/how-to/developer-guide.md](docs/how-to/developer-guide.md).
- The tofu **state backend** (a storage account) is a one-time prerequisite created by `./buddy.sh infrastructure setup-state`. It is not managed by tofu.
- `destroy.yml` (manual `workflow_dispatch`) runs `tofu destroy`.
- Secrets in GitHub repository **secrets** (`ARM_*`, `TF_BACKEND_ACCESS_KEY`); public Entra values in repo **variables** (`ENTRA_*`) — never in code.
