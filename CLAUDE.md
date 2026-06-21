# BikeBuddy — Claude Code Guidelines

## Project Overview

BikeBuddy is an Azure-hosted web app for motorcycle tour management. Users upload GPX files, see their rides as interactive heatmaps, and attach photos to tours.

**Stack:** Azure Static Web App (frontend) · Azure Functions Node.js 20 (backend API) · Azure Cosmos DB Serverless (database) · Azure Blob Storage (files) · Azure AD B2C (auth) · Leaflet.js + Leaflet.heat (maps)

**Cost target:** < €5/month on the Azure free/serverless tier.

---

## Repository Structure

```
/
├── frontend/          # Static Web App — plain HTML/CSS/JS, no bundler
│   ├── index.html
│   ├── app.js
│   └── style.css
├── functions/         # Azure Functions app (Node.js)
│   ├── host.json
│   ├── package.json
│   ├── local.settings.json.example   # committed; actual file is gitignored
│   └── src/
│       ├── middleware/authMiddleware.js
│       └── <FunctionName>/
│           └── index.js
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
npm test           # Jest unit tests
npm run lint       # ESLint
npm run format     # Prettier

# No build step for frontend — open frontend/index.html directly or via Static Web App CLI
```

**Prerequisites:** Node.js 20, Azure Functions Core Tools v4, Azurite (`npm i -g azurite`).

---

## Architecture Decisions

- **No framework for frontend.** Plain JS to keep the Static Web App truly static and avoid a build pipeline. Use CDN links for Leaflet and MSAL.
- **Node.js, not Python, for Functions.** Faster cold starts on Consumption plan; better Azure SDK support for Cosmos DB and Blob Storage.
- **Cosmos DB partition key:** `users` → `/id`, `tours` → `/userId`. Never query cross-partition unless absolutely necessary.
- **`heatmapData` is never returned in list endpoints** (`GET /api/tours`). Fetch it only in the detail endpoint to keep list payloads small.
- **GPX files > 5,000 trackpoints are downsampled** before storing `heatmapData`. Keeps Cosmos DB documents under the 2 MB limit.
- **Images are resized (max 2000px)** with `sharp` before storing in Blob Storage. Never store originals.
- **SAS URLs** for serving images — not public Blob containers. Generate short-lived SAS tokens in the API.

---

## Authentication

All API endpoints (except public health checks) require a valid Azure AD B2C JWT in the `Authorization: Bearer <token>` header. Use the shared `authMiddleware.js` — never inline auth logic in individual functions.

The middleware attaches `context.userId` and `context.userEmail` for downstream use.

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
- Azure Functions: Consumption plan only. No Premium plan.
- Blob Storage: LRS redundancy. No GRS.
- Static Web App: Free tier.
- Azure AD B2C: Free tier (50,000 MAU/month).

---

## Issue Tracking

Issues are organized into epics on GitHub:

| Epic | Issues | Description |
|------|--------|-------------|
| #2  | #3–#8   | Azure Infrastructure Setup |
| #9  | #10–#12 | User Auth & Profile |
| #13 | #14–#20 | Tour Management (GPX) |
| #21 | #22–#25 | Map & Heatmap |
| #26 | #27–#30 | Image Management (later phase) |
| #31 | #32–#34 | CI/CD & Developer Experience |

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

- Unit tests with Jest for: GPX parsing logic, auth middleware, input validation.
- No mocking of Cosmos DB or Blob Storage in unit tests — use Azurite for local integration.
- Test file: `<module>.test.js` next to the module.

---

## Deployment

- **Functions:** GitHub Actions workflow `.github/workflows/deploy-functions.yml` deploys on push to `main`.
- **Frontend:** Azure Static Web App auto-deploys from `main` via its own GitHub Actions workflow (generated by Azure).
- Secrets stored in GitHub repository secrets — never in code.
