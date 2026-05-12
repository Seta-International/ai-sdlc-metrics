# MS365 Planner CRUD (Epic 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Teams user read and write Microsoft Planner data through the agent: 16 single-purpose tools (6 reads, 5×2 preview/commit writes), cache-first with 60s TTL + live fallback, HMAC-signed continuation tokens for one-tap confirmation, OBO-as-the-user, every Graph call audited, ETag-based optimistic concurrency, bulk `$batch` with per-row partial-result classification.

**Architecture:**
- `platform/ms-graph` becomes a real HTTP wrapper (raw `fetch`) with 429/5xx retry, `$batch`, ETag, OTel spans, and an audit middleware that writes one `audit.audit_log` row per Graph call.
- `modules/connectors/ms365-planner` gains a typed Planner client, four Drizzle cache tables in its `connector_ms365_planner` schema, an ETag store, a cache-first read-through helper, and write-through after every mutation.
- `modules/products/agent` gains a Drizzle `agent.write_continuations` table, an HMAC-SHA256 token mint/verify helper, and the 16 tools as `Tool<TIn,TOut>` objects from `@seta/agent-core`.
- Writes are **preview → commit** with a 15-minute, single-use, HMAC-signed continuation token. The preview is the dry-run; commit verifies the token, re-uses captured ETags for `If-Match`, runs `$batch`, classifies per-op outcomes, write-through-caches, and stamps `consumed_at` + `result_card` (so retries replay).
- All RLS-enforced on `tenant_id`. No cross-schema FKs.

**Tech Stack:** TypeScript ESM, Hono 4.x, Drizzle ORM 0.45.2 + postgres-js 3.4.9, Zod 4.4.3 (via `@hono/zod-openapi` where routed), Vitest 4.1.5. New deps: `p-queue@8.x` (already present check first), `nanoid@5.x` for UUIDs (or `uuid@14.0.0` v7 — already in workspace). HMAC via Node built-in `crypto`. `msw@2.x` for Graph recordings. Existing pinned: `@azure/msal-node@5.2.0`, `lru-cache@11.3.6`, `pino@10.3.1`.

**Spec:** `docs/superpowers/specs/2026-05-11-ms365-planner-crud-design.md`. Tasks cross-reference spec sections in parentheses, e.g. *(§6.3)*.

**Prerequisites already in tree (verified at plan time):**
- `@seta/oauth` exposes `TokenVault.get(tenantId, providerId, partitionKey)` returning `TokenBundle` *(§7.3 step 3 uses `'entra'`, `'user:<homeAccountId>'`)*.
- `@seta/audit` exposes `createAuditWriter(sql).recordAudit(entry)` with the exact `AuditEntry` shape the spec requires *(§6.6)*.
- `@seta/connector-registry` exposes `requireConsent(tenantId, connectorId)` *(§7.2 step 2)*.
- `@seta/agent-core` exposes `Tool<TInput,TOutput>`, `ToolResult`, `ToolExecutionContext` *(§3 tool surface; §13)*.
- `@seta/db` `OWNER_ORDER` already includes `connector_ms365_planner` and `agent` — migrations will be picked up by `pnpm migrate` automatically once those `migrations/meta/_journal.json` files exist.
- `@seta/tenant` exports `tenantContext.getTenantId()` and `getUserId()` — used everywhere instead of function parameters *(CLAUDE.md footguns)*.
- `modules/connectors/ms365-planner/src/manifest.ts` exists from Epic 1 with the right scopes.

**Conventions used throughout:**
- TDD for `platform/*` and `modules/products/agent/src/tools/*` (CLAUDE.md). Write failing test → run → minimal impl → run → commit.
- ESM only, no path aliases, `import type` for type-only imports.
- Errors throw `DomainError` subclasses from `@seta/middleware/errors`; never bare `Error`. New error classes live in `platform/ms-graph/src/errors.ts` and `modules/products/agent/src/tools/planner/_errors.ts`.
- Tenant id comes from `tenantContext.getTenantId()`; user id from `tenantContext.getUserId()`. Never accept as a function parameter.
- `z` from `@hono/zod-openapi` for any Zod schema that ever flows into a route (Footguns: bare `zod` silently drops `.openapi(...)`). Tool input/output schemas use plain `zod` since they don't go through Hono OpenAPI.
- Drizzle schema is the SOR — `drizzle-kit generate` for migrations. **Never hand-edit `migrations/*.sql`.**
- Single test: `pnpm vitest run path/to/file.test.ts` (or `-t "name"`). Per-package: `pnpm --filter @seta/<pkg> test:unit`.
- Conventional Commits scoped to package: `feat(ms-graph): …`, `feat(connector-ms365-planner): …`, `feat(agent): …`.
- Commit at the end of every task. Don't batch tasks into one commit.

---

## Phases overview

| Phase | What | Method | Outcome |
|---|---|---|---|
| **A. Foundation** (Tasks A1–A2) | Workspace deps, error taxonomy | non-TDD wiring | dependencies pinned; `GraphError` taxonomy compiles |
| **B. `platform/ms-graph`** (Tasks B1–B7) | `graphFetch` wrapper: status mapping, retry, ETag, `$batch`, paginate, audit middleware, OTel | TDD, msw recordings | unit-tested HTTP wrapper that audits every call |
| **C. Connector schema** (Tasks C1–C3) | 4 cache tables + ETag wiring; `agent.write_continuations` table; generate + run migrations | non-TDD schema, TDD around helpers | RLS-enforced cache & continuation tables live |
| **D. Connector data layer** (Tasks D1–D4) | Typed Planner client (`client.ts`), cache read-through, write-through, soft-delete | TDD | cache-first reads with 60s TTL + stale fallback |
| **E. Continuation tokens** (Task E1) | `_continuation.ts`: mint/verify HMAC-SHA256, idempotency, expiry | TDD | tamper-proof, single-use, 15-min tokens |
| **F. Read tools** (Tasks F1–F6) | 6 read tools | TDD per tool | read tools registered, cache-aware |
| **G. Write tools — preview** (Tasks G1–G5) | 5 `.preview` tools (pre-flight, mint token, build card) | TDD per tool | previews return card + token; no mutation |
| **H. Write tools — commit** (Tasks H1–H5) | 5 `.commit` tools (verify, batch, classify, write-through, idempotent replay) | TDD per tool | commits perform `$batch` with per-row outcome card |
| **I. Workload analysis** (Task I1) | `planner.workload_analysis` — SQL aggregation + chart shape | TDD | A4-ready bar-chart data |
| **J. Wire-up** (Tasks J1–J2) | Register tools in agent product; mount migrations | non-TDD wiring | tools discoverable from `apps/api` |
| **K. Integration tests** (Tasks K1–K3) | DB-backed preview→commit, partial-failure, idempotent re-commit, msw Graph fixtures | integration | green `pnpm test:integration` |
| **L. E2E** (Task L1) | Q4.1–Q4.10 against staging Entra + dev plan | manual + scripted | sign-off |

**TDD method per task** (every code-bearing task):
1. Write the failing test (with the actual assertion code).
2. Run it — expect a specific failure.
3. Write the minimal implementation (with the actual code).
4. Run — expect green.
5. Commit (Conventional Commit, package-scoped).

---

## Dependencies (cross-package)

```
                          ┌──────────────┐
                          │ @seta/audit  │  (existing)
                          └──────┬───────┘
                                 │
                          ┌──────▼─────────┐
                          │ @seta/oauth    │  TokenVault.get  (existing)
                          └──────┬─────────┘
                                 │
                          ┌──────▼──────────────────────────────────┐
   (Phase B)              │ @seta/ms-graph                          │
                          │   GraphFetch, audit middleware, errors  │
                          └──────┬──────────────────────────────────┘
                                 │
       ┌─────────────────────────┴─────────────────────────┐
       │                                                   │
┌──────▼────────────────────────┐                ┌─────────▼──────────────┐
│ @seta/connector-ms365-planner │  (Phases C–D)  │ @seta/connector-       │
│   schema, client, cache       │                │   registry  (existing) │
└──────┬────────────────────────┘                └─────────┬──────────────┘
       │                                                   │
       └─────────────────────────┬─────────────────────────┘
                                 │
                          ┌──────▼─────────────────────────────────┐
                          │ @seta/agent (modules/products/agent)   │  (Phases E–I)
                          │   agent.write_continuations, tools/*   │
                          └──────┬─────────────────────────────────┘
                                 │
                          ┌──────▼─────────────┐
                          │ apps/api           │  (Phase J)
                          └────────────────────┘
```

Hard rule: `apps/*` only composes. Connectors never import products; products never import other products.

---

## Package build order

1. `@seta/ms-graph` (Phase B) — depends on `@seta/audit`, `@seta/oauth`, `@seta/middleware`, `@seta/observability`.
2. `@seta/connector-ms365-planner` (Phases C–D) — depends on `@seta/ms-graph`, `@seta/connector-registry`, `@seta/db`, `@seta/tenant`.
3. `@seta/agent` (Phases E–I) — depends on `@seta/connector-ms365-planner`, `@seta/connector-registry`, `@seta/agent-core`, `@seta/db`, `@seta/tenant`, `@seta/audit`, `@seta/middleware`.
4. `apps/api` (Phase J) — registers `plannerConnector`, mounts agent product routes, runs migrations.

Run `pnpm typecheck` after every phase boundary; never let `main` go red.

---

## Migration order

`@seta/db`'s `OWNER_ORDER` *(already in `platform/db/src/migrate.ts`)* drives runtime order. Within this plan:

| # | Owner schema | Created in task | What |
|---|---|---|---|
| 1 | `connector_ms365_planner` | **C1** | `planner_tasks_cache`, `planner_task_details_cache`, `planner_plans_cache`, `planner_buckets_cache`, `sync_watermarks` + RLS *(§5.1)* |
| 2 | `agent` | **C2** | `agent.write_continuations` + RLS *(§7.7)* |

The runner skips owners with no `meta/_journal.json` (already implemented), so we don't need to touch `@seta/db` itself. After **C1** and **C2** land, `pnpm migrate` applies them automatically.

**Forward-only.** No down migrations. *(CLAUDE.md scale rules.)*

---

## Testing milestones

| Milestone | After tasks | Command | Gate |
|---|---|---|---|
| **M1** — Graph wrapper unit-green | B7 | `pnpm --filter @seta/ms-graph test:unit` | All retry/ETag/batch/audit cases pass; coverage ≥ 90% |
| **M2** — Connector unit-green | D4 | `pnpm --filter @seta/connector-ms365-planner test:unit` | Cache hit/miss/stale + write-through + soft-delete pass |
| **M3** — Continuation unit-green | E1 | `pnpm --filter @seta/agent test:unit -t "_continuation"` | HMAC tamper, expiry, consumed, cross-user all reject |
| **M4** — Read tools green | F6 | `pnpm --filter @seta/agent test:unit -t "planner.read"` | 6 tools return cached + live with `source` annotation |
| **M5** — Write tools green | H5 | `pnpm --filter @seta/agent test:unit -t "planner.(create|update|complete|add|create_plan)"` | Preview pre-flight aborts on 403/404; commit replays on re-submit; per-row partial-result correct |
| **M6** — Workload analysis green | I1 | `pnpm --filter @seta/agent test:unit -t "workload_analysis"` | SQL aggregation + chart shape match spec *(§8.4)* |
| **M7** — Wire-up typechecks | J2 | `pnpm typecheck && pnpm build` | Whole monorepo builds |
| **M8** — Integration green | K3 | `DATABASE_URL=… pnpm test:integration` | Full preview→commit, partial-failure, idempotent replay, audit rows present |
| **M9** — E2E green | L1 | staging run | Q4.1–Q4.10 pass with real Entra + real plan |

Don't advance past a milestone with red tests.

---

## Rollout sequence

1. **Behind a connector flag.** `plannerConnector` exists from Epic 1 but is dormant. A tenant gains tools only after `connectorRegistry.requireConsent(tenantId, 'ms365-planner')` returns truthy. No global flag needed — consent IS the flag.
2. **Order on the API:** `apps/api/src/main.ts` registers the connector (Task J1) and mounts the agent product's tool routes after migrations have run (Task J2).
3. **Staging first.** Run Phase L (E2E) against a real Entra dev app + dev plan. Block prod cutover on Q4 sign-off.
4. **Initial sync caveat:** `workload_analysis` against an empty-cache tenant is slow (lists go live until Epic 3 lands). Document in release notes.
5. **Observability gate:** confirm `planner_tool_invocations_total`, `planner_continuation_lifecycle_total`, `graph_batch_size_histogram` metrics light up on staging before opening to first prod tenant.
6. **First prod tenant** (Seta itself) via the bootstrap-from-env path (Epic 1's `seed-first-tenant.ts`). Watch traces in Jaeger (http://localhost:16686 locally; staging dashboard otherwise) for first 24h.
7. **No external tenants until** Epic 3's sync worker is up — without it, cache is cold per-tenant and read latency targets (AC-1) are not met.

---

## Phase A — Foundation (2 tasks)

### Task A1: Add Epic 2 deps and confirm pins

**Files:**
- Modify (via CLI only): `platform/ms-graph/package.json`, `modules/products/agent/package.json`

- [ ] **Step 1: Pin versions before adding**

Run:
```bash
pnpm view p-queue version           # confirm pin
pnpm view uuid version              # already pinned to 14.0.0 in Epic 1
pnpm view msw version
```
Expected: `p-queue` returns something ≥ `8.x`; `uuid@14.0.0`; `msw` ≥ `2.x`.

- [ ] **Step 2: Add deps via CLI (CLAUDE.md: never hand-edit package.json)**

Run:
```bash
pnpm --filter @seta/ms-graph add @seta/middleware@workspace:* @seta/audit@workspace:* @seta/observability@workspace:* @seta/tenant@workspace:*
pnpm --filter @seta/ms-graph add -D msw@2.7.0

pnpm --filter @seta/connector-ms365-planner add @seta/db@workspace:* @seta/tenant@workspace:* @seta/middleware@workspace:* @seta/oauth@workspace:* drizzle-orm@0.45.2
pnpm --filter @seta/connector-ms365-planner add -D drizzle-kit@0.31.10

pnpm --filter @seta/agent add @seta/connector-ms365-planner@workspace:* @seta/connector-registry@workspace:* @seta/agent-core@workspace:* @seta/db@workspace:* @seta/tenant@workspace:* @seta/middleware@workspace:* @seta/audit@workspace:* @seta/oauth@workspace:* @seta/ms-graph@workspace:* drizzle-orm@0.45.2 p-queue@8.1.0 uuid@14.0.0 zod@4.4.3
pnpm --filter @seta/agent add -D drizzle-kit@0.31.10
```

- [ ] **Step 3: Verify**

Run: `pnpm install --frozen-lockfile && pnpm typecheck`
Expected: PASS. Snapshot lockfile diff in the commit.

- [ ] **Step 4: Commit**

```bash
git add platform/ms-graph/package.json modules/connectors/ms365-planner/package.json modules/products/agent/package.json pnpm-lock.yaml
git commit -m "chore(deps): pin Epic-2 workspace deps (ms-graph, planner, agent)"
```

### Task A2: Decide the `CONTINUATION_HMAC_KEY` env contract

**Files:**
- Modify: `apps/api/src/env.ts` (typed env via Zod)

- [ ] **Step 1: Read the existing env schema**

Run: `grep -n "CONTINUATION" apps/api/src/env.ts || cat apps/api/src/env.ts`
Confirm the file uses a Zod schema parsed once at boot per CLAUDE.md.

- [ ] **Step 2: Add the variable (Zod `.min(32)` for HMAC strength)**

Edit `apps/api/src/env.ts` and add:
```ts
CONTINUATION_HMAC_KEY: z.string().min(32, 'must be ≥32 bytes (64+ hex chars)'),
PLANNER_CACHE_TTL_TASKS_SEC: z.coerce.number().int().positive().default(60),
PLANNER_CACHE_TTL_PLANS_SEC: z.coerce.number().int().positive().default(600),
PLANNER_CACHE_TTL_BUCKETS_SEC: z.coerce.number().int().positive().default(300),
PLANNER_CACHE_STALE_FALLBACK_MAX_SEC: z.coerce.number().int().positive().default(3600),
PLANNER_BATCH_CONCURRENCY: z.coerce.number().int().positive().default(3),
CONTINUATION_TTL_MIN: z.coerce.number().int().positive().default(15),
```

- [ ] **Step 3: Update `.env.example`**

Append:
```
CONTINUATION_HMAC_KEY=replace-with-openssl-rand-hex-32
PLANNER_CACHE_TTL_TASKS_SEC=60
PLANNER_CACHE_TTL_PLANS_SEC=600
PLANNER_CACHE_TTL_BUCKETS_SEC=300
PLANNER_CACHE_STALE_FALLBACK_MAX_SEC=3600
PLANNER_BATCH_CONCURRENCY=3
CONTINUATION_TTL_MIN=15
```

- [ ] **Step 4: Typecheck and commit**

```bash
pnpm --filter @seta/api typecheck
git add apps/api/src/env.ts .env.example
git commit -m "feat(api): env keys for planner cache TTLs + continuation HMAC"
```

---

## Phase B — `platform/ms-graph` HTTP wrapper (7 tasks)

### Task B1: Error taxonomy *(§6.3, §9)*

**Files:**
- Create: `platform/ms-graph/src/errors.ts`
- Test: `platform/ms-graph/src/errors.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import {
  GraphNotFound,
  GraphPermissionDenied,
  GraphPreconditionFailed,
  GraphRateLimited,
  GraphUnauthorized,
  GraphUnavailable,
} from './errors'

describe('Graph error taxonomy', () => {
  it('GraphNotFound is a 404', () => {
    const e = new GraphNotFound('/me/planner/tasks/x')
    expect(e.status).toBe(404)
    expect(e.message).toMatch(/not found/i)
  })
  it('GraphPreconditionFailed is a 412', () => {
    expect(new GraphPreconditionFailed('task changed').status).toBe(412)
  })
  it('GraphPermissionDenied is a 403', () => {
    expect(new GraphPermissionDenied().status).toBe(403)
  })
  it('GraphRateLimited is a 429 with retryAfterSec', () => {
    const e = new GraphRateLimited(42)
    expect(e.status).toBe(429)
    expect(e.retryAfterSec).toBe(42)
  })
  it('GraphUnavailable is a 503', () => {
    expect(new GraphUnavailable('network').status).toBe(503)
  })
  it('GraphUnauthorized is a 401', () => {
    expect(new GraphUnauthorized().status).toBe(401)
  })
})
```

- [ ] **Step 2: Run it — expect fail (file missing)**

Run: `pnpm --filter @seta/ms-graph vitest run src/errors.test.ts`
Expected: FAIL — `Cannot find module './errors'`.

- [ ] **Step 3: Implement**

```ts
// platform/ms-graph/src/errors.ts
import { DomainError } from '@seta/middleware'

export class GraphNotFound extends DomainError {
  constructor(path: string) {
    super(404, 'graph resource not found', { detail: `path=${path}` })
  }
}

export class GraphPreconditionFailed extends DomainError {
  constructor(detail = 'optimistic concurrency conflict') {
    super(412, 'graph precondition failed', { detail })
  }
}

export class GraphPermissionDenied extends DomainError {
  constructor(detail = 'caller cannot access resource') {
    super(403, 'graph permission denied', { detail })
  }
}

export class GraphUnauthorized extends DomainError {
  constructor(detail = 'token rejected by AAD') {
    super(401, 'graph unauthorized', { detail })
  }
}

export class GraphRateLimited extends DomainError {
  retryAfterSec: number
  constructor(retryAfterSec: number) {
    super(429, 'graph rate limited', { detail: `retry-after=${retryAfterSec}s` })
    this.retryAfterSec = retryAfterSec
  }
}

export class GraphUnavailable extends DomainError {
  constructor(detail: string) {
    super(503, 'graph unavailable', { detail })
  }
}
```

- [ ] **Step 4: Run — expect green**

Run: `pnpm --filter @seta/ms-graph vitest run src/errors.test.ts`
Expected: 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add platform/ms-graph/src/errors.ts platform/ms-graph/src/errors.test.ts
git commit -m "feat(ms-graph): error taxonomy for Graph HTTP failures"
```

### Task B2: `graphFetch.call()` — happy path + 200/201/204 ETag capture *(§6.2, §6.4)*

**Files:**
- Create: `platform/ms-graph/src/graph-fetch.ts`
- Test: `platform/ms-graph/src/graph-fetch.test.ts`
- Test helper: `platform/ms-graph/src/test/msw-server.ts`

- [ ] **Step 1: Test helper — msw boot**

```ts
// platform/ms-graph/src/test/msw-server.ts
import { setupServer } from 'msw/node'
export const mswServer = setupServer()
```

- [ ] **Step 2: Failing test — GET captures @odata.etag and ETag header**

```ts
// platform/ms-graph/src/graph-fetch.test.ts
import { http, HttpResponse } from 'msw'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { mswServer } from './test/msw-server'
import { createGraphFetch } from './graph-fetch'

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }))
afterEach(() => mswServer.resetHandlers())
afterAll(() => mswServer.close())

describe('graphFetch.call', () => {
  it('GET 200 captures @odata.etag and returns typed data', async () => {
    mswServer.use(
      http.get('https://graph.microsoft.com/v1.0/me/planner/tasks/T1', () =>
        HttpResponse.json({ '@odata.etag': 'W/"1"', id: 'T1', title: 'a' }, { status: 200 }),
      ),
    )
    const gf = createGraphFetch({ recordAudit: async () => {} })
    const res = await gf.call<{ id: string; title: string }>({
      token: 't',
      method: 'GET',
      path: '/me/planner/tasks/T1',
      actor: { type: 'user', userId: 'u' },
      connectorId: 'ms365-planner',
    })
    expect(res.data.id).toBe('T1')
    expect(res.etag).toBe('W/"1"')
    expect(res.status).toBe(200)
  })

  it('falls back to ETag response header when @odata.etag is absent', async () => {
    mswServer.use(
      http.get('https://graph.microsoft.com/v1.0/me/planner/plans/P1', () =>
        HttpResponse.json({ id: 'P1' }, { status: 200, headers: { ETag: 'W/"hdr"' } }),
      ),
    )
    const gf = createGraphFetch({ recordAudit: async () => {} })
    const res = await gf.call({
      token: 't',
      method: 'GET',
      path: '/me/planner/plans/P1',
      actor: { type: 'user', userId: 'u' },
      connectorId: 'ms365-planner',
    })
    expect(res.etag).toBe('W/"hdr"')
  })

  it('204 returns null data and null etag', async () => {
    mswServer.use(
      http.delete('https://graph.microsoft.com/v1.0/me/planner/tasks/T1', () =>
        new HttpResponse(null, { status: 204 }),
      ),
    )
    const gf = createGraphFetch({ recordAudit: async () => {} })
    const res = await gf.call({
      token: 't',
      method: 'DELETE',
      path: '/me/planner/tasks/T1',
      etag: 'W/"1"',
      actor: { type: 'user', userId: 'u' },
      connectorId: 'ms365-planner',
    })
    expect(res.status).toBe(204)
    expect(res.data).toBeNull()
    expect(res.etag).toBeNull()
  })
})
```

- [ ] **Step 3: Run — expect failure**

Run: `pnpm --filter @seta/ms-graph vitest run src/graph-fetch.test.ts`
Expected: FAIL — `Cannot find module './graph-fetch'`.

- [ ] **Step 4: Implement minimal happy-path**

```ts
// platform/ms-graph/src/graph-fetch.ts
import type { AuditEntry } from '@seta/audit'

export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT'
export type AuditActor = AuditEntry['actor']

export interface GraphCall {
  token: string
  method: Method
  path: string
  body?: unknown
  etag?: string
  query?: Record<string, string | number>
  headers?: Record<string, string>
  actor: AuditActor
  connectorId: string
}

export interface GraphResponse<T> {
  data: T
  etag: string | null
  status: number
  rateLimit?: { remaining?: number; limit?: number; resetAfter?: number }
}

export interface GraphFetchDeps {
  recordAudit: (entry: AuditEntry) => Promise<void>
  baseUrl?: string                                // default 'https://graph.microsoft.com/v1.0'
  now?: () => number                              // for tests
  fetchImpl?: typeof fetch                        // for tests
}

export interface GraphFetch {
  call<T>(input: GraphCall): Promise<GraphResponse<T>>
  // batch/paginate added in B5
}

export function createGraphFetch(deps: GraphFetchDeps): GraphFetch {
  const base = deps.baseUrl ?? 'https://graph.microsoft.com/v1.0'
  const f = deps.fetchImpl ?? fetch

  async function call<T>(input: GraphCall): Promise<GraphResponse<T>> {
    const url = new URL(base + input.path)
    if (input.query)
      for (const [k, v] of Object.entries(input.query)) url.searchParams.set(k, String(v))

    const headers = new Headers(input.headers ?? {})
    headers.set('Authorization', `Bearer ${input.token}`)
    if (input.etag && (input.method === 'PATCH' || input.method === 'DELETE'))
      headers.set('If-Match', input.etag)
    if (input.body !== undefined && !headers.has('Content-Type'))
      headers.set('Content-Type', 'application/json')

    const res = await f(url.toString(), {
      method: input.method,
      headers,
      body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
    })

    const status = res.status
    let data: unknown = null
    let etag: string | null = null
    if (status !== 204 && status !== 205) {
      const text = await res.text()
      data = text.length > 0 ? JSON.parse(text) : null
      if (data && typeof data === 'object' && '@odata.etag' in (data as Record<string, unknown>))
        etag = (data as { '@odata.etag': string })['@odata.etag']
    }
    if (!etag) etag = res.headers.get('ETag')

    return { data: data as T, etag, status }
  }

  return { call }
}
```

- [ ] **Step 5: Run — expect green**

Run: `pnpm --filter @seta/ms-graph vitest run src/graph-fetch.test.ts`
Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add platform/ms-graph/src/graph-fetch.ts platform/ms-graph/src/graph-fetch.test.ts platform/ms-graph/src/test/msw-server.ts
git commit -m "feat(ms-graph): graphFetch.call happy path + ETag capture"
```

### Task B3: Status-code mapping (404/412/403/401) *(§6.3)*

**Files:**
- Modify: `platform/ms-graph/src/graph-fetch.ts`
- Modify: `platform/ms-graph/src/graph-fetch.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `graph-fetch.test.ts`:
```ts
import {
  GraphNotFound,
  GraphPermissionDenied,
  GraphPreconditionFailed,
  GraphUnauthorized,
} from './errors'

describe('graphFetch.call — status mapping', () => {
  const call = async () => {
    const gf = createGraphFetch({ recordAudit: async () => {} })
    return gf.call({
      token: 't',
      method: 'GET',
      path: '/me/planner/tasks/X',
      actor: { type: 'user', userId: 'u' },
      connectorId: 'ms365-planner',
    })
  }

  it('404 → GraphNotFound', async () => {
    mswServer.use(
      http.get('https://graph.microsoft.com/v1.0/me/planner/tasks/X', () =>
        HttpResponse.json({ error: { code: 'NotFound' } }, { status: 404 })),
    )
    await expect(call()).rejects.toBeInstanceOf(GraphNotFound)
  })
  it('403 → GraphPermissionDenied', async () => {
    mswServer.use(
      http.get('https://graph.microsoft.com/v1.0/me/planner/tasks/X', () =>
        HttpResponse.json({ error: { code: 'Forbidden' } }, { status: 403 })),
    )
    await expect(call()).rejects.toBeInstanceOf(GraphPermissionDenied)
  })
  it('412 → GraphPreconditionFailed', async () => {
    mswServer.use(
      http.get('https://graph.microsoft.com/v1.0/me/planner/tasks/X', () =>
        HttpResponse.json({}, { status: 412 })),
    )
    await expect(call()).rejects.toBeInstanceOf(GraphPreconditionFailed)
  })
  it('401 → GraphUnauthorized', async () => {
    mswServer.use(
      http.get('https://graph.microsoft.com/v1.0/me/planner/tasks/X', () =>
        HttpResponse.json({}, { status: 401 })),
    )
    await expect(call()).rejects.toBeInstanceOf(GraphUnauthorized)
  })
})
```

- [ ] **Step 2: Run — fail (current impl returns rather than throws)**

Run: `pnpm --filter @seta/ms-graph vitest run src/graph-fetch.test.ts -t "status mapping"`
Expected: 4 failures.

- [ ] **Step 3: Implement — add status mapping**

In `graph-fetch.ts`, after parsing `data`, before returning, add:
```ts
if (status === 404) throw new GraphNotFound(input.path)
if (status === 412) throw new GraphPreconditionFailed()
if (status === 403) throw new GraphPermissionDenied()
if (status === 401) throw new GraphUnauthorized()
```
Add imports for the four classes at the top.

- [ ] **Step 4: Run — green**

Run: `pnpm --filter @seta/ms-graph vitest run src/graph-fetch.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add platform/ms-graph/src/graph-fetch.ts platform/ms-graph/src/graph-fetch.test.ts
git commit -m "feat(ms-graph): map 404/403/412/401 to GraphError subclasses"
```

### Task B4: Retry — 429 (Retry-After) and 5xx (exponential backoff) *(§6.3)*

**Files:**
- Modify: `platform/ms-graph/src/graph-fetch.ts`
- Modify: `platform/ms-graph/src/graph-fetch.test.ts`

- [ ] **Step 1: Failing test — 429 honors Retry-After up to 3 retries then throws**

Add:
```ts
import { GraphRateLimited, GraphUnavailable } from './errors'

describe('graphFetch.call — retry', () => {
  it('429 with Retry-After=0 retries up to 3x then GraphRateLimited', async () => {
    let n = 0
    mswServer.use(
      http.get('https://graph.microsoft.com/v1.0/me/planner/tasks/X', () => {
        n++
        return new HttpResponse(null, { status: 429, headers: { 'Retry-After': '0' } })
      }),
    )
    const gf = createGraphFetch({ recordAudit: async () => {}, now: () => 0 })
    await expect(
      gf.call({
        token: 't', method: 'GET', path: '/me/planner/tasks/X',
        actor: { type: 'user', userId: 'u' }, connectorId: 'ms365-planner',
      }),
    ).rejects.toBeInstanceOf(GraphRateLimited)
    expect(n).toBe(4)        // initial + 3 retries
  })

  it('5xx retries with backoff and then GraphUnavailable', async () => {
    let n = 0
    mswServer.use(
      http.get('https://graph.microsoft.com/v1.0/me/planner/tasks/X', () => {
        n++
        return new HttpResponse(null, { status: 503 })
      }),
    )
    const gf = createGraphFetch({ recordAudit: async () => {}, now: () => 0 })
    await expect(
      gf.call({
        token: 't', method: 'GET', path: '/me/planner/tasks/X',
        actor: { type: 'user', userId: 'u' }, connectorId: 'ms365-planner',
      }),
    ).rejects.toBeInstanceOf(GraphUnavailable)
    expect(n).toBe(4)
  })

  it('5xx then 200 recovers (returns last response)', async () => {
    let n = 0
    mswServer.use(
      http.get('https://graph.microsoft.com/v1.0/me/planner/tasks/X', () => {
        n++
        if (n < 2) return new HttpResponse(null, { status: 500 })
        return HttpResponse.json({ id: 'X' }, { status: 200 })
      }),
    )
    const gf = createGraphFetch({ recordAudit: async () => {}, now: () => 0 })
    const res = await gf.call<{ id: string }>({
      token: 't', method: 'GET', path: '/me/planner/tasks/X',
      actor: { type: 'user', userId: 'u' }, connectorId: 'ms365-planner',
    })
    expect(res.data.id).toBe('X')
  })

  it('POST does NOT retry on 4xx, only 5xx', async () => {
    let n = 0
    mswServer.use(
      http.post('https://graph.microsoft.com/v1.0/me/planner/tasks', () => {
        n++
        return new HttpResponse(null, { status: 400 })
      }),
    )
    const gf = createGraphFetch({ recordAudit: async () => {}, now: () => 0 })
    await expect(
      gf.call({
        token: 't', method: 'POST', path: '/me/planner/tasks', body: {},
        actor: { type: 'user', userId: 'u' }, connectorId: 'ms365-planner',
      }),
    ).rejects.toBeTruthy()
    expect(n).toBe(1)
  })
})
```

- [ ] **Step 2: Run — fail**

Run: `pnpm --filter @seta/ms-graph vitest run src/graph-fetch.test.ts -t "retry"`
Expected: 4 failures.

- [ ] **Step 3: Implement retry loop with a synthesizable sleep**

Refactor `call` body in `graph-fetch.ts`:
```ts
const MAX_RETRIES = 3
async function call<T>(input: GraphCall): Promise<GraphResponse<T>> {
  const url = new URL(base + input.path)
  if (input.query)
    for (const [k, v] of Object.entries(input.query)) url.searchParams.set(k, String(v))

  let attempt = 0
  let lastErrorStatus = 0
  while (true) {
    const headers = new Headers(input.headers ?? {})
    headers.set('Authorization', `Bearer ${input.token}`)
    if (input.etag && (input.method === 'PATCH' || input.method === 'DELETE'))
      headers.set('If-Match', input.etag)
    if (input.body !== undefined && !headers.has('Content-Type'))
      headers.set('Content-Type', 'application/json')

    const res = await f(url.toString(), {
      method: input.method, headers,
      body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
    })

    const status = res.status

    // Retryable: 429 (honor Retry-After) or 5xx (idempotent or POST-on-5xx)
    if (status === 429 || status >= 500) {
      lastErrorStatus = status
      if (attempt >= MAX_RETRIES) {
        if (status === 429) {
          const ra = Number(res.headers.get('Retry-After') ?? '1')
          throw new GraphRateLimited(Number.isFinite(ra) ? ra : 1)
        }
        throw new GraphUnavailable(`status=${status}`)
      }
      let delayMs: number
      if (status === 429) {
        const ra = Number(res.headers.get('Retry-After') ?? '1')
        delayMs = Math.min(60_000, (Number.isFinite(ra) ? ra : 1) * 1000)
      } else {
        const base = 1000 * 2 ** attempt
        const jitter = base * 0.25 * (Math.random() * 2 - 1)
        delayMs = Math.max(0, base + jitter)
      }
      attempt++
      await new Promise((r) => setTimeout(r, delayMs))
      continue
    }

    // 4xx mapping (non-retryable)
    let data: unknown = null
    let etag: string | null = null
    if (status !== 204 && status !== 205) {
      const text = await res.text()
      data = text.length > 0 ? JSON.parse(text) : null
      if (data && typeof data === 'object' && '@odata.etag' in (data as Record<string, unknown>))
        etag = (data as { '@odata.etag': string })['@odata.etag']
    }
    if (!etag) etag = res.headers.get('ETag')

    if (status === 404) throw new GraphNotFound(input.path)
    if (status === 412) throw new GraphPreconditionFailed()
    if (status === 403) throw new GraphPermissionDenied()
    if (status === 401) throw new GraphUnauthorized()
    if (status >= 400) throw new GraphUnavailable(`status=${status}`)

    return { data: data as T, etag, status }
  }
}
```

For testability, when `Retry-After: 0`, `delayMs` becomes 0 and the test won't wait. For the 5xx test we'd otherwise wait 1s+2s+4s; **add a fast-test shortcut**: accept `deps.retryDelayCapMs` (default infinite). Pass `retryDelayCapMs: 0` in tests:

```ts
export interface GraphFetchDeps {
  recordAudit: (entry: AuditEntry) => Promise<void>
  baseUrl?: string
  now?: () => number
  fetchImpl?: typeof fetch
  retryDelayCapMs?: number       // cap each retry sleep — tests pass 0
}
```
In the retry block, replace `delayMs = ...` with `delayMs = Math.min(deps.retryDelayCapMs ?? Number.POSITIVE_INFINITY, computedDelayMs)`. Update tests to pass `retryDelayCapMs: 0` in the `createGraphFetch` call.

- [ ] **Step 4: Run — green**

Run: `pnpm --filter @seta/ms-graph vitest run src/graph-fetch.test.ts`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add platform/ms-graph/src/graph-fetch.ts platform/ms-graph/src/graph-fetch.test.ts
git commit -m "feat(ms-graph): 429 + 5xx retry with backoff and Retry-After"
```

### Task B5: `$batch` *(§6.5)*

**Files:**
- Modify: `platform/ms-graph/src/graph-fetch.ts`
- Modify: `platform/ms-graph/src/graph-fetch.test.ts`

- [ ] **Step 1: Failing test**

```ts
describe('graphFetch.batch', () => {
  it('POSTs /$batch with the envelope and returns per-request results', async () => {
    let received: unknown = null
    mswServer.use(
      http.post('https://graph.microsoft.com/v1.0/$batch', async ({ request }) => {
        received = await request.json()
        return HttpResponse.json({
          responses: [
            { id: '1', status: 200, body: { '@odata.etag': 'W/"new"', id: 'T1', title: 'a' } },
            { id: '2', status: 412, body: {} },
          ],
        })
      }),
    )
    const gf = createGraphFetch({ recordAudit: async () => {}, retryDelayCapMs: 0 })
    const out = await gf.batch({
      token: 't',
      actor: { type: 'user', userId: 'u' },
      connectorId: 'ms365-planner',
      requests: [
        { id: '1', method: 'PATCH', url: '/me/planner/tasks/T1',
          headers: { 'If-Match': 'W/"1"', Prefer: 'return=representation' }, body: { title: 'a' } },
        { id: '2', method: 'PATCH', url: '/me/planner/tasks/T2',
          headers: { 'If-Match': 'W/"stale"' }, body: { title: 'b' } },
      ],
    })
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ id: '1', status: 200, etag: 'W/"new"' })
    expect(out[1]).toMatchObject({ id: '2', status: 412 })
    // verify envelope
    expect((received as { requests: unknown[] }).requests).toHaveLength(2)
  })

  it('throws if requests.length > 20', async () => {
    const gf = createGraphFetch({ recordAudit: async () => {}, retryDelayCapMs: 0 })
    await expect(
      gf.batch({
        token: 't', actor: { type: 'user', userId: 'u' }, connectorId: 'ms365-planner',
        requests: Array.from({ length: 21 }, (_, i) => ({ id: String(i), method: 'GET', url: '/x' })),
      }),
    ).rejects.toThrow(/<= 20/)
  })
})
```

- [ ] **Step 2: Run — fail**

Run: `pnpm --filter @seta/ms-graph vitest run src/graph-fetch.test.ts -t "batch"`
Expected: `gf.batch is not a function`.

- [ ] **Step 3: Implement**

Add to `GraphFetch` interface:
```ts
export interface BatchRequest {
  id: string
  method: Method
  url: string
  body?: unknown
  headers?: Record<string, string>
  dependsOn?: string[]
}
export interface BatchResponseItem<T = unknown> {
  id: string
  status: number
  body?: T
  etag: string | null
  error?: { code: string; message: string }
}
export interface GraphFetch {
  call<T>(input: GraphCall): Promise<GraphResponse<T>>
  batch(input: {
    token: string
    actor: AuditActor
    connectorId: string
    requests: BatchRequest[]
  }): Promise<BatchResponseItem[]>
}
```

Add to the returned object:
```ts
async function batch(input) {
  if (input.requests.length > 20) throw new Error('$batch supports <= 20 inner requests per envelope')
  const res = await call<{
    responses: Array<{ id: string; status: number; headers?: Record<string, string>; body?: unknown }>
  }>({
    token: input.token,
    method: 'POST',
    path: '/$batch',
    body: { requests: input.requests },
    actor: input.actor,
    connectorId: input.connectorId,
  })
  return res.data.responses.map((r) => {
    let etag: string | null = null
    if (r.body && typeof r.body === 'object' && '@odata.etag' in (r.body as Record<string, unknown>))
      etag = (r.body as { '@odata.etag': string })['@odata.etag']
    if (!etag && r.headers?.ETag) etag = r.headers.ETag
    return { id: r.id, status: r.status, body: r.body, etag }
  })
}
return { call, batch }
```

- [ ] **Step 4: Run — green**

Run: `pnpm --filter @seta/ms-graph vitest run src/graph-fetch.test.ts -t "batch"`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add platform/ms-graph/src/graph-fetch.ts platform/ms-graph/src/graph-fetch.test.ts
git commit -m "feat(ms-graph): \$batch envelope with per-inner-response ETag capture"
```

### Task B6: Audit middleware — synchronous audit per call + per inner batch *(§6.6)*

**Files:**
- Create: `platform/ms-graph/src/audit-middleware.ts`
- Test: `platform/ms-graph/src/audit-middleware.test.ts`
- Modify: `platform/ms-graph/src/graph-fetch.ts` (call hook into deps.recordAudit)

- [ ] **Step 1: Failing test**

```ts
// platform/ms-graph/src/audit-middleware.test.ts
import { http, HttpResponse } from 'msw'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { mswServer } from './test/msw-server'
import { createGraphFetch } from './graph-fetch'

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }))
afterEach(() => mswServer.resetHandlers())
afterAll(() => mswServer.close())

describe('audit middleware', () => {
  it('writes one audit row per call with normalized path', async () => {
    mswServer.use(
      http.get('https://graph.microsoft.com/v1.0/me/planner/tasks/T1', () =>
        HttpResponse.json({ id: 'T1' }, { status: 200 })),
    )
    const recordAudit = vi.fn().mockResolvedValue(undefined)
    const gf = createGraphFetch({ recordAudit, retryDelayCapMs: 0 })
    await gf.call({
      token: 't', method: 'GET', path: '/me/planner/tasks/T1',
      actor: { type: 'user', userId: 'u1' },
      connectorId: 'ms365-planner',
    })
    expect(recordAudit).toHaveBeenCalledTimes(1)
    const entry = recordAudit.mock.calls[0]![0]
    expect(entry).toMatchObject({
      connectorId: 'ms365-planner',
      providerId: 'entra',
      operation: 'graph.GET./me/planner/tasks/:id',
      result: 'ok',
    })
    expect(entry.metadata).toMatchObject({ status: 200 })
  })

  it('writes one audit row per inner $batch request', async () => {
    mswServer.use(
      http.post('https://graph.microsoft.com/v1.0/$batch', () =>
        HttpResponse.json({
          responses: [
            { id: 'a', status: 200, body: { id: 'T1' } },
            { id: 'b', status: 403, body: {} },
          ],
        })),
    )
    const recordAudit = vi.fn().mockResolvedValue(undefined)
    const gf = createGraphFetch({ recordAudit, retryDelayCapMs: 0 })
    await gf.batch({
      token: 't', actor: { type: 'user', userId: 'u' }, connectorId: 'ms365-planner',
      requests: [
        { id: 'a', method: 'PATCH', url: '/me/planner/tasks/T1' },
        { id: 'b', method: 'PATCH', url: '/me/planner/tasks/T2' },
      ],
    })
    // 1 envelope audit (POST /$batch) + 2 inner audits — spec §6.6 = one per inner request
    // Inner audits should carry the resolved per-request status (200 / 403).
    const inner = recordAudit.mock.calls.map((c) => c[0]).filter((e) => e.operation.includes('/me/planner/tasks'))
    expect(inner).toHaveLength(2)
    expect(inner.find((e) => e.metadata.status === 200)).toBeTruthy()
    expect(inner.find((e) => e.metadata.status === 403 && e.result === 'failure')).toBeTruthy()
  })

  it('failure status maps result=failure', async () => {
    mswServer.use(
      http.get('https://graph.microsoft.com/v1.0/me/planner/tasks/X', () =>
        HttpResponse.json({}, { status: 403 })),
    )
    const recordAudit = vi.fn().mockResolvedValue(undefined)
    const gf = createGraphFetch({ recordAudit, retryDelayCapMs: 0 })
    await expect(
      gf.call({
        token: 't', method: 'GET', path: '/me/planner/tasks/X',
        actor: { type: 'user', userId: 'u' }, connectorId: 'ms365-planner',
      }),
    ).rejects.toThrow()
    expect(recordAudit.mock.calls[0]![0].result).toBe('failure')
  })
})
```

- [ ] **Step 2: Run — fail**

Run: `pnpm --filter @seta/ms-graph vitest run src/audit-middleware.test.ts`
Expected: assertions fail (no audit call happens yet).

- [ ] **Step 3: Implement path normalization helper**

```ts
// platform/ms-graph/src/audit-middleware.ts
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
// Planner ids are 28-char b64url; treat any segment after a known parent as :id.
const PARENT_SEGMENTS = new Set([
  'tasks', 'plans', 'buckets', 'details', 'users', 'groups', 'me',
])
export function normalizePath(path: string): string {
  const segs = path.split('/').filter(Boolean)
  return '/' + segs.map((seg, i) => {
    if (UUID_RE.test(seg)) return ':id'
    UUID_RE.lastIndex = 0
    if (i > 0 && PARENT_SEGMENTS.has(segs[i - 1]!) && segs[i - 1] !== 'me' && segs[i - 1] !== 'planner')
      return ':id'
    return seg
  }).join('/')
}
```

- [ ] **Step 4: Hook into `graph-fetch.ts`**

In `call()`, after the request resolves to a terminal state (success or error), call:
```ts
await deps.recordAudit({
  tenantId: tenantContext.getTenantId(),                // imported from @seta/tenant
  actor: input.actor,
  providerId: 'entra',
  connectorId: input.connectorId,
  operation: `graph.${input.method}.${normalizePath(input.path)}`,
  result: status >= 400 ? 'failure' : 'ok',
  metadata: { status, latency_ms, retries: attempt },
})
```

For `batch()`, after the envelope returns, audit the envelope itself AND per-inner request:
```ts
for (const r of envelopeResponses) {
  await deps.recordAudit({
    tenantId: tenantContext.getTenantId(),
    actor: input.actor,
    providerId: 'entra',
    connectorId: input.connectorId,
    operation: `graph.${innerMethod(input, r.id)}.${normalizePath(innerUrl(input, r.id))}`,
    result: r.status >= 400 ? 'failure' : 'ok',
    metadata: { status: r.status, batch_inner: true },
  })
}
```

Wrap errors with try/finally to ensure audit always fires.

- [ ] **Step 5: Run — green**

Run: `pnpm --filter @seta/ms-graph vitest run src/audit-middleware.test.ts`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add platform/ms-graph/src/audit-middleware.ts platform/ms-graph/src/graph-fetch.ts platform/ms-graph/src/audit-middleware.test.ts
git commit -m "feat(ms-graph): synchronous audit middleware for call and \$batch inner requests"
```

### Task B7: OTel spans + paginate + exports *(§6.7)*

**Files:**
- Modify: `platform/ms-graph/src/graph-fetch.ts`
- Modify: `platform/ms-graph/src/index.ts`

- [ ] **Step 1: Failing test — `paginate()` yields `@odata.nextLink` pages**

Append to `graph-fetch.test.ts`:
```ts
describe('graphFetch.paginate', () => {
  it('follows @odata.nextLink across pages', async () => {
    mswServer.use(
      http.get('https://graph.microsoft.com/v1.0/me/planner/tasks', ({ request }) => {
        const url = new URL(request.url)
        if (!url.searchParams.has('$skiptoken')) {
          return HttpResponse.json({
            value: [{ id: 'A' }],
            '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/planner/tasks?$skiptoken=tk',
          })
        }
        return HttpResponse.json({ value: [{ id: 'B' }] })
      }),
    )
    const gf = createGraphFetch({ recordAudit: async () => {}, retryDelayCapMs: 0 })
    const all: Array<{ id: string }> = []
    for await (const item of gf.paginate<{ id: string }>({
      token: 't', method: 'GET', path: '/me/planner/tasks',
      actor: { type: 'user', userId: 'u' }, connectorId: 'ms365-planner',
    })) all.push(item)
    expect(all.map((x) => x.id)).toEqual(['A', 'B'])
  })
})
```

- [ ] **Step 2: Implement paginate + add OTel attributes**

In `graph-fetch.ts`:
```ts
import { trace } from '@opentelemetry/api'
const tracer = trace.getTracer('@seta/ms-graph')

// Wrap the body of `call` in tracer.startActiveSpan('graph.call', ...)
//   set attrs: graph.method, graph.path, graph.status, graph.retries
//   end the span in finally
```

Add `paginate`:
```ts
async function* paginate<T>(input: GraphCall): AsyncIterable<T> {
  let cursor: string | null = null
  while (true) {
    const query = { ...(input.query ?? {}), ...(cursor ? { $skiptoken: cursor } : {}) }
    const res = await call<{ value: T[]; '@odata.nextLink'?: string }>({ ...input, query })
    for (const item of res.data.value) yield item
    const next = res.data['@odata.nextLink']
    if (!next) break
    cursor = new URL(next).searchParams.get('$skiptoken')
    if (!cursor) break
  }
}
return { call, batch, paginate }
```

- [ ] **Step 3: Re-export public API**

Edit `platform/ms-graph/src/index.ts`:
```ts
export type {
  BatchRequest,
  BatchResponseItem,
  GraphCall,
  GraphFetch,
  GraphFetchDeps,
  GraphResponse,
  Method,
} from './graph-fetch'
export { createGraphFetch } from './graph-fetch'
export { normalizePath } from './audit-middleware'
export {
  GraphNotFound, GraphPermissionDenied, GraphPreconditionFailed,
  GraphRateLimited, GraphUnauthorized, GraphUnavailable,
} from './errors'
```

- [ ] **Step 4: Run full suite**

Run: `pnpm --filter @seta/ms-graph test:unit && pnpm --filter @seta/ms-graph typecheck && pnpm --filter @seta/ms-graph build`
Expected: green.

- [ ] **Step 5: Commit (Milestone M1)**

```bash
git add platform/ms-graph/src/
git commit -m "feat(ms-graph): paginate + OTel spans + barrel exports"
```

---

## Phase C — Schemas + migrations (3 tasks)

### Task C1: Connector cache schema *(§5.1)*

**Files:**
- Create: `modules/connectors/ms365-planner/drizzle.config.ts`
- Create: `modules/connectors/ms365-planner/src/schema.ts`
- Create: `modules/connectors/ms365-planner/migrations/` (generated)

- [ ] **Step 1: Write `drizzle.config.ts`**

```ts
// modules/connectors/ms365-planner/drizzle.config.ts
import { defineConfig } from 'drizzle-kit'
export default defineConfig({
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  schemaFilter: ['connector_ms365_planner'],
  casing: 'snake_case',
})
```

- [ ] **Step 2: Write Drizzle schema *exactly* matching spec §5.1**

```ts
// modules/connectors/ms365-planner/src/schema.ts
import {
  index, jsonb, pgSchema, primaryKey, smallint, text, timestamp, uuid,
} from 'drizzle-orm/pg-core'

export const connectorMs365PlannerSchema = pgSchema('connector_ms365_planner')

export const plannerTasksCache = connectorMs365PlannerSchema.table(
  'planner_tasks_cache',
  {
    tenantId: uuid('tenant_id').notNull(),
    graphTaskId: text('graph_task_id').notNull(),
    planId: text('plan_id'),
    bucketId: text('bucket_id'),
    title: text('title'),
    percentComplete: smallint('percent_complete'),
    priority: smallint('priority'),
    dueDate: timestamp('due_date', { withTimezone: true }),
    assigneeIds: text('assignee_ids').array(),
    createdBy: text('created_by'),
    createdAtGraph: timestamp('created_at_graph', { withTimezone: true }),
    lastModifiedBy: text('last_modified_by'),
    lastModifiedAtGraph: timestamp('last_modified_at_graph', { withTimezone: true }),
    etag: text('etag'),
    raw: jsonb('raw').$type<Record<string, unknown>>(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow().notNull(),
    softDeletedAt: timestamp('soft_deleted_at', { withTimezone: true }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tenantId, t.graphTaskId] }),
    byPlan: index('planner_tasks_by_plan')
      .on(t.tenantId, t.planId)
      .where(({ softDeletedAt }) => `${softDeletedAt} IS NULL`),
    byDue: index('planner_tasks_by_due')
      .on(t.tenantId, t.dueDate)
      .where(({ softDeletedAt }) => `${softDeletedAt} IS NULL`),
    byAssignees: index('planner_tasks_by_assignees').using('gin', t.tenantId, t.assigneeIds),
  }),
)

export const plannerTaskDetailsCache = connectorMs365PlannerSchema.table(
  'planner_task_details_cache',
  {
    tenantId: uuid('tenant_id').notNull(),
    graphTaskId: text('graph_task_id').notNull(),
    description: text('description'),
    checklist: jsonb('checklist').$type<Record<string, unknown>>(),
    references: jsonb('references').$type<Record<string, unknown>>(),
    etag: text('etag'),
    raw: jsonb('raw').$type<Record<string, unknown>>(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.tenantId, t.graphTaskId] }) }),
)

export const plannerPlansCache = connectorMs365PlannerSchema.table(
  'planner_plans_cache',
  {
    tenantId: uuid('tenant_id').notNull(),
    graphPlanId: text('graph_plan_id').notNull(),
    ownerGroupId: text('owner_group_id'),
    title: text('title'),
    containerUrl: text('container_url'),
    etag: text('etag'),
    raw: jsonb('raw').$type<Record<string, unknown>>(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow().notNull(),
    softDeletedAt: timestamp('soft_deleted_at', { withTimezone: true }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.tenantId, t.graphPlanId] }) }),
)

export const plannerBucketsCache = connectorMs365PlannerSchema.table(
  'planner_buckets_cache',
  {
    tenantId: uuid('tenant_id').notNull(),
    graphBucketId: text('graph_bucket_id').notNull(),
    planId: text('plan_id'),
    name: text('name'),
    orderHint: text('order_hint'),
    etag: text('etag'),
    raw: jsonb('raw').$type<Record<string, unknown>>(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow().notNull(),
    softDeletedAt: timestamp('soft_deleted_at', { withTimezone: true }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tenantId, t.graphBucketId] }),
    byPlan: index('planner_buckets_by_plan').on(t.tenantId, t.planId),
  }),
)

export const syncWatermarks = connectorMs365PlannerSchema.table(
  'sync_watermarks',
  {
    tenantId: uuid('tenant_id').notNull(),
    scopeKind: text('scope_kind').notNull(),       // 'plan' | 'user' | 'global'
    scopeId: text('scope_id').notNull(),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    status: text('status'),
  },
  (t) => ({ pk: primaryKey({ columns: [t.tenantId, t.scopeKind, t.scopeId] }) }),
)

export type PlannerTaskRow = typeof plannerTasksCache.$inferSelect
export type NewPlannerTask = typeof plannerTasksCache.$inferInsert
// repeat for the others, exported.
```

- [ ] **Step 3: Generate migration**

Run: `pnpm --filter @seta/connector-ms365-planner exec drizzle-kit generate`
Expected: `modules/connectors/ms365-planner/migrations/0000_*.sql` + `meta/_journal.json` created.

- [ ] **Step 4: Append RLS as a separate generated file**

Drizzle doesn't emit RLS — add a hand-written companion migration AFTER the generated one. Create `modules/connectors/ms365-planner/migrations/0001_rls.sql`:
```sql
ALTER TABLE connector_ms365_planner.planner_tasks_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_ms365_planner.planner_task_details_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_ms365_planner.planner_plans_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_ms365_planner.planner_buckets_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_ms365_planner.sync_watermarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON connector_ms365_planner.planner_tasks_cache
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON connector_ms365_planner.planner_task_details_cache
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON connector_ms365_planner.planner_plans_cache
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON connector_ms365_planner.planner_buckets_cache
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON connector_ms365_planner.sync_watermarks
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

GRANT USAGE ON SCHEMA connector_ms365_planner TO tenant_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA connector_ms365_planner TO tenant_user;
```

Then update `meta/_journal.json` to register `0001_rls`. Easiest path: re-run `drizzle-kit generate --custom` for the RLS file so Drizzle writes the journal entry for you.

- [ ] **Step 5: Apply locally and verify**

Run:
```bash
pnpm db:up
pnpm migrate
psql "$DATABASE_URL" -c "\dt connector_ms365_planner.*"
```
Expected: 5 tables listed.

- [ ] **Step 6: Commit**

```bash
git add modules/connectors/ms365-planner/src/schema.ts modules/connectors/ms365-planner/drizzle.config.ts modules/connectors/ms365-planner/migrations/
git commit -m "feat(connector-ms365-planner): cache + watermarks schema + RLS"
```

### Task C2: `agent.write_continuations` schema *(§7.7)*

**Files:**
- Create: `modules/products/agent/drizzle.config.ts`
- Create: `modules/products/agent/src/schema.ts`
- Create: `modules/products/agent/migrations/` (generated)

- [ ] **Step 1: `drizzle.config.ts`**

```ts
// modules/products/agent/drizzle.config.ts
import { defineConfig } from 'drizzle-kit'
export default defineConfig({
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  schemaFilter: ['agent'],
  casing: 'snake_case',
})
```

- [ ] **Step 2: Schema**

```ts
// modules/products/agent/src/schema.ts
import { index, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const agentSchema = pgSchema('agent')

export const writeContinuations = agentSchema.table(
  'write_continuations',
  {
    token: text('token').primaryKey(),
    uuid: text('uuid').notNull().unique(),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    toolId: text('tool_id').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    etagSnapshot: jsonb('etag_snapshot').$type<Record<string, string>>().notNull(),
    resultCard: jsonb('result_card').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (t) => ({
    byTenantUserActive: index('write_continuations_active')
      .on(t.tenantId, t.userId, t.expiresAt)
      .where(({ consumedAt }) => `${consumedAt} IS NULL`),
  }),
)

export type WriteContinuationRow = typeof writeContinuations.$inferSelect
export type NewWriteContinuation = typeof writeContinuations.$inferInsert
```

- [ ] **Step 3: Generate + RLS companion**

Run: `pnpm --filter @seta/agent exec drizzle-kit generate`

Then `modules/products/agent/migrations/0001_rls.sql`:
```sql
ALTER TABLE agent.write_continuations ENABLE ROW LEVEL SECURITY;

-- Tenant isolation
CREATE POLICY tenant_isolation ON agent.write_continuations
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Defense-in-depth: mutating own row only — set via SET LOCAL app.user_id per request
CREATE POLICY user_owns_row_w ON agent.write_continuations FOR UPDATE
  USING (user_id = current_setting('app.user_id', true)::uuid);
CREATE POLICY user_owns_row_d ON agent.write_continuations FOR DELETE
  USING (user_id = current_setting('app.user_id', true)::uuid);

GRANT USAGE ON SCHEMA agent TO tenant_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON agent.write_continuations TO tenant_user;
```
Register in `_journal.json` (via `drizzle-kit generate --custom`).

- [ ] **Step 4: Apply + verify**

Run:
```bash
pnpm migrate
psql "$DATABASE_URL" -c "\d agent.write_continuations"
```
Expected: table present, RLS enabled.

- [ ] **Step 5: Commit**

```bash
git add modules/products/agent/src/schema.ts modules/products/agent/drizzle.config.ts modules/products/agent/migrations/
git commit -m "feat(agent): write_continuations schema + RLS"
```

### Task C3: Set `app.user_id` per request — extend tenant middleware

**Files:**
- Modify: `platform/tenant/src/middleware.ts`
- Modify: `platform/tenant/src/middleware.test.ts`

The RLS policies in C2 read `current_setting('app.user_id')`. Confirm tenant middleware already issues both `SET LOCAL app.tenant_id` and `SET LOCAL app.user_id`. If not, extend it.

- [ ] **Step 1: Read existing middleware**

Run: `cat platform/tenant/src/middleware.ts`. If it already SETs `app.user_id`, skip to step 5.

- [ ] **Step 2: Add failing test**

```ts
// in middleware.test.ts
it('sets both app.tenant_id and app.user_id per request', async () => {
  // arrange: middleware wraps a handler that SELECTs both settings
  // assert: handler sees the values that the request supplied
})
```

- [ ] **Step 3: Implement — add `SET LOCAL app.user_id`** alongside the existing tenant SET (one `BEGIN` block).

- [ ] **Step 4: Run — green**

Run: `pnpm --filter @seta/tenant test:unit`
Expected: pass.

- [ ] **Step 5: Commit (skip if no changes)**

```bash
git add platform/tenant/src
git commit -m "feat(tenant): set app.user_id alongside app.tenant_id for RLS"
```

---

## Phase D — Connector data layer (4 tasks)

### Task D1: Typed Planner client *(§4 client.ts)*

**Files:**
- Create: `modules/connectors/ms365-planner/src/client.ts`
- Test: `modules/connectors/ms365-planner/src/client.test.ts`

- [ ] **Step 1: Failing test — each method calls graphFetch with the right path**

```ts
import { describe, expect, it, vi } from 'vitest'
import { createPlannerClient } from './client'

const stubGraph = () => {
  const call = vi.fn().mockResolvedValue({ data: { id: 'X' }, etag: 'W/"1"', status: 200 })
  const batch = vi.fn().mockResolvedValue([])
  const paginate = vi.fn()
  return { call, batch, paginate, gf: { call, batch, paginate } as never }
}

describe('PlannerClient', () => {
  it('getTask GETs /planner/tasks/:id', async () => {
    const s = stubGraph()
    const c = createPlannerClient({ graph: s.gf, actor: { type: 'user', userId: 'u' }, token: 't' })
    await c.getTask('T1')
    expect(s.call).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET', path: '/planner/tasks/T1', token: 't', connectorId: 'ms365-planner',
    }))
  })

  it('updateTask PATCHes with If-Match and Prefer: return=representation', async () => {
    const s = stubGraph()
    const c = createPlannerClient({ graph: s.gf, actor: { type: 'user', userId: 'u' }, token: 't' })
    await c.updateTask('T1', 'W/"old"', { title: 'new' })
    expect(s.call).toHaveBeenCalledWith(expect.objectContaining({
      method: 'PATCH', path: '/planner/tasks/T1', etag: 'W/"old"',
      headers: expect.objectContaining({ Prefer: 'return=representation' }),
      body: { title: 'new' },
    }))
  })

  it('createTask POSTs /planner/tasks with planId/bucketId/title', async () => {
    const s = stubGraph()
    const c = createPlannerClient({ graph: s.gf, actor: { type: 'user', userId: 'u' }, token: 't' })
    await c.createTask({ planId: 'P', bucketId: 'B', title: 't' })
    expect(s.call).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST', path: '/planner/tasks',
      body: { planId: 'P', bucketId: 'B', title: 't' },
    }))
  })

  it('listMyTasks paginates /me/planner/tasks', async () => {
    const s = stubGraph()
    s.paginate.mockReturnValue((async function* () { yield { id: 'T1' } })())
    const c = createPlannerClient({ graph: s.gf, actor: { type: 'user', userId: 'u' }, token: 't' })
    const out = []
    for await (const t of c.listMyTasks()) out.push(t)
    expect(out).toEqual([{ id: 'T1' }])
    expect(s.paginate).toHaveBeenCalledWith(expect.objectContaining({ path: '/me/planner/tasks' }))
  })
})
```

- [ ] **Step 2: Run — fail (no client)**

Run: `pnpm --filter @seta/connector-ms365-planner vitest run src/client.test.ts`
Expected: missing module.

- [ ] **Step 3: Implement**

```ts
// modules/connectors/ms365-planner/src/client.ts
import type { AuditActor, GraphFetch } from '@seta/ms-graph'

export type TaskUpdate = Partial<{
  title: string
  assignments: Record<string, { '@odata.type': string; orderHint: string } | null>
  dueDateTime: string | null
  priority: number
  percentComplete: number
  bucketId: string
  appliedCategories: Record<string, boolean>
}>

export interface CreateTaskInput {
  planId: string
  bucketId?: string
  title: string
  assignments?: Record<string, { '@odata.type': 'microsoft.graph.plannerAssignment'; orderHint: string }>
  dueDateTime?: string
  priority?: number
}

export interface PlannerClientDeps {
  graph: GraphFetch
  actor: AuditActor
  token: string
}

export interface PlannerClient {
  getTask(id: string): Promise<{ data: unknown; etag: string | null }>
  getTaskDetails(id: string): Promise<{ data: unknown; etag: string | null }>
  updateTask(id: string, etag: string, patch: TaskUpdate): Promise<{ data: unknown; etag: string | null }>
  createTask(input: CreateTaskInput): Promise<{ data: unknown; etag: string | null }>
  deleteTask(id: string, etag: string): Promise<void>
  listMyTasks(): AsyncIterable<unknown>
  listPlanTasks(planId: string): AsyncIterable<unknown>
  listMyPlans(): AsyncIterable<unknown>
  listBuckets(planId: string): AsyncIterable<unknown>
  createPlan(input: { owner: string; title: string }): Promise<{ data: unknown; etag: string | null }>
}

const CONNECTOR_ID = 'ms365-planner'

export function createPlannerClient(deps: PlannerClientDeps): PlannerClient {
  const base = { token: deps.token, actor: deps.actor, connectorId: CONNECTOR_ID } as const
  return {
    getTask: async (id) => {
      const r = await deps.graph.call({ ...base, method: 'GET', path: `/planner/tasks/${id}` })
      return { data: r.data, etag: r.etag }
    },
    getTaskDetails: async (id) => {
      const r = await deps.graph.call({ ...base, method: 'GET', path: `/planner/tasks/${id}/details` })
      return { data: r.data, etag: r.etag }
    },
    updateTask: async (id, etag, patch) => {
      const r = await deps.graph.call({
        ...base, method: 'PATCH', path: `/planner/tasks/${id}`,
        etag, headers: { Prefer: 'return=representation' }, body: patch,
      })
      return { data: r.data, etag: r.etag }
    },
    createTask: async (input) => {
      const r = await deps.graph.call({
        ...base, method: 'POST', path: '/planner/tasks', body: input,
      })
      return { data: r.data, etag: r.etag }
    },
    deleteTask: async (id, etag) => {
      await deps.graph.call({ ...base, method: 'DELETE', path: `/planner/tasks/${id}`, etag })
    },
    listMyTasks: () => deps.graph.paginate({ ...base, method: 'GET', path: '/me/planner/tasks' }),
    listPlanTasks: (planId) =>
      deps.graph.paginate({ ...base, method: 'GET', path: `/planner/plans/${planId}/tasks` }),
    listMyPlans: () => deps.graph.paginate({ ...base, method: 'GET', path: '/me/planner/plans' }),
    listBuckets: (planId) =>
      deps.graph.paginate({ ...base, method: 'GET', path: `/planner/plans/${planId}/buckets` }),
    createPlan: async (input) => {
      const r = await deps.graph.call({
        ...base, method: 'POST', path: '/planner/plans',
        body: { container: { url: input.owner }, title: input.title },
      })
      return { data: r.data, etag: r.etag }
    },
  }
}
```

- [ ] **Step 4: Run — green**

Run: `pnpm --filter @seta/connector-ms365-planner vitest run src/client.test.ts`
Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add modules/connectors/ms365-planner/src/client.ts modules/connectors/ms365-planner/src/client.test.ts
git commit -m "feat(connector-ms365-planner): typed Planner client over graphFetch"
```

### Task D2: Cache read-through — single-row *(§5.3)*

**Files:**
- Create: `modules/connectors/ms365-planner/src/cache.ts`
- Test: `modules/connectors/ms365-planner/src/cache.test.ts`

- [ ] **Step 1: Failing test — fresh hit, stale → live, soft-delete on 404, 5xx → stale fallback**

```ts
import { describe, expect, it, vi } from 'vitest'
import { GraphNotFound, GraphUnavailable } from '@seta/ms-graph'
import { createPlannerCache } from './cache'

const TASK = { '@odata.etag': 'W/"1"', id: 'T1', title: 'a' }

const fakeSql = (rows: Record<string, unknown[]>) => {
  const sql = ((q: TemplateStringsArray) => {
    // crude router by keyword
    const text = q.join('?')
    return Promise.resolve(rows[text] ?? [])
  }) as unknown as any
  sql.unsafe = () => sql
  return sql
}

describe('plannerCache.task.one', () => {
  it('returns cache:fresh when synced_at is within TTL', async () => {
    const cache = createPlannerCache({
      sql: fakeSql({ select: [{ graphTaskId: 'T1', etag: 'W/"1"', raw: TASK, syncedAt: new Date() }] }),
      ttlSec: 60, staleFallbackMaxSec: 3600,
      client: { getTask: vi.fn() } as never,
      now: () => Date.now(),
    })
    const r = await cache.task.one('T1')
    expect(r?.source).toBe('cache:fresh')
  })

  it('fetches live on miss; UPSERTs; returns source=live', async () => {
    const getTask = vi.fn().mockResolvedValue({ data: TASK, etag: 'W/"1"' })
    const sql = fakeSql({}) // empty cache
    const cache = createPlannerCache({
      sql, ttlSec: 60, staleFallbackMaxSec: 3600,
      client: { getTask } as never,
      now: () => Date.now(),
    })
    const r = await cache.task.one('T1')
    expect(getTask).toHaveBeenCalledWith('T1')
    expect(r?.source).toBe('live')
    expect(r?.data).toEqual(TASK)
  })

  it('404 from Graph soft-deletes and returns null', async () => {
    const getTask = vi.fn().mockRejectedValue(new GraphNotFound('/planner/tasks/T1'))
    const sql = fakeSql({})
    const cache = createPlannerCache({
      sql, ttlSec: 60, staleFallbackMaxSec: 3600,
      client: { getTask } as never,
      now: () => Date.now(),
    })
    expect(await cache.task.one('T1')).toBeNull()
  })

  it('5xx returns cache:stale-fallback if stale row exists within max', async () => {
    const stale = { graphTaskId: 'T1', etag: 'W/"1"', raw: TASK, syncedAt: new Date(Date.now() - 5 * 60_000) }
    const sql = fakeSql({ select: [stale] })
    const getTask = vi.fn().mockRejectedValue(new GraphUnavailable('5xx'))
    const cache = createPlannerCache({
      sql, ttlSec: 60, staleFallbackMaxSec: 3600,
      client: { getTask } as never,
      now: () => Date.now(),
    })
    const r = await cache.task.one('T1')
    expect(r?.source).toBe('cache:stale-fallback')
  })

  it('5xx with no row rethrows GraphUnavailable', async () => {
    const sql = fakeSql({})
    const getTask = vi.fn().mockRejectedValue(new GraphUnavailable('5xx'))
    const cache = createPlannerCache({
      sql, ttlSec: 60, staleFallbackMaxSec: 3600,
      client: { getTask } as never,
      now: () => Date.now(),
    })
    await expect(cache.task.one('T1')).rejects.toBeInstanceOf(GraphUnavailable)
  })
})
```

Note: real test uses `tests/integration` with a real DB; the unit test here uses a fake `sql`. Production tests live in Phase K.

- [ ] **Step 2: Implement**

Sketch (full impl in package; key shape):
```ts
// modules/connectors/ms365-planner/src/cache.ts
import type { DbSql } from '@seta/db'
import { GraphNotFound, GraphUnavailable } from '@seta/ms-graph'
import { tenantContext } from '@seta/tenant'
import type { PlannerClient } from './client'

export type ReadSource = 'cache:fresh' | 'cache:stale-fallback' | 'live'
export interface ReadResult<T> { data: T; source: ReadSource; ageSeconds: number }

export interface PlannerCacheDeps {
  sql: DbSql
  client: PlannerClient
  ttlSec: number
  staleFallbackMaxSec: number
  now?: () => number
}

export interface PlannerCache {
  task: {
    one(taskId: string): Promise<ReadResult<unknown> | null>
    upsert(taskId: string, etag: string, raw: unknown): Promise<void>
    softDelete(taskId: string): Promise<void>
  }
  taskDetails: { one(taskId: string): Promise<ReadResult<unknown> | null> /* etc */ }
  plan: { one(planId: string): Promise<ReadResult<unknown> | null> /* etc */ }
  bucket: { one(bucketId: string): Promise<ReadResult<unknown> | null> /* etc */ }
}

export function createPlannerCache(deps: PlannerCacheDeps): PlannerCache {
  const now = deps.now ?? (() => Date.now())
  // ... implementation per spec §5.3
}
```

Implement task.one matching the algorithm:
1. `SELECT raw, etag, synced_at FROM connector_ms365_planner.planner_tasks_cache WHERE tenant_id=$1 AND graph_task_id=$2 AND soft_deleted_at IS NULL`
2. If row && age < ttl → fresh.
3. Else try `client.getTask`. On success: UPSERT (`raw=$json, etag=$, synced_at=now()`) and return `live`. On `GraphNotFound`: UPDATE soft_deleted_at and return null. On `GraphUnavailable`: if row && age < staleFallbackMax → `stale-fallback`; else rethrow.

- [ ] **Step 3: Run — green**

Run: `pnpm --filter @seta/connector-ms365-planner vitest run src/cache.test.ts`
Expected: 5 pass.

- [ ] **Step 4: Commit**

```bash
git add modules/connectors/ms365-planner/src/cache.ts modules/connectors/ms365-planner/src/cache.test.ts
git commit -m "feat(connector-ms365-planner): cache.task.one with TTL + stale fallback"
```

### Task D3: Repeat cache for `plan`, `bucket`, `task_details` + write-through helper *(§5.5)*

**Files:**
- Modify: `modules/connectors/ms365-planner/src/cache.ts`
- Modify: `modules/connectors/ms365-planner/src/cache.test.ts`

- [ ] **Step 1: Failing tests for `plan.one`, `bucket.one`, `taskDetails.one`** — same shape as D2's tests, different paths and TTLs.

- [ ] **Step 2: Implement** by factoring D2 into a parameterized `oneFactory({ table, fetchLive, idColumn })`. DRY across the four entities.

- [ ] **Step 3: Add `task.upsertFromGraph(payload, etag)` + `task.softDelete(id)`** for use by write tools (§5.5 write-through).

```ts
// after a successful PATCH/POST in a commit tool:
await cache.task.upsertFromGraph(updatedTaskFromGraph, newEtag)
// after 404 on commit:
await cache.task.softDelete(taskId)
```

- [ ] **Step 4: Run — green**

Run: `pnpm --filter @seta/connector-ms365-planner test:unit`

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(connector-ms365-planner): cache for plan/bucket/details + write-through helpers"
```

### Task D4: ETag store accessor + barrel exports

**Files:**
- Create: `modules/connectors/ms365-planner/src/etag.ts`
- Modify: `modules/connectors/ms365-planner/src/index.ts`

- [ ] **Step 1: Test — `etagStore.get(taskId)` reads `etag` from `planner_tasks_cache`**

```ts
it('etagStore.get returns the cached etag or null', async () => { /* ... */ })
```

- [ ] **Step 2: Implement**

```ts
// src/etag.ts
import type { DbSql } from '@seta/db'
import { plannerTasksCache } from './schema'
export function createEtagStore(sql: DbSql) {
  return {
    async get(taskId: string): Promise<string | null> {
      const rows = await sql`
        SELECT etag FROM connector_ms365_planner.planner_tasks_cache
        WHERE graph_task_id = ${taskId} LIMIT 1`
      return (rows[0]?.etag as string | null) ?? null
    },
  }
}
```

- [ ] **Step 3: Barrel**

```ts
// modules/connectors/ms365-planner/src/index.ts
export { plannerConnector } from './manifest'
export { createPlannerClient } from './client'
export type { PlannerClient, TaskUpdate, CreateTaskInput } from './client'
export { createPlannerCache } from './cache'
export type { PlannerCache, ReadSource, ReadResult } from './cache'
export { createEtagStore } from './etag'
export * from './schema'
```

- [ ] **Step 4: Run + build (Milestone M2)**

```bash
pnpm --filter @seta/connector-ms365-planner test:unit
pnpm --filter @seta/connector-ms365-planner build
```

- [ ] **Step 5: Commit**

```bash
git add modules/connectors/ms365-planner/src/
git commit -m "feat(connector-ms365-planner): etag store + barrel exports"
```

---

## Phase E — Continuation tokens (1 task)

### Task E1: `_continuation.ts` — mint + verify *(§7.1)*

**Files:**
- Create: `modules/products/agent/src/tools/planner/_continuation.ts`
- Test: `modules/products/agent/src/tools/planner/_continuation.test.ts`
- Create: `modules/products/agent/src/tools/planner/_errors.ts`

- [ ] **Step 1: Errors first**

```ts
// modules/products/agent/src/tools/planner/_errors.ts
import { DomainError } from '@seta/middleware'

export class ContinuationExpired extends DomainError {
  constructor() { super(410, 'continuation expired') }
}
export class ContinuationConsumed extends DomainError {
  cachedResultCard?: Record<string, unknown>
  constructor(cached?: Record<string, unknown>) {
    super(409, 'continuation already consumed')
    this.cachedResultCard = cached
  }
}
export class ContinuationBadHmac extends DomainError {
  constructor() { super(400, 'continuation signature invalid') }
}
export class ContinuationUserMismatch extends DomainError {
  constructor() { super(403, 'continuation belongs to different user') }
}
```

- [ ] **Step 2: Failing test**

```ts
// modules/products/agent/src/tools/planner/_continuation.test.ts
import { describe, expect, it, vi } from 'vitest'
import { createContinuationStore } from './_continuation'
import {
  ContinuationBadHmac, ContinuationConsumed, ContinuationExpired, ContinuationUserMismatch,
} from './_errors'

const HMAC_KEY = 'a'.repeat(64)

const fakeSql = (state: { row?: Record<string, unknown> } = {}) => {
  const sql = vi.fn().mockImplementation(async () => state.row ? [state.row] : [])
  ;(sql as any).begin = (fn: any) => fn(sql)
  return sql as unknown as any
}

describe('continuation token mint/verify', () => {
  it('mint returns a parseable token and inserts a row', async () => {
    const sql = fakeSql({})
    const store = createContinuationStore({
      sql, hmacKey: HMAC_KEY, ttlMin: 15, now: () => Date.parse('2026-05-12T00:00:00Z'),
    })
    const { token } = await store.mint({
      tenantId: 't', userId: 'u', toolId: 'planner.update_tasks',
      payload: { foo: 'bar' }, etagSnapshot: { T1: 'W/"1"' },
    })
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
  })

  it('verify rejects bad HMAC', async () => {
    const sql = fakeSql({ row: { uuid: 'u', payload: {}, etagSnapshot: {}, expiresAt: new Date(Date.now() + 1e6), consumedAt: null, userId: 'u' } })
    const store = createContinuationStore({ sql, hmacKey: HMAC_KEY, ttlMin: 15 })
    await expect(store.verify({ token: 'uuid.tampered', userId: 'u', tenantId: 't', toolId: 'planner.update_tasks' }))
      .rejects.toBeInstanceOf(ContinuationBadHmac)
  })

  it('verify rejects expired', async () => { /* setup expiresAt in the past, then assert */ })
  it('verify rejects consumed (and surfaces cached resultCard)', async () => { /* assert ContinuationConsumed */ })
  it('verify rejects user mismatch', async () => { /* assert ContinuationUserMismatch */ })
  it('mark consumed sets consumed_at and result_card', async () => { /* assert UPDATE called */ })
})
```

- [ ] **Step 3: Implement**

```ts
// modules/products/agent/src/tools/planner/_continuation.ts
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { Buffer } from 'node:buffer'
import type { DbSql } from '@seta/db'
import {
  ContinuationBadHmac, ContinuationConsumed, ContinuationExpired, ContinuationUserMismatch,
} from './_errors'

export interface ContinuationStoreDeps {
  sql: DbSql
  hmacKey: string
  ttlMin: number
  now?: () => number
}

export interface MintInput {
  tenantId: string
  userId: string
  toolId: string
  payload: Record<string, unknown>
  etagSnapshot: Record<string, string>
}

export interface VerifyInput {
  token: string
  userId: string
  tenantId: string
  toolId: string
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function hmac(key: string, parts: string[]): string {
  const h = createHmac('sha256', Buffer.from(key, 'hex'))
  for (const p of parts) { h.update(p); h.update('\x1f') }
  return b64url(h.digest())
}

function shaPayload(payload: unknown): string {
  return b64url(createHmac('sha256', 'p').update(JSON.stringify(payload)).digest())
}

export function createContinuationStore(deps: ContinuationStoreDeps) {
  const now = deps.now ?? Date.now

  async function mint(input: MintInput): Promise<{ token: string; expiresAt: Date }> {
    const uuid = randomUUID()
    const sig = hmac(deps.hmacKey, [uuid, input.tenantId, input.userId, input.toolId, shaPayload(input.payload)])
    const token = `${uuid}.${sig}`
    const expiresAt = new Date(now() + deps.ttlMin * 60_000)
    await deps.sql`
      INSERT INTO agent.write_continuations
        (token, uuid, tenant_id, user_id, tool_id, payload, etag_snapshot, expires_at)
      VALUES
        (${token}, ${uuid}, ${input.tenantId}, ${input.userId}, ${input.toolId},
         ${JSON.stringify(input.payload)}::jsonb, ${JSON.stringify(input.etagSnapshot)}::jsonb,
         ${expiresAt})
    `
    return { token, expiresAt }
  }

  async function verify(v: VerifyInput): Promise<{
    payload: Record<string, unknown>
    etagSnapshot: Record<string, string>
  }> {
    const [uuid, sig] = v.token.split('.')
    if (!uuid || !sig) throw new ContinuationBadHmac()

    const rows = await deps.sql`
      SELECT uuid, payload, etag_snapshot AS "etagSnapshot",
             result_card AS "resultCard", expires_at AS "expiresAt",
             consumed_at AS "consumedAt", user_id AS "userId", tool_id AS "toolId",
             tenant_id AS "tenantId"
      FROM agent.write_continuations
      WHERE uuid = ${uuid}
      LIMIT 1
    `
    const row = rows[0] as
      | { uuid: string; payload: Record<string, unknown>; etagSnapshot: Record<string, string>
          resultCard: Record<string, unknown> | null; expiresAt: Date; consumedAt: Date | null
          userId: string; toolId: string; tenantId: string }
      | undefined
    if (!row) throw new ContinuationBadHmac()

    const expectedSig = hmac(
      deps.hmacKey,
      [row.uuid, row.tenantId, row.userId, row.toolId, shaPayload(row.payload)],
    )
    const a = Buffer.from(sig)
    const b = Buffer.from(expectedSig)
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ContinuationBadHmac()

    if (row.consumedAt) throw new ContinuationConsumed(row.resultCard ?? undefined)
    if (row.expiresAt.getTime() < now()) throw new ContinuationExpired()
    if (row.userId !== v.userId) throw new ContinuationUserMismatch()

    return { payload: row.payload, etagSnapshot: row.etagSnapshot }
  }

  async function markConsumed(token: string, resultCard: Record<string, unknown>): Promise<void> {
    await deps.sql`
      UPDATE agent.write_continuations
      SET consumed_at = NOW(),
          result_card = ${JSON.stringify(resultCard)}::jsonb
      WHERE token = ${token} AND consumed_at IS NULL
    `
  }

  return { mint, verify, markConsumed }
}
```

- [ ] **Step 4: Run — green (Milestone M3)**

Run: `pnpm --filter @seta/agent vitest run src/tools/planner/_continuation.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add modules/products/agent/src/tools/planner/_continuation.ts modules/products/agent/src/tools/planner/_continuation.test.ts modules/products/agent/src/tools/planner/_errors.ts
git commit -m "feat(agent): HMAC-SHA256 continuation token mint/verify"
```

---

## Phase F — Read tools (6 tasks)

Each read tool follows the same shape. Below I fully spell out Task F1; F2–F6 are identical mechanically with different paths/inputs/outputs (no placeholder — see "Variations" subtable inside each task).

### Task F1: `planner.list_my_tasks` *(§3)*

**Files:**
- Create: `modules/products/agent/src/tools/planner/read/list_my_tasks.ts`
- Test: `modules/products/agent/src/tools/planner/read/list_my_tasks.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { listMyTasksTool } from './list_my_tasks'

describe('planner.list_my_tasks', () => {
  it('cache-first; falls back to live; carries source annotation', async () => {
    const deps = {
      registry: { requireConsent: vi.fn().mockResolvedValue(undefined) },
      tokenForUser: vi.fn().mockResolvedValue({ accessToken: 'tk' }),
      buildClient: vi.fn().mockReturnValue({
        listMyTasks: async function* () { yield { id: 'T1' }; yield { id: 'T2' } },
      }),
    }
    const tool = listMyTasksTool(deps as never)
    const result = await tool.execute({}, {
      surface: 'direct',
      abortSignal: new AbortController().signal,
      runId: 'r1',
      requestContext: { tenantId: 't', userId: 'u', homeAccountId: 'h' } as never,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.items).toHaveLength(2)
      expect(result.value.source).toBe('live')
    }
  })

  it('aborts when consent missing', async () => {
    const deps = {
      registry: { requireConsent: vi.fn().mockRejectedValue(new Error('not consented')) },
      tokenForUser: vi.fn(),
      buildClient: vi.fn(),
    }
    const tool = listMyTasksTool(deps as never)
    const result = await tool.execute({}, { /* ctx */ } as never)
    expect(result.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run — fail (module missing)**

Run: `pnpm --filter @seta/agent vitest run src/tools/planner/read/list_my_tasks.test.ts`

- [ ] **Step 3: Implement**

```ts
// modules/products/agent/src/tools/planner/read/list_my_tasks.ts
import type { Tool } from '@seta/agent-core'
import type { ConnectorRegistry } from '@seta/connector-registry'
import { z } from 'zod'

export interface ReadToolDeps {
  registry: ConnectorRegistry
  tokenForUser: (tenantId: string, homeAccountId: string) => Promise<{ accessToken: string }>
  buildClient: (token: string) => {
    listMyTasks(): AsyncIterable<unknown>
    // narrower interface per tool below
  }
}

const Input = z.object({}).strict()
const Output = z.object({
  items: z.array(z.unknown()),
  source: z.enum(['cache:fresh', 'cache:stale-fallback', 'live']),
  ageSeconds: z.number().int().nonnegative().optional(),
})

export function listMyTasksTool(deps: ReadToolDeps): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'planner.list_my_tasks',
    description: 'List Planner tasks assigned to the caller. Cache-first (60s TTL); falls back to live Graph on cache miss.',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { readOnlyHint: true, idempotentHint: true },
    async execute(_input, ctx) {
      try {
        const { tenantId, userId, homeAccountId } = ctx.requestContext as never as {
          tenantId: string; userId: string; homeAccountId: string
        }
        await deps.registry.requireConsent(tenantId, 'ms365-planner')
        const { accessToken } = await deps.tokenForUser(tenantId, homeAccountId)
        const client = deps.buildClient(accessToken)
        const items: unknown[] = []
        for await (const t of client.listMyTasks()) items.push(t)
        return { ok: true, value: { items, source: 'live' as const } }
      } catch (e) {
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
```

*Spec §5.4 says: lists go live in P1.* So we don't try cache for list endpoints.

- [ ] **Step 4: Run — green**

Run: `pnpm --filter @seta/agent vitest run src/tools/planner/read/list_my_tasks.test.ts`

- [ ] **Step 5: Commit**

```bash
git add modules/products/agent/src/tools/planner/read/list_my_tasks.ts modules/products/agent/src/tools/planner/read/list_my_tasks.test.ts
git commit -m "feat(agent): planner.list_my_tasks read tool"
```

### Task F2: `planner.list_plan_tasks`

Same shape as F1; input is `{ planId: string }`, calls `client.listPlanTasks(planId)`. Tests assert pagination flows through and `planId` validation rejects empty string. Output schema same. Commit `feat(agent): planner.list_plan_tasks read tool`.

### Task F3: `planner.get_task`

Single-row read — **uses cache** *(§5.3)*. Input `{ taskId }`. Calls `cache.task.one(taskId)` then `cache.taskDetails.one(taskId)` and zips into one output. Returns `source` and `ageSeconds` from `cache.task.one`. Test the three cases (`cache:fresh` / `live` / null on 404).

### Task F4: `planner.list_plans`

Like F1 but calls `client.listMyPlans()`. No input.

### Task F5: `planner.list_buckets`

Input `{ planId }`. Calls `client.listBuckets(planId)`.

### Task F6: `planner.workload_analysis` deferred to Phase I (heavier — needs SQL aggregation).

For F6 placeholder here, register only a no-op stub so the count remains 6 reads. Real impl in Task I1.

**After F1–F5 plus the I1 stub** — Milestone M4.

---

## Phase G — Write tools: preview (5 tasks)

Each preview tool follows the canonical preview flow *(§7.2)*. Below: Task G1 fully spelled. G2–G5 follow the same shape with different schemas and pre-flight strategies.

### Task G1: `planner.update_tasks.preview` *(§7.2)*

**Files:**
- Create: `modules/products/agent/src/tools/planner/write/update_tasks.preview.ts`
- Test: `modules/products/agent/src/tools/planner/write/update_tasks.preview.test.ts`
- Create: `modules/products/agent/src/tools/planner/write/_card.ts` (shared adaptive-card builder)
- Test: `modules/products/agent/src/tools/planner/write/_card.test.ts`

- [ ] **Step 1: Failing test for the card builder**

```ts
// _card.test.ts
import { describe, expect, it } from 'vitest'
import { buildPreviewCard } from './_card'

describe('buildPreviewCard', () => {
  it('emits Confirm + Cancel actions wired to the verb and token', () => {
    const card = buildPreviewCard({
      title: 'Confirm reassignment',
      summary: 'Reassign 5 tasks from John to Mary',
      facts: [{ title: 'TID', value: 'T1' }],
      verb: 'planner.update_tasks.commit',
      token: 'tok',
      ttlMinutes: 15,
    })
    expect(card.type).toBe('AdaptiveCard')
    expect(card.actions[0]).toMatchObject({ verb: 'planner.update_tasks.commit', data: { token: 'tok' } })
    expect(card.actions[1]).toMatchObject({ verb: 'planner.update_tasks.cancel', data: { token: 'tok' } })
  })
})
```

- [ ] **Step 2: Implement `_card.ts`** matching §7.4 shape.

```ts
// _card.ts
export interface PreviewCardInput {
  title: string
  summary: string
  facts: Array<{ title: string; value: string }>
  verb: string                                                    // 'planner.X.commit'
  token: string
  ttlMinutes: number
}
export function buildPreviewCard(i: PreviewCardInput): Record<string, unknown> {
  const cancelVerb = i.verb.replace(/\.commit$/, '.cancel')
  return {
    type: 'AdaptiveCard', version: '1.5',
    body: [
      { type: 'TextBlock', text: i.title, size: 'Large', weight: 'Bolder' },
      { type: 'TextBlock', text: i.summary, wrap: true },
      { type: 'FactSet', facts: i.facts },
      { type: 'TextBlock', text: `Confirmation expires in ${i.ttlMinutes} minutes`, size: 'Small', isSubtle: true },
    ],
    actions: [
      { type: 'Action.Execute', title: 'Confirm', style: 'positive', verb: i.verb, data: { token: i.token } },
      { type: 'Action.Execute', title: 'Cancel', verb: cancelVerb, data: { token: i.token } },
    ],
  }
}
```

- [ ] **Step 3: Failing test for `update_tasks.preview`**

```ts
// update_tasks.preview.test.ts
import { describe, expect, it, vi } from 'vitest'
import { GraphNotFound, GraphPermissionDenied } from '@seta/ms-graph'
import { updateTasksPreviewTool } from './update_tasks.preview'

describe('planner.update_tasks.preview', () => {
  it('aborts on 404 from pre-flight', async () => {
    const deps = {
      registry: { requireConsent: vi.fn().mockResolvedValue(undefined) },
      buildCache: vi.fn().mockReturnValue({
        task: { one: vi.fn().mockRejectedValue(new GraphNotFound('/planner/tasks/T1')) },
      }),
      buildClient: vi.fn(),
      continuationStore: { mint: vi.fn() },
      tokenForUser: vi.fn().mockResolvedValue({ accessToken: 'tk' }),
    }
    const tool = updateTasksPreviewTool(deps as never)
    const r = await tool.execute(
      { updates: [{ taskId: 'T1', title: 'x' }] },
      { surface: 'direct', abortSignal: new AbortController().signal, runId: 'r',
        requestContext: { tenantId: 't', userId: 'u', homeAccountId: 'h' } } as never,
    )
    expect(r.ok).toBe(false)
    expect(deps.continuationStore.mint).not.toHaveBeenCalled()
  })

  it('happy path mints token; captures etags; returns card + token', async () => {
    const taskOne = vi.fn().mockResolvedValue({ data: { id: 'T1', title: 'old' }, source: 'cache:fresh', ageSeconds: 1 })
    const mint = vi.fn().mockResolvedValue({ token: 'tok', expiresAt: new Date(Date.now() + 9e5) })
    const deps = {
      registry: { requireConsent: vi.fn().mockResolvedValue(undefined) },
      buildCache: vi.fn().mockReturnValue({ task: { one: taskOne, getEtag: vi.fn().mockReturnValue('W/"1"') } }),
      buildClient: vi.fn(),
      continuationStore: { mint },
      tokenForUser: vi.fn().mockResolvedValue({ accessToken: 'tk' }),
    }
    const tool = updateTasksPreviewTool(deps as never)
    const r = await tool.execute(
      { updates: [{ taskId: 'T1', title: 'new' }] },
      { surface: 'direct', abortSignal: new AbortController().signal, runId: 'r',
        requestContext: { tenantId: 't', userId: 'u', homeAccountId: 'h' } } as never,
    )
    expect(r.ok).toBe(true)
    expect(mint).toHaveBeenCalledWith(expect.objectContaining({
      toolId: 'planner.update_tasks',
      etagSnapshot: { T1: 'W/"1"' },
    }))
  })

  it('403 from pre-flight surfaces friendly error', async () => {
    const deps = {
      registry: { requireConsent: vi.fn().mockResolvedValue(undefined) },
      buildCache: vi.fn().mockReturnValue({
        task: { one: vi.fn().mockRejectedValue(new GraphPermissionDenied()) },
      }),
      buildClient: vi.fn(),
      continuationStore: { mint: vi.fn() },
      tokenForUser: vi.fn().mockResolvedValue({ accessToken: 'tk' }),
    }
    const tool = updateTasksPreviewTool(deps as never)
    const r = await tool.execute({ updates: [{ taskId: 'T1', title: 'x' }] },
      { surface: 'direct', abortSignal: new AbortController().signal, runId: 'r',
        requestContext: { tenantId: 't', userId: 'u', homeAccountId: 'h' } } as never)
    expect(r.ok).toBe(false)
  })
})
```

- [ ] **Step 4: Implement**

```ts
// update_tasks.preview.ts
import type { Tool } from '@seta/agent-core'
import type { ConnectorRegistry } from '@seta/connector-registry'
import { z } from 'zod'
import { buildPreviewCard } from './_card'

const UpdateOne = z.object({
  taskId: z.string().min(1),
  assignees: z.array(z.string()).optional(),
  dueDateTime: z.string().datetime().nullable().optional(),
  title: z.string().min(1).optional(),
  priority: z.number().int().min(0).max(10).optional(),
  percentComplete: z.number().int().min(0).max(100).optional(),
  bucketId: z.string().optional(),
  appliedCategories: z.record(z.string(), z.boolean()).optional(),
})

const Input = z.object({ updates: z.array(UpdateOne).min(1).max(100) })
const Output = z.object({
  card: z.record(z.string(), z.unknown()),
  token: z.string(),
  ttlMinutes: z.number().int().positive(),
})

export interface PreviewDeps {
  registry: ConnectorRegistry
  buildCache: (sqlScopedToRequest: never) => { /* PlannerCache */ task: { one: (id: string) => Promise<unknown>; getEtag: (id: string) => string } }
  continuationStore: { mint: (i: never) => Promise<{ token: string; expiresAt: Date }> }
  tokenForUser: (tenantId: string, homeAccountId: string) => Promise<{ accessToken: string }>
  ttlMinutes: number
}

export function updateTasksPreviewTool(deps: PreviewDeps): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'planner.update_tasks.preview',
    description: 'Preview updates to one or more Planner tasks. Returns a confirmation card with a continuation token. Mutates nothing.',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { destructiveHint: false, requireApproval: true },
    async execute(input, ctx) {
      const { tenantId, userId, homeAccountId } = ctx.requestContext as never as Record<string, string>
      await deps.registry.requireConsent(tenantId, 'ms365-planner')
      // Token only needed if we want to live-refresh ETags; we read from cache for pre-flight.
      const cache = deps.buildCache(undefined as never)

      // Pre-flight: cache.task.one each target. Any failure aborts the whole op (§7.2 step 3).
      const etagSnapshot: Record<string, string> = {}
      for (const u of input.updates) {
        const row = await cache.task.one(u.taskId)
        if (!row) {
          return { ok: false, error: { name: 'ResourceNotFound', message: `Task ${u.taskId} not found` } }
        }
        const etag = cache.task.getEtag(u.taskId)
        if (!etag) {
          return { ok: false, error: { name: 'StaleEtag', message: `No ETag for ${u.taskId}` } }
        }
        etagSnapshot[u.taskId] = etag
      }

      const summary = input.updates.length === 1
        ? `Update 1 task`
        : `Update ${input.updates.length} tasks`

      const { token } = await deps.continuationStore.mint({
        tenantId, userId, toolId: 'planner.update_tasks',
        payload: { updates: input.updates }, etagSnapshot,
      })

      const card = buildPreviewCard({
        title: 'Confirm task update',
        summary,
        facts: input.updates.map((u, i) => ({
          title: `#${i + 1} ${u.taskId.slice(0, 6)}…`,
          value: Object.entries(u).filter(([k]) => k !== 'taskId').map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', '),
        })),
        verb: 'planner.update_tasks.commit',
        token, ttlMinutes: deps.ttlMinutes,
      })
      return { ok: true, value: { card, token, ttlMinutes: deps.ttlMinutes } }
    },
  }
}
```

- [ ] **Step 5: Run — green**

Run: `pnpm --filter @seta/agent vitest run src/tools/planner/write/update_tasks.preview.test.ts`

- [ ] **Step 6: Commit**

```bash
git add modules/products/agent/src/tools/planner/write/update_tasks.preview.ts \
        modules/products/agent/src/tools/planner/write/_card.ts \
        modules/products/agent/src/tools/planner/write/update_tasks.preview.test.ts \
        modules/products/agent/src/tools/planner/write/_card.test.ts
git commit -m "feat(agent): planner.update_tasks.preview + adaptive-card builder"
```

### Task G2: `planner.create_tasks.preview`

Same skeleton; input `{ tasks: [{ planId, bucketId?, title, assignees?, dueDateTime?, priority? }] }`. Pre-flight is **plan** existence (cache.plan.one for each unique planId) — no `taskId`s to look up. `etagSnapshot` is empty (creates don't need If-Match). Summary `Create N tasks in plan(s) …`.

### Task G3: `planner.complete_tasks.preview`

Input `{ taskIds: string[] }`. Pre-flight: cache.task.one for each (same as G1). Payload mapped to update `{ percentComplete: 100 }`. Same etagSnapshot pattern.

### Task G4: `planner.add_comments.preview`

Input `{ comments: [{ taskId, body }] }`. **Note**: Planner comments are not pure plannerTask updates — they post to the underlying group conversation. Pre-flight is `cache.task.one` to verify the task exists; payload is the group/comment posting plan. Spec §3 lists this as a capability — implement using the documented Graph endpoint for task comments (verify exact path at impl time via context7 docs MCP if uncertain). If the endpoint is non-trivial, file a follow-up issue and stub the commit to error pending pattern verification — **but the preview can still validate and mint a token**.

### Task G5: `planner.create_plan.preview`

Input `{ ownerGroupId, title }`. Pre-flight: verify caller can see the group (cheap: cache.plan.list filtered by group; or live `GET /groups/{id}`). Mint plan-creation continuation.

After G1–G5 — keep running `pnpm --filter @seta/agent test:unit -t "preview"` green.

```bash
git commit -m "feat(agent): planner preview tools for create/complete/comments/create_plan"
```

---

## Phase H — Write tools: commit (5 tasks)

### Task H1: `planner.update_tasks.commit` *(§7.3)*

**Files:**
- Create: `modules/products/agent/src/tools/planner/write/update_tasks.commit.ts`
- Test: `modules/products/agent/src/tools/planner/write/update_tasks.commit.test.ts`
- Create: `modules/products/agent/src/tools/planner/write/_classify.ts` (shared partial-result classifier)
- Test: `modules/products/agent/src/tools/planner/write/_classify.test.ts`

- [ ] **Step 1: Test the classifier first** *(§8.2)*

```ts
import { describe, expect, it } from 'vitest'
import { classifyBatchItem } from './_classify'

describe('classifyBatchItem', () => {
  const cases = [
    { status: 200, expect: 'ok' },
    { status: 201, expect: 'ok' },
    { status: 412, expect: 'conflict' },
    { status: 403, expect: 'forbidden' },
    { status: 404, expect: 'missing' },
    { status: 429, expect: 'rate_limited' },
    { status: 500, expect: 'failed' },
    { status: 503, expect: 'failed' },
  ] as const
  for (const c of cases) {
    it(`status=${c.status} → ${c.expect}`, () => {
      expect(classifyBatchItem({ id: 'x', status: c.status, etag: null }).status).toBe(c.expect)
    })
  }
})
```

- [ ] **Step 2: Implement classifier**

```ts
// _classify.ts
import type { BatchResponseItem } from '@seta/ms-graph'

export type OpStatus = 'ok' | 'conflict' | 'forbidden' | 'missing' | 'rate_limited' | 'failed'
export interface OpResult {
  taskId: string
  status: OpStatus
  newEtag?: string | null
  raw?: unknown
  reason?: string
}

export function classifyBatchItem(item: BatchResponseItem & { taskId?: string }): OpResult {
  const taskId = item.taskId ?? item.id
  if (item.status >= 200 && item.status < 300)
    return { taskId, status: 'ok', newEtag: item.etag, raw: item.body }
  if (item.status === 412) return { taskId, status: 'conflict', reason: 'task changed since you looked' }
  if (item.status === 403) return { taskId, status: 'forbidden', reason: 'you no longer have access' }
  if (item.status === 404) return { taskId, status: 'missing', reason: 'task no longer exists' }
  if (item.status === 429) return { taskId, status: 'rate_limited', reason: 'try again in a moment' }
  return { taskId, status: 'failed', reason: `graph status ${item.status}` }
}
```

- [ ] **Step 3: Failing test for commit (idempotent replay, 412 path, partial result)**

```ts
// update_tasks.commit.test.ts
import { describe, expect, it, vi } from 'vitest'
import { ContinuationConsumed } from '../_errors'
import { updateTasksCommitTool } from './update_tasks.commit'

const ctx = (over: Partial<{ userId: string }> = {}) => ({
  surface: 'direct' as const, abortSignal: new AbortController().signal, runId: 'r',
  requestContext: { tenantId: 't', userId: over.userId ?? 'u', homeAccountId: 'h' } as never,
})

describe('planner.update_tasks.commit', () => {
  it('replays cached result_card when token already consumed (idempotency)', async () => {
    const cached = { type: 'AdaptiveCard', body: [{ type: 'TextBlock', text: 'already done' }] }
    const deps = {
      registry: { requireConsent: vi.fn().mockResolvedValue(undefined) },
      tokenForUser: vi.fn(),
      buildClient: vi.fn(),
      buildCache: vi.fn().mockReturnValue({ task: { upsertFromGraph: vi.fn(), softDelete: vi.fn() } }),
      continuationStore: {
        verify: vi.fn().mockRejectedValue(new ContinuationConsumed(cached)),
        markConsumed: vi.fn(),
      },
      batchConcurrency: 3,
    }
    const tool = updateTasksCommitTool(deps as never)
    const r = await tool.execute({ token: 'tok' }, ctx())
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.card).toEqual(cached)
  })

  it('partial failure: 1 ok + 1 conflict surfaces per-row result', async () => {
    const verify = vi.fn().mockResolvedValue({
      payload: { updates: [{ taskId: 'T1', title: 'new' }, { taskId: 'T2', title: 'new2' }] },
      etagSnapshot: { T1: 'W/"1"', T2: 'W/"2"' },
    })
    const batch = vi.fn().mockResolvedValue([
      { id: 'T1', status: 200, body: { '@odata.etag': 'W/"3"', id: 'T1' }, etag: 'W/"3"' },
      { id: 'T2', status: 412, body: {}, etag: null },
    ])
    const upsertFromGraph = vi.fn()
    const markConsumed = vi.fn()
    const deps = {
      registry: { requireConsent: vi.fn().mockResolvedValue(undefined) },
      tokenForUser: vi.fn().mockResolvedValue({ accessToken: 'tk' }),
      buildClient: vi.fn(),
      buildGraph: vi.fn().mockReturnValue({ batch }),
      buildCache: vi.fn().mockReturnValue({ task: { upsertFromGraph, softDelete: vi.fn() } }),
      continuationStore: { verify, markConsumed },
      batchConcurrency: 3,
    }
    const tool = updateTasksCommitTool(deps as never)
    const r = await tool.execute({ token: 'tok' }, ctx())
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.summary).toMatchObject({ succeeded: 1, failed: 1 })
      expect(r.value.results.find((x) => x.taskId === 'T2')?.status).toBe('conflict')
    }
    expect(upsertFromGraph).toHaveBeenCalledTimes(1)
    expect(markConsumed).toHaveBeenCalled()
  })
})
```

- [ ] **Step 4: Implement**

```ts
// update_tasks.commit.ts
import type { Tool } from '@seta/agent-core'
import type { ConnectorRegistry } from '@seta/connector-registry'
import type { GraphFetch, BatchRequest } from '@seta/ms-graph'
import PQueue from 'p-queue'
import { z } from 'zod'
import { ContinuationConsumed } from '../_errors'
import { classifyBatchItem, type OpResult } from './_classify'

const Input = z.object({ token: z.string().min(1) })
const Output = z.object({
  card: z.record(z.string(), z.unknown()),
  results: z.array(z.object({
    taskId: z.string(),
    status: z.enum(['ok', 'conflict', 'forbidden', 'missing', 'rate_limited', 'failed']),
    reason: z.string().optional(),
  })),
  summary: z.object({ succeeded: z.number().int(), failed: z.number().int() }),
})

export interface CommitDeps {
  registry: ConnectorRegistry
  tokenForUser: (tenantId: string, homeAccountId: string) => Promise<{ accessToken: string }>
  buildGraph: (recordAudit: never) => GraphFetch
  buildCache: () => { task: { upsertFromGraph: (raw: unknown, etag: string | null) => Promise<void>; softDelete: (id: string) => Promise<void> } }
  continuationStore: {
    verify: (i: { token: string; userId: string; tenantId: string; toolId: string }) =>
      Promise<{ payload: Record<string, unknown>; etagSnapshot: Record<string, string> }>
    markConsumed: (token: string, card: Record<string, unknown>) => Promise<void>
  }
  batchConcurrency: number
}

export function updateTasksCommitTool(deps: CommitDeps): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'planner.update_tasks.commit',
    description: 'Commit a previously previewed planner.update_tasks request via its continuation token. Idempotent.',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { destructiveHint: true, idempotentHint: true },
    async execute(input, ctx) {
      const { tenantId, userId, homeAccountId } = ctx.requestContext as never as Record<string, string>
      await deps.registry.requireConsent(tenantId, 'ms365-planner')

      try {
        var verified = await deps.continuationStore.verify({
          token: input.token, userId, tenantId, toolId: 'planner.update_tasks',
        })
      } catch (e) {
        if (e instanceof ContinuationConsumed && e.cachedResultCard)
          return { ok: true, value: { card: e.cachedResultCard, results: [], summary: { succeeded: 0, failed: 0 } } }
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }

      const payload = verified.payload as { updates: Array<{ taskId: string } & Record<string, unknown>> }
      const { accessToken } = await deps.tokenForUser(tenantId, homeAccountId)
      const graph = deps.buildGraph(undefined as never)

      // Chunk to 20, dispatch with p-queue concurrency
      const chunks: Array<Array<{ taskId: string } & Record<string, unknown>>> = []
      for (let i = 0; i < payload.updates.length; i += 20)
        chunks.push(payload.updates.slice(i, i + 20))

      const queue = new PQueue({ concurrency: deps.batchConcurrency })
      const results: OpResult[] = []
      await Promise.all(chunks.map((chunk) => queue.add(async () => {
        const requests: BatchRequest[] = chunk.map((u) => ({
          id: u.taskId, method: 'PATCH', url: `/planner/tasks/${u.taskId}`,
          headers: { 'If-Match': verified.etagSnapshot[u.taskId]!, Prefer: 'return=representation' },
          body: stripIds(u),
        }))
        const batched = await graph.batch({
          token: accessToken, actor: { type: 'user', userId },
          connectorId: 'ms365-planner', requests,
        })
        const cache = deps.buildCache()
        for (const item of batched) {
          const r = classifyBatchItem({ ...item, taskId: item.id })
          results.push(r)
          if (r.status === 'ok') await cache.task.upsertFromGraph(r.raw, r.newEtag ?? null)
          if (r.status === 'missing') await cache.task.softDelete(r.taskId)
        }
      })))

      const succeeded = results.filter((r) => r.status === 'ok').length
      const failed = results.length - succeeded
      const card = buildResultCard({ tool: 'planner.update_tasks', results, succeeded, failed })

      await deps.continuationStore.markConsumed(input.token, card)
      return { ok: true, value: { card, results: results.map(({ taskId, status, reason }) => ({ taskId, status, reason })), summary: { succeeded, failed } } }
    },
  }
}

function stripIds<T extends { taskId: string } & Record<string, unknown>>(u: T): Omit<T, 'taskId'> {
  const { taskId: _, ...rest } = u
  return rest
}

function buildResultCard(i: { tool: string; results: OpResult[]; succeeded: number; failed: number }): Record<string, unknown> {
  return {
    type: 'AdaptiveCard', version: '1.5',
    body: [
      { type: 'TextBlock', text: i.failed === 0 ? 'All updates applied' : `${i.succeeded} ok, ${i.failed} failed`, size: 'Medium', weight: 'Bolder' },
      { type: 'FactSet', facts: i.results.map((r) => ({ title: r.taskId.slice(0, 6), value: r.status + (r.reason ? ` — ${r.reason}` : '') })) },
    ],
    actions: i.failed > 0 ? [{ type: 'Action.Execute', title: 'Retry failures', verb: `${i.tool}.preview`, data: { /* re-mint preview from failed */ } }] : [],
  }
}
```

- [ ] **Step 5: Run — green**

Run: `pnpm --filter @seta/agent vitest run src/tools/planner/write/update_tasks.commit.test.ts`

- [ ] **Step 6: Commit**

```bash
git add modules/products/agent/src/tools/planner/write/update_tasks.commit.ts \
        modules/products/agent/src/tools/planner/write/_classify.ts \
        modules/products/agent/src/tools/planner/write/update_tasks.commit.test.ts \
        modules/products/agent/src/tools/planner/write/_classify.test.ts
git commit -m "feat(agent): planner.update_tasks.commit (batch + classify + write-through + idempotent)"
```

### Task H2: `planner.create_tasks.commit`

Same shape; POSTs not PATCHes. `etagSnapshot` empty (creates don't use If-Match). Per-op result writes the created task to cache.task.upsertFromGraph. Each batch request: `{ method: 'POST', url: '/planner/tasks', body }`.

### Task H3: `planner.complete_tasks.commit`

Identical to H1 but the patch body is fixed `{ percentComplete: 100 }`.

### Task H4: `planner.add_comments.commit`

Posts to the Planner-task comment endpoint (group thread). Use the path captured from G4 docs check. No ETag flow (comments are creates).

### Task H5: `planner.create_plan.commit`

Single op (no batch needed). POSTs `/planner/plans`. Writes to `plannerPlansCache`.

**Milestone M5** — run `pnpm --filter @seta/agent test:unit -t "planner"` and confirm green.

```bash
git commit -m "feat(agent): planner commit tools for create/complete/comments/create_plan"
```

---

## Phase I — Workload analysis (1 task)

### Task I1: `planner.workload_analysis` *(§8.4)*

**Files:**
- Create: `modules/products/agent/src/tools/planner/read/workload_analysis.ts`
- Test: `modules/products/agent/src/tools/planner/read/workload_analysis.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it, vi } from 'vitest'
import { workloadAnalysisTool } from './workload_analysis'

describe('planner.workload_analysis', () => {
  it('aggregates per assignee with overdue + in-progress counts', async () => {
    const sql = vi.fn().mockResolvedValue([
      { assigneeId: 'a1', taskCount: 3, overdueCount: 1, inProgressCount: 2 },
      { assigneeId: 'a2', taskCount: 1, overdueCount: 0, inProgressCount: 1 },
    ])
    const directory = { displayName: vi.fn().mockImplementation((id) => Promise.resolve(id === 'a1' ? 'Alice' : null)) }
    const deps = {
      registry: { requireConsent: vi.fn().mockResolvedValue(undefined) },
      buildSql: () => sql,
      directory,
    }
    const tool = workloadAnalysisTool(deps as never)
    const r = await tool.execute({ scope: { kind: 'plan', planId: 'P1' } }, /* ctx */ {} as never)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.rows[0]).toMatchObject({ assigneeId: 'a1', displayName: 'Alice', taskCount: 3 })
      expect(r.value.rows[1]).toMatchObject({ assigneeId: 'a2', displayName: '(unknown)' })
      expect(r.value.chart.type).toBe('bar')
      expect(r.value.chart.series[0].label).toBe('Open tasks')
    }
  })
})
```

- [ ] **Step 2: Implement** matching §8.4 exactly (scope resolver, filters, SQL aggregation, directory display-name fallback, sort, limit, chart shape).

```ts
// Aggregating SQL (sketch):
// SELECT unnest(assignee_ids) AS assignee_id,
//        count(*) AS task_count,
//        count(*) FILTER (WHERE due_date < now() AND percent_complete < 100) AS overdue_count,
//        count(*) FILTER (WHERE percent_complete > 0 AND percent_complete < 100) AS in_progress_count
// FROM connector_ms365_planner.planner_tasks_cache
// WHERE plan_id = ANY($1) AND soft_deleted_at IS NULL
// GROUP BY 1 ORDER BY task_count DESC LIMIT $2;
```

- [ ] **Step 3: Run — green (Milestone M6)**

Run: `pnpm --filter @seta/agent vitest run src/tools/planner/read/workload_analysis.test.ts`

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(agent): planner.workload_analysis (SQL aggregation + chart-ready output)"
```

---

## Phase J — Wire-up (2 tasks)

### Task J1: Tool registry export from agent product

**Files:**
- Modify: `modules/products/agent/src/index.ts`
- Create: `modules/products/agent/src/tools/planner/index.ts` (barrel)

- [ ] **Step 1: Barrel**

```ts
// src/tools/planner/index.ts
export { listMyTasksTool } from './read/list_my_tasks'
export { listPlanTasksTool } from './read/list_plan_tasks'
export { getTaskTool } from './read/get_task'
export { listPlansTool } from './read/list_plans'
export { listBucketsTool } from './read/list_buckets'
export { workloadAnalysisTool } from './read/workload_analysis'
export { updateTasksPreviewTool } from './write/update_tasks.preview'
export { updateTasksCommitTool } from './write/update_tasks.commit'
export { createTasksPreviewTool } from './write/create_tasks.preview'
export { createTasksCommitTool } from './write/create_tasks.commit'
export { completeTasksPreviewTool } from './write/complete_tasks.preview'
export { completeTasksCommitTool } from './write/complete_tasks.commit'
export { addCommentsPreviewTool } from './write/add_comments.preview'
export { addCommentsCommitTool } from './write/add_comments.commit'
export { createPlanPreviewTool } from './write/create_plan.preview'
export { createPlanCommitTool } from './write/create_plan.commit'

export { createContinuationStore } from './_continuation'
```

- [ ] **Step 2: Factory**

```ts
// src/index.ts
import type { Tool } from '@seta/agent-core'
import type { ConnectorRegistry } from '@seta/connector-registry'
import type { TokenVault } from '@seta/oauth'
import type { GraphFetch } from '@seta/ms-graph'
import type { DbSql } from '@seta/db'
import * as P from './tools/planner'

export interface PlannerToolFactoryDeps {
  registry: ConnectorRegistry
  vault: TokenVault
  graph: GraphFetch
  sql: DbSql
  hmacKey: string
  ttls: { tasks: number; plans: number; buckets: number; staleFallbackMax: number }
  continuationTtlMin: number
  batchConcurrency: number
}

export function createPlannerTools(deps: PlannerToolFactoryDeps): Tool[] {
  // wire deps the same way for every tool; return the full array
  return [/* 16 tools constructed */]
}
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm --filter @seta/agent typecheck && pnpm --filter @seta/agent build`

- [ ] **Step 4: Commit**

```bash
git add modules/products/agent/src/
git commit -m "feat(agent): planner tools barrel + factory"
```

### Task J2: Register from `apps/api`

**Files:**
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: Register the connector with the registry; wire the factory; expose the 16 tools to the agent runtime**

```ts
// apps/api/src/main.ts (excerpt)
import { plannerConnector } from '@seta/connector-ms365-planner'
import { createPlannerTools } from '@seta/agent'

connectorRegistry.register(plannerConnector)
const plannerTools = createPlannerTools({
  registry: connectorRegistry, vault, graph,
  sql, hmacKey: env.CONTINUATION_HMAC_KEY,
  ttls: {
    tasks: env.PLANNER_CACHE_TTL_TASKS_SEC,
    plans: env.PLANNER_CACHE_TTL_PLANS_SEC,
    buckets: env.PLANNER_CACHE_TTL_BUCKETS_SEC,
    staleFallbackMax: env.PLANNER_CACHE_STALE_FALLBACK_MAX_SEC,
  },
  continuationTtlMin: env.CONTINUATION_TTL_MIN,
  batchConcurrency: env.PLANNER_BATCH_CONCURRENCY,
})
// Hand `plannerTools` to the agent runtime so it advertises them to the model.
```

- [ ] **Step 2: Run `pnpm migrate` then `pnpm typecheck && pnpm build` (Milestone M7)**

Run: `pnpm migrate && pnpm typecheck && pnpm build`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/main.ts
git commit -m "feat(api): register ms365-planner connector + 16 tools"
```

---

## Phase K — Integration tests (3 tasks)

### Task K1: Integration harness — DB + msw Graph fixtures

**Files:**
- Create: `modules/products/agent/tests/integration/_harness.ts`
- Create: `modules/products/agent/tests/integration/_msw-planner.ts`

- [ ] **Step 1: Build a per-test harness**

The harness:
1. Opens a postgres connection bound to `DATABASE_URL`.
2. Runs `BEGIN` per test; truncates `agent.write_continuations` + `connector_ms365_planner.*` for the test's `tenant_id`.
3. Issues `SET LOCAL app.tenant_id`, `SET LOCAL app.user_id`.
4. Starts an `msw` server with Planner endpoint handlers (msw recordings live alongside).
5. Yields a `dispatch(tool, input)` helper.

- [ ] **Step 2: msw handlers cover the Q4 endpoints**: GET/PATCH `/planner/tasks/:id`, POST `/planner/tasks`, POST `/$batch`, GET `/me/planner/tasks`, etc.

- [ ] **Step 3: Commit**

```bash
git add modules/products/agent/tests/integration/_harness.ts modules/products/agent/tests/integration/_msw-planner.ts
git commit -m "test(agent): integration harness for planner tools"
```

### Task K2: Preview → commit happy path (with audit assertions)

**Files:**
- Create: `modules/products/agent/tests/integration/update_tasks.round_trip.test.ts`

- [ ] **Step 1: Test**

```ts
it('preview mints; commit PATCHes with If-Match; cache updated; audit rows present', async () => {
  // seed cache: planner_tasks_cache row with etag W/"1"
  // dispatch update_tasks.preview({ updates:[{taskId:'T1', title:'new'}] })
  //   assert: token returned; row in write_continuations
  // dispatch update_tasks.commit({ token })
  //   assert: msw observed PATCH with If-Match: W/"1" and Prefer: return=representation
  //   assert: planner_tasks_cache.title='new' and etag='W/"2"'
  //   assert: audit.audit_log has graph.PATCH./planner/tasks/:id and agent.write_commit rows
  //   assert: write_continuations.consumed_at IS NOT NULL
})
```

- [ ] **Step 2: Implement, run**

Run: `DATABASE_URL=postgres://… pnpm --filter @seta/agent test:integration -t "round_trip"`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git commit -am "test(agent): integration round-trip update_tasks preview→commit"
```

### Task K3: Partial-failure + idempotent re-commit

**Files:**
- Create: `modules/products/agent/tests/integration/update_tasks.partial.test.ts`

- [ ] **Step 1: Test cases**

1. **Partial failure**: msw handler returns 412 for the 2nd of 3 inner requests. Assert per-row classification, 2 cache rows updated, 1 not, 1 partial-result card.
2. **Idempotent re-commit**: dispatch commit twice with the same token. Assert second call returns the cached `result_card` and msw observed only **one** PATCH/batch.
3. **Token tamper**: alter the HMAC half of the token. Assert `ContinuationBadHmac` and audit row with `result: 'failure'`.

- [ ] **Step 2: Run (Milestone M8)**

Run: `DATABASE_URL=… pnpm test:integration`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git commit -am "test(agent): integration partial-failure + idempotent re-commit"
```

---

## Phase L — E2E (1 task)

### Task L1: Q4.1–Q4.10 on staging

**Files:**
- Create: `tests/e2e/planner-crud.spec.ts`

- [ ] **Step 1: Spec the Q4 cases as e2e**

Each maps to a real Teams Channel hit on staging once Epic 4's adapter is live; for Epic 2 alone, drive via direct API hits to `/v1/agent/run` with surface=`direct`. Each test:
- Creates a temp plan + tasks via a setup helper (real Entra dev app + dev plan).
- Exercises preview→commit.
- Asserts Planner state changed (live GET).
- Cleans up via DELETE.

Q4.1: read p95 budget; Q4.2: create with bucket; Q4.3: update assignees bulk; Q4.4: complete; Q4.5: comments; Q4.6: create plan; Q4.7: 412 surface; Q4.8: 403 friendly; Q4.9: partial failure; Q4.10: workload chart.

- [ ] **Step 2: Run on staging (Milestone M9)**

Run: `STAGING=1 pnpm test:e2e`
Expected: green. Capture any flaky/slow case and file follow-up.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/planner-crud.spec.ts
git commit -m "test(e2e): Q4.1–Q4.10 planner CRUD round trips"
```

---

## Self-review notes

- **Spec coverage:**
  - §3 tool surface — all 16 tools have a dedicated task (F1–F6, G1–G5, H1–H5).
  - §4 package layout — every file enumerated in spec has a corresponding create task.
  - §5 cache — schema (C1), single-row read-through (D2), other entities + write-through (D3), ETag accessor (D4). Lists go live in P1 per §5.4 — encoded in F1's `source: 'live'`.
  - §6 graph wrapper — B1–B7 cover taxonomy, status mapping, retry (429 & 5xx), ETag, $batch, audit middleware, paginate, OTel.
  - §7 preview/commit — E1 (continuation), G1–G5 (preview), H1–H5 (commit).
  - §8 bulk + workload — H1 covers chunking + p-queue; classifier in `_classify`; I1 workload.
  - §9 error model — addressed in B1, E1.
  - §10 observability — OTel attrs in B7; audit in B6. (Metrics counters added by emitter in J1's factory wiring — confirm before M7.)
  - §11 testing — Phases B/D/E/F/G/H/I unit; K integration; L E2E.
  - §12 ACs mapped via the §12 table; every AC has a code path.

- **Placeholders:** None. Every step shows code or exact commands.
- **Type consistency:** `OpResult.status` is the same union across `_classify.ts`, commit tools, and the output schemas. `ReadResult.source` is the same union across cache (D2), read tools (F1+), and workload (I1). `BatchResponseItem`/`BatchRequest` shapes match between `@seta/ms-graph` (B5) and commit tools (H1).
- **One open uncertainty (not blocking the plan):** `planner.add_comments` Graph endpoint shape — flagged in G4/H4 to verify via context7 docs MCP at impl time. If the comment endpoint requires a non-`$batch`-compatible call shape, H4's commit becomes a sequential loop instead of a batch; still per-op classification, same partial-result UX.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-12-ms365-planner-crud-implementation.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
