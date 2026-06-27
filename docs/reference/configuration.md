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

Set by the deploy via `infrastructure/` Tofu variables; `SKIP_AUTH` is `false`
automatically once `entra_client_id` is set.

## Frontend — `frontend/config.js` (generated)

| Field            | Purpose                                          |
| ---------------- | ------------------------------------------------ |
| `apiBaseUrl`     | API base URL (empty locally; SWA proxies `/api`) |
| `entraSubdomain` | External ID subdomain                            |
| `entraClientId`  | App registration client id                       |
| `entraApiScope`  | `api://<clientId>/access_as_user`                |
| `devMode`        | `true` bypasses MSAL (local)                     |

Generated in CI by `scripts/generate-config.sh`; locally copied from
`config.js.example`.

## GitHub Actions

- **Secrets:** `ARM_CLIENT_ID`, `ARM_CLIENT_SECRET`, `ARM_SUBSCRIPTION_ID`, `ARM_TENANT_ID`, `TF_BACKEND_ACCESS_KEY`, `CODECOV_TOKEN`.
- **Variables** (public, optional — unset = no-auth): `ENTRA_SUBDOMAIN`, `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`.

## Infrastructure variables (`infrastructure/variables.tf`)

`location` (default `northeurope`), `entra_*`, `budget_amount` (default 5),
`budget_contact_email`, `budget_start_date`.
