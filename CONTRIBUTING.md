# Contributing to BikeBuddy

Thanks for helping out! This is a small, free-tier project — see the
[docs](docs/README.md) for how it fits together.

## Setup

```bash
./setup.sh   # one-time: tools + config templates (Docker must be running)
./dev.sh     # full local stack → http://localhost:4280
```

See the [Developer guide](docs/how-to/developer-guide.md) for local dev, auth/tokens, and deploys.

## Workflow

- **Branch off `main`** — never commit to `main` directly (a hook blocks it).
- **One ticket per commit**; reference the issue number in the message, e.g.
  `fix(auth): backfill name on login (#97)`.
- Open a **PR** into `main`. CI must be green; merge with a merge commit once
  required checks pass (0 reviews required, no admin override).

## Before you push

Run the same checks CI runs:

```bash
cd functions && npm test        # unit tests
cd e2e && npm test              # static UI e2e
cd e2e && npm run test:fullstack # full-stack e2e (needs the local stack up)
prek run --all-files            # lint, format, security, markdown, editorconfig
```

The quality gates are listed in [CLAUDE.md](CLAUDE.md#ci--quality-gates).

## Code style

ESLint + Prettier (2-space, single quotes) for JS; Prettier + markdownlint for
docs; `tofu fmt` for infra; shellcheck for scripts. All enforced by pre-commit.
Comment only when the _why_ is non-obvious.

## Reporting issues

Use the issue templates. For security problems, follow [SECURITY.md](SECURITY.md)
instead of opening a public issue.
