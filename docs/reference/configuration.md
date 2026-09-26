# Reference: Configuration

## Backend — `functions/local.settings.json` (or Function App settings)

| Setting                      | Purpose                                                               |
| ---------------------------- | --------------------------------------------------------------------- |
| `COSMOS_CONNECTION_STRING`   | Cosmos DB account connection string                                   |
| `COSMOS_DATABASE`            | Database name (`bikebuddy`)                                           |
| `BLOB_CONNECTION_STRING`     | Blob Storage connection string (`UseDevelopmentStorage=true` locally) |
| `ENTRA_TENANT_SUBDOMAIN`     | External ID subdomain, e.g. `bikebuddy` for `bikebuddy.ciamlogin.com` |
| `ENTRA_TENANT_ID`            | Directory (tenant) GUID                                               |
| `ENTRA_CLIENT_ID`            | App registration client id (also the token audience)                  |
| `SKIP_AUTH`                  | `"true"` skips JWT verification (local dev only)                      |
| `ENTRA_OIDC_METADATA_URL`    | Test issuer's metadata URL; loopback only, refused inside Azure       |
| `LOAD_PROFILING`             | `"true"` logs per-request timings and RU for the load-test report     |
| `UPLOAD_RATE_LIMIT_PER_HOUR` | Uploads per rider per hour (default 100, #549); local stacks raise it |
| `AzureWebJobsStorage`        | Functions host storage (`UseDevelopmentStorage=true` locally)         |
| `FUNCTIONS_WORKER_RUNTIME`   | `node`                                                                |

The account-deletion job (`functions/scripts/process-deletions.js`) also reads
`GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID` and `GRAPH_CLIENT_SECRET`; the API never
does.

Set by the deploy via `infrastructure/` Tofu variables. The deployed app never
gets `SKIP_AUTH`, and the plan fails while any of the three `ENTRA_*` values
is empty, so a missing repository variable stops the deploy instead of
shipping an API without auth (#545; pinned by
`infrastructure/tests/auth.tftest.hcl`). Should `SKIP_AUTH` and Entra ever end
up set at once, the API refuses the bypass and every request fails with a 500
rather than silently serving all callers as the shared local dev user.

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

## Infrastructure variables (`infrastructure/variables.tf`)

`location` (default `northeurope`), `entra_*`, `budget_amount` (default 5),
`budget_contact_email` (default in `variables.tf`; moving it to a repository
variable is #636), `budget_start_date`.
