# Infrastructure (OpenTofu)

All Azure resources for BikeBuddy: resource group, Cosmos DB (serverless),
Storage, and the Functions app. The **same config** runs locally and in CI.

## TL;DR — bring everything up

```bash
az login
az account set --subscription <SUB_ID>

# one-time: create the state-backend storage (see "State backend" below)
./bootstrap.sh <globally-unique-name>      # then set storage_account_name in main.tf

export ARM_ACCESS_KEY="$(az storage account keys list -g bikebuddy-tfstate-rg \
  -n <globally-unique-name> --query '[0].value' -o tsv)"

# build the Functions package (deployed via WEBSITE_RUN_FROM_PACKAGE)
( cd ../functions && npm ci && npm prune --omit=dev \
  && zip -r ../func.zip . -x '*.test.js' 'reports/*' '.azurite/*' )

tofu init
tofu apply -var="package_path=../func.zip"
```

That's it — one `tofu apply` provisions and deploys everything.

## State backend (the one prerequisite)

OpenTofu stores state in an Azure Storage account. That account must exist
**before** `tofu init`, so it can't be created by the apply itself. `bootstrap.sh`
creates it once. Storage account names are globally unique, so pick your own and
put it in the `backend "azurerm"` block in `main.tf`.

Local runs and CI share this same remote state, so they never diverge.

## CI credentials (GitHub Actions only — not needed locally)

Locally you authenticate with `az login`. CI uses a service principal instead:

```bash
az ad sp create-for-rbac --name bikebuddy-ci --role Contributor \
  --scopes /subscriptions/<SUB_ID>
```

Store these as repo **secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|--------|-------|
| `ARM_CLIENT_ID` | service principal `appId` |
| `ARM_CLIENT_SECRET` | service principal `password` |
| `ARM_TENANT_ID` | service principal `tenant` |
| `ARM_SUBSCRIPTION_ID` | target subscription ID |
| `TF_BACKEND_ACCESS_KEY` | state storage account key |

CI then runs the exact same `tofu apply` (see `.github/workflows/deploy.yml`).

## Auth (Microsoft Entra External ID)

Optional repo **variables** wire real auth; leave unset to run in no-auth mode:
`ENTRA_SUBDOMAIN`, `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`. `SKIP_AUTH` flips off
automatically once `entra_client_id` is set.

## Teardown

```bash
tofu destroy -var="package_path=../func.zip"
```

This removes `bikebuddy-rg` but not the state-backend resource group
(`bikebuddy-tfstate-rg`) — delete that separately if you want a full wipe.
