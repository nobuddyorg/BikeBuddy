# Reference: Configuration

## Backend — `functions/local.settings.json` (or Function App settings)

| Setting                    | Purpose                                                               |
| -------------------------- | --------------------------------------------------------------------- |
| `COSMOS_CONNECTION_STRING` | Cosmos DB account connection string                                   |
| `COSMOS_DATABASE`          | Database name (`bikebuddy`)                                           |
| `BLOB_CONNECTION_STRING`   | Blob Storage connection string (`UseDevelopmentStorage=true` locally) |
| `ENTRA_TENANT_SUBDOMAIN`   | External ID subdomain, e.g. `bikebuddy` for `bikebuddy.ciamlogin.com` |
| `ENTRA_TENANT_ID`          | Directory (tenant) GUID                                               |
| `ENTRA_CLIENT_ID`          | App registration client id (also the token audience)                  |
| `SKIP_AUTH`                | `"true"` skips JWT verification (local dev only)                      |
| `LOAD_PROFILING`           | `"true"` logs per-request timings and RU for the load-test report     |
| `AzureWebJobsStorage`      | Functions host storage (`UseDevelopmentStorage=true` locally)         |
| `FUNCTIONS_WORKER_RUNTIME` | `node`                                                                |

The account-deletion job (`functions/scripts/process-deletions.js`) also reads
`GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID` and `GRAPH_CLIENT_SECRET`; the API never
does.

Set by the deploy via `infrastructure/` Tofu variables; `SKIP_AUTH` is `false`
automatically once `entra_client_id` is set. Should both ever end up set at
once, the API refuses the bypass and every request fails with a 500 rather than
silently serving all callers as the shared local dev user.

## Frontend — `frontend/src/config.js` (generated)

| Field            | Purpose                                          |
| ---------------- | ------------------------------------------------ |
| `apiBaseUrl`     | API base URL (empty locally; SWA proxies `/api`) |
| `entraSubdomain` | External ID subdomain                            |
| `entraClientId`  | App registration client id                       |
| `entraApiScope`  | `api://<clientId>/access_as_user`                |
| `devMode`        | `true` bypasses MSAL (local)                     |

Generated in CI by `./buddy.sh infrastructure generate-config`; locally copied
from `config.js.example`.

## GitHub Actions

- **Repository secrets:** `ARM_CLIENT_ID`, `ARM_CLIENT_SECRET`,
  `ARM_SUBSCRIPTION_ID`, `ARM_TENANT_ID`, `TF_BACKEND_ACCESS_KEY` (deploy);
  `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET` (account-deletion
  job); `LOAD_ACCESS_TOKEN` (k6 against the hosted API, optional).
- **`ci` environment secrets:** `CODECOV_TOKEN`, `STRYKER_DASHBOARD_API_KEY`.
- **Variables** (public, optional — unset = no-auth): `ENTRA_SUBDOMAIN`,
  `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`; `LOAD_API_URL` (k6 hosted target).
- **Required variable:** `BUDGET_CONTACT_EMAIL`, where budget alerts go;
  deploy and destroy fail while it is unset.

## Infrastructure variables (`infrastructure/variables.tf`)

`location` (default `northeurope`), `entra_*`, `budget_amount` (default 5),
`budget_contact_email` (required, no default; CI passes the
`BUDGET_CONTACT_EMAIL` repository variable), `budget_start_date`.
