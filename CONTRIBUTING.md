# Contributing to BikeBuddy

## No outside contributions

BikeBuddy is a personal hobby project. I don't accept pull requests, issues or
feature requests from outside the project; they are closed without review.

Want to change something? **Fork it.** The [MIT License](LICENSE) lets you
use, change and redistribute the code in your own fork, no need to ask. There
is no support for forks.

Found a security vulnerability? Report it privately as described in the
[security policy](SECURITY.md).

The rest of this guide is how the project itself is worked on; it applies
equally to a fork. Start with the [documentation index](docs/README.md) to see
how everything fits together.

## Getting started

Follow the [Getting started tutorial](docs/tutorials/getting-started.md) to
install the toolchain and run the stack locally. Local dev, auth, testing, and
deploys are covered in the [Developer guide](docs/how-to/developer-guide.md).

## How we work

- Branch off `main` (a hook blocks direct commits).
- One ticket per commit; reference the issue number in the message.
- Open a PR into `main` and wait for green CI before merging.

Code style is enforced by the pre-commit hooks (ESLint + Prettier); run them
with `./buddy.sh quality hooks`. The full CI quality gates are defined in
[`.github/workflows/gate.yml`](.github/workflows/gate.yml).

## Before you push

Work through the [Definition of done](CLAUDE.md#definition-of-done), in its
order; it is the same for people and AI assistants. `./buddy.sh quality check`
runs the part that needs no services, `--stack` the rest against the local
stack. Each command is explained in
[Run the checks CI runs, locally](docs/how-to/developer-guide.md#run-the-checks-ci-runs-locally).
Which layer a new test belongs in: [TEST_STRATEGY.md](TEST_STRATEGY.md) and
[testing.md](docs/reference/testing.md).
