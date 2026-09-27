# Security

## Reporting a vulnerability

Do **not** open a public issue for security problems. Report privately via
GitHub [security advisories](https://github.com/nobuddyorg/BikeBuddy/security/advisories/new)
(Security → Report a vulnerability). Include what you found, how to reproduce it,
and the impact you expect. We acknowledge within a few days and keep you posted
on the fix.

## Scope

BikeBuddy stores user-uploaded GPX tracks (location data) and photos behind
Microsoft Entra External ID auth. Of particular interest: auth/token handling,
cross-user data access, file-upload handling, and SAS URL exposure.

## Posture

- Secrets live in GitHub Actions secrets, never in the repo.
- The API validates JWTs (issuer, audience, RS256, and the `access_as_user`
  scope, so an ID token for the same client is refused) and scopes Cosmos queries to
  the caller's partition. Two local-only settings change that, and both fail
  closed: `SKIP_AUTH` is refused once Entra is configured, and
  `ENTRA_OIDC_METADATA_URL` (the integration suite's local test issuer) is
  honoured only for a loopback URL outside Azure; any other value makes every
  authenticated request fail rather than fall back to Entra.
- Every endpoint is tested with real signed tokens for two users: the owner
  succeeds, another user gets the same 404 as a nonexistent id, and every
  rejected credential (none, malformed, expired, not yet valid, wrong audience
  or issuer, foreign key, `alg: none`, HS256, no or another scope, an ID token)
  gets 401 with nothing written (`functions/test/integration/`).
- Uploads are validated by magic bytes and resized server-side; images are served
  via short-lived SAS URLs, not public containers.
- User text (tour names and descriptions, profile names) is stored as typed,
  only trimmed (#574). XSS is prevented where it is shown: the page writes it
  through `textContent` or `value`, and the frontend ESLint config fails on every
  HTML-parsing sink (`innerHTML` other than clearing, `insertAdjacentHTML`,
  Leaflet's string tooltips and popups, ...). `e2e/tests/tour-name-markup.spec.ts`
  shows a name with markup literally.

## Browser hardening

The frontend is deployed to GitHub Pages, which serves static files and offers no
way to set response headers. The Content-Security-Policy therefore ships as a
`<meta http-equiv>` tag in `frontend/src/index.html`, which browsers enforce for
everything the document loads.

The committed policy is the development one: it allows any
`*.azurewebsites.net`, `*.blob.core.windows.net` and `*.ciamlogin.com` host,
and Azurite at `http://127.0.0.1:10000`. The deploy narrows it in the published
page (#560): `infrastructure tighten-csp` (`functions/scripts/lib/productionCsp.js`)
replaces each wildcard with this deployment's exact API, storage and Entra
hosts, and drops Azurite. It fails the deploy if a host is not a bare `https`
origin, or if the development policy no longer contains what it replaces. The
post-deploy smoke test checks the served page names the API and no development
host. `style-src 'unsafe-inline'` stays: Leaflet positions its map elements
with inline styles.

Three protections cannot be delivered that way and are currently **not** in effect:

- `frame-ancestors` / `X-Frame-Options` — browsers ignore `frame-ancestors` in a
  meta CSP, so there is no clickjacking defence.
- `Strict-Transport-Security` — no HSTS pin, though the site is HTTPS-only in
  practice.
- `Permissions-Policy` — geolocation, camera and microphone are not denied up
  front.

Closing those requires a proxy in front of the origin (a CDN with header rules)
or a move off GitHub Pages. Until then the repo deliberately holds no header
config file, so what is committed matches what is served.
