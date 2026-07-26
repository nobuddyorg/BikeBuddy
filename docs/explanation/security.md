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
- The API validates JWTs (issuer, audience, RS256) and scopes Cosmos queries to
  the caller's partition.
- Uploads are validated by magic bytes and resized server-side; images are served
  via short-lived SAS URLs, not public containers.

## Browser hardening

The frontend is deployed to GitHub Pages, which serves static files and offers no
way to set response headers. The Content-Security-Policy therefore ships as a
`<meta http-equiv>` tag in `frontend/src/index.html`, which browsers enforce for
everything the document loads.

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
