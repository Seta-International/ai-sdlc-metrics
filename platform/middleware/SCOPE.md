# SCOPE — platform/middleware  (@seta/middleware)

## Purpose
Hono router-level middleware: error handling (`DomainError` → RFC 7807
`application/problem+json`), auth wrapper, tenant wrapper, OpenAPI router defaults, and
rate limiting. Bridges HTTP transport to the platform primitives that own state
(`@seta/auth` for identity, `@seta/observability` for logging, `@seta/tenant` for ALS).
The package's `description` ("Hono middleware: auth + tenant + errors + openapi +
rate-limit") names the full surface; only `errors` is implemented today.

## Responsibilities
- **Owns:**
  - `DomainError` + subclasses (`NotFound`, `Forbidden`, `ConflictError`, `Unprocessable`,
    `Unauthorized`, `BadRequest`, `Gone`, `ServiceUnavailable`) — every route's only
    sanctioned way to fail. Extends Hono's `HTTPException` and carries an RFC 7807
    `Problem` document.
  - `onError` Hono error handler — translates `DomainError` / `ZodError` / `HTTPException`
    / anything-else into `application/problem+json` responses with `instance: c.req.path`.
    Unknown errors return a generic 500 (CLAUDE.md "never leak internals").
  - Planned (per setup.md §13 and §15 footguns):
    - Auth middleware (`requireUser`, `requireAdmin`, `requireApiKey`) that pulls from
      `@seta/auth` sessions/API keys and enters `@seta/tenant`'s ALS frame.
    - Tenant middleware (`withTenantContext`) — the seam where the request id +
      tenant id + user id frame is created and frozen.
    - Request-id middleware (UUID v7) that injects `c.var.log` (child of
      `@seta/observability`'s `logger`) bound to `{ req_id, tenant_id }`.
    - `hono-rate-limiter` defaults (per-tenant + per-IP) with an in-memory store P1,
      Redis-ready shape (setup.md §3 "Scale & multi-tenancy").
    - `@hono/zod-openapi` `OpenAPIHono` constructor with seta-OS defaults (default
      `application/problem+json` validation hook, route-id prefix, `getOpenAPIDocument`
      mount helper).
- **Does NOT own:**
  - **Identity / session / API key verification.** Lives in `@seta/auth` (`@node-rs/argon2`,
    `needsRehash` upgrade path — setup.md §4:245). Middleware only consumes the verified
    principal.
  - **`AsyncLocalStorage` itself.** Lives in `@seta/tenant`. Middleware calls
    `tenantContext.run({tenantId, userId, requestId}, fn)` — setter is in `@seta/tenant`
    (`07-request-context.md` punch list).
  - **Logger implementation.** Lives in `@seta/observability`. Middleware imports `logger`
    and creates child bindings.
  - **OTel SDK init.** Lives in `apps/api/src/instrumentation.ts` (setup.md §8 + CLAUDE.md
    "Footguns"). Middleware emits manual spans only if needed, never starts the SDK.
  - **Route mounting.** `apps/api/src/main.ts` owns mount prefixes and the connector
    registration list (CLAUDE.md "Boundaries"). Middleware is registered there, not here.
  - **Streaming kernels.** `streamKernelSSE` lives in `@seta/agent-core` (CLAUDE.md
    "Footguns"). Middleware never wraps SSE handlers itself.

## Current state (Epic 1)
Only `errors.ts` is implemented. The package description and `package.json` deps
(`@seta/auth`, `@seta/observability`, `hono-rate-limiter`, `@hono/zod-openapi`,
`@hono/node-server`) anticipate the rest of the surface.
- `src/errors.ts` — `Problem` type; `DomainError` extending `HTTPException` with a
  `problem: Problem` field and constrained status union (`400|401|403|404|409|410|422`);
  seven concrete subclasses; `onError` that:
  - `DomainError` → `c.json({ ...problem, instance }, status, { 'Content-Type':
    'application/problem+json' })` (note: deviates from setup.md §15 by NOT logging via
    `c.var.log` — no logger wired yet).
  - `ZodError` → 400 with `errors: err.flatten().fieldErrors`, same content type.
  - Unhandled `HTTPException` → wrapped in problem-json.
  - Anything else → 500 "Internal Server Error", no detail (CLAUDE.md "never leak
    internals"; covered by `errors.test.ts:36-46` "DB host secret leaked" assertion).
- `src/index.ts` — `export * from './errors'`.
- `src/errors.test.ts` — covers (a) `Problem` document shape on `DomainError`, (b) subclass
  status mapping, (c) `onError` emits `application/problem+json` with `instance`, (d) the
  500 path never echoes the underlying message.

No auth, tenant, request-id, rate-limit, or OpenAPI helpers exist yet; their deps are
installed but unused. Whoever ships Epic 2 will add them under the public-interface plan
below.

## Public interface
From `src/index.ts` (re-exports all of `errors.ts`):
- `type Problem = { type; title; status; detail?; instance? }`.
- `class DomainError extends HTTPException` — constructor `(status, message,
  opts?: { type?; detail?; cause? })`; carries `problem: Problem`.
- `class NotFound(what: string)` → 404.
- `class Forbidden(reason: string)` → 403.
- `class ConflictError(reason: string)` → 409.
- `class Unprocessable(detail: string)` → 422.
- `class Unauthorized(reason: string)` → 401.
- `class BadRequest(detail: string)` → 400.
- `class Gone(detail: string)` → 410.
- `class ServiceUnavailable(detail: string)` → 503.
- `const onError: ErrorHandler` — Hono error handler; mount last via
  `app.onError(onError)`.

Planned (per setup.md §13 + Phase-1 reports):
- `requestId()` Hono middleware (UUIDv7 from `uuid@14.0.0` already in
  `@seta/observability`'s deps; or pull `uuid` here). Sets `c.set('reqId', …)`.
- `requestLogger()` Hono middleware — `c.set('log', logger.child({ req_id, tenant_id }))`.
- `withTenantContext()` Hono middleware — wraps the downstream pipeline in
  `tenantContext.run({...}, next)` (`@seta/tenant` API per `07-request-context.md`).
- `requireUser` / `requireAdmin` / `requireApiKey` — pull from `@seta/auth`; throw
  `Unauthorized` / `Forbidden` `DomainError`s.
- `rateLimit({ keyFn, max, window })` — `hono-rate-limiter` wrapper with in-memory store,
  per-tenant or per-IP key strategies.
- `createApiRouter()` — `OpenAPIHono` factory with seta-OS defaults + a `getOpenAPIDocument`
  helper. Imports `z` from `@hono/zod-openapi`, NOT `zod` (CLAUDE.md "Footguns" + setup.md
  §15:2066 + `08-schema-compat.md` § "Open question resolved").

## Imports
- **Allowed internal** (current deps):
  - `@seta/auth` — for sessions / API key verification once the auth middlewares land.
  - `@seta/observability` — for `logger`.
- **Forbidden:**
  - `@seta/tenant` is **not** in current `package.json` deps but setup.md §13 lists it.
    See Open Questions — middleware must depend on `@seta/tenant` to wire `tenantContext.
    run({...}, next)`.
  - `@seta/db` — middleware does not own queries. Tenant/auth lookups go through
    `@seta/auth` and `@seta/tenant`; DB access from middleware would invert layers.
  - `modules/*` — CLAUDE.md "Boundaries": platform may not import modules.
  - Any concrete connector — CLAUDE.md: composition is in `apps/api`.
- **External (pinned per setup.md §13 "HTTP middleware"):**
  - `hono@4.12.18`
  - `@hono/zod-openapi@1.4.0` (re-exports a wrapped `z`; setup.md §15 forbids importing
    `z` from `zod` inside OpenAPI route files — `08-schema-compat.md` confirms it
    peer-deps `zod ^4.0.0`)
  - `@hono/node-server@2.0.2`
  - `hono-rate-limiter@^0.5.3`
  - `zod@4.4.3`
  - dev: `vitest@4.1.5`, `tsup@8.5.1`, `typescript@6.0.3`, `@types/node@^24.12.3`,
    `@seta/tsconfig: workspace:*`.

## Patterns to follow
- **Every domain failure is a `DomainError` subclass.** Setup.md §15 + `errors.ts:32-71`.
  Route authors throw `new NotFound('Tenant')` etc.; never construct `Response` for errors
  manually. `onError` handles wire format.
- **`application/problem+json` content type on every error path.** Setup.md §15:1444-1448;
  `errors.ts:75-115` sets the header on all four branches.
- **Single `onError` mount, last middleware on the root app.** Setup.md §15:1439 + 1486-
  1487. Composition lives in `apps/api/src/main.ts` (CLAUDE.md "Boundaries").
- **`z` from `@hono/zod-openapi`, never `zod`, in OpenAPI route files.** CLAUDE.md
  "Footguns" + setup.md §15:2066 + `08-schema-compat.md` § "Delta": `extendZodWithOpenApi`
  mutates the shared `zod` module on import; works iff pnpm resolves exactly one `zod`
  (4.4.3 is the workspace pin). Belt-and-suspenders: import `z` from the OpenAPI package.
- **OpenAPI path syntax `{id}`; Hono native `:id`. Do not mix in one router.** CLAUDE.md
  "Footguns".
- **`tenantContext.run({...}, next)` at the HTTP seam.** Once tenant middleware lands,
  it is the only entrypoint that *sets* the ALS frame (`07-request-context.md` punch list:
  store is frozen inside `run`). Mid-request promotion of `userId` is a security regression.
- **Per-request child logger.** Setup.md §8:673 — `c.var.log = logger.child({ req_id,
  tenant_id })`. Handlers always use `c.var.log`; never the root `logger`, never
  `console.log` (CLAUDE.md "Conventions").
- **Unknown errors stay opaque.** `errors.test.ts:36-46` is the load-bearing assertion —
  500 responses must not echo the underlying error message. Adding `detail` from `err` in
  the catch-all branch is the exact regression this test guards against.

## Patterns to avoid
- **Building `Response` for errors.** Setup.md §15:1490 — domain failures always throw a
  `DomainError`. Manual `c.json({error: ...})` for errors fragments the wire format and
  breaks RFC 7807 consumers.
- **Logging from `onError` without a `c.var.log` fallback that is wired.** Setup.md §15:
  1441 uses `c.var.log ?? console`; current `errors.ts` does not log at all. When the
  request-logger middleware lands, add `c.var.log?.warn({ err: err.problem }, 'domain
  error')` for `DomainError` and `.error` for the 500 path — but not before, since pulling
  `console` in here will violate `noConsole` Biome rules.
- **Mocking `@seta/auth` / `@seta/observability` in middleware tests.** CLAUDE.md
  "Conventions": never mock internal `@seta/*` modules — if you need to, the seam is wrong.
  `errors.test.ts` mounts a real Hono app and asserts the response — the right pattern for
  the rest of the middleware as it lands.
- **Mutating the `tenantContext` store mid-request.** `07-request-context.md` § "Mastra's
  `set()` mutability" — our frozen-store model is the security property. Don't add a
  middleware that promotes `userId` post-auth into the same frame; create a new frame.
- **DI / RequestContext conflation.** `07-request-context.md` § "Deliberately avoid":
  middleware sets request identity, not a service bag. Services come from explicit imports.
- **Reading `process.env` in handlers.** CLAUDE.md "Schema-driven" — env validated once
  at boot in `apps/api/src/env.ts`.
- **`SET` (no `LOCAL`) inside a tenant middleware** — fold into `@seta/db`'s `withTenant`
  call inside the handler, not a `SET` on the connection from middleware (setup.md §3:132,
  silent cross-tenant leak risk).

## Test strategy
- **Unit, co-located.** `src/errors.test.ts` mounts a real Hono app, throws inside a
  handler, and inspects the response — no mocking of Hono internals, no mocking of pino.
  Covers all four `onError` branches' content type + body shape + status + the
  "no internals leaked" assertion.
- **Future tests as middleware lands:**
  - Auth: throw `Unauthorized` when no session; succeed when one exists. Use a real
    `@seta/auth` in-memory test harness, not mocks (CLAUDE.md).
  - Tenant: `tenantContext.getTenantId()` returns the bound id inside `next`, throws
    `TenantContextMissingError` after `next` returns (`07-request-context.md` punch list).
  - Request id: response carries `x-request-id`; child logger has `req_id` bound.
  - Rate limit: 429 with `application/problem+json` after the configured burst.
- Vitest leaf config sets only `test.name: "@seta/middleware"` per CLAUDE.md
  "Conventions". Root config owns coverage thresholds.

## Open questions
- **Missing `@seta/tenant` dep.** Setup.md §13 lists `@seta/tenant@workspace:*` in this
  package's deps; `package.json` does not yet have it. Tenant middleware cannot ship
  without that import. Resolution: `pnpm --filter @seta/middleware add
  @seta/tenant@workspace:*` when implementing `withTenantContext`.
- **`logger` import-vs-handler.** `errors.ts` does not yet use `@seta/observability`'s
  `logger`, even though it is in deps. Decision: wire `c.var.log?.warn(...)` in `onError`
  once `requestLogger` middleware is added — current shape is correct (no `console`
  fallback) but is silent on domain errors.
- **`DomainError.status` typing.** `errors.ts:22` casts to a union `400|401|403|404|409|
  410|422`, but the class accepts arbitrary `number` and `ServiceUnavailable` constructs
  503. The runtime is fine (Hono's `HTTPException` accepts any status), but TS users see a
  too-narrow union. Either widen the union to include 503/5xx, or move the cast to the
  subclass constructors. Worth a fix in the same PR that adds 5xx subclasses.
- **`onError` logging coupling.** Setup.md §15:1441 reads `c.var.log ?? console` — once
  request-logger middleware lands, the `?? console` fallback violates Biome's `noConsole`
  rule scoped to apps/modules. Resolution: drop the fallback; treat absence of `c.var.log`
  as a misconfiguration (assert in dev).
- **Auth wrapper coupling to API keys vs sessions.** Setup.md §4 has two principals (Web
  session, API key with `needsRehash`). Decide whether `requireUser` accepts both or
  whether there are two explicit middlewares — affects how Teams JWT verification
  (`@seta/teams`) plugs in.
- **`zod` direct dep vs transitive via `@hono/zod-openapi`.** `package.json` carries
  `zod@4.4.3` directly. With one workspace `zod` resolution (`08-schema-compat.md` §
  "Mechanism"), keeping a direct dep is harmless but redundant. Either drop or keep as a
  documented belt-and-suspenders pin.
