# BikeBuddy 🧭

BikeBuddy – Your ride, your routes, your memories. Upload GPX tours from any ride (cycling or motorcycling), visualize them as heatmaps, and attach photos.

![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen?logo=node.js)
![Azure Functions](https://img.shields.io/badge/Azure%20Functions-v4-blue?logo=azure-functions)
![GitHub Pages](https://img.shields.io/badge/hosting-GitHub%20Pages-blue?logo=github)
![ESLint](https://img.shields.io/badge/ESLint-10-4B32C3?logo=eslint)
![Prettier](https://img.shields.io/badge/Prettier-3-F7B93E?logo=prettier)
![Vitest](https://img.shields.io/badge/tested%20with-Vitest-6E9F18?logo=vitest)
[![Tests](https://github.com/nobuddyorg/BikeBuddy/actions/workflows/tests.yml/badge.svg)](https://github.com/nobuddyorg/BikeBuddy/actions/workflows/tests.yml)
[![codecov](https://codecov.io/gh/nobuddyorg/BikeBuddy/graph/badge.svg?token=Kk7defQRUB)](https://codecov.io/gh/nobuddyorg/BikeBuddy)
![OpenGrep](https://img.shields.io/badge/SAST-OpenGrep-4A90D9)
![zizmor](https://img.shields.io/badge/GH%20Actions-zizmor-blueviolet)
![pre-commit](https://img.shields.io/badge/pre--commit-enabled-brightgreen?logo=pre-commit)

**Stack:** GitHub Pages · Azure Functions (Node 22, Flex Consumption) · Cosmos DB Serverless · Blob Storage · Microsoft Entra External ID · Leaflet · OpenTofu.

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

## License

See [LICENSE](LICENSE).
