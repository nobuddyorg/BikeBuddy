# BikeBuddy

BikeBuddy – Your ride, your routes, your memories. Upload GPX tours from any ride (cycling or motorcycling), visualize them as routes on the map, and attach photos.

**Stack**
[![Node.js](https://img.shields.io/badge/node-%3E%3D24-brightgreen?logo=nodedotjs&logoColor=white)](https://github.com/nobuddyorg/BikeBuddy/blob/main/functions/package.json)
[![Azure Functions](https://img.shields.io/badge/Azure%20Functions-v4-blue?logo=azurefunctions&logoColor=white)](https://github.com/nobuddyorg/BikeBuddy/blob/main/docs/reference/architecture.md)
[![GitHub Pages](https://img.shields.io/badge/hosting-GitHub%20Pages-blue?logo=github)](https://github.com/nobuddyorg/BikeBuddy/blob/main/docs/reference/architecture.md)
[![Azure](https://img.shields.io/badge/cloud-Azure-0078D4?logo=microsoftazure&logoColor=white)](https://github.com/nobuddyorg/BikeBuddy/blob/main/docs/how-to/infrastructure.md)
[![OpenTofu](https://img.shields.io/badge/infrastructure-OpenTofu-844FBA?logo=opentofu&logoColor=white)](https://github.com/nobuddyorg/BikeBuddy/blob/main/infrastructure)

**Lint & format**
[![ESLint](https://img.shields.io/badge/lint-ESLint-4B32C3?logo=eslint&logoColor=white)](https://github.com/nobuddyorg/BikeBuddy/blob/main/functions/eslint.config.js)
[![Prettier](https://img.shields.io/badge/format-Prettier-F7B93E?logo=prettier&logoColor=white)](https://github.com/nobuddyorg/BikeBuddy/blob/main/functions/.prettierrc.json)
[![SonarJS](https://img.shields.io/badge/code%20smells-SonarJS-4E9BCD?logo=sonar&logoColor=white)](https://github.com/nobuddyorg/BikeBuddy/blob/main/functions/eslint.config.js)
[![TypeScript check](https://img.shields.io/badge/types-tsc%20checkJs-3178C6?logo=typescript&logoColor=white)](https://github.com/nobuddyorg/BikeBuddy/blob/main/functions/tsconfig.json)
[![markdownlint](https://img.shields.io/badge/docs-markdownlint-000000?logo=markdown&logoColor=white)](https://github.com/nobuddyorg/BikeBuddy/blob/main/.markdownlint-cli2.jsonc)
[![typos](https://img.shields.io/badge/spelling-typos-2F6DB5)](https://github.com/nobuddyorg/BikeBuddy/blob/main/.typos.toml)
[![EditorConfig](https://img.shields.io/badge/style-EditorConfig-FEFEFE?logo=editorconfig&logoColor=black)](https://github.com/nobuddyorg/BikeBuddy/blob/main/.editorconfig)
[![actionlint](https://img.shields.io/badge/workflows-actionlint-2088FF?logo=githubactions&logoColor=white)](https://github.com/nobuddyorg/BikeBuddy/blob/main/.pre-commit-config.yaml)
[![TFLint](https://img.shields.io/badge/IaC%20lint-TFLint-844FBA?logo=opentofu&logoColor=white)](https://github.com/nobuddyorg/BikeBuddy/blob/main/.tflint.hcl)
[![prek](https://img.shields.io/badge/hooks-prek-brightgreen)](https://github.com/nobuddyorg/BikeBuddy/blob/main/.pre-commit-config.yaml)

**Architecture**
[![dependency-cruiser](https://img.shields.io/badge/architecture-dependency--cruiser-orange)](https://github.com/nobuddyorg/BikeBuddy/blob/main/.dependency-cruiser.cjs)
[![Knip](https://img.shields.io/badge/dead%20code-Knip-000000?logo=knip&logoColor=white)](https://github.com/nobuddyorg/BikeBuddy/blob/main/functions/knip.jsonc)

**Security**
[![gitleaks](https://img.shields.io/badge/secrets-gitleaks-C0392B)](https://github.com/nobuddyorg/BikeBuddy/blob/main/.gitleaks.toml)
[![zizmor](https://img.shields.io/badge/GH%20Actions-zizmor-blueviolet)](https://github.com/nobuddyorg/BikeBuddy/blob/main/.github/zizmor.yml)
[![Opengrep](https://img.shields.io/badge/SAST-Opengrep-blue?logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB2aWV3Qm94PSI4MCA2MTAgNjIgNTciIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgZmlsbD0ibm9uZSI%2BPHBhdGggZD0iTTExNyA2MTguOUMxMTEuNCA2MjQuOSAxMTAuNiA2MzQuNSAxMTAuOSA2MzguNkg5OC4zQzk4LjggNjI2LjEgMTAzLjIgNjE5LjkgMTA1LjMgNjE4LjNDMTA2LjIgNjE3LjUgMTA4LjYgNjE2IDExMS4zIDYxNkMxMTQgNjE2IDExNi4yIDYxOCAxMTcgNjE4LjlaTTExNyA2MTguOUMxMjIuNSA2MjQuOSAxMjMuMyA2MzQuNSAxMjMuMSA2MzguNkgxMzUuNkMxMzUuMSA2MjYuMSAxMzAuOCA2MTkuOSAxMjguNyA2MTguM0MxMjcuOCA2MTcuNSAxMjUuNCA2MTYgMTIyLjYgNjE2QzExOS45IDYxNiAxMTcuNyA2MTggMTE3IDYxOC45Wk0xMDQuNyA2NTguM0M5OS4xIDY1Mi4zIDk4LjMgNjQyLjcgOTguNiA2MzguN0g4NkM4Ni41IDY1MS4xIDkwLjkgNjU3LjQgOTMgNjU4LjlDOTMuOSA2NTkuNyA5Ni4zIDY2MS4yIDk5IDY2MS4yQzEwMS43IDY2MS4yIDEwMy45IDY1OS4zIDEwNC43IDY1OC4zWk0xMDQuNyA2NTguM0MxMTAuMiA2NTIuMyAxMTEgNjQyLjcgMTEwLjggNjM4LjdIMTIzLjNDMTIyLjggNjUxLjEgMTE4LjUgNjU3LjQgMTE2LjQgNjU4LjlDMTE1LjUgNjU5LjcgMTEzIDY2MS4yIDExMC4zIDY2MS4yQzEwNy42IDY2MS4yIDEwNS40IDY1OS4zIDEwNC43IDY1OC4zWiIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIzLjUiLz48L3N2Zz4%3D)](https://github.com/nobuddyorg/BikeBuddy/security/code-scanning?query=tool%3A%22Opengrep+OSS%22)
[![CodeQL](https://img.shields.io/badge/security-CodeQL-blue?logo=github)](https://github.com/nobuddyorg/BikeBuddy/security/code-scanning?query=tool%3ACodeQL)
[![Trivy](https://img.shields.io/badge/IaC%20misconfig-Trivy-1904DA?logo=trivy&logoColor=white)](https://github.com/nobuddyorg/BikeBuddy/security/code-scanning?query=tool%3ATrivy)
[![OWASP ZAP](https://img.shields.io/badge/DAST-OWASP%20ZAP-FFC933?logo=owasp&logoColor=white)](https://github.com/nobuddyorg/BikeBuddy/blob/main/.zap)
[![lockfile-lint](https://img.shields.io/badge/supply%20chain-lockfile--lint-CB3837?logo=npm&logoColor=white)](https://github.com/nobuddyorg/BikeBuddy/blob/main/.pre-commit-config.yaml)

**Tests**
[![Vitest](https://img.shields.io/badge/unit-Vitest-6E9F18?logo=vitest&logoColor=white)](https://github.com/nobuddyorg/BikeBuddy/blob/main/functions/vitest.config.js)
[![Playwright](https://img.shields.io/badge/e2e-Playwright-2EAD33?logo=playwright&logoColor=white)](https://github.com/nobuddyorg/BikeBuddy/blob/main/e2e/playwright.config.ts)
[![Accessibility](https://img.shields.io/badge/a11y-axe--core-663399?logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIj48IS0tISBGb250IEF3ZXNvbWUgRnJlZSA2LjcuMiBieSBAZm9udGF3ZXNvbWUgLSBodHRwczovL2ZvbnRhd2Vzb21lLmNvbSBMaWNlbnNlIC0gaHR0cHM6Ly9mb250YXdlc29tZS5jb20vbGljZW5zZS9mcmVlIChJY29uczogQ0MgQlkgNC4wLCBGb250czogU0lMIE9GTCAxLjEsIENvZGU6IE1JVCBMaWNlbnNlKSBDb3B5cmlnaHQgMjAyNCBGb250aWNvbnMsIEluYy4gLS0%2BPHBhdGggZmlsbD0iI2ZmZmZmZiIgZD0iTTAgMjU2YTI1NiAyNTYgMCAxIDEgNTEyIDBBMjU2IDI1NiAwIDEgMSAwIDI1NnptMTYxLjUtODYuMWMtMTIuMi01LjItMjYuMyAuNC0zMS41IDEyLjZzLjQgMjYuMyAxMi42IDMxLjVsMTEuOSA1LjFjMTcuMyA3LjQgMzUuMiAxMi45IDUzLjYgMTYuM2wwIDUwLjFjMCA0LjMtLjcgOC42LTIuMSAxMi42bC0yOC43IDg2LjFjLTQuMiAxMi42IDIuNiAyNi4yIDE1LjIgMzAuNHMyNi4yLTIuNiAzMC40LTE1LjJsMjQuNC03My4yYzEuMy0zLjggNC44LTYuNCA4LjgtNi40czcuNiAyLjYgOC44IDYuNGwyNC40IDczLjJjNC4yIDEyLjYgMTcuOCAxOS40IDMwLjQgMTUuMnMxOS40LTE3LjggMTUuMi0zMC40bC0yOC43LTg2LjFjLTEuNC00LjEtMi4xLTguMy0yLjEtMTIuNmwwLTUwLjFjMTguNC0zLjUgMzYuMy04LjkgNTMuNi0xNi4zbDExLjktNS4xYzEyLjItNS4yIDE3LjgtMTkuMyAxMi42LTMxLjVzLTE5LjMtMTcuOC0zMS41LTEyLjZMMzM4LjcgMTc1Yy0yNi4xIDExLjItNTQuMiAxNy04Mi43IDE3cy01Ni41LTUuOC04Mi43LTE3bC0xMS45LTUuMXpNMjU2IDE2MGE0MCA0MCAwIDEgMCAwLTgwIDQwIDQwIDAgMSAwIDAgODB6Ii8%2BPC9zdmc%2B)](https://github.com/nobuddyorg/BikeBuddy/blob/main/e2e/axe.ts)
[![fast-check](https://img.shields.io/badge/property%20tests-fast--check-B5372E)](https://github.com/nobuddyorg/BikeBuddy/blob/main/functions/test/fast-check.setup.js)
[![codecov](https://codecov.io/gh/nobuddyorg/BikeBuddy/graph/badge.svg?token=Kk7defQRUB)](https://codecov.io/gh/nobuddyorg/BikeBuddy)
[![Mutation testing badge](https://img.shields.io/endpoint?style=plastic&url=https%3A%2F%2Fbadge-api.stryker-mutator.io%2Fgithub.com%2Fnobuddyorg%2FBikeBuddy%2Fmain)](https://dashboard.stryker-mutator.io/reports/github.com/nobuddyorg/BikeBuddy/main)

**Performance**
[![Lighthouse CI](https://img.shields.io/badge/performance-Lighthouse%20CI-F44B21?logo=lighthouse&logoColor=white)](https://github.com/nobuddyorg/BikeBuddy/blob/main/e2e/lighthouse)
[![Load test (k6)](https://github.com/nobuddyorg/BikeBuddy/actions/workflows/k6-load-test.yml/badge.svg)](https://github.com/nobuddyorg/BikeBuddy/actions/workflows/k6-load-test.yml)

**Status**
[![Gate](https://github.com/nobuddyorg/BikeBuddy/actions/workflows/gate.yml/badge.svg)](https://github.com/nobuddyorg/BikeBuddy/actions/workflows/gate.yml)
[![Deploy](https://github.com/nobuddyorg/BikeBuddy/actions/workflows/deploy.yml/badge.svg)](https://github.com/nobuddyorg/BikeBuddy/actions/workflows/deploy.yml)
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
- **How-to** — [User guide](docs/how-to/user-guide.md) · [Developer guide](docs/how-to/developer-guide.md) (local dev, auth/tokens, deploy) · [Load testing](docs/how-to/load-testing.md)
- **Reference** — [Architecture](docs/reference/architecture.md) · [Configuration](docs/reference/configuration.md)
- **Explanation** — [Design decisions](docs/explanation/design-decisions.md) · [Cost report](docs/cost-report.md)

Infrastructure details: [Infrastructure how-to](docs/how-to/infrastructure.md). Contributor conventions: [Contributing guide](CONTRIBUTING.md).

## Screenshot

![BikeBuddy map view with ride routes and tour sidebar](docs/assets/screenshots/map-overview.png)

## Technology map

<p align="center">
  <img src="https://api.iconify.design/logos:nodejs-icon.svg?height=88" height="88" alt="Node.js" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:javascript.svg?height=88" height="88" alt="JavaScript" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:typescript-icon.svg?height=88" height="88" alt="TypeScript" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:zod.svg?height=76" height="76" alt="Zod" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:microsoft-azure.svg?height=88" height="88" alt="Azure" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/devicon:cosmosdb.svg?height=88" height="88" alt="Cosmos DB" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/fluent-mdl2:blob-storage.svg?height=80&color=%230078D4" height="80" alt="Blob Storage" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:leaflet.svg?height=66" height="66" alt="Leaflet" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/simple-icons:opentofu.svg?height=82&color=%23844FBA" height="82" alt="OpenTofu" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:docker-icon.svg?height=72" height="72" alt="Docker" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:github-icon.svg?height=82" height="82" alt="GitHub Pages" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:github-actions.svg?height=82" height="82" alt="GitHub Actions" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/vscode-icons:file-type-codeql.svg?height=78" height="78" alt="CodeQL" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/vscode-icons:file-type-zizmor.svg?height=78" height="78" alt="zizmor" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:vitest.svg?height=82" height="82" alt="Vitest" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:playwright.svg?height=82" height="82" alt="Playwright" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/simple-icons:stryker.svg?height=82&color=%23E74C3C" height="82" alt="Stryker" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/simple-icons:codecov.svg?height=80&color=%23F01F7A" height="80" alt="Codecov" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:eslint.svg?height=82" height="82" alt="ESLint" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:prettier.svg?height=72" height="72" alt="Prettier" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/simple-icons:precommit.svg?height=78&color=%23FAB040" height="78" alt="pre-commit" />
</p>
