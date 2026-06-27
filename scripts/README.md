# scripts/

Reusable, standalone scripts. CI is just glue: every workflow step that does
real work calls one of these, so anything CI does you can also run locally.

All scripts are `bash`, `set -euo pipefail`, and resolve paths relative to the
repo root (run them from anywhere).

| Script                                       | What it does                                                                             | Inputs                                                                                                                                                    | Used by                        |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `cosmos-emulator.sh`                         | Start the Cosmos DB Linux emulator (Docker) and wait until `:8081` is ready. Idempotent. | — (Docker must be running)                                                                                                                                | `dev.sh`, `e2e-fullstack.yml`  |
| `start-backend.sh`                           | Start Azurite + the Functions host in the background; wait for `:7071`.                  | env: `COSMOS_CONNECTION_STRING`, `BLOB_CONNECTION_STRING`, `SKIP_AUTH`, … (or `functions/local.settings.json`). Optional: `AZURITE_LOCATION`, `FUNC_LOG`. | `e2e-fullstack.yml`            |
| `generate-config.sh`                         | Write `frontend/config.js` from env.                                                     | env: `FUNCTIONS_URL`, `ENTRA_SUBDOMAIN`, `ENTRA_CLIENT_ID`, `DEV_MODE`. Optional: `CONFIG_OUT`.                                                           | `deploy.yml`                   |
| `tofu-apply.sh`                              | `tofu init` + `apply` in `infrastructure/`, passing Entra vars (empty = no-auth).        | env: `ENTRA_*`; auth via `az login` + `ARM_ACCESS_KEY` (or CI `ARM_*`).                                                                                   | `deploy.yml`                   |
| `publish-functions.sh`                       | `func azure functionapp publish <app> --build remote --javascript` (Flex).               | arg `$1` or `FUNCTIONS_APP_NAME`; `az login`/CI session.                                                                                                  | `deploy.yml`                   |
| `init-cosmos.js` _(in `functions/scripts/`)_ | Create the `bikebuddy` DB + containers in the emulator.                                  | env: `COSMOS_CONNECTION_STRING`, `COSMOS_DATABASE`.                                                                                                       | `e2e-fullstack.yml`, local dev |

## Examples

```bash
# Bring up a local backend the same way CI does
./scripts/cosmos-emulator.sh
node functions/scripts/init-cosmos.js
COSMOS_CONNECTION_STRING="AccountEndpoint=http://localhost:8081/;AccountKey=<emulator-key>" \
  SKIP_AUTH=true BLOB_CONNECTION_STRING="UseDevelopmentStorage=true" \
  ./scripts/start-backend.sh

# Point the static frontend at a deployed API
FUNCTIONS_URL=https://my-api.azurewebsites.net ./scripts/generate-config.sh

# Deploy infrastructure + code (after az login + export ARM_ACCESS_KEY)
ENTRA_SUBDOMAIN=… ENTRA_TENANT_ID=… ENTRA_CLIENT_ID=… ./scripts/tofu-apply.sh
./scripts/publish-functions.sh "$(cd infrastructure && tofu output -raw functions_app_name)"
```
