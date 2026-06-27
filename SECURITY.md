# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Instead, report privately via GitHub's
[security advisories](https://github.com/nobuddyorg/BikeBuddy/security/advisories/new)
(Security → Report a vulnerability).

Include what you found, how to reproduce it, and the impact you expect. We'll
acknowledge within a few days and keep you posted on the fix.

## Scope

BikeBuddy stores user-uploaded GPX tracks (location data) and photos, behind
Microsoft Entra External ID auth. Of particular interest: auth/token handling,
cross-user data access, file-upload handling, and SAS URL exposure.

## Good to know

- Secrets live in GitHub Actions secrets, never in the repo.
- The API validates JWTs (issuer, audience, RS256) and scopes Cosmos queries to
  the caller's partition.
- Uploads are validated by magic bytes and resized server-side; images are
  served via short-lived SAS URLs, not public containers.
