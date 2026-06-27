# scripts/

Every helper script runs through one entry point at the repo root:

```bash
./buddy.sh <group> <command> [options]
./buddy.sh --help          # lists all groups and commands (auto-generated)
```

`buddy.sh` just dispatches to `scripts/<group>/<command>.sh`. The `--help`
listing is generated from each script's `# Description:` line, so adding a script
needs no extra wiring. CI is the same glue: every workflow step that does real
work calls `./buddy.sh ...`, so anything CI does you can also run locally.

All scripts are `bash`, `set -euo pipefail`, and resolve paths relative to the
repo root (run them from anywhere).

## Groups

### development

| Command         | What it does                                                              | Inputs                                                                                      |
| --------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `setup`         | One-time install of local prerequisites + config templates (interactive). | Homebrew, Docker running.                                                                   |
| `start-all`     | Start the full local stack and open the app.                              | Run `setup` first.                                                                          |
| `start-cosmos`  | Start only the Cosmos DB emulator (Docker); wait for `:8081`. Idempotent. | Docker running.                                                                             |
| `start-backend` | Start only Azurite + the Functions host; wait for `:7071`.                | env: `COSMOS_CONNECTION_STRING`, `SKIP_AUTH`, ... Optional: `AZURITE_LOCATION`, `FUNC_LOG`. |

### infrastructure

| Command             | What it does                                                        | Inputs                                                                  |
| ------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `setup-state`       | One-time create of the OpenTofu remote state backend (storage).     | arg: storage account name; `az login`.                                  |
| `provision`         | `tofu init` + `apply` in `infrastructure/`, passing Entra vars.     | env: `ENTRA_*`; `az login` + `ARM_ACCESS_KEY` (or CI `ARM_*`).          |
| `publish-functions` | `func azure functionapp publish <app> --build remote --javascript`. | arg `$1` or `FUNCTIONS_APP_NAME`; `az login`/CI session.                |
| `generate-config`   | Write `frontend/config.js` from env.                                | env: `FUNCTIONS_URL`, `ENTRA_SUBDOMAIN`, `ENTRA_CLIENT_ID`, `DEV_MODE`. |

### maintenance

| Command        | What it does                                                           | Inputs                                                                          |
| -------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `delete-users` | Drain the GDPR account-deletion queue (delete queued users via Graph). | `az login` (Cosmos), `GRAPH_TENANT_ID`/`GRAPH_CLIENT_ID`/`GRAPH_CLIENT_SECRET`. |

> `functions/scripts/init-cosmos.js` (Node, not a buddy command) creates the
> `bikebuddy` DB + containers in the emulator. It is called by `start-all` and
> the full-stack e2e workflow.

## Tab completion (optional)

Source the completion script to tab-complete groups and commands:

```bash
# bash (~/.bashrc)
source "$PWD/scripts/completion/buddy-completion.bash"

# zsh (~/.zshrc)
autoload -Uz bashcompinit && bashcompinit
source "$PWD/scripts/completion/buddy-completion.bash"
```

## Examples

```bash
# Bring up a local backend the way CI does
./buddy.sh development start-cosmos
node functions/scripts/init-cosmos.js
COSMOS_CONNECTION_STRING="AccountEndpoint=http://localhost:8081/;AccountKey=<emulator-key>" \
  SKIP_AUTH=true BLOB_CONNECTION_STRING="UseDevelopmentStorage=true" \
  ./buddy.sh development start-backend

# Point the static frontend at a deployed API
FUNCTIONS_URL=https://my-api.azurewebsites.net ./buddy.sh infrastructure generate-config

# Deploy infrastructure + code (after az login + export ARM_ACCESS_KEY)
ENTRA_SUBDOMAIN=... ENTRA_TENANT_ID=... ENTRA_CLIENT_ID=... ./buddy.sh infrastructure provision
./buddy.sh infrastructure publish-functions "$(cd infrastructure && tofu output -raw functions_app_name)"
```
