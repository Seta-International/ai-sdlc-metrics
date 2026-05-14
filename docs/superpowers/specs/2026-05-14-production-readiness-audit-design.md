# Production Readiness Audit — Design Spec

**Date:** 2026-05-14  
**Scope:** `apps/*`, `modules/*`, `platform/*`  
**Goal:** Resolve all DDD boundary violations, missing structured logging, error handling gaps, env hygiene issues, and tenant context discipline to make seta-os production-ready for OSS release.

---

## Architecture Rules (from CLAUDE.md)

| Layer | What it may import |
|---|---|
| `platform/*` | Nothing in `modules/` or `apps/` |
| `modules/channels/<name>` | `platform/*` only. Never products, connectors, or other channels |
| `modules/connectors/<vendor>` | `platform/*` and other `modules/connectors/*`. Never products or channels |
| `modules/products/<name>` | `platform/*` and `modules/connectors/*` to call external systems. Never another product |
| `apps/*` | Composition only — no business logic, no raw SQL against domain schemas |

Additional invariants:
- `process.env.X` only in `apps/api/src/env.ts` (with sanctioned exceptions documented below)
- `tenantId` is never a function parameter in domain/business code — read via `tenantContext.getTenantId()`
- All logging via `logger` from `@seta/observability` — no `console.*` except CLI scripts
- All runtime errors thrown as `DomainError` subclasses from `@seta/middleware/errors`

---

## Delivery: 5 Category PRs (in order)

### Category 1 — DDD Boundary Violations (fix first)

#### 1a. `products/planner` imports `@seta/ms-graph` directly

**Files affected:**
- `modules/products/planner/package.json` — lists `@seta/ms-graph` as dependency
- `modules/products/planner/src/index.ts` — re-exports `GraphFetch` from `@seta/ms-graph`
- `modules/products/planner/src/tools/write/create_plan.commit.ts` — `import type { GraphFetch }`
- `modules/products/planner/src/tools/write/complete_tasks.commit.ts` — `import type { BatchRequest }`
- `modules/products/planner/src/tools/write/create_tasks.commit.ts` — `import type { BatchRequest }`
- `modules/products/planner/src/tools/write/update_tasks.commit.ts` — `import type { BatchRequest, GraphFetch }`
- `modules/products/planner/src/tools/write/_classify.ts` — `import type { BatchResponseItem }`

**Fix:**  
`@seta/connector-ms365-planner` re-exports the `GraphFetch`, `BatchRequest`, and `BatchResponseItem` types (or defines equivalent local interfaces that `@seta/planner` can consume). `@seta/planner` removes `@seta/ms-graph` from its `package.json` and updates all import sites to source types from `@seta/connector-ms365-planner`. The re-export from `planner/src/index.ts` is deleted.

#### 1b. `products/analytics` queries `connector_ms365_planner.*` tables directly

**Files affected (all emit cross-schema SQL):**
- `modules/products/analytics/src/tools/tasks_by_status.ts`
- `modules/products/analytics/src/tools/workload_by_assignee.ts`
- `modules/products/analytics/src/tools/tasks_by_plan.ts`
- `modules/products/analytics/src/tools/query_analytics.ts`

All directly query `connector_ms365_planner.planner_tasks_cache`, `connector_ms365_planner.plan_members`, `connector_ms365_planner.planner_plans_cache`.

**Fix:**  
`@seta/connector-ms365-planner` adds a read-model API — a set of query functions (e.g., `queryTaskStats`, `queryPlanMembers`, `queryPlanList`) that accept a typed `Sql` and filter params, returning typed results. The analytics tools import and call these functions instead of writing raw cross-schema SQL. `@seta/analytics` already declares `@seta/connector-ms365-planner` as a dependency so no package.json change is needed.

#### 1c. `apps/api/src/main.ts` contains business logic

Four separate pieces of domain logic live in `main.ts` and must be extracted:

**1c-i. Inline consent check query (line 51)**  
```ts
const rows = await sql<...>`SELECT 1 AS ok FROM tenant.tenant_connectors WHERE ...`
```
This belongs in `@seta/tenant`. **Fix:** add `isConnectorConsented(sql, tenantId, connectorId): Promise<boolean>` to `@seta/tenant` and use it in `main.ts`.

**1c-ii. `onConsented` callback with raw SQL (lines 178–196)**  
Manages `tenant.tenants` and `tenant.tenant_connectors` tables directly. **Fix:** add `recordConsent(sql, { tenantId, connectorIds, scopesGranted }): Promise<void>` to `@seta/tenant`. `main.ts` passes this function as `onConsented`.

**1c-iii. `getActiveTenantIds()` (lines 223–226)**  
Raw SQL querying `tenant.tenants`. **Fix:** add `getActiveTenantIds(sql): Promise<string[]>` to `@seta/tenant`.

**1c-iv. `afterSync` materialized view refresh (lines 243–244)**  
```ts
await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_assignee_workload`
await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_plan_weekly_velocity`
```
This is analytics domain logic. **Fix:** add `refreshAnalyticsViews(sql): Promise<void>` to `@seta/analytics`. `main.ts` calls this function.

After these extractions `main.ts` should contain only: infrastructure wiring, route mounting, and the server start sequence — zero raw SQL, zero domain logic.

---

### Category 2 — Missing Structured Logging

**Rule:** Use `logger` from `@seta/observability`. No `console.*` in non-CLI source.

#### 2a. `platform/middleware/src/errors.ts` — `console.error` in `onError`

Line 106: `console.error('[onError] unhandled error', err)`.

**Fix:** Import `logger` from `@seta/observability` (already a transitive dep via `@seta/middleware`). Replace with:
```ts
logger.error({ err }, '[onError] unhandled error')
```

#### 2b. `modules/connectors/ms365-planner/src/` — no logging

`client.ts`, `cache.ts`, `etag.ts` do Graph HTTP calls and DB writes with no logging.

**Fix:** Add `logger` from `@seta/observability` to each file. Log at:
- `info`: cache hits/misses (with `planId`, `taskId`), successful Graph API calls
- `warn`: stale cache fallbacks, retry attempts
- `error`: Graph errors, DB write failures

#### 2c. `modules/products/planner/src/tools/` — no logging (20+ files)

All write and read tool files silently succeed or fail.

**Fix:** Each tool must log:
- `logger.debug({ tool: '<id>', tenantId: tenantContext.getTenantId() }, 'tool invoked')` at entry
- `logger.error({ err, tool: '<id>' }, 'tool failed')` at every error path

#### 2d. `modules/products/analytics/src/tools/` — no logging (4 files)

Same pattern as planner tools. Same fix.

#### 2e. `modules/channels/teams/src/` — no logging

`routes.ts`, `bot-token.ts`, `reply.ts`, `teams-handler.ts`, `activity.ts`, `handler.ts` all have no logging.

**Fix:** Log:
- `info`: inbound Teams activity type and conversation type
- `info`: agent slug selected (`selectSlug` result)
- `error`: bot token fetch failures, reply failures, run errors

---

### Category 3 — Error Handling: Raw `Error` → `DomainError`

All changes import from `@seta/middleware`.

| File | Current throw | Required fix |
|---|---|---|
| `channels/teams/src/bot-token.ts:18` | `Error('Bot token fetch failed: ${res.status}')` | `ServiceUnavailable(\`bot token fetch failed: ${res.status}\`)` |
| `channels/teams/src/reply.ts:20` | `Error('Reply failed: ...')` | `ServiceUnavailable(\`teams reply failed: ${res.status}\`)` |
| `connectors/ms365-planner/src/cache.ts:134` | `Error('softDelete not supported...')` | `Unprocessable('softDelete not supported for this entity')` |
| `platform/directory/src/jit-mapper.ts:47` | `Error('JIT mapper: upsert returned no row')` | `ServiceUnavailable('jit-mapper: upsert returned no row')` |
| `platform/ms-graph/src/graph-fetch.ts:234` | `Error('batch requests must be <= 20')` | `BadRequest('batch requests must be <= 20')` |

**Intentional `Error` (not DomainError) — keep as-is:**
- `platform/connector-registry/src/runtime.ts:29` — `'connector already registered'` is a programming invariant, not a runtime domain error
- `platform/connector-registry/src/runtime.ts:54` — `'consentCheck not configured'` is a boot-time programming invariant
- `platform/agent/core/src/testkit/*` — test infrastructure only

---

### Category 4 — `process.env` Access Outside `apps/api/src/env.ts`

#### 4a. `modules/channels/teams/src/manifest/build.ts`

Lines 11–12 read `process.env.MS_BOT_ID` and `process.env.VALID_DOMAINS` directly.

**Fix:** Add a Zod schema at the top of `build.ts` that parses the required env vars:
```ts
const env = z.object({
  MS_BOT_ID: z.string().min(1),
  VALID_DOMAINS: z.string().default('localhost'),
}).parse(process.env)
```
This is a CLI script (not server runtime), so direct `process.env` access is acceptable — but validation via Zod is required for consistency and early failure.

#### 4b. `platform/observability/src/logger.ts`

Reads `process.env.LOG_LEVEL` and `process.env.NODE_ENV` directly.

**Sanctioned exception.** The logger is the foundational layer that must bootstrap before `env.ts` is parsed. Any higher-level mechanism would create a circular dependency. Add a comment:
```ts
// Sanctioned exception: logger bootstraps before env.ts; reads process.env directly.
```

#### 4c. All other `process.env` accesses

- `drizzle.config.ts` files — migration tooling, not runtime. Acceptable.
- Integration test helpers (`_helpers.ts`, `support/db.ts`) — test infrastructure. Acceptable.
- `platform/agent/core/src/testkit/recording/mode.ts` — test kit only. Acceptable.

No changes needed for these.

---

### Category 5 — `tenantId` as Function Parameter

**Rule:** `tenantId` is never a function parameter in domain/business code. Read via `tenantContext.getTenantId()`. Background workers set context via `tenantContext.run(tenantId, fn)`.

#### 5a. `platform/connector-registry/src/types.ts` and `runtime.ts`

`RequireConsentFn = (tenantId: string, connectorId: string) => Promise<boolean>` and `requireConsent(tenantId, connectorId)`.

**Fix:** Remove `tenantId` parameter. Inside `requireConsent`, call `tenantContext.getTenantId()`. Update the `RequireConsentFn` type signature. Update the consent check in `apps/api/main.ts` accordingly (removes `tenantId` argument). `@seta/connector-registry` adds `@seta/tenant` as a dependency.

#### 5b. `platform/oauth/src/routes.ts` — OAuth callback tenantId

The OAuth callback receives `tenantId` in the `state` object (round-tripped through the OAuth provider). After the state is validated and tenant identity is confirmed:

**Fix:** Wrap all downstream work in `tenantContext.run(tenantId, async () => { ... })`:
```ts
return tenantContext.run(tenantId, async () => {
  // ... everything that happens after consent is confirmed
})
```
This ensures that `recordConsent` and any downstream services can read tenant from context.

#### 5c. `platform/oauth/src/providers/entra.ts`

`acquireAppOnly(tenantId, scopes)`, `acquireOnBehalf({ tenantId, ... })`.

**Sanctioned infrastructure exception.** The OAuth provider is stateless MSAL infrastructure. `tenantId` here is an MSAL routing parameter used to build the token authority URL (`https://login.microsoftonline.com/{tenantId}`). This is not business-layer tenant discrimination — it is a network routing identifier for the identity provider. Add a comment on these functions:
```ts
// tenantId is an MSAL authority parameter, not a domain discriminator.
// Sanctioned exception to the tenantId-as-param rule.
```

#### 5d. Background sync worker in `apps/api/src/main.ts`

`syncWorker.start(tenantIds)` iterates tenants and calls `afterSync(tenantId, changedTaskIds)`.

**Fix:** `createPlannerSyncWorker` wraps each tenant's sync iteration in `tenantContext.run(tenantId, async () => { ... })` internally. `afterSync` callback signature becomes `afterSync(changedTaskIds: string[]) => Promise<void>` — it reads tenantId from context. Update the `main.ts` `afterSync` implementation accordingly.

---

## Testing Strategy

- **Category 1:** Verify no cross-boundary imports remain via `pnpm typecheck`. Integration tests must still pass.
- **Category 2:** Spot-check logs appear in test output; existing unit tests continue to pass.
- **Category 3:** Unit tests for any changed error paths. Verify error responses are `application/problem+json`.
- **Category 4:** `pnpm build` must succeed; env vars without Zod parse should throw at start.
- **Category 5:** `pnpm typecheck` + run existing integration tests with `DATABASE_URL`.

For each category PR: `pnpm lint && pnpm typecheck && pnpm test:unit`.

---

## Sanctioned Exceptions Summary

| Rule | Sanctioned exception | File | Reason |
|---|---|---|---|
| No `process.env` outside `env.ts` | `platform/observability/src/logger.ts` | Foundation layer, bootstraps before env.ts |
| `tenantId` never a function param | `platform/oauth/src/providers/entra.ts` — `acquireAppOnly`, `acquireOnBehalf` | MSAL routing parameter, not domain discriminator |
| `DomainError` for all throws | `platform/connector-registry/src/runtime.ts:29,54` | Programming invariants, not runtime domain errors |

---

## Out of Scope

- No new external services (no Redis, queues, vector stores)
- No schema changes
- No new features
- No refactoring unrelated to the violations above
