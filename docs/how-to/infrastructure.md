# Infrastructure (OpenTofu)

All Azure resources for BikeBuddy live in `infrastructure/`: the resource
group, Cosmos DB (serverless), Storage, the Flex Consumption Functions app and
a monthly budget alert. Production changes reach Azure one way only: merge to
`main`, and `.github/workflows/deploy.yml` applies them.

## Change the infrastructure

1. Edit `infrastructure/*.tf` on a branch.
2. Check it locally; none of these touch Azure resources:

   ```bash
   cd infrastructure
   tofu fmt -recursive
   tofu init -backend=false && tofu validate
   tofu test                            # plans against mock providers
   cd .. && ./buddy.sh quality iac      # TFLint + Trivy config scan
   ```

   With read access to the subscription and the state key (see
   [State backend](#state-backend)), `tofu plan` shows what the merge will do.
   Never `tofu apply` against production by hand.

3. In the PR, paste the plan's destroy/replace lines (or say there are none). A
   plan that destroys or replaces the Cosmos account or the storage account is
   a stop-and-ask: those hold every user's data.
4. After the merge, `deploy.yml` runs `./buddy.sh infrastructure provision`
   (`tofu apply -auto-approve` with the Entra variables), then publishes the
   Functions code (`infrastructure publish-functions`, remote build so `sharp`
   compiles for Linux) and the frontend.

A new scanner exception goes in `.trivyignore.yaml` with its reason and in
[design decisions](../explanation/design-decisions.md), "IaC scan exceptions".

## Destroy guards

The resource group, the Cosmos account, its database and its `users`, `tours`
and `deletions` containers, the storage account and its `gpx-files` container
carry `lifecycle { prevent_destroy = true }` (#543). A change that would
replace or delete one fails at plan time instead of deleting user data. The
guards are never removed; a change that needs one gone is redesigned, or raised
with the maintainer first.

## State backend

OpenTofu stores state in the Azure Storage account named in the `backend
"azurerm"` block of `infrastructure/main.tf`
(`bikebuddy-tfstate-rg`/`bikebuddytfstate8769`, container `tfstate`). CI and
local plans share it. It must exist before `tofu init`, so it is created once,
outside OpenTofu:

```bash
az login && az account set --subscription <SUB_ID>
./buddy.sh infrastructure setup-state <globally-unique-name>   # only for a new environment
```

then set `storage_account_name` in `main.tf`. The state resource group lives in
`westeurope`, independent of the app's `location` variable (default
`northeurope`). The script also turns on versioning and 30-day soft delete for
the state and puts a `CanNotDelete` lock on its resource group. It is
idempotent: rerun it with the existing account's name to apply those to an
environment set up before them.

## CI credentials

CI authenticates with a service principal (#561 tracks narrowing it):

```bash
az ad sp create-for-rbac --name bikebuddy-ci --role Contributor \
  --scopes /subscriptions/<SUB_ID>
```

Repository **secrets** (Settings → Secrets and variables → Actions):

| Secret                                                      | Value                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------ |
| `ARM_CLIENT_ID`                                             | service principal `appId`                                    |
| `ARM_CLIENT_SECRET`                                         | service principal `password`                                 |
| `ARM_TENANT_ID`                                             | service principal `tenant`                                   |
| `ARM_SUBSCRIPTION_ID`                                       | target subscription ID                                       |
| `TF_BACKEND_ACCESS_KEY`                                     | state storage account key                                    |
| `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET` | app allowed to delete directory users (account-deletion job) |

The full list, including the `ci` environment secrets, is in
[Configuration](../reference/configuration.md#github-actions).

## Auth (Microsoft Entra External ID)

The repository **variables** `ENTRA_SUBDOMAIN`, `ENTRA_TENANT_ID` and
`ENTRA_CLIENT_ID` are required. A precondition on the Function App fails the
plan while any of them is empty, so a missing or renamed variable stops the
deploy rather than shipping an API without auth, and `SKIP_AUTH` is never part
of the deployed app settings (#545). No-auth mode exists only locally
(`SKIP_AUTH=true` in `functions/local.settings.json`).

## Restore user data

What stays recoverable, and for how long (#541; pinned by
`infrastructure/tests/backup.tftest.hcl`):

| Data                                    | Mechanism                                   | Window  |
| --------------------------------------- | ------------------------------------------- | ------- |
| Cosmos: `users`, `tours`, `deletions`   | Continuous backup, point-in-time restore    | 7 days  |
| Blobs: GPX files, photos, thumbnails    | Soft delete, versioning (previous versions) | 14 days |
| Blob containers                         | Container soft delete                       | 14 days |
| OpenTofu state (`bikebuddy-tfstate-rg`) | Versioning, soft delete (`setup-state`)     | 30 days |

Past the window the data is gone for good, which is also what bounds how long
a deleted account's data lingers (design decisions, "Account deletion").

**Cosmos.** A point-in-time restore creates a **new** account; it never
overwrites the live one. Pick a timestamp just before the damage:

```bash
az cosmosdb restore --resource-group bikebuddy-rg \
  --account-name <live-account> --target-database-account-name <live-account>-restore \
  --restore-timestamp 2026-09-25T10:00:00Z --location northeurope
```

Read what you need from the restored account (the same database and
container names) and write it back into the live one with a reviewed one-off
script. The restored account is not in OpenTofu state: delete it once done.

**Blobs.** Versioning is on, so a deleted or overwritten blob lives on as a
previous version: in the portal, open the blob (list with **Show deleted
blobs** and versions), pick the version and **Make current version**. From the
CLI, `az storage blob list --include vd --prefix <userId>/` lists versions and
deleted blobs. A deleted container comes back with
`az storage container list --include-deleted` and
`az storage container restore --name <container> --deleted-version <version>`.

**State.** Restore the previous version of `tfstate/bikebuddy.tfstate` the same
way, then `tofu plan` to check it matches Azure before anything is applied.

## Budget

`budget.tf` creates a monthly consumption budget on the resource group
(`budget_amount`, default 5; `budget_contact_email`; `budget_start_date`) that
mails at 80 % forecast and 100 % actual spend. See the [cost report](../cost-report.md).

## Teardown

`.github/workflows/destroy.yml` (manual) runs `tofu destroy`. It fails unless
the `confirm` input is exactly `destroy bikebuddy-rg`, runs in the `destroy`
environment (add required reviewers to it under Settings → Environments), and
shares deploy's concurrency group. With the destroy
guards in place it cannot delete the data resources; that is the point. The
state-backend resource group (`bikebuddy-tfstate-rg`) is never touched by it.
