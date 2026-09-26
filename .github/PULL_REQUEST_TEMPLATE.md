<!-- Outside pull requests are closed without review; fork instead (CONTRIBUTING.md). -->

<!-- One ticket per PR where possible. -->

## What & why

<!-- What does this change and why? -->

Closes #

## Changes

-

## Security-relevant

<!-- Auth, ownership, partitioning, SAS scope or the deletion job: one line on what it now allows or denies. Otherwise "None". -->

## Infrastructure

<!-- A change under infrastructure/**: paste the plan's destroy/replace lines ("None" if there are none). Otherwise delete this section. -->

## Verification

<!-- The Definition of done in CLAUDE.md, run from the repo root in its order. Tick what ran; say why a step did not. -->

- [ ] `./buddy.sh quality check` (hooks, unit, frontend, static e2e with coverage)
- [ ] `./buddy.sh test mutation` (a file in `mutation-targets.mjs` changed)
- [ ] `./buddy.sh quality check --stack` (integration, full-stack e2e, Lighthouse, ZAP)
- [ ] Load test comparison attached (a change to a hot path)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
