# BikeBuddy 🏍

BikeBuddy – Your ride, your routes, your memories. Upload GPX tours, visualize them as heatmaps, and share your adventures with ease.

![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen?logo=node.js)
![Azure Functions](https://img.shields.io/badge/Azure%20Functions-v4-blue?logo=azure-functions)
![Azure Static Web Apps](https://img.shields.io/badge/Azure%20Static%20Web%20Apps-free%20tier-blue?logo=microsoft-azure)
![ESLint](https://img.shields.io/badge/ESLint-10-4B32C3?logo=eslint)
![Prettier](https://img.shields.io/badge/Prettier-3-F7B93E?logo=prettier)
![Vitest](https://img.shields.io/badge/tested%20with-Vitest-6E9F18?logo=vitest)
[![Tests](https://github.com/nobuddyorg/BikeBuddy/actions/workflows/tests.yml/badge.svg)](https://github.com/nobuddyorg/BikeBuddy/actions/workflows/tests.yml)
[![codecov](https://codecov.io/gh/nobuddyorg/BikeBuddy/graph/badge.svg?token=Kk7defQRUB)](https://codecov.io/gh/nobuddyorg/BikeBuddy)
![OpenGrep](https://img.shields.io/badge/SAST-OpenGrep-4A90D9)
![zizmor](https://img.shields.io/badge/GH%20Actions-zizmor-blueviolet)
![pre-commit](https://img.shields.io/badge/pre--commit-enabled-brightgreen?logo=pre-commit)

## Stack

| Layer    | Technology                                       |
| -------- | ------------------------------------------------ |
| Frontend | Plain HTML/CSS/JS · Leaflet.js · Leaflet.heat    |
| Backend  | Azure Functions (Node.js 22, Consumption Plan)   |
| Database | Azure Cosmos DB Serverless                       |
| Storage  | Azure Blob Storage (LRS)                         |
| Auth     | Azure AD B2C                                     |

## Getting started

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop) (runs the Cosmos DB emulator) — must be running
- [Homebrew](https://brew.sh) (macOS) for the one-time setup script

### One-time setup

```bash
./setup.sh
```

Interactively installs Node 22, Azure Functions Core Tools v4, Azurite, the
Azure Static Web Apps CLI and `prek`, pulls the Cosmos DB emulator image, and
copies the config templates. Then fill in your values (or keep the local-dev
defaults — see below):

- `functions/local.settings.json` — `COSMOS_CONNECTION_STRING`, `B2C_*`
- `frontend/config.js` — `b2cTenant`, `b2cClientId`

### Run the full stack locally

```bash
./dev.sh
```

This brings up everything and opens the app at `http://localhost:4280`:

- **App** (Static Web App via SWA CLI) — `http://localhost:4280`
- **Functions API** — `http://localhost:7071/api`
- **Cosmos DB** — emulator at `http://localhost:8081` (explorer `http://localhost:1234`)
- **Blob storage** — Azurite

The emulator container (`bikebuddy-cosmos`) is left running between sessions;
stop it with `docker stop bikebuddy-cosmos`.

### Local auth (no Azure needed)

For local development you don't need a real Azure AD B2C tenant:

- `functions/local.settings.json` → `"SKIP_AUTH": "true"` makes the API skip JWT
  verification and use a local dev user.
- `frontend/config.js` → `devMode: true` makes the frontend skip MSAL and call
  the API directly.

Both are set by the config templates for local use. **Never** enable them in a
deployed environment.

### Tests, lint, format

```bash
cd functions
npm test        # Vitest unit tests
npm run lint    # ESLint
npm run format  # Prettier
```
