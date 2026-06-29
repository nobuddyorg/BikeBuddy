# BikeBuddy 🧭

BikeBuddy – Your ride, your routes, your memories. Upload GPX tours from any ride (cycling or motorcycling), visualize them as heatmaps, and attach photos.

![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen?logo=node.js)
![Azure Functions](https://img.shields.io/badge/Azure%20Functions-v4-blue?logo=azure-functions)
![GitHub Pages](https://img.shields.io/badge/hosting-GitHub%20Pages-blue?logo=github)
![Azure](https://img.shields.io/badge/cloud-Azure-0078D4?logo=microsoftazure&logoColor=white)
![OpenTofu](https://img.shields.io/badge/infrastructure-OpenTofu-844FBA?logo=opentofu&logoColor=white)
![ESLint](https://img.shields.io/badge/ESLint-10-4B32C3?logo=eslint)
![Prettier](https://img.shields.io/badge/Prettier-3-F7B93E?logo=prettier)
![Vitest](https://img.shields.io/badge/tested%20with-Vitest-6E9F18?logo=vitest)
[![Gate](https://github.com/nobuddyorg/BikeBuddy/actions/workflows/gate.yml/badge.svg)](https://github.com/nobuddyorg/BikeBuddy/actions/workflows/gate.yml)
[![codecov](https://codecov.io/gh/nobuddyorg/BikeBuddy/graph/badge.svg?token=Kk7defQRUB)](https://codecov.io/gh/nobuddyorg/BikeBuddy)
[![Mutation testing badge](https://img.shields.io/endpoint?style=plastic&url=https%3A%2F%2Fbadge-api.stryker-mutator.io%2Fgithub.com%2Fnobuddyorg%2FBikeBuddy%2Fmain)](https://dashboard.stryker-mutator.io/reports/github.com/nobuddyorg/BikeBuddy/main)
![OpenGrep](https://img.shields.io/badge/SAST-OpenGrep-4A90D9)
![zizmor](https://img.shields.io/badge/GH%20Actions-zizmor-blueviolet)
[![CodeQL](https://img.shields.io/badge/security-CodeQL-blue?logo=github)](https://github.com/nobuddyorg/BikeBuddy/security/code-scanning)
![pre-commit](https://img.shields.io/badge/pre--commit-enabled-brightgreen?logo=pre-commit)
[![Last commit](https://img.shields.io/github/last-commit/nobuddyorg/BikeBuddy)](https://github.com/nobuddyorg/BikeBuddy/commits/main)
[![License: MIT](https://img.shields.io/github/license/nobuddyorg/BikeBuddy)](LICENSE)

## Quickstart

All helper scripts run through a single entry point, `./buddy.sh <group> <command>`
(`./buddy.sh --help` lists everything):

```bash
./buddy.sh development setup       # one-time: install tools + config templates (Docker must be running)
./buddy.sh development start-all   # start the full local stack → http://localhost:4280
```

## Documentation

Full docs live in [`docs/`](docs/README.md), organised by [Diátaxis](https://diataxis.fr):

- **Tutorial** — [Getting started](docs/tutorials/getting-started.md)
- **How-to** — [User guide](docs/how-to/user-guide.md) · [Developer guide](docs/how-to/developer-guide.md) (local dev, auth/tokens, deploy)
- **Reference** — [Architecture](docs/reference/architecture.md) · [Configuration](docs/reference/configuration.md)
- **Explanation** — [Design decisions](docs/explanation/design-decisions.md) · [Cost report](docs/cost-report.md)

Infrastructure details: [`infrastructure/README.md`](infrastructure/README.md). Contributor conventions: [`CLAUDE.md`](CLAUDE.md).

## Technology map

<p align="center">
  <img src="https://api.iconify.design/logos:nodejs-icon.svg?height=64" height="64" alt="Node.js" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:javascript.svg?height=64" height="64" alt="JavaScript" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:microsoft-azure.svg?height=64" height="64" alt="Azure" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/devicon:cosmosdb.svg?height=64" height="64" alt="Cosmos DB" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/fluent-mdl2:blob-storage.svg?height=58&color=%230078D4" height="58" alt="Blob Storage" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:leaflet.svg?height=48" height="48" alt="Leaflet" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/simple-icons:opentofu.svg?height=60&color=%23844FBA" height="60" alt="OpenTofu" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:docker-icon.svg?height=52" height="52" alt="Docker" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:github-icon.svg?height=60" height="60" alt="GitHub Pages" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:github-actions.svg?height=60" height="60" alt="GitHub Actions" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:vitest.svg?height=60" height="60" alt="Vitest" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:playwright.svg?height=60" height="60" alt="Playwright" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/simple-icons:stryker.svg?height=60&color=%23E74C3C" height="60" alt="Stryker" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:eslint.svg?height=60" height="60" alt="ESLint" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:prettier.svg?height=52" height="52" alt="Prettier" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/simple-icons:precommit.svg?height=56&color=%23FAB040" height="56" alt="pre-commit" />
</p>
