# 07 — Request context / tenant propagation via AsyncLocalStorage

## What Mastra does

Mastra's `RequestContext` is **not** AsyncLocalStorage-backed. It is a typed `Map` wrapper passed explicitly through call options. See the class at `/Users/canh/Projects/Seta/mastra/packages/core/src/request-context/index.ts:56-210` — plain `Map`-based registry with `set/get/has/delete/keys/values/entries/forEach/toJSON`, no ambient store. Reserved keys are declared as exported constants: `MASTRA_RESOURCE_ID_KEY`, `MASTRA_THREAD_ID_KEY`, `MASTRA_VERSIONS_KEY`, `MASTRA_AUTH_TOKEN_KEY` (`/Users/canh/Projects/Seta/mastra/packages/core/src/request-context/index.ts:17-51`). The `di/` directory is a one-line re-export of the same class (`/Users/canh/Projects/Seta/mastra/packages/core/src/di/index.ts:1-9`) — there is no DI container; RequestContext **is** the DI surface.

Propagation across async boundaries is done by **threading `requestContext` through every call option** — agent/memory/tool callsites read it from `options.requestContext` (e.g. `/Users/canh/Projects/Seta/mastra/packages/core/src/agent/stream-until-idle.ts:70-75`, `/Users/canh/Projects/Seta/mastra/packages/core/src/agent/thread-stream-runtime.ts:66-72`). Model SDKs that spawn their own promises receive context via the same explicit parameter — Mastra never relies on ALS to survive into vendor SDK promises. `toJSON()` strips non-serializable values (functions, symbols, circulars, RPC proxies) so context can be persisted/forwarded across processes (`/Users/canh/Projects/Seta/mastra/packages/core/src/request-context/index.ts:168-193`).

Mastra **does** use `AsyncLocalStorage`, but only for span/tracing context — `spanContextStorage` in `/Users/canh/Projects/Seta/mastra/packages/core/src/observability/context-storage.ts:11`, exposed via `getCurrentSpan()` (`:17-19`) and `executeWithContext({span, fn})` (`:58-69`) which wraps `fn` in `spanContextStorage.run(span, fn)`. A lazy resolver layer (`/Users/canh/Projects/Seta/mastra/packages/core/src/observability/utils.ts:13-21,60-99`) keeps `async_hooks` out of browser-safe chunks; `initContextStorage()` registers the impls at boot (`context-storage.ts:31-37`).

## What setup.md plans

§3 multi-tenancy paragraph: `tenantContext.getTenantId()` (AsyncLocalStorage) is the *primary* enforcement; RLS is the backstop. (`/Users/canh/Projects/Seta/seta-os/docs/setup.md:61`).

§3 `withTenant` wrapper: `SET LOCAL` ONLY persists for the duration of a Postgres transaction. Outside a transaction, postgres-js auto-commits each query… Worse: using plain `SET` (no `LOCAL`) on a reserved/pooled connection persists across releases, leaking the previous request's tenant_id into the next request that gets that connection — silent cross-tenant data exposure. (`/Users/canh/Projects/Seta/seta-os/docs/setup.md:132`). Implementation uses `sql.begin` + `SELECT set_config('app.tenant_id', ${tenantId}, true)` — bind-param safe, tx-scoped (`setup.md:150-158`). Anything that does `await sql\`SELECT ...\`` directly on the root client without `withTenant` will have `app.tenant_id` unset — RLS will reject the query. That's the desired failure mode: deny by default. (`setup.md:168`). API rule: Tenant id | Never a function param; read from `tenantContext.getTenantId()` (`setup.md:2063`). Package home: `@seta/tenant — AsyncLocalStorage + guards` (`setup.md:974`). Logger child also reads it (`setup.md:674,761-762` — `getTenantId()`, `getUserId()`).

## Delta

**Fold in from Mastra:**
- **Typed Map class with reserved-key constants.** Even with ALS as the carrier, the *value* inside the store should be a `RequestContext`-shaped object so we can add non-tenant fields (userId, requestId, locale, auth token) without growing the ALS API surface per field. Mastra's reserved-key constants pattern (`/Users/canh/Projects/Seta/mastra/packages/core/src/request-context/index.ts:17-51`) gives security-critical fields a single import-site to audit.
- **`toJSON` strip of non-serializable values** (`request-context/index.ts:168-193`) — directly applicable when we forward context to background jobs / queue handlers (Idempotent external boundaries, CLAUDE.md). Keeps proxies, functions, circulars from poisoning serialization.
- **Lazy-resolver split for ALS** (`observability/utils.ts:60-99` + `context-storage.ts:31-37`) — keeps `node:async_hooks` out of any package that might end up in a browser chunk (Studio P2). `@seta/tenant` should expose a browser-safe shim that throws if `enterTenantContext` is called without `initTenantContext()` at boot.

**Deliberately avoid:**
- **Mastra's explicit pass-through.** Setup.md is explicit (`setup.md:2063`): tenant id is never a function param. Passing `requestContext` through every signature is exactly the footgun setup.md is closing — a single missed parameter → unscoped query → RLS denial (best case) or, with `SET` instead of `SET LOCAL`, cross-tenant leak (worst case). ALS at the edge + `withTenant` at the DB seam is the correct topology for us.
- **Mastra's `set()` mutability after construction.** For our enforcement model, the ALS store should be **frozen** after creation in the auth middleware — promotion of `userId`/`resourceId` mid-request is a security regression. Mastra's mutable `set()` exists because they don't have an auth boundary; we do.
- **DI/RequestContext conflation.** Mastra uses RequestContext as a DI bag (`di/index.ts` literally re-exports it). Don't. Keep `@seta/tenant` strictly about *request identity*; services come from explicit imports.

**Open questions:**
1. Do background jobs (sync workers, queue handlers in §3 / Epic 3) enter `@seta/tenant`'s ALS via a `runAsTenant(tenantId, fn)` helper? Mastra has no analog because it has no job runner.
2. Streaming / SSE responses (`streamKernelSSE` per CLAUDE.md) — ALS survives `await` but a Hono SSE handler that returns a `ReadableStream` may close its outer async frame before chunks flow. Need to verify the stream's `pull()` callback inherits the ALS frame from where the stream was constructed, or wrap each chunk producer in `tenantContext.run()`.
3. Vendor SDK promise pools — `@azure/msal-node` and `postgres-js` use `node:async_hooks`-compatible promise chaining, so ALS survives. We should add an integration test that asserts `getTenantId()` is still the right value inside an MSAL `acquireTokenOnBehalfOf` callback.

## Punch list

- `@seta/tenant`: API shape `tenantContext.getTenantId(): string` (throws `TenantContextMissingError` extends `DomainError` if unset — never returns `undefined`; matches setup.md:2063 "never a function param"); `tenantContext.getUserId(): string | undefined` (matches setup.md:761); `tenantContext.run({tenantId, userId, requestId}, fn): Promise<T>` (the only setter; store is frozen inside `fn`); `tenantContext.tryGetTenantId(): string | undefined` for background-job entrypoints that legitimately have no context yet.
- `@seta/tenant`: store shape is a frozen object `{tenantId, userId?, requestId, authToken?, locale?}` — not a mutable Map. Reserved-key constants pattern from Mastra (`request-context/index.ts:17-51`) becomes typed object fields here.
- `@seta/tenant`: ship `runAsTenant(tenantId, fn)` for sync workers / queue handlers / cron — explicit "I am asserting tenant context for a job" entrypoint, audit-logged. Closes Open Question 1.
- `@seta/tenant`: integration test asserting `tenantContext.getTenantId()` survives `postgres-js` `sql.begin` and `msal-node.acquireTokenOnBehalfOf` callbacks (Open Question 3).
- `@seta/tenant`: SSE-safe `withTenantStream(fn)` that re-enters the ALS frame inside each chunk producer (Open Question 2).
- setup.md §3: add one paragraph naming the API surface (`tenantContext.run` / `getTenantId` / `tryGetTenantId` / `runAsTenant`) and stating that the store is frozen — currently §3:61 + §3:164 only show `getTenantId()` callsites with no constructor/entry API.
- setup.md §3: cross-reference `streamKernelSSE` footgun (CLAUDE.md "use streamKernelSSE") with an explicit note that long-running streams must re-enter tenant context per chunk producer, mirroring the `SET LOCAL` warning at §3:132.
- setup.md §3: add a `toJSON`/serialization note for forwarding tenant context to background jobs — borrow Mastra's "strip non-serializable" guarantee from `/Users/canh/Projects/Seta/mastra/packages/core/src/request-context/index.ts:168-193` (Idempotent external boundaries, CLAUDE.md).
- setup.md §3: explicitly forbid using `@seta/tenant`'s store as a DI bag — call out Mastra's `di/` re-export anti-pattern by name so future contributors don't drift there.
- P2-defer: cross-process context forwarding (e.g. trace-context-style W3C header for tenant id when we add a worker over HTTP). In P1 every job runs in the same process, so ALS + `runAsTenant` is sufficient.
- P2-defer: browser-safe shim of `@seta/tenant` for Studio. Lazy-resolver split (Mastra `observability/utils.ts:13-21`) is the template, but Studio is P2 so don't build it now.
- P2-defer: AuthN field promotion / impersonation flows ("act as user X within tenant Y"). Current frozen-store model is correct for P1; impersonation needs a nested `tenantContext.run` semantics decision that depends on §4 SSO design.
