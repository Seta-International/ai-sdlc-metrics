# ADR 0002 — Hand-rolled Bot Framework adapter (no `botbuilder` / `teams-ai`)

- Status: Accepted
- Date: 2026-05-11
- Deciders: Platform team

## Context

Microsoft Teams is the P1 channel surface. Microsoft ships several SDKs for building bots — `botbuilder` (classic), `@microsoft/teams-ai`, and `@microsoft/agents-hosting` (M365 Agents SDK). All three are heavy, opinionated, and pull in large dependency trees.

The Bot Framework protocol itself is straightforward: REST + JWT + JSON activities. Validating the JWT, replying via `serviceUrl/v3/conversations/:id/activities`, and minting an outbound client-credentials token cover the happy path in well under 500 LOC.

## Decision

`modules/channels/teams` implements the Bot Framework REST surface directly, using `jose` for JWT validation and plain `fetch` for outbound calls. No Microsoft SDK runtime dependencies.

## Consequences

- Full visibility into the request path — every byte we send is in our codebase.
- Maintenance tax: we own JWKS rotation, channel auth changes, new activity types, proactive-messaging trust tokens, and Teams-specific quirks. Budget ~1 day/quarter of MS-protocol drift work.
- Trigger to revisit: if drift exceeds ~2 days/quarter at P3, consider adopting one of the SDKs.

See spec §7 for the implementation patterns.
