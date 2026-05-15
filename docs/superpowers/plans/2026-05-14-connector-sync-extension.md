# Connector Sync Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `@seta/connector-ms365-planner` with delta-poll task sync, plan membership tracking, and a background sync worker — so all agent reads come from local Postgres, never live Graph API calls.

**Architecture:** A new `createPlannerSyncWorker` factory runs on a timer per tenant. It (1) fetches all plans via Graph app token, (2) uses delta queries for incremental task sync storing the delta token in `sync_watermarks`, (3) syncs plan membership from group membership data. The worker is started by `apps/api` at boot and calls an `afterSync` hook so the product layer can trigger downstream updates (embedding, materialized view refresh) without the connector knowing about them.

**Tech Stack:** Drizzle ORM (`drizzle-kit generate`), vitest, `@seta/ms-graph` (`GraphFetch`), `node:timers`

---

## File map

| Action | File |
|---|---|
| Modify | `modules/connectors/ms365-planner/src/schema.ts` |
| Modify | `modules/connectors/ms365-planner/src/client.ts` |
| Create | `modules/connectors/ms365-planner/src/sync.ts` |
| Create | `modules/connectors/ms365-planner/src/sync.test.ts` |
| Modify | `modules/connectors/ms365-planner/src/index.ts` |
| Generate | `modules/connectors/ms365-planner/migrations/<hash>_plan-members.sql` |
| Generate | `modules/connectors/ms365-planner/migrations/<hash>_delta-token.sql` |
| Generate | `modules/connectors/ms365-planner/migrations/<hash>_rls-plan-members.sql` |

---

## Task 1: Add `deltaToken` to `syncWatermarks`

**Files:**
- Modify: `modules/connectors/ms365-planner/src/schema.ts`
- Generate: `modules/connectors/ms365-planner/migrations/`

- [ ] **Step 1: Add `deltaToken` column to the `syncWatermarks` table definition**

Open `modules/connectors/ms365-planner/src/schema.ts`. Add `deltaToken` to the `syncWatermarks` table and export its inferred type:

```typescript
export const syncWatermarks = connectorMs365PlannerSchema.table(
  'sync_watermarks',
  {
    tenantId: uuid('tenant_id').notNull(),
    scopeKind: text('scope_kind').notNull(),
    scopeId: text('scope_id').notNull(),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    status: text('status'),
    deltaToken: text('delta_token'),  // ← add this line
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.scopeKind, t.scopeId] })],
)

// Add at the bottom alongside existing type exports:
export type SyncWatermarkRow = typeof syncWatermarks.$inferSelect
export type NewSyncWatermark = typeof syncWatermarks.$inferInsert
```

- [ ] **Step 2: Generate the migration**

```bash
pnpm --filter @seta/connector-ms365-planner exec drizzle-kit generate
```

Expected: a new `.sql` file appears in `migrations/` containing `ALTER TABLE connector_ms365_planner.sync_watermarks ADD COLUMN delta_token text;`

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @seta/connector-ms365-planner typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add modules/connectors/ms365-planner/src/schema.ts modules/connectors/ms365-planner/migrations/
git commit -m "feat(connector-ms365-planner): add delta_token column to sync_watermarks"
```

---

## Task 2: Add `planMembers` table + RLS migration

**Files:**
- Modify: `modules/connectors/ms365-planner/src/schema.ts`
- Generate: `modules/connectors/ms365-planner/migrations/` (DDL + custom RLS)

- [ ] **Step 1: Add the `planMembers` table definition to `schema.ts`**

Add after `syncWatermarks` in `modules/connectors/ms365-planner/src/schema.ts`:

```typescript
export const planMembers = connectorMs365PlannerSchema.table(
  'plan_members',
  {
    tenantId: uuid('tenant_id').notNull(),
    planId: text('plan_id').notNull(),
    userId: text('user_id').notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.planId, t.userId] })],
)

export type PlanMemberRow = typeof planMembers.$inferSelect
export type NewPlanMember = typeof planMembers.$inferInsert
```

- [ ] **Step 2: Generate DDL migration**

```bash
pnpm --filter @seta/connector-ms365-planner exec drizzle-kit generate
```

Expected: new `.sql` with `CREATE TABLE connector_ms365_planner.plan_members (...)`.

- [ ] **Step 3: Generate the RLS custom migration skeleton**

```bash
pnpm --filter @seta/connector-ms365-planner exec drizzle-kit generate --custom --name rls-plan-members
```

Expected: a new empty `.sql` file in `migrations/`.

- [ ] **Step 4: Write the RLS policy in the generated custom migration file**

Open the newly generated `migrations/<hash>_rls-plan-members.sql` and replace its empty body with:

```sql
ALTER TABLE connector_ms365_planner.plan_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON connector_ms365_planner.plan_members
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @seta/connector-ms365-planner typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add modules/connectors/ms365-planner/src/schema.ts modules/connectors/ms365-planner/migrations/
git commit -m "feat(connector-ms365-planner): add plan_members table with RLS"
```

---

## Task 3: Extend `PlannerClient` with sync methods

**Files:**
- Modify: `modules/connectors/ms365-planner/src/client.ts`
- Modify: `modules/connectors/ms365-planner/src/client.test.ts`

Three new methods are needed for the sync worker. The existing `paginate` helper follows `@odata.nextLink` only; delta queries also emit `@odata.deltaLink` in the final page, so `listPlanTasksDelta` paginates manually via `call`.

- [ ] **Step 1: Write three failing tests**

Append to `modules/connectors/ms365-planner/src/client.test.ts`:

```typescript
  it('listAllPlans paginates /planner/plans', async () => {
    const s = stubGraph()
    s.paginate.mockReturnValue(
      (async function* () { yield { id: 'P1' } })(),
    )
    const c = createPlannerClient({ graph: s.gf, actor: { type: 'user', userId: 'u' }, token: 't' })
    const out = []
    for await (const p of c.listAllPlans()) out.push(p)
    expect(out).toEqual([{ id: 'P1' }])
    expect(s.paginate).toHaveBeenCalledWith(expect.objectContaining({ path: '/planner/plans' }))
  })

  it('listPlanTasksDelta GETs delta endpoint and extracts nextDeltaToken', async () => {
    const s = stubGraph()
    s.call.mockResolvedValue({
      data: {
        value: [{ id: 'T1' }],
        '@odata.deltaLink':
          'https://graph.microsoft.com/v1.0/planner/plans/P1/tasks/delta?$deltatoken=tok42',
      },
      etag: null,
      status: 200,
    })
    const c = createPlannerClient({ graph: s.gf, actor: { type: 'user', userId: 'u' }, token: 't' })
    const result = await c.listPlanTasksDelta('P1')
    expect(result.items).toEqual([{ id: 'T1' }])
    expect(result.nextDeltaToken).toBe('tok42')
    expect(s.call).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/planner/plans/P1/tasks/delta' }),
    )
  })

  it('listPlanTasksDelta resumes from stored delta token', async () => {
    const s = stubGraph()
    s.call.mockResolvedValue({
      data: { value: [], '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/planner/plans/P1/tasks/delta?$deltatoken=tok99' },
      etag: null, status: 200,
    })
    const c = createPlannerClient({ graph: s.gf, actor: { type: 'user', userId: 'u' }, token: 't' })
    await c.listPlanTasksDelta('P1', 'prevTok')
    expect(s.call).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/planner/plans/P1/tasks/delta?$deltatoken=prevTok' }),
    )
  })

  it('listGroupMembers paginates /groups/:id/members', async () => {
    const s = stubGraph()
    s.paginate.mockReturnValue(
      (async function* () { yield { id: 'U1' } })(),
    )
    const c = createPlannerClient({ graph: s.gf, actor: { type: 'user', userId: 'u' }, token: 't' })
    const out = []
    for await (const m of c.listGroupMembers('G1')) out.push(m)
    expect(out).toEqual([{ id: 'U1' }])
    expect(s.paginate).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/groups/G1/members' }),
    )
  })
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pnpm --filter @seta/connector-ms365-planner test:unit
```

Expected: 4 new tests FAIL with "is not a function" or similar.

- [ ] **Step 3: Add the three methods to the `PlannerClient` interface in `client.ts`**

Add to the `PlannerClient` interface (after the existing `createPlan` method):

```typescript
  listAllPlans(): AsyncIterable<unknown>
  listPlanTasksDelta(planId: string, deltaToken?: string): Promise<{
    items: unknown[]
    nextDeltaToken: string
  }>
  listGroupMembers(groupId: string): AsyncIterable<unknown>
```

- [ ] **Step 4: Implement the three methods in `createPlannerClient`**

Add after the existing `createPlan` implementation (before the closing `}`):

```typescript
    listAllPlans: () =>
      deps.graph.paginate({ ...base, method: 'GET', path: '/planner/plans' }),

    listPlanTasksDelta: async (planId, deltaToken) => {
      const startPath = deltaToken
        ? `/planner/plans/${planId}/tasks/delta?$deltatoken=${deltaToken}`
        : `/planner/plans/${planId}/tasks/delta`
      const items: unknown[] = []
      let path = startPath
      while (true) {
        const res = await deps.graph.call<{
          value?: unknown[]
          '@odata.nextLink'?: string
          '@odata.deltaLink'?: string
        }>({ ...base, method: 'GET', path })
        const page = res.data
        if (page.value) items.push(...page.value)
        if (page['@odata.deltaLink']) {
          const url = new URL(page['@odata.deltaLink'])
          const nextToken = url.searchParams.get('$deltatoken') ?? ''
          return { items, nextDeltaToken: nextToken }
        }
        if (page['@odata.nextLink']) {
          const nextUrl = new URL(page['@odata.nextLink'])
          path = nextUrl.pathname.replace(/^\/v1\.0/, '') + nextUrl.search
          continue
        }
        // Graph delta API must always terminate with deltaLink
        const { GraphUnavailable } = await import('@seta/ms-graph')
        throw new GraphUnavailable('delta response missing both nextLink and deltaLink')
      }
    },

    listGroupMembers: (groupId) =>
      deps.graph.paginate({ ...base, method: 'GET', path: `/groups/${groupId}/members` }),
```

Note: move the `import { GraphUnavailable } from '@seta/ms-graph'` to the top of the file alongside the existing imports rather than using a dynamic import.

- [ ] **Step 5: Run tests — verify they pass**

```bash
pnpm --filter @seta/connector-ms365-planner test:unit
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add modules/connectors/ms365-planner/src/client.ts modules/connectors/ms365-planner/src/client.test.ts
git commit -m "feat(connector-ms365-planner): add listAllPlans, listPlanTasksDelta, listGroupMembers"
```

---

## Task 4: Implement `createPlannerSyncWorker`

**Files:**
- Create: `modules/connectors/ms365-planner/src/sync.ts`
- Create: `modules/connectors/ms365-planner/src/sync.test.ts`

- [ ] **Step 1: Create `sync.test.ts` with failing tests**

Create `modules/connectors/ms365-planner/src/sync.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPlannerSyncWorker } from './sync'

// Stub GraphFetch — same pattern as client.test.ts
function stubGraph() {
  const call = vi.fn()
  const paginate = vi.fn()
  const batch = vi.fn()
  return { call, paginate, batch, gf: { call, batch, paginate } as never }
}

// Stub the tagged-template sql function.
// Returns [] by default; use .mockResolvedValueOnce([row]) to control per-call.
function makeSql() {
  return Object.assign(vi.fn().mockResolvedValue([]), {
    array: (arr: unknown[]) => arr,
  }) as ReturnType<typeof vi.fn> & { array(a: unknown[]): unknown[] }
}

const TENANT = '00000000-0000-0000-0000-000000000001'

describe('createPlannerSyncWorker', () => {
  let g: ReturnType<typeof stubGraph>
  let sql: ReturnType<typeof makeSql>

  beforeEach(() => {
    g = stubGraph()
    sql = makeSql()
  })

  it('syncTenant: upserts plans returned by listAllPlans', async () => {
    g.paginate.mockImplementation(({ path }: { path: string }) => {
      if (path === '/planner/plans') {
        return (async function* () {
          yield { id: 'P1', owner: 'G1', title: 'Plan One', container: { url: 'https://x' } }
        })()
      }
      return (async function* () {})()
    })
    g.call.mockResolvedValue({
      data: {
        value: [],
        '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/planner/plans/P1/tasks/delta?$deltatoken=T1',
      },
      etag: null, status: 200,
    })
    // planRows query returns P1
    sql.mockResolvedValueOnce([{ graph_plan_id: 'P1', owner_group_id: 'G1' }])

    const worker = createPlannerSyncWorker({
      sql, graph: g.gf, getAppToken: async () => 'tok',
    })
    await worker.syncTenant(TENANT)

    // sql was called at least once — the plans upsert
    expect(sql).toHaveBeenCalled()
    // paginate was called with /planner/plans
    expect(g.paginate).toHaveBeenCalledWith(expect.objectContaining({ path: '/planner/plans' }))
  })

  it('syncTenant: calls afterSync with IDs of upserted tasks', async () => {
    const afterSync = vi.fn()
    g.paginate.mockImplementation(({ path }: { path: string }) => {
      if (path === '/planner/plans') {
        return (async function* () { yield { id: 'P1', owner: 'G1', title: 'Plan One' } })()
      }
      // listGroupMembers
      return (async function* () { yield { id: 'U1' } })()
    })
    g.call.mockResolvedValue({
      data: {
        value: [{ id: 'T1', planId: 'P1', assignments: {}, percentComplete: 0, priority: 1 }],
        '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/planner/plans/P1/tasks/delta?$deltatoken=T1',
      },
      etag: null, status: 200,
    })
    sql
      .mockResolvedValueOnce([])                                                // deltaToken watermark lookup
      .mockResolvedValueOnce([{ graph_plan_id: 'P1', owner_group_id: 'G1' }]) // planRows query

    const worker = createPlannerSyncWorker({
      sql, graph: g.gf, getAppToken: async () => 'tok', afterSync,
    })
    await worker.syncTenant(TENANT)

    expect(afterSync).toHaveBeenCalledWith(TENANT, ['T1'])
  })

  it('syncTenant: does NOT call afterSync when no tasks changed', async () => {
    const afterSync = vi.fn()
    g.paginate.mockImplementation(({ path }: { path: string }) => {
      if (path === '/planner/plans') {
        return (async function* () { yield { id: 'P1', owner: 'G1', title: 'Plan One' } })()
      }
      return (async function* () {})()
    })
    g.call.mockResolvedValue({
      data: { value: [], '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/planner/plans/P1/tasks/delta?$deltatoken=T1' },
      etag: null, status: 200,
    })
    sql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ graph_plan_id: 'P1', owner_group_id: 'G1' }])

    const worker = createPlannerSyncWorker({
      sql, graph: g.gf, getAppToken: async () => 'tok', afterSync,
    })
    await worker.syncTenant(TENANT)

    expect(afterSync).not.toHaveBeenCalled()
  })

  it('syncTenant: uses stored delta token on subsequent sync', async () => {
    g.paginate.mockImplementation(({ path }: { path: string }) => {
      if (path === '/planner/plans') {
        return (async function* () { yield { id: 'P1', owner: 'G1', title: 'P' } })()
      }
      return (async function* () {})()
    })
    g.call.mockResolvedValue({
      data: { value: [], '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/planner/plans/P1/tasks/delta?$deltatoken=NEW' },
      etag: null, status: 200,
    })
    sql
      .mockResolvedValueOnce([{ delta_token: 'STORED_TOKEN' }]) // watermark row
      .mockResolvedValueOnce([{ graph_plan_id: 'P1', owner_group_id: null }])

    const worker = createPlannerSyncWorker({
      sql, graph: g.gf, getAppToken: async () => 'tok',
    })
    await worker.syncTenant(TENANT)

    // call() should have been given the stored delta token in the path
    expect(g.call).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/planner/plans/P1/tasks/delta?$deltatoken=STORED_TOKEN',
      }),
    )
  })

  it('start / stop: does not throw; stop clears the timer', () => {
    vi.useFakeTimers()
    const worker = createPlannerSyncWorker({
      sql, graph: g.gf, getAppToken: async () => 'tok', intervalMs: 5000,
    })
    worker.start([TENANT])
    worker.stop()
    // No error thrown, timer stopped
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pnpm --filter @seta/connector-ms365-planner test:unit
```

Expected: 5 new tests FAIL with "Cannot find module './sync'" or similar.

- [ ] **Step 3: Create `sync.ts`**

Create `modules/connectors/ms365-planner/src/sync.ts`:

```typescript
import type { GraphFetch } from '@seta/ms-graph'
import { createPlannerClient } from './client.js'

type DbSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>
type SqlWithArray = DbSql & { array(arr: unknown[]): unknown[] }

export interface PlannerSyncWorkerDeps {
  sql: SqlWithArray
  graph: GraphFetch
  getAppToken: (tenantId: string) => Promise<string>
  intervalMs?: number
  afterSync?: (tenantId: string, changedTaskIds: string[]) => Promise<void>
}

const SYNC_ACTOR = { type: 'system' as const, userId: 'planner-sync' }

export function createPlannerSyncWorker(deps: PlannerSyncWorkerDeps) {
  const { sql, graph, getAppToken, intervalMs = 3 * 60 * 1000, afterSync } = deps
  let timer: ReturnType<typeof setInterval> | null = null

  async function syncTenantPlans(tenantId: string, token: string): Promise<string[]> {
    const client = createPlannerClient({ graph, token, actor: SYNC_ACTOR })
    const seenPlanIds: string[] = []

    for await (const raw of client.listAllPlans()) {
      const plan = raw as {
        id: string
        owner?: string
        title?: string
        container?: { url?: string }
      }
      seenPlanIds.push(plan.id)
      await sql`
        INSERT INTO connector_ms365_planner.planner_plans_cache
          (tenant_id, graph_plan_id, owner_group_id, title, container_url, raw, synced_at, soft_deleted_at)
        VALUES (
          ${tenantId}::uuid, ${plan.id}, ${plan.owner ?? null}, ${plan.title ?? null},
          ${plan.container?.url ?? null}, ${JSON.stringify(raw)}::jsonb, now(), NULL
        )
        ON CONFLICT (tenant_id, graph_plan_id) DO UPDATE SET
          owner_group_id  = EXCLUDED.owner_group_id,
          title           = EXCLUDED.title,
          container_url   = EXCLUDED.container_url,
          raw             = EXCLUDED.raw,
          synced_at       = now(),
          soft_deleted_at = NULL
      `
    }

    if (seenPlanIds.length > 0) {
      await sql`
        UPDATE connector_ms365_planner.planner_plans_cache
        SET soft_deleted_at = now()
        WHERE tenant_id    = ${tenantId}::uuid
          AND soft_deleted_at IS NULL
          AND graph_plan_id <> ALL(${sql.array(seenPlanIds)})
      `
    }

    return seenPlanIds
  }

  async function syncTenantTasksDelta(
    tenantId: string,
    token: string,
    planId: string,
  ): Promise<string[]> {
    const client = createPlannerClient({ graph, token, actor: SYNC_ACTOR })

    const watermarkRows = await sql`
      SELECT delta_token FROM connector_ms365_planner.sync_watermarks
      WHERE tenant_id  = ${tenantId}::uuid
        AND scope_kind = 'tasks'
        AND scope_id   = ${planId}
    `
    const storedToken =
      (watermarkRows[0] as { delta_token?: string } | undefined)?.delta_token ?? undefined

    const { items, nextDeltaToken } = await client.listPlanTasksDelta(planId, storedToken)
    const changedTaskIds: string[] = []

    for (const raw of items) {
      const task = raw as {
        id: string
        planId?: string
        bucketId?: string
        title?: string
        percentComplete?: number
        priority?: number
        dueDateTime?: string | null
        assignments?: Record<string, unknown>
        createdBy?: { user?: { id?: string } }
        createdDateTime?: string | null
        lastModifiedBy?: { user?: { id?: string } }
        lastModifiedDateTime?: string | null
        '@odata.etag'?: string
        '@removed'?: unknown
      }

      if (task['@removed']) {
        await sql`
          UPDATE connector_ms365_planner.planner_tasks_cache
          SET soft_deleted_at = now()
          WHERE tenant_id    = ${tenantId}::uuid
            AND graph_task_id = ${task.id}
        `
        continue
      }

      const assigneeIds = Object.keys(task.assignments ?? {})
      await sql`
        INSERT INTO connector_ms365_planner.planner_tasks_cache (
          tenant_id, graph_task_id, plan_id, bucket_id, title,
          percent_complete, priority, due_date, assignee_ids,
          created_by, created_at_graph, last_modified_by, last_modified_at_graph,
          etag, raw, synced_at
        ) VALUES (
          ${tenantId}::uuid,
          ${task.id},
          ${task.planId ?? planId},
          ${task.bucketId ?? null},
          ${task.title ?? null},
          ${task.percentComplete ?? 0},
          ${task.priority ?? 1},
          ${task.dueDateTime ?? null}::timestamptz,
          ${sql.array(assigneeIds)},
          ${task.createdBy?.user?.id ?? null},
          ${task.createdDateTime ?? null}::timestamptz,
          ${task.lastModifiedBy?.user?.id ?? null},
          ${task.lastModifiedDateTime ?? null}::timestamptz,
          ${task['@odata.etag'] ?? null},
          ${JSON.stringify(raw)}::jsonb,
          now()
        )
        ON CONFLICT (tenant_id, graph_task_id) DO UPDATE SET
          plan_id              = EXCLUDED.plan_id,
          bucket_id            = EXCLUDED.bucket_id,
          title                = EXCLUDED.title,
          percent_complete     = EXCLUDED.percent_complete,
          priority             = EXCLUDED.priority,
          due_date             = EXCLUDED.due_date,
          assignee_ids         = EXCLUDED.assignee_ids,
          last_modified_by     = EXCLUDED.last_modified_by,
          last_modified_at_graph = EXCLUDED.last_modified_at_graph,
          etag                 = EXCLUDED.etag,
          raw                  = EXCLUDED.raw,
          synced_at            = now(),
          soft_deleted_at      = NULL
      `
      changedTaskIds.push(task.id)
    }

    await sql`
      INSERT INTO connector_ms365_planner.sync_watermarks
        (tenant_id, scope_kind, scope_id, last_sync_at, status, delta_token)
      VALUES
        (${tenantId}::uuid, 'tasks', ${planId}, now(), 'ok', ${nextDeltaToken})
      ON CONFLICT (tenant_id, scope_kind, scope_id) DO UPDATE SET
        last_sync_at = now(),
        status       = 'ok',
        delta_token  = EXCLUDED.delta_token
    `

    return changedTaskIds
  }

  async function syncTenantPlanMembers(
    tenantId: string,
    token: string,
    planId: string,
    ownerGroupId: string,
  ): Promise<void> {
    const client = createPlannerClient({ graph, token, actor: SYNC_ACTOR })
    const seenUserIds: string[] = []

    for await (const raw of client.listGroupMembers(ownerGroupId)) {
      const member = raw as { id?: string }
      if (!member.id) continue
      seenUserIds.push(member.id)
      await sql`
        INSERT INTO connector_ms365_planner.plan_members (tenant_id, plan_id, user_id, synced_at)
        VALUES (${tenantId}::uuid, ${planId}, ${member.id}, now())
        ON CONFLICT (tenant_id, plan_id, user_id) DO UPDATE SET synced_at = now()
      `
    }

    if (seenUserIds.length > 0) {
      await sql`
        DELETE FROM connector_ms365_planner.plan_members
        WHERE tenant_id = ${tenantId}::uuid
          AND plan_id   = ${planId}
          AND user_id   <> ALL(${sql.array(seenUserIds)})
      `
    }
  }

  async function syncTenant(tenantId: string): Promise<void> {
    const token = await getAppToken(tenantId)

    const planIds = await syncTenantPlans(tenantId, token)
    if (planIds.length === 0) return

    const planRows = await sql`
      SELECT graph_plan_id, owner_group_id
      FROM connector_ms365_planner.planner_plans_cache
      WHERE tenant_id     = ${tenantId}::uuid
        AND soft_deleted_at IS NULL
        AND graph_plan_id = ANY(${sql.array(planIds)})
    `

    const allChangedTaskIds: string[] = []

    for (const row of planRows as { graph_plan_id: string; owner_group_id: string | null }[]) {
      const { graph_plan_id: planId, owner_group_id: ownerGroupId } = row
      const changed = await syncTenantTasksDelta(tenantId, token, planId)
      allChangedTaskIds.push(...changed)
      if (ownerGroupId) {
        await syncTenantPlanMembers(tenantId, token, planId, ownerGroupId)
      }
    }

    if (allChangedTaskIds.length > 0) {
      await afterSync?.(tenantId, allChangedTaskIds)
    }
  }

  return {
    start(tenantIds: string[]): void {
      if (timer) return
      timer = setInterval(() => {
        for (const tenantId of tenantIds) {
          syncTenant(tenantId).catch((err) => {
            // Swallowed — log in consuming code via afterSync or observability
            void err
          })
        }
      }, intervalMs)
    },

    stop(): void {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    },

    syncTenant,
  }
}

export type PlannerSyncWorker = ReturnType<typeof createPlannerSyncWorker>
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm --filter @seta/connector-ms365-planner test:unit
```

Expected: all tests PASS including the 5 new sync tests.

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @seta/connector-ms365-planner typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add modules/connectors/ms365-planner/src/sync.ts modules/connectors/ms365-planner/src/sync.test.ts
git commit -m "feat(connector-ms365-planner): createPlannerSyncWorker with delta-poll and plan members sync"
```

---

## Task 5: Export from `index.ts`

**Files:**
- Modify: `modules/connectors/ms365-planner/src/index.ts`

- [ ] **Step 1: Add exports**

Add to `modules/connectors/ms365-planner/src/index.ts`:

```typescript
export type { PlannerSyncWorker, PlannerSyncWorkerDeps } from './sync.js'
export { createPlannerSyncWorker } from './sync.js'
```

The `export * from './schema'` line already exports the new `PlanMemberRow`, `NewPlanMember`, and updated `SyncWatermarkRow` types.

- [ ] **Step 2: Build to verify public API**

```bash
pnpm --filter @seta/connector-ms365-planner build
```

Expected: `dist/index.js` and `dist/index.d.ts` generated without errors.

- [ ] **Step 3: Commit**

```bash
git add modules/connectors/ms365-planner/src/index.ts
git commit -m "feat(connector-ms365-planner): export createPlannerSyncWorker from public API"
```

---

## Task 6: Integration test

**Files:**
- Create: `modules/connectors/ms365-planner/tests/integration/sync.test.ts`

Requires `DATABASE_URL` pointing to a local dev Postgres with `pnpm db:up` running and migrations applied (`pnpm migrate`).

- [ ] **Step 1: Create the integration test directory and file**

```bash
mkdir -p modules/connectors/ms365-planner/tests/integration
```

Create `modules/connectors/ms365-planner/tests/integration/sync.test.ts`:

```typescript
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createPlannerSyncWorker } from '../../src/sync.js'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) throw new Error('DATABASE_URL required for integration tests')

const TENANT = '10000000-0000-0000-0000-000000000001'

let db: ReturnType<typeof postgres>
let sql: ReturnType<typeof postgres>

beforeAll(async () => {
  db = postgres(DATABASE_URL, { max: 1 })
  sql = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => db(strings, ...values),
    { array: postgres.sql.array ?? ((a: unknown[]) => a) },
  ) as never
  // Clean fixture tenant data
  await db`DELETE FROM connector_ms365_planner.plan_members WHERE tenant_id = ${TENANT}::uuid`
  await db`DELETE FROM connector_ms365_planner.planner_tasks_cache WHERE tenant_id = ${TENANT}::uuid`
  await db`DELETE FROM connector_ms365_planner.planner_plans_cache WHERE tenant_id = ${TENANT}::uuid`
  await db`DELETE FROM connector_ms365_planner.sync_watermarks WHERE tenant_id = ${TENANT}::uuid`
})

afterAll(async () => {
  await db.end()
})

describe('PlannerSyncWorker integration', () => {
  it('syncTenant: persists plan, task, and member rows to Postgres', async () => {
    const stubGraph = {
      call: vi.fn().mockResolvedValue({
        data: {
          value: [{ id: 'T-INTEG-1', planId: 'P-INTEG-1', assignments: { 'U1': {} }, percentComplete: 0, priority: 1, title: 'Integration task' }],
          '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/planner/plans/P-INTEG-1/tasks/delta?$deltatoken=integ-tok',
        },
        etag: null, status: 200,
      }),
      batch: vi.fn(),
      paginate: vi.fn().mockImplementation(({ path }: { path: string }) => {
        if (path === '/planner/plans') {
          return (async function* () {
            yield { id: 'P-INTEG-1', owner: 'G-INTEG-1', title: 'Integration Plan' }
          })()
        }
        if (path === '/groups/G-INTEG-1/members') {
          return (async function* () {
            yield { id: 'U1', displayName: 'Test User' }
          })()
        }
        return (async function* () {})()
      }),
    }

    const worker = createPlannerSyncWorker({
      sql: sql as never,
      graph: stubGraph as never,
      getAppToken: async () => 'test-token',
    })

    await worker.syncTenant(TENANT)

    const plans = await db`
      SELECT graph_plan_id, title FROM connector_ms365_planner.planner_plans_cache
      WHERE tenant_id = ${TENANT}::uuid
    `
    expect(plans).toHaveLength(1)
    expect(plans[0]!.graph_plan_id).toBe('P-INTEG-1')

    const tasks = await db`
      SELECT graph_task_id, title, assignee_ids FROM connector_ms365_planner.planner_tasks_cache
      WHERE tenant_id = ${TENANT}::uuid
    `
    expect(tasks).toHaveLength(1)
    expect(tasks[0]!.graph_task_id).toBe('T-INTEG-1')
    expect(tasks[0]!.assignee_ids).toContain('U1')

    const members = await db`
      SELECT user_id FROM connector_ms365_planner.plan_members
      WHERE tenant_id = ${TENANT}::uuid AND plan_id = 'P-INTEG-1'
    `
    expect(members).toHaveLength(1)
    expect(members[0]!.user_id).toBe('U1')

    const watermarks = await db`
      SELECT delta_token FROM connector_ms365_planner.sync_watermarks
      WHERE tenant_id = ${TENANT}::uuid AND scope_kind = 'tasks' AND scope_id = 'P-INTEG-1'
    `
    expect(watermarks[0]!.delta_token).toBe('integ-tok')
  })

  it('syncTenant: uses stored delta token on second run', async () => {
    const callSpy = vi.fn().mockResolvedValue({
      data: { value: [], '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/planner/plans/P-INTEG-1/tasks/delta?$deltatoken=integ-tok2' },
      etag: null, status: 200,
    })
    const stubGraph = {
      call: callSpy,
      batch: vi.fn(),
      paginate: vi.fn().mockImplementation(({ path }: { path: string }) => {
        if (path === '/planner/plans') {
          return (async function* () { yield { id: 'P-INTEG-1', owner: 'G-INTEG-1', title: 'Integration Plan' } })()
        }
        return (async function* () {})()
      }),
    }

    const worker = createPlannerSyncWorker({
      sql: sql as never, graph: stubGraph as never, getAppToken: async () => 'test-token',
    })
    await worker.syncTenant(TENANT)

    // Second call must use the delta token stored by the first run
    expect(callSpy).toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.stringContaining('$deltatoken=integ-tok') }),
    )
  })
})
```

- [ ] **Step 2: Run integration test**

```bash
DATABASE_URL=<your-local-db-url> pnpm --filter @seta/connector-ms365-planner test:integration
```

Expected: both integration tests PASS.

- [ ] **Step 3: Commit**

```bash
git add modules/connectors/ms365-planner/tests/
git commit -m "test(connector-ms365-planner): integration tests for sync worker"
```

---

*Plan 1 of 5. Next: Plan 2 — `@seta/agent-server` platform package.*
