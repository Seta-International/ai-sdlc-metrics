# SCOPE — modules/channels/teams  (@seta/teams)

## Purpose

Generic Microsoft Teams / Bot Framework transport adapter. Owns the wire protocol — JWKS-backed inbound JWT verification, Zod-validated activity schemas, outbound bot-token (client-credentials) cache, async reply transport, and the Teams SSO `signin/tokenExchange` → OBO bridge — and exposes a `Handler` interface that products implement. **No product knowledge lives here.** Hand-rolled per setup.md §7 to keep request-path visibility and shed `botbuilder` / `teams-ai` runtime weight (setup.md §7, ADR-0002).

## Responsibilities

- **Owns:**
  - The `/teams/messages` and `/teams/health` Hono routes (setup.md §11, `modules/channels/teams/src/routes.ts`).
  - JWKS resolution + `jose.jwtVerify` against `https://login.botframework.com/v1/.well-known/keys` with multi-matching-kid handling and stateless JWKS cache (setup.md §7 `jose` patterns).
  - Bot-framework activity Zod schemas: `Activity`, `MessageActivity`, `InvokeActivity`, `TokenExchangeActivity` (setup.md §11 `activity.ts`).
  - Outbound bot token (client-credentials → `login.microsoftonline.com/botframework.com/oauth2/v2.0/token`), LRU-cached ~1h (setup.md §7 table).
  - Outbound reply transport: `POST {serviceUrl}/v3/conversations/{id}/activities` — return 200 immediately, post the reply asynchronously (setup.md §7 table).
  - Teams SSO `signin/tokenExchange` activity → Entra OBO via `@seta/oauth` (setup.md §7 table, §11 `sso.ts`).
  - The `TeamsHandler` interface (`onMessage`, `onConversationUpdate`, `onInvoke`) and the `teamsRouter(handler)` factory (setup.md §11 `handler.ts`, `index.ts`).
  - Teams app manifest + icons (setup.md §11 `manifest/`).

- **Does NOT own:**
  - Any product logic — no Planner calls, no agent kernel calls, no adaptive-card content. Cards and tool wiring live in `@seta/agent`. (CLAUDE.md boundary rules; setup.md §11 §11.)
  - Connector imports. Channels never import connectors. Outbound Graph calls do not originate here — a product implements `TeamsHandler` and calls connectors itself. (setup.md §11 boundary rules.)
  - Database schema. The Bot Framework adapter is stateless aside from in-process LRU caches; JWKS cache that survives cold start uses Postgres/Redis owned by `@seta/oauth` or the host app, not a `connector_teams_*` schema. (setup.md §7 stateless deployments note.)

## Current state (Epic 1)

Epic 1 was auth-focused; the Teams channel is a scaffold only.

- `modules/channels/teams/src/index.ts` is `export {}` — no `teamsRouter`, no `TeamsHandler`, no JWT/JWKS/SSO code yet.
- `modules/channels/teams/src/index.test.ts` is a `placeholder` assertion.
- `package.json` declares the right surface deps from setup.md §13 (`hono@4.12.18`, `jose@6.2.3`, `lru-cache@11.3.6`, `zod@4.4.3`, `@seta/oauth`, `@seta/tenant`) — wired but not yet used.

Everything below is the contract future work must respect; nothing is implemented yet.

## Public interface

All exports from `modules/channels/teams/src/index.ts`. Signatures only — bodies forbidden in this document.

- `routes(handler: TeamsHandler) => Hono` — **mandatory `routes(handler?: Handler) => Hono` export** per CLAUDE.md "every `modules/*` package exports `routes`". Mounts `POST /messages` and `GET /health`. Apps choose the prefix (setup.md §11 composition example uses `/teams`).
- `teamsRouter(handler: TeamsHandler) => Hono` — alias retained for setup.md §11 wording (`teamsRouter(teamsHandler)`). May be the same callable as `routes`; pick one and re-export the other.
- `TeamsHandler` — interface with `onMessage(ctx, activity)`, `onConversationUpdate(ctx, activity)`, `onInvoke(ctx, activity)` (setup.md §11 `handler.ts`).
- `Activity`, `MessageActivity`, `InvokeActivity`, `TokenExchangeActivity` — Zod schemas + inferred types (setup.md §11 `activity.ts`).
- `verifyBotFrameworkJwt(token: string) => Promise<JwtPayload>` — internal-but-exported for tests; encapsulates `createRemoteJWKSet` + `jwtVerify` + multi-kid handling (setup.md §7).
- `getBotToken() => Promise<string>` — outbound client-credentials token, LRU-cached (setup.md §7).
- `replyToActivity(serviceUrl: string, conversationId: string, activity: OutboundActivity) => Promise<void>` — async reply (setup.md §7).
- `exchangeTeamsSsoForGraphToken(ssoToken: string, scopes: string[]) => Promise<string>` — `signin/tokenExchange` → OBO via `@seta/oauth` (setup.md §7).
- `teamsAppManifest` — app manifest JSON for Teams admin upload (setup.md §11 `manifest/`).

## Imports

- **Allowed internal:**
  - `@seta/oauth` — OBO and bot-token client-credentials grants; KMS-envelope token vault (setup.md §11 dep direction `modules/channels/* → platform/oauth`; setup.md §13).
  - `@seta/tenant` — `tenantContext.getTenantId()` for the in-handler tenant binding (setup.md §13; CLAUDE.md "tenant id is never a function parameter").
  - `@seta/middleware`, `@seta/observability`, `@seta/audit`, `@seta/db`, `@seta/auth` — permitted by setup.md §11 dep direction `modules/channels/* → platform/{middleware,observability,oauth,db,auth,tenant,audit}`. Use only when needed (e.g., `@seta/middleware` for error mapping; `@seta/db` only for a stateless JWKS-cache row per setup.md §7).

- **Forbidden:**
  - **Any `modules/products/*` package** including `@seta/agent` — channels never import products (CLAUDE.md boundaries; setup.md §11 `Channels never import products`).
  - **Any `modules/connectors/*` package** including `@seta/connector-ms365-planner`, `@seta/connector-ms365-directory` — channels never import connectors (CLAUDE.md; setup.md §11).
  - **Any other `modules/channels/*` package** — channels never import other channels (CLAUDE.md; setup.md §11).
  - `@seta/agent-core` — the kernel belongs to products, not transport.
  - `botbuilder`, `botbuilder-core`, `@microsoft/teams-ai` — explicit non-pick (setup.md §7 "hand-rolled — no Microsoft SDK"; ADR-0002).
  - `openai`, `@anthropic-ai/sdk` — no LLM at the transport layer.

- **External (pinned per setup.md §13):**
  - `hono@4.12.18`
  - `jose@6.2.3`
  - `zod@4.4.3`
  - `lru-cache@11.3.6`
  - Dev: `vitest@4.1.5`, `tsup@8.5.1`, `typescript@6.0.3`, `@types/node@24`.

## Patterns to follow

- **JWKS via `createRemoteJWKSet(new URL(...), { cooldownDuration })`** — URL **object**, not string; `cooldownDuration: 30_000` throttles refetches on unknown `kid` (setup.md §7 jose pattern 1).
- **`jose.jwtVerify(token, JWKS, { issuer, audience, algorithms: ["RS256"], clockTolerance: 60 })`** — pin algs, allow ≤60s clock drift (setup.md §7 jose pattern 2).
- **Handle `ERR_JWKS_MULTIPLE_MATCHING_KEYS`** during MS key rotation — two valid keys can briefly match the same kid (setup.md §7 jose pattern 3).
- **Stateless JWKS cache** — persist `jose.JWKSCacheInput` across cold starts (Postgres or Redis); read on boot, write back on `cache.uat` change (setup.md §7 "Stateless deployments").
- **Async reply pattern** — return HTTP 200 to Bot Framework immediately; POST the reply to `serviceUrl/v3/conversations/:id/activities` after handler resolves (setup.md §7 table "Reply transport").
- **Bot token LRU** — `lru-cache` with ~1h TTL on the client-credentials response (setup.md §7 table).
- **Adaptive Cards are just JSON** — `adaptivecards-templating` is **optional** and lives in `@seta/agent`, not here (setup.md §7 table "hand-built JSON + optional templating"; `@seta/agent/package.json` carries the dep).
- **Tenant id from context** — read via `tenantContext.getTenantId()`; never accept as a parameter (CLAUDE.md "Tenant id is never a function parameter").
- **Idempotent webhook entry** — Bot Framework will replay activities on retry; use the activity `id` as the natural key (CLAUDE.md "Idempotent external boundaries").
- **`routes(handler) => Hono` factory shape** — single mandated module export shape (CLAUDE.md "Every `modules/*` package exports `routes(handler?: Handler) => Hono`").
- **Errors throw `DomainError` subclasses from `@seta/middleware/errors`** — RFC 7807 mapping happens centrally (CLAUDE.md conventions; setup.md §15).

## Patterns to avoid

- **Importing `@seta/agent`, `@seta/connector-ms365-planner`, `@seta/connector-ms365-directory`, or any other module package** — boundary rule violation; CI guard would reject (CLAUDE.md; setup.md §11).
- **Importing `botbuilder`, `botbuilder-core`, `botbuilder-dialogs`, `@microsoft/teams-ai`** — the entire point of this package is to not depend on them (setup.md §7; ADR-0002).
- **Calling Graph directly from the channel** — Graph calls belong to connectors, invoked from products via the handler (setup.md §11 boundary rules; dep direction).
- **`createRemoteJWKSet(stringUrl)`** — silently broken; jose 6.x requires `URL` (setup.md §7 jose pattern 1).
- **Omitting `algorithms`** in `jwtVerify` — opens "none"/HS-confusion attack surface (setup.md §7 jose pattern 2).
- **Per-cold-start JWKS refetch with no cache** — hits MS rate limits (setup.md §7 "Stateless deployments").
- **Synchronous reply on the inbound request** — Bot Framework expects an immediate 200; reply via the outbound transport (setup.md §7 table).
- **Threading `tenantId` as a function parameter** — read from `@seta/tenant`'s AsyncLocalStorage (CLAUDE.md).
- **`console.log`** — use `logger` from `@seta/middleware`/`@seta/observability` (CLAUDE.md conventions).
- **`vi.mock` of internal `@seta/*` modules** — if you feel the urge, the seam is wrong (CLAUDE.md "never mock internal `@seta/*` modules").

## Test strategy

- **Unit (`src/**/*.test.ts`, vitest):**
  - JWT verification happy + failure paths (expired, wrong aud, wrong iss, unknown kid → JWKS refetch, multi-match recovery).
  - Activity Zod schemas — accept canonical fixtures from Bot Framework docs; reject malformed.
  - Bot-token cache hit/miss/expiry.
  - `signin/tokenExchange` invoke path → OBO call shape (with `@seta/oauth` provided through its real export — **never mock internal `@seta/*`**, CLAUDE.md).
- **External HTTP via `msw` recordings only** — Bot Framework token endpoint, JWKS endpoint, outbound reply, OBO. Recordings live in `__recordings__/` and are checked in (CLAUDE.md "External HTTP via `msw` recordings"; setup.md §17 / mock-policy table).
- **No live MS endpoints in CI.** No `botbuilder` substitution. No internal-module mocks.
- **Integration (`tests/integration/**`)** — full inbound → handler invocation → outbound reply round-trip against msw, including JWKS cache write-back to Postgres (uses `DATABASE_URL`).

## Open questions

- Does the persisted JWKS cache live in a `connector_teams_*`-style schema, or as a single row in a platform table owned by `@seta/oauth`/`@seta/auth`? Setup.md §7 shows the read/write helpers but does not pin the schema owner. Default assumption: platform-owned single-row cache, no `@seta/teams` schema.
- Where do `signin/verifyState` (OAuth-popup fallback) and `messageBack` invoke activity types fit — exported from `activity.ts` here, or deferred until a P2 channel-installation flow needs them?
- Is `teamsRouter` an alias for `routes` or a separate named export? CLAUDE.md mandates `routes`; setup.md §11 composition example calls `teamsRouter`. Suggest `routes` is canonical, `teamsRouter` re-exports it.
- Manifest packaging: does `manifest/` ship as a `files` entry in `package.json` (consumed by ops scripts), or only as repo-local artifacts? Currently `files: ["dist"]` only.
