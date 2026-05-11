# ADR 0004 — Flip the monorepo to public before the first npm publish

- Status: Accepted
- Date: 2026-05-11
- Deciders: Platform team

## Context

P1 ships selected packages to npm under `@seta/*` under Apache-2.0. The Apache-2.0 license requires source availability — publishing a built artifact while the source is hidden violates the licence's spirit and creates legal risk.

The monorepo is private during P1 development to allow internal iteration without external review pressure.

## Decision

- Monorepo stays **private** for the duration of P1 implementation.
- Before the first `npm publish` (target: P1 close-out), the repo is flipped to **public**.
- Pre-flip checklist runs in the last week of P1: security scrub (no secrets in git history), dep audit, README + CONTRIBUTING, code of conduct, CLA decision.
- The CI release workflow only runs on `main` after the flip; until then no `NPM_TOKEN` is provisioned.

## Consequences

- The release workflow stays dormant until the flip — no accidental publishes.
- `@seta/placeholder@0.0.0` is published + deprecated on day 1 to lock the npm scope; this is a one-line manual step (`tooling/scripts/claim-npm-scope.sh`).
- Public packages enforce zero imports from private workspace packages. `tooling/scripts/check-public-private.ts` is wired in CI; the build fails if a `"private": false` package imports a `"private": true` package.

See spec §9 ("Open-source publishing strategy") for the full plan.
