# How-to: Develop, test & deploy

## Local development

Every helper script runs through one entry point — `./buddy.sh <group> <command>`
(`./buddy.sh --help` lists them all). Full stack (Cosmos emulator + Functions +
Azurite + SWA proxy):

```bash
./buddy.sh development start-all   # run `./buddy.sh development setup` first if tools are missing
```

Or piece by piece (these are the same scripts CI runs, so anything CI does you
can reproduce locally):

```bash
./buddy.sh development start-cosmos   # Cosmos emulator
node functions/scripts/init-cosmos.js # create DB + containers
./buddy.sh development start-backend  # Azurite + Functions host (:7071)
```

`buddy.sh` dispatches to `scripts/<group>/<command>.sh`; `./buddy.sh --help`
lists every command (generated from each script's `# Description:` line).

**Tab completion** (the `kubectl` pattern) — add to `~/.bashrc` or `~/.zshrc`:

```bash
eval "$(./buddy.sh completion)"
```

(`eval`, rather than `source <(...)`, also works in macOS's system bash 3.2.)

## Tests, lint, format

```bash
cd functions && npm test            # Vitest unit tests
cd e2e && npm test                  # Playwright (static UI)
cd e2e && npm run test:fullstack    # Playwright against the real backend
prek run --all-files                # all lint/format/security hooks
```

CI gates: see the [CI / quality gates table in CLAUDE.md](../../CLAUDE.md#ci--quality-gates).

## Authentication & tokens

Auth is **Microsoft Entra External ID** (OIDC). How tokens flow:

1. The SPA signs the user in with **MSAL** (popup) and requests the API scope
   `api://<clientId>/access_as_user`.
2. MSAL returns an **access token** (JWT) whose audience (`aud`) is the app's
   client id. The session is cached in `sessionStorage` (survives refresh,
   cleared on tab close).
3. The frontend sends it as `Authorization: Bearer <token>` on every API call.
4. `functions/src/middleware/authMiddleware.js` validates it: it reads the
   issuer + JWKS URI from the tenant's OIDC discovery document, verifies the
   RS256 signature, and checks `aud == ENTRA_CLIENT_ID` and the issuer.
5. On the first authenticated call, `GET /api/me` provisions the user's Cosmos doc.

**Local no-auth mode:** set `SKIP_AUTH=true` (backend) + `devMode: true`
(frontend) — the middleware returns a fixed dev user and the SPA skips MSAL.
This is the default from the config templates. Never enable it in a deployed env.

To run against a **real** tenant locally, fill `ENTRA_*` in
`functions/local.settings.json` and `entraSubdomain`/`entraClientId` in
`frontend/config.js`. See [Configuration](../reference/configuration.md).

## Deploy

Push to `main` → `.github/workflows/deploy.yml` runs three jobs: OpenTofu apply,
Functions publish (Flex, remote build), and GitHub Pages. To run the same steps
by hand: `./buddy.sh infrastructure provision`, `./buddy.sh infrastructure publish-functions`,
`./buddy.sh infrastructure generate-config` (see [Infrastructure](infrastructure.md)).

`destroy.yml` (manual) tears the infrastructure down.
