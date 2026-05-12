# SCOPE — platform/oauth  (@seta/oauth)

## Purpose

`@seta/oauth` is the provider-agnostic OAuth 2.0 surface for Seta: an
`OAuthProvider` interface, a first-class Entra (`@azure/msal-node`)
implementation, a KMS-envelope-encrypted `TokenVault` over
`oauth.oauth_tokens`, a single-flight token acquirer with `SELECT … FOR
UPDATE` refresh coordination, a database-backed CSRF/state store, a Hono
router exposing `/consent-url`, `/callback`, `/revoke`, `/exchange-obo`,
and (transitionally — see Open Question 1) the `KmsClient` interface plus
its AWS / EnvDek implementations. Every outbound vendor token in Seta
flows through this package.

## Responsibilities

- **Owns:**
  - `oauth.oauth_tokens` (encrypted at-rest token rows with KMS-wrapped DEK
    per row, AES-GCM with AAD bound to
    `tenantId|providerId|partitionKey|envelopeVersion`) and `oauth.oauth_state`
    (admin-consent CSRF state). RLS policy + `FORCE` + `tenant_user` grant
    on `oauth_tokens`.
  - The `OAuthProvider` interface and its **Entra** implementation
    (`ConfidentialClientApplication` cached one-per-tenant-id in an LRU,
    MSAL kept stateless, admin-consent against `/v2.0/adminconsent` with
    `scope=https://graph.microsoft.com/.default`).
  - The `TokenVault` (`createTokenVault({ sql, kms })`) — KMS-envelope
    encrypt/decrypt, DEK zeroization in `finally`, transparent
    `withTenantTx` around RLS-protected I/O.
  - The `TokenAcquirer` (`createTokenAcquirer`) — single-flight refresh via
    `sql.begin` + `set_config('app.tenant_id', …, true)` + `SELECT … FOR
    UPDATE`. The pattern setup.md §4 line 199 calls out as the explicit
    fix for MSAL Node not coordinating refresh across instances.
  - The `StateStore` — `mint` issues a 24-byte base64url state with a
    nonce and TTL (default 900s); `consume` is `DELETE … RETURNING` so a
    state can be used at most once.
  - The Hono router (`createOAuthRoutes`) — `/:provider/consent-url`,
    `/:provider/callback`, `/:provider/revoke`, `/:provider/exchange-obo`,
    each wired to `@seta/audit` and the `@seta/connector-registry` scope
    union.
  - **(Transitional)** The `KmsClient` interface and `AwsKmsClient` /
    `EnvDekProvider` implementations — setup.md §4 places these in
    `@seta/auth`; Epic 1 shipped them here because oauth was the first
    consumer. See Open Question 1.
- **Does NOT own:**
  - JWT verification (Bot Framework, inbound SSO ID tokens) — that's
    `jose` inside `modules/channels/teams` and the future SSO product.
  - User/session/api-key persistence — `@seta/auth`.
  - Tenant identity propagation / ALS — `@seta/tenant`.
  - Connector scope definitions or consent-required gating —
    `@seta/connector-registry`. This package consumes
    `registry.scopeUnion` / `registry.get` but does not own scope sets.
  - Microsoft Graph HTTP calls — `@seta/ms-graph`.

## Current state (Epic 1)

Implemented and shipped on `main`:

- `src/kms.ts` — `KmsClient` interface, `AwsKmsClient`,
  `EnvDekProvider` (32-byte master, framed envelope, accepts
  EncryptionContext for parity but ignores it), and `createKmsClient(env)`
  factory.
- `src/vault.ts` — `TokenVault` interface, `TokenBundle` type,
  `createTokenVault`, `KmsAuthTagInvalid` error subclass of
  `ServiceUnavailable`. `withTenantTx` helper sets
  `app.tenant_id` via `SET LOCAL` inside `sql.begin`. AES-256-GCM with
  AAD `${tenantId}|${providerId}|${partitionKey}|v1`. Plaintext DEK and
  JSON bundle wiped in `finally`.
- `src/refresh.ts` — `TokenAcquirer` interface, `createTokenAcquirer`,
  `NoTokenForTenant` error (subclass of `Unauthorized`). Uses `SELECT
  expires_at FOR UPDATE` to single-flight the refresh; refresh lead time
  defaults to 300s.
- `src/state-store.ts` — `StateStore` interface, `createStateStore(sql)`.
  Issues `randomBytes(24).toString('base64url')` state, `DELETE …
  RETURNING` consume.
- `src/provider.ts` — `OAuthProvider` interface
  (`buildAdminConsentUrl` / `completeAdminConsent` / `acquireAppOnly` /
  `acquireOnBehalfOf` / `refresh`).
- `src/providers/entra.ts` — `EntraProvider` (LRU(256, 60min)) +
  `CcaLike` type for test injection. Admin-consent URL uses
  `tenantHint ?? 'organizations'` and `scope=https://graph.microsoft.com/.default`.
- `src/routes.ts` — `createOAuthRoutes(deps)` — Hono router with the four
  endpoints; verifies `connectors[]` all belong to the named provider;
  tid-mismatch detection between query `tenant` and MSAL
  `account.tenantId` writes a failure audit and 400s; OBO writes a
  `user:<homeAccountId>` partition entry.
- `src/schema.ts` — Drizzle for `oauth.oauth_tokens` (with `pgPolicy`
  declaration for `tenant_isolation_oauth_tokens`) and `oauth.oauth_state`.
- `migrations/0000_harsh_vapor.sql` — schema + tables.
- `migrations/0001_security_hardening.sql` — hand-written: `ENABLE` +
  `FORCE ROW LEVEL SECURITY` and the `tenant_user` GRANT (drizzle-kit
  0.31.10 doesn't emit `FORCE` or grants — explicit comment in
  `src/schema.ts:43-45`).
- Tests: `kms.test.ts`, `state-store.test.ts`, `vault.test.ts` (integration
  vs Postgres), `refresh.test.ts` (concurrent acquire → exactly one
  refresh call), `routes.test.ts` (326 LOC; the largest test file in the
  package), `providers/entra.test.ts`, `index.test.ts` (export
  surface check).

## Public interface

- **KMS (transitional):** `KmsClient` interface, `AwsKmsClient`,
  `EnvDekProvider`, `createKmsClient(env)`, types `DataKey` /
  `EncryptionContext`.
- **Vault:** `TokenBundle`, `TokenVault` interface, `createTokenVault`,
  `KmsAuthTagInvalid` error.
- **Acquirer:** `TokenAcquirer`, `RefreshFn`, `AcquireTokenInput`,
  `createTokenAcquirer`, `NoTokenForTenant` error.
- **State:** `StateStore`, `StateRow`, `createStateStore`.
- **Provider:** `OAuthProvider` interface; `EntraProvider`, `EntraConfig`,
  `CcaLike`.
- **Routes:** `OAuthRoutesDeps`, `createOAuthRoutes(deps): Hono`.
- **Schema:** `oauthTokens`, `oauthState`, `oauthSchema`, types
  `OAuthToken` / `NewOAuthToken` / `OAuthStateRow` / `NewOAuthState`.

## Imports

- **Allowed internal:**
  - `@seta/db` — `tenantUser` role export used by the `pgPolicy`
    declaration in `src/schema.ts`.
  - `@seta/middleware` — `BadRequest`, `ServiceUnavailable`, `Unauthorized`
    DomainError subclasses (CLAUDE.md "Errors: throw DomainError
    subclasses from `@seta/middleware/errors`").
  - `@seta/audit` — `AuditWriter` for consent / OBO / revoke / tid-mismatch
    audit rows.
  - `@seta/connector-registry` — `ConnectorRegistry` for scope union and
    provider-id validation on `/consent-url`.
  - `@seta/tenant` — listed in `package.json` deps but **not currently
    imported** in `src/*`. Intended for the consent callback path (where
    the tenant arrives in the query string and the route enters
    `tenantContext.run` before calling `vault.put`). Verify before
    removing.
- **Forbidden:**
  - `@seta/agent-core`, `@seta/ms-graph`, `@seta/connector-ms365-*`,
    `modules/*`, `apps/*` — `oauth` is upstream of the consumers; importing
    them would invert the dep DAG (setup.md §11 "Dependency direction").
  - Direct `openai` / `@anthropic-ai/sdk` — no LLM code lives here.
  - `jose` — JWT verify is not this package's job (setup.md §4 row 185:
    jose is "Used for Bot Framework JWKS-based JWT verification and (P2)
    inbound OIDC ID-token validation. **Not** used for outbound Entra
    OAuth — MSAL owns that.").
- **External (pinned per setup.md §13):**
  - `@azure/msal-node@5.2.0` — Entra CCA. Stateless from our view (no
    `ICachePlugin` wired; see setup.md §4 lines 197-200).
  - `@aws-sdk/client-kms@3.1045.0` — AWS KMS (transitional location).
  - `hono@4.12.18` — router shell.
  - `lru-cache@11.3.6` — one CCA per tenant id, max 256, TTL 60min
    (setup.md §4 line 197).
  - `postgres@3.4.9` — `Sql` type imported as type-only; runtime client
    injected.
  - `uuid@14.0.0` — present in deps; not currently used in `src/*`.
    Audit before next change.
  - `drizzle-orm@0.45.2`, `zod@4.4.3`, `dotenv@17.4.2`.

  **Divergence from setup.md §13:** §13 lines 1781-1792 list this package
  with `@azure/msal-node`, `lru-cache`, `jose`, `node:crypto`. Reality:
  no `jose` (correct — JWT verify lives in Teams adapter), plus
  `@aws-sdk/client-kms`, `uuid`, `postgres`, `hono` not enumerated. The
  AWS-SDK dep is the transitional-KMS issue (Open Question 1).

## Patterns to follow

- **One CCA per tenant id, MSAL is stateless.** Setup.md §4 lines 196-200
  + spike-derived reasoning in setup.md §4 line 199 — single-flight refresh
  is on us, not MSAL. Current `src/providers/entra.ts:39-54` is the
  canonical impl.
- **Admin consent uses `/v2.0/adminconsent` with
  `scope=https://graph.microsoft.com/.default`, not `getAuthCodeUrl`.**
  Setup.md §4 lines 201-202; current `EntraProvider.buildAdminConsentUrl`
  matches. Per-connector scopes are validated as a sanity union, not
  encoded in the URL.
- **Single-flight refresh via `SELECT … FOR UPDATE` inside `sql.begin` +
  `set_config('app.tenant_id', …, true)`.** Setup.md §3 line 158 + §4 line
  199 + CLAUDE.md "MSAL is stateless — `oauth.oauth_tokens` is the only
  SOR; single-flight refresh via `SELECT … FOR UPDATE`". Verified by
  `src/refresh.test.ts:21-56`. **Always use `set_config(name, value,
  true)`, never `SET app.tenant_id = …`** — spike report 07 §"What setup.md
  plans" quoting setup.md §3 line 132 "using plain `SET` (no `LOCAL`) on a
  reserved/pooled connection persists across releases, leaking the
  previous request's tenant_id."
- **KMS EncryptionContext + AES-GCM AAD double-bind.** `buildEncryptionContext`
  (`{tenant_id, provider_id, partition_key}`) goes to KMS; AAD
  (`${tenantId}|${providerId}|${partitionKey}|v1`) goes to AES-GCM. An
  attacker with both ciphertext and a stolen KMS Decrypt grant cannot
  re-target a different (tenant, provider, partition) tuple. Setup.md §4
  line 325; `src/vault.ts:38-48`.
- **DEK plaintext zeroization in `finally`.** `dek.plaintext.fill(0)` and
  the JSON-bundle plaintext `fill(0)` — `src/vault.ts:120-126,180-184`.
  Setup.md §4 line 318 implies it; the spike doesn't explicitly cover
  zeroization but the pattern is in `src/vault.ts`.
- **`DELETE … RETURNING` for state consume.** Setup.md §4 says "state
  used at most once" implicitly; `src/state-store.ts:39-44` realizes it
  by making the read destructive in one round-trip.
- **Tid-mismatch fails-closed and audits.** `src/routes.ts:83-93` —
  query `tenant` vs MSAL `account.tenantId` mismatch records an audit
  with `result: 'failure'` and 400s. Critical for multi-tenant safety.
- **Zod parse at the route boundary.** `ConsentUrlBody.parse(await
  c.req.json())` (`src/routes.ts:24-37`) — schema-driven (CLAUDE.md
  "Schema-driven — always generate"). When OpenAPI routes land for these
  endpoints, swap `import { z } from 'zod'` to
  `from '@hono/zod-openapi'` per setup.md §15 line 2066. Spike report
  08 §Delta confirms the mechanism (`extendZodWithOpenApi(z)` mutates
  the shared `zod` module).
- **`DomainError` subclasses, not raw `Error`.** `BadRequest`,
  `ServiceUnavailable`, `Unauthorized`, and the package-specific
  `KmsAuthTagInvalid` / `NoTokenForTenant` extend them — CLAUDE.md
  "Errors: throw DomainError subclasses from `@seta/middleware/errors`;
  mapped to RFC 7807."
- **Idempotent external boundaries.** Refresh and OBO callbacks must
  tolerate replays — CLAUDE.md "Webhooks, OAuth callbacks, LLM/Graph
  calls, queue handlers must tolerate replays. Use natural keys (…
  ulid) for cross-system correlation — never auto-increment ints."
  Partition keys (`app:<clientId>` / `user:<homeAccountId>`) are the
  natural keys here.

## Patterns to avoid

- **Do not wire MSAL's `ICachePlugin`.** Setup.md §4 line 199 is
  explicit. Two SOR for tokens = drift + cross-instance staleness.
- **Do not use `getAuthCodeUrl` for admin consent.** Setup.md §4 line
  201 — only `/v2.0/adminconsent` can grant application permissions in
  one click.
- **Do not call vault `put`/`get` outside a tenant-scoped tx.**
  `withTenantTx` (`src/vault.ts:56-67`) handles it transparently when no
  executor is supplied. Bypassing it would hit RLS denial (setup.md §3
  line 168 "the desired failure mode: deny by default").
- **Do not import `jose` here.** Setup.md §4 row 185 explicitly excludes
  outbound Entra OAuth from `jose` — MSAL owns it.
- **Do not pass tenant ids through cross-package function parameters in
  hot paths.** Setup.md §15 line 2063. The vault/acquirer signatures
  accept `tenantId` because they are infrastructure called *by* the
  middleware that just read it from ALS — the value isn't being
  smuggled past an authorization boundary. Routes still read identity
  via `tenantContext` (when wired) and pass it into these helpers.
- **Do not add an `auth.users` FK from `oauth.oauth_tokens`** — CLAUDE.md
  "No cross-schema foreign keys."
- **Do not log access/refresh tokens.** Pino redact paths in
  `@seta/observability` (setup.md §8 lines 616-680) should already cover
  this; do not log the `TokenBundle` shape directly under any
  circumstance.
- **Do not let `EnvDekProvider` run in production.** `src/kms.ts:60-65`
  notes "NOT secure; never enable in production." The env-driven
  factory (`createKmsClient`) hardcodes that `KMS_PROVIDER=env` requires
  `DEV_DEK_BASE64`; ensure deployment guards exclude that path.

## Test strategy

- **Unit (current):** `kms.test.ts` (round-trip via `EnvDekProvider`),
  `state-store.test.ts` (mint/consume/expired), `providers/entra.test.ts`
  (via injected `CcaLike`), `routes.test.ts` (route behaviour with all
  deps mocked, 326 LOC).
- **Integration (current):** `vault.test.ts` and `refresh.test.ts` hit
  real Postgres at
  `process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'`.
  `refresh.test.ts` asserts the single-flight invariant under 10
  concurrent acquirers — the load-bearing safety contract.
- **No mocking of internal `@seta/*`** — CLAUDE.md "never mock internal
  `@seta/*` modules — if you need to, your seam is wrong." Tests inject
  real `EnvDekProvider`, real `TokenVault`, real `StateStore`.
- **No live MSAL calls in CI.** `EntraConfig.ccaFactory` injection +
  `CcaLike` type (`src/providers/entra.ts:18-28,34`) is the seam.
- **No live AWS KMS in CI** — `EnvDekProvider` is the test impl.
- **Vitest 4.1.5.** Per-package leaf config; root owns coverage / pool
  (CLAUDE.md).

## Open questions

1. **KMS location (`@seta/oauth/src/kms.ts` vs `@seta/auth/src/kms/`).**
   Setup.md §4 lines 277-325 places `KmsProvider` in `@seta/auth`. Epic 1
   shipped here because oauth was the first consumer. Mirror question
   from `@seta/auth` SCOPE.md Open Question 1: pick one home, move in a
   single PR, no shim (CLAUDE.md "No legacy, no backward compat").
2. **Tenant ALS not yet wired in routes.** `@seta/tenant` is a declared
   dep but no `src/*.ts` imports `tenantContext`. The callback path
   doesn't enter `tenantContext.run` before calling `vault.put` —
   `withTenantTx` saves us at the SQL layer, but downstream observability
   tooling (`@seta/observability` logger child reading
   `getTenantId()` — setup.md §8) will miss the tag. Either remove the
   `@seta/tenant` dep or wire the route handlers through it.
3. **`uuid@14.0.0` in deps but unused.** Audit before next change —
   either drop it via `pnpm --filter @seta/oauth remove uuid` or
   document the planned consumer.
4. **Provider id `'entra'` vs `'ms365'`** — `EntraProvider.id = 'entra'`
   and routes are mounted under `/oauth/:provider`. Coordinate with
   `modules/connectors/ms365-*` so connector manifests reference the
   same provider id.
5. **OBO `tenantId` parameter** in `/exchange-obo` body is currently
   trusted from the request. When the Teams channel middleware lands,
   it should arrive via `tenantContext` from the validated Bot Framework
   JWT, not from the request body. Tracked as a hardening follow-up.
6. **OpenAPI route registration.** Routes are plain `Hono` today.
   Migrating to `@hono/zod-openapi` (setup.md §15 line 2066) needs the
   `z` import swap and `{id}` parameter syntax (CLAUDE.md "OpenAPI uses
   `{id}`, Hono native uses `:id`"). Do in one PR for all four routes;
   no mixed routers.
7. **State-store TTL of 900s** — hardcoded default in
   `src/state-store.ts:19`. Configurable per-call but never set; verify
   against Entra's admin-consent timeout window before P1 close.
