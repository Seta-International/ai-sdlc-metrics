# SCOPE — apps/api  (@seta/api)

## Purpose

The single P1 deployable: one Hono server that composes the entire stack —
platform primitives, MS365 connectors, OAuth admin-consent flow, future
channel adapters, and future product modules — into one Node process. It is
composition-only (setup.md §11 "apps/* = composition only … No business
logic"). Its job is to load OTel before user code, parse env once, wire
shared singletons (DB pool, KMS, vault, registry), mount module routers
under fixed prefixes, install the global error handler, and shut down
gracefully on SIGTERM/SIGINT.

## Responsibilities

- **Owns:**
  - The composition root (`src/main.ts`) — the only place that imports module
    packages, instantiates shared singletons, and mounts routers under their
    URL prefixes. Setup.md §11 "Mount prefix is owned by `apps/api/src/main.ts`".
  - The typed `env` boundary (`src/env.ts`) — Zod-validated `process.env` parse,
    exported as `env`. Setup.md §12 + CLAUDE.md "Schema-driven … `process.env`
    → typed `env` via Zod once at boot".
  - The OTel SDK init file (`src/instrumentation.ts`) — loaded via Node's
    `--import` flag so the SDK starts before any application import.
    Setup.md §8 "The SDK must start before any application code imports".
  - Static registration of connectors into `@seta/connector-registry` and the
    consent-persistence side-effect that writes `tenant.tenants` +
    `tenant.tenant_connectors` on successful admin consent.
  - The process lifecycle: `serve({ fetch, port })`, SIGTERM/SIGINT handlers
    that drain HTTP via `server.close()` and end the DB pool. Setup.md §11
    "Graceful shutdown" + §8 "graceful shutdown so spans flush".
  - The Dockerfile and the `build` / `dev` / `start` scripts that pin the
    `--import ./instrumentation.{ts,js}` flag (setup.md §8 invocation).

- **Does NOT own:**
  - Business logic, agent definitions, prompt construction, tool implementations
    — those live in `modules/products/agent` (`@seta/agent`).
  - Transport adapters (Bot Framework activity parsing, JWKS validation, reply
    posting) — those live in `modules/channels/*` (P1: `@seta/teams`).
  - Vendor adapters (Planner client, directory mirror, Graph HTTP wrapper) —
    those live in `modules/connectors/*` and `platform/ms-graph`.
  - Agent runtime, run loop, streaming, tool schemas — `platform/agent/core`.
  - Database schemas / migrations / RLS policies — owned per-package by each
    schema owner; `@seta/db` provides only pool + `withTenant` + roles +
    migration runner. CLAUDE.md "Schema-per-module (DDD) … `@seta/db` owns
    no application tables".
  - Auth verification, tenant extraction, error mapping, request-id, rate-limit
    middleware — those are factories from `@seta/middleware` / `@seta/auth` /
    `@seta/tenancy` / `@seta/observability` that the composition root installs,
    not implements.
  - Any logic conditional on `process.env.X` outside `env.ts` — CLAUDE.md
    "Never read `process.env.X` elsewhere".

## Current state (Epic 1)

`src/` contains exactly three files; there is no `src/routes/` directory yet.

- `src/env.ts` — Zod schema parsing `process.env` once at module load via
  `Env.parse(process.env)`. Fields: `NODE_ENV` (enum, default `development`),
  `PORT` (coerced number, default `8080`), `DATABASE_URL`, `PUBLIC_BASE_URL`,
  `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `ENTRA_SSO_TENANT` (default
  `common`), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_HMAC_KEY`
  (≥32 chars), `SESSION_TTL_SEC` (default `86400`), `KMS_PROVIDER` (enum
  `'aws'|'env'`, default `'env'`), `DEV_DEK_BASE64?`, `AWS_REGION?`,
  `KMS_KEY_ARN?`. The file
  also `import 'dotenv/config'` for local development. **Single export: `env`.**
- `src/instrumentation.ts` — currently a placeholder (`export {}`) loaded via
  `--import`. The file exists so the OTel boot pattern is correct from day one
  per setup.md §8; the `NodeSDK` block is wired in a follow-up. The header
  comment explicitly states "anything imported before sdk.start() would be
  invisible to traces".
- `src/main.ts` — the composition root. In order:
  1. Build singletons against the validated `env`: `sql = createPool(env.DATABASE_URL)`,
     `kms = createKmsClient({...})`, `vault = createTokenVault({ sql, kms })`,
     `stateStore = createStateStore(sql)`, `audit = createAuditWriter(sql)`.
  2. Build `registry = createConnectorRegistry(...)` with a closure that
     queries `tenant.tenant_connectors` to satisfy
     `connectorRegistry.requireConsent`. Statically registers
     `plannerConnector` and `directoryConnector` — no plugin loader.
  3. Build `entra = new EntraProvider({ clientId, clientSecret })`.
  4. `const app = new Hono().onError(onError)` — installs the
     `@seta/middleware` global error handler that maps `DomainError` → RFC 7807.
  5. Routers: `GET /healthz` returns `{ ok: true }`; `app.route('/oauth', createOAuthRoutes({ providers: { entra }, registry, stateStore, vault, audit, redirectBase: env.PUBLIC_BASE_URL, onConsented })` — the `onConsented` callback upserts the tenant + active connector rows in a `sql.begin` transaction. The callback carries a `TODO(rls)` note about `tenant_user` INSERT grants for J3 follow-up.
  6. `server = serve({ fetch: app.fetch, port: env.PORT }, ...)` logging `port`
     on listen via `@seta/observability`'s `logger`.
  7. `shutdown(signal)` closes the HTTP server then `await sql.end()` then
     `process.exit(0)`; bound to both `SIGTERM` and `SIGINT`.
- `package.json` — `private: true`, `type: "module"`. Scripts:
  - `dev`:  `tsx watch --import ./src/instrumentation.ts src/main.ts`
  - `start`: `node --import ./dist/instrumentation.js dist/main.js`
  - `build`: `tsup src/main.ts src/instrumentation.ts --format esm --sourcemap`
  - `typecheck`: `tsc --noEmit -p tsconfig.json`
- `vitest.config.ts` — leaf override `{ name: '@seta/api' }` only.
- `Dockerfile` — multi-stage `node:24-alpine` build using
  `pnpm --filter @seta/api... build` then `pnpm deploy --prod /out`; `EXPOSE 8080`.

Endpoints currently mounted:
- `GET  /healthz`
- `POST /sso/login/:provider`, `GET /sso/callback/:provider`, `POST /sso/logout`,
  `GET /me` — surface owned by `@seta/identity` `createSsoRoutes`.
- `GET  /oauth/*` and `POST /oauth/*` — surface owned by `@seta/oauth`
  `createOAuthRoutes`; covers admin-consent URL issuance and the OAuth
  callback per CLAUDE.md "Connector consent" + setup.md §4. The callback
  optionally redirects to `${PUBLIC_BASE_URL}/console/connectors/:cid/consent`
  via the `onConsentRedirect` hook (Console owns the consent landing UI).
- `GET  /tenants` — surface owned by `@seta/tenancy` `createTenantRoutes`;
  returns the membership rows joined from `tenant.tenant_members`.
- `GET  /tenants/:id/connectors`, `POST /tenants/:id/connectors/:cid/consent-url`
  — surface owned by `@seta/connector-registry` `createConnectorAdminRoutes`.
  Each route is gated by a `tenant.tenant_members` lookup; the consent-url
  endpoint delegates to a composition-root closure that reuses the same
  provider + state-store as `/oauth/:provider/consent-url`.

## Public interface

This is an app, not a library — the "public interface" is HTTP and env.

**HTTP endpoints (current).**
- `GET /healthz` — liveness, returns `{ ok: true }`.
- `POST /sso/login/:provider` — issues PKCE handshake URL (provider ∈ `entra | google`).
- `GET  /sso/callback/:provider` — exchanges code, sets `seta_sess` cookie, 302 redirects.
- `POST /sso/logout` — clears session.
- `GET  /me` — returns `{ user, tenants, csrfToken }` or 401 RFC 7807 problem JSON.
- `GET|POST /oauth/...` — admin-consent + callback routes mounted from
  `@seta/oauth`. Exact subpaths are owned by `createOAuthRoutes`; this
  package only owns the `/oauth` mount prefix.

**HTTP endpoints (planned mount prefixes, owned by `main.ts`).** From setup.md
§11 composition example and §11 repo layout `apps/api/src/routes/` line:
- `/teams/*` — `@seta/teams` channel router (`teamsRouter(teamsHandler)`).
- `/agent/*` — `@seta/agent` product router (`agentRoutes(registry)`).
- `/admin/*`, `/threads/*` — reserved per setup.md §11 (`apps/api/src/routes/`
  comment lists `/agents/* /threads/* /oauth/* /admin/*`).

**Env contract** (Zod-validated; missing/invalid → boot fails fast):

| Var | Type | Default | Required |
|---|---|---|---|
| `NODE_ENV` | `'development' \| 'test' \| 'production'` | `development` | no |
| `PORT` | number (coerced) | `8080` | no |
| `DATABASE_URL` | URL | — | yes |
| `PUBLIC_BASE_URL` | URL | — | yes — canonical origin for API + all SPAs (single-origin) |
| `ENTRA_CLIENT_ID` | non-empty string | — | yes |
| `ENTRA_CLIENT_SECRET` | non-empty string | — | yes |
| `ENTRA_SSO_TENANT` | non-empty string | `common` | no |
| `GOOGLE_CLIENT_ID` | non-empty string | — | yes |
| `GOOGLE_CLIENT_SECRET` | non-empty string | — | yes |
| `SESSION_HMAC_KEY` | string (≥32 chars) | — | yes |
| `SESSION_TTL_SEC` | positive int | `86400` | no |
| `KMS_PROVIDER` | `'aws' \| 'env'` | `env` | no |
| `DEV_DEK_BASE64` | string | — | no (required when `KMS_PROVIDER=env`) |
| `AWS_REGION` | string | — | no (required when `KMS_PROVIDER=aws`) |
| `KMS_KEY_ARN` | string | — | no (required when `KMS_PROVIDER=aws`) |

OTel endpoint configuration rides on `OTEL_EXPORTER_OTLP_ENDPOINT` and is
read by `@opentelemetry/sdk-node` itself, not by `env.ts` (setup.md §8).

## Imports

- **Allowed internal:** Every `@seta/*` workspace package. Per setup.md §11
  "apps/* = composition only (mount channels + products + platform routes;
  register connectors; wire env)" and the dependency-direction table
  (`apps/* → modules/{channels,connectors,products}/*, platform/agent/*,
  platform/{middleware,observability,oauth,connector-registry,ms-graph,
  directory,audit,db,auth,tenant}`). Current Epic 1 dependencies (`package.json`):
  `@seta/agent`, `@seta/agent-core`, `@seta/audit`, `@seta/auth`,
  `@seta/connector-ms365-directory`, `@seta/connector-ms365-planner`,
  `@seta/connector-registry`, `@seta/db`, `@seta/directory`, `@seta/middleware`,
  `@seta/ms-graph`, `@seta/oauth`, `@seta/observability`, `@seta/teams`,
  `@seta/tenancy`.
- **External (pinned per setup.md §13 `@seta/api` block):**
  - `hono@4.12.18` (router)
  - `@hono/node-server@2.0.2` (Node adapter — `serve`)
  - `dotenv@17.4.2` (local-dev `.env` load in `env.ts`)
  - `zod@4.4.3` (env schema)
  - OTel dependencies are imported transitively by `@seta/observability` and
    will be referenced directly in `instrumentation.ts` when the `NodeSDK`
    block lands. Setup.md §13 leaves OTel deps on `@seta/observability` only;
    `apps/api` does not list its own `@opentelemetry/*` pins.
- **Dev deps:** `@seta/tsconfig@workspace:*`, `@types/node`, `tsup@8.5.1`,
  `tsx@4.21.0`, `typescript@6.0.3`, `vitest@4.1.5`.
- **Forbidden:** None at the package boundary — this is the one package
  allowed to import everything. The forbiddens are about *what code lives
  here*, covered under "Patterns to avoid".

## Composition order (mandatory)

The strict load order (setup.md §8 + §11). Deviating from any step is a
silent-failure footgun.

1. **`instrumentation.ts` via `--import`.** Loaded by Node 22's `--import`
   flag before any `import` in `main.ts` resolves. Setup.md §8 "The SDK must
   start before any application code imports … If `import { Hono } from "hono"`
   runs first, the auto-instrumentation never patches Hono and you get traces
   with zero HTTP spans". Encoded in scripts (`dev` uses `tsx watch --import`,
   `start` uses `node --import`). **Never** call `sdk.start()` from `main.ts` —
   CLAUDE.md footgun "Never call `sdk.start()` from `main.ts`".
2. **`env.ts` imported first in `main.ts`.** `Env.parse(process.env)` runs at
   module load; an invalid env fails the import before any singleton is built
   (setup.md §12 + CLAUDE.md "`process.env` → typed `env` via Zod once at boot").
3. **Shared singletons** (current order in `main.ts`): `sql` → `kms` →
   `vault` → `stateStore` → `audit` → `registry` (with static `register()`
   calls) → `entra` provider. Every downstream router receives these by
   constructor injection — no DI container (CLAUDE.md "no DI containers, no
   plugin loaders, no runtime discovery").
4. **`new Hono().onError(onError)`.** The error handler is attached on the
   root Hono instance **before** any `app.route(...)` call so RFC 7807 mapping
   covers every mounted router (`@seta/middleware`'s `onError` per
   CLAUDE.md "errors: throw `DomainError` subclasses … mapped to RFC 7807").
5. **Middleware** (when added): `requestId` → `requestLogger` → `auth` →
   `tenant` → `rateLimit`, installed on the root `app` before routes mount.
   Per setup.md §8 the request-id middleware injects `c.var.log` and the
   tenant middleware drives `tenantContext.run(...)`.
6. **Channels** (when added): `app.route('/teams', teamsRouter(teamsHandler))`.
7. **Products** (when added): `app.route('/agent', agentRoutes(registry))`.
8. **Platform routes** (current): `app.route('/oauth', createOAuthRoutes(...))`.
   Setup.md §11 example places OAuth before channels in the snippet; relative
   ordering among routers is irrelevant for correctness because Hono routes
   by prefix, but the *position relative to `onError` and middleware* is not.
9. **`serve({ fetch, port })`** followed by SIGTERM/SIGINT shutdown.
   Shutdown order is **drain HTTP first** (`server.close`) **then** flush
   telemetry / close DB pool — setup.md §11 "Order matters: drain HTTP first
   (so traces complete), then flush OTel. Reverse order loses the final spans."
   Current code closes server then `await sql.end()`; the OTel
   `sdk.shutdown()` call lands when `instrumentation.ts` exports the SDK
   handle per setup.md §8 (`import { otelSdk } from './instrumentation'`).

## Patterns to follow

- Read env **only** through `import { env } from './env'`. Setup.md §12 +
  CLAUDE.md "typed env via Zod once at boot".
- Boot OTel via the `--import` flag pointed at `src/instrumentation.ts` (dev)
  / `dist/instrumentation.js` (prod). Setup.md §8 "OTel init order — the
  silent footgun".
- Statically register connectors in `main.ts` against
  `createConnectorRegistry` (no discovery, no autoload). Setup.md §11
  composition example + CLAUDE.md "No DI containers, plugin loaders, or
  runtime discovery".
- Pass shared singletons (`sql`, `vault`, `audit`, `registry`, providers)
  into router factories as constructor arguments. Setup.md §11 "Every module
  package exports `routes(...) => Hono` and (where applicable) a `connector:
  ConnectorDefinition` manifest. Mount prefix is owned by
  `apps/api/src/main.ts`."
- Install `@seta/middleware`'s `onError` on the root Hono instance before
  any `app.route(...)`. CLAUDE.md "Errors: throw `DomainError` subclasses
  from `@seta/middleware/errors`; mapped to RFC 7807".
- Persist `onConsented` side-effects (tenant + tenant_connectors upsert) in
  a single `sql.begin` transaction. Setup.md §3 + CLAUDE.md "Schema-driven"
  and the existing `main.ts:64-83` pattern.
- Graceful shutdown: bind both `SIGTERM` and `SIGINT`; close HTTP first,
  flush telemetry, end the DB pool, then `process.exit(0)`. Setup.md §11
  "Graceful shutdown — apps/api/src/main.ts tail".
- `private: true` and `type: "module"`. CLAUDE.md "ESM only" + the package
  is an app and never publishes.
- Single mount prefix per module: routes live where the module package puts
  them; `main.ts` owns only the prefix. Setup.md §11 module boundary rules.

## Patterns to avoid

- **No `process.env.X` reads outside `env.ts`.** Setup.md §12 + CLAUDE.md
  "Schema-driven … `process.env` → typed `env` via Zod once at boot. Never
  read `process.env.X` elsewhere." `instrumentation.ts` may read OTel-native
  env vars indirectly via the SDK only; do not introduce ad-hoc reads.
- **No business logic in `main.ts` or in any local route handler.** Setup.md
  §11 "`apps/*` = composition only … No business logic." The current
  `onConsented` callback persists a side-effect of the OAuth flow and is on
  the boundary — keep it minimal; promote to a service in `@seta/oauth` or
  `@seta/directory` if it grows.
- **No DI containers, no plugin loaders, no runtime module discovery.**
  CLAUDE.md "no DI containers, plugin loaders, or runtime discovery" + setup.md
  §11 "static registration in the composition root (per 'no plugin loaders' rule)".
  Registration is a literal sequence of `registry.register(xConnector)` lines.
- **No `console.log` anywhere except instrumentation pre-init.** Setup.md §8
  "handlers always use `c.var.log`, never the root `logger`, never
  `console.log`. (Codified as a Biome `noConsole` rule scoped to `apps/*`
  and `modules/*`.)" Boot-time logging goes through `logger` from
  `@seta/observability`.
- **Never call `sdk.start()` from `main.ts`.** CLAUDE.md footgun "OTel init
  order: `apps/api` MUST start via `node --import ./instrumentation.ts …`
  (dev: `tsx watch --import`). Anything imported before `sdk.start()` is
  invisible to traces. Never call `sdk.start()` from `main.ts`."
- **No path aliases** — use workspace package names. CLAUDE.md "No TS path
  aliases. Import via workspace package names."
- **No DB queries against `tenant_user` without `withTenant`** — even the
  composition root must respect the RLS contract. The current `onConsented`
  callback runs as the default app role; the `TODO(rls)` in `main.ts:61-63`
  tracks the J3 follow-up where grants or a `SECURITY DEFINER` helper close
  the gap. CLAUDE.md "App connects as `tenant_user` (RLS-enforced)".
- **No new top-level env vars without adding them to `env.ts` first.** Same
  PR rule as CLAUDE.md "No legacy, no backward compat … Change every caller
  in the same PR".

## Test strategy

- **Unit tests stay where the logic lives** — `apps/api` has no business
  logic, therefore essentially no unit tests beyond a thin smoke test (`env`
  schema parses a known-good shape; `Env.parse` rejects a missing required).
  CLAUDE.md "Tests: unit co-located `<pkg>/src/**/*.test.ts`".
- **Integration tests** for the composed boundary live in `/tests/integration/`
  and use the dockerized Postgres from `pnpm db:up` (CLAUDE.md "Tests" row +
  setup.md §11 `tests/integration/` directory). They exercise the
  composition by importing `main.ts`'s singletons or by booting the Hono
  `app.fetch` in-process — never with internal `@seta/*` mocks (CLAUDE.md
  "never mock internal `@seta/*` modules").
- **E2E tests** live in `/tests/e2e/` and boot the real `apps/api` process
  (`pnpm --filter @seta/api dev` or the built binary) against a real
  Postgres. Setup.md §11 `tests/e2e/` line + CLAUDE.md "Tests: … E2E
  `/tests/e2e/**`". E2E covers `/healthz`, the OAuth admin-consent
  round-trip, and (when channels mount) the Teams webhook → product handler
  path.
- **No live model APIs in CI.** When agent-driven endpoints land,
  `@seta/agent-core`'s testkit recordings are the only LLM source.
  CLAUDE.md "LLM in tests: only via `@seta/agent-core/testkit` recordings.
  Never live model APIs in CI."
- **No Postgres mocks in integration.** CLAUDE.md "Never mock Postgres in
  integration tests."
- **`vitest.config.ts` stays minimal** — leaf override of `test.name`
  (`@seta/api`) only; pool/coverage/projects belong to the root config.
  CLAUDE.md "Vitest config: root owns `pool` / `coverage` / `thresholds` /
  `projects`. Leaf overrides only `test.name`."

## Open questions

- **Where does the OTel `NodeSDK` block actually land?** `src/instrumentation.ts`
  is a placeholder; setup.md §8 shows the SDK construction in the app file
  but the dependency list in §13 puts `@opentelemetry/*` on
  `@seta/observability`. Option A: export a `createOtelSdk()` factory from
  `@seta/observability` and have `instrumentation.ts` call `.start()` on
  the returned handle (matches the "the instrumentation file lives in the
  **app**, not the package — `@seta/observability` exports the factory, the
  app calls it" guidance at setup.md §8). Option B: hand-inline the
  `NodeSDK` in the app and let `apps/api` carry its own `@opentelemetry/*`
  pins. Decision needed before the OTel slot ships.
- **Should `main.ts` expose `app.fetch` for E2E in-process testing?**
  Currently `main.ts` `serve(...)`s immediately as a side-effect of import,
  so in-process boot for tests requires guarding with a `if (import.meta.main)`
  or factoring `buildApp()` out. Decision is whether E2E always uses a real
  socket (matches CLAUDE.md "Verify before claiming done: … exercise the
  endpoint") or whether unit-of-composition tests want an in-process Hono.
- **`onConsented` RLS gap.** `main.ts:61-63` carries a `TODO(rls)` that
  `tenant_user` may lack `INSERT` on `tenant.tenants` /
  `tenant.tenant_connectors` in production; dev uses the `seta` superuser.
  J3 follow-up needs an explicit grant migration or a `SECURITY DEFINER`
  helper. Until resolved, the callback is local-dev only.
- **`src/routes/` directory.** Setup.md §11 lists
  `apps/api/src/routes/ # /agents/* /threads/* /oauth/* /admin/*`. Epic 1
  mounts `/oauth` directly from `main.ts`. Decide whether composition-root
  routers (`/admin`, `/threads` placeholders) ever live here, or whether
  every router moves to its owning package. Current code biases toward the
  latter — `routes/` may stay empty.
- **Sentry coexistence.** Setup.md §8 documents `skipOpenTelemetrySetup: true`
  + manual processor attach, gated on `SENTRY_DSN`. `env.ts` does not declare
  `SENTRY_DSN`, `GIT_SHA`, or `SENTRY_TRACES_SAMPLE_RATE` yet. Add them when
  the Sentry slot ships.
