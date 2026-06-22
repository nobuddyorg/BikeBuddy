# BikeBuddy 🏍

BikeBuddy – Your ride, your routes, your memories. Upload GPX tours, visualize them as heatmaps, and share your adventures with ease.

![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen?logo=node.js)
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
| Backend  | Azure Functions (Node.js 20, Consumption Plan)   |
| Database | Azure Cosmos DB Serverless                       |
| Storage  | Azure Blob Storage (LRS)                         |
| Auth     | Azure AD B2C                                     |

## Getting started

```bash
cd functions
npm ci
cp local.settings.json.example local.settings.json  # fill in your values
npm run dev   # starts Azurite emulator + func start
```

Open `frontend/index.html` directly in your browser — no build step needed.
