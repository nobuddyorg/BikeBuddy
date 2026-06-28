# Tutorial: Getting started locally

By the end you'll have BikeBuddy running on your machine and your first GPX tour
on the map. No Azure account needed — everything runs against local emulators.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop) (runs the Cosmos DB emulator) — **must be running**
- macOS with [Homebrew](https://brew.sh) (the setup script uses it)

## 1. Install the toolchain

```bash
./buddy.sh local setup
```

This interactively installs Node 22, Azure Functions Core Tools v4, Azurite,
the SWA CLI, OpenTofu, and `prek`, pulls the Cosmos emulator image, and copies
the config templates. The defaults run in **no-auth mode** (`SKIP_AUTH=true`,
`devMode`), so you can skip filling in any secrets for now.

## 2. Start the stack

```bash
./buddy.sh development start-all
```

It brings everything up and opens the app at <http://localhost:4280>:

- **App** (SWA CLI proxy) — `http://localhost:4280`
- **Functions API** — `http://localhost:7071/api`
- **Cosmos DB** emulator — `http://localhost:8081` (explorer `http://localhost:1234`)
- **Blob storage** — Azurite

## 3. Upload your first tour

1. The app auto-signs-in as a local dev user.
2. Click **Upload GPX**, give it a name, drop a `.gpx` file.
3. It appears in the sidebar and as a heatmap on the map. Click it to focus, add
   photos, or edit it.

## Next steps

- Day-to-day usage → [User guide](../how-to/user-guide.md)
- Work on the code, auth, or deploys → [Developer guide](../how-to/developer-guide.md)
