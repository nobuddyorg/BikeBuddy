# Security Policy

Found a vulnerability? **Don't open a public issue** — report it privately via
GitHub [security advisories](https://github.com/nobuddyorg/BikeBuddy/security/advisories/new)
(Security → Report a vulnerability).

Scope and the security model are documented in
[docs/explanation/security.md](docs/explanation/security.md).

## Secret scanning

Every commit and every CI run is scanned for credentials with gitleaks
(default rules plus Azure Cosmos/Storage/SAS rules in [`.gitleaks.toml`](.gitleaks.toml)).
The Cosmos emulator key is the one allowlisted value; it is public by design.
Handling a finding or a false positive:
[Developer guide, Secret scanning](docs/how-to/developer-guide.md#secret-scanning).
