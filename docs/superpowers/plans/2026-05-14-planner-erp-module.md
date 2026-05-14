# Planner ERP Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `modules/products/planner` (`@seta/planner`) — ERP Module #1, containing all Planner Agent tools (DB-first reads, write preview/commit pairs, semantic search, T2 analytics helpers, workflows, cards, TaskIndexer) and the `planner.*` Postgres schema.

**Architecture:** Product module — may import `@seta/connector-ms365-planner`, `@seta/connector-ms365-directory`, `@seta/ms-graph`, `@seta/agent-core`, `@seta/agent-vector`, `@seta/agent-embeddings`, `@seta/middleware`, `@seta/tenant`, `@seta/db`. Never imports from other product modules. Existing tools in `modules/products/agent` are moved here with schema prefix updated from `agent.write_continuations` → `planner.write_continuations`. Read tools are completely rewritten to query Postgres views instead of live Graph calls (DB-first principle). The `plannerTools` map is exported for `apps/api` to register into the tool registry at startup.

**Tech Stack:** Drizzle ORM + `drizzle-kit`, Zod, `@seta/agent-core`, `@seta/agent-workflows`, `@seta/agent-vector`, `@seta/agent-embeddings`, `p-queue`, `@hono/zod-openapi`

**Depends on:** Plan 1 complete (plan_members table exists + delta sync worker exports), Plan 2 complete (`@seta/agent-server` published).

---

## File map

| Action | File |
|---|---|
| Create (scaffold) | `modules/products/planner/` via `pnpm new:package` |
| Create | `modules/products/planner/src/schema.ts` |
| Create | `modules/products/planner/drizzle.config.ts` |
| Move + rewrite | `src/tools/read/list_my_tasks.ts` (from `modules/products/agent`) |
| Move + rewrite | `src/tools/read/list_plan_tasks.ts` |
| Move + rewrite | `src/tools/read/get_task.ts` |
| Move + rewrite | `src/tools/read/list_plans.ts` |
| Move + rewrite | `src/tools/read/list_buckets.ts` |
| Create | `src/tools/read/search_tasks_semantic.ts` |
| Create | `src/tools/read/get_project_status.ts` |
| Create | `src/tools/read/get_one_on_one_prep.ts` |
| Move + update | `src/tools/write/_continuation.ts` (schema ref: `agent.*` → `planner.*`) |
| Move | `src/tools/write/_errors.ts` |
| Move | `src/tools/write/_classify.ts` |
| Create | `src/tools/write/_card.ts` (write-preview card) |
| Move | `src/tools/write/update_tasks.preview.ts` |
| Move | `src/tools/write/update_tasks.commit.ts` |
| Move | `src/tools/write/create_tasks.preview.ts` |
| Move | `src/tools/write/create_tasks.commit.ts` |
| Move | `src/tools/write/complete_tasks.preview.ts` |
| Move | `src/tools/write/complete_tasks.commit.ts` |
| Move | `src/tools/write/add_comments.preview.ts` |
| Move | `src/tools/write/add_comments.commit.ts` |
| Move | `src/tools/write/create_plan.preview.ts` |
| Move | `src/tools/write/create_plan.commit.ts` |
| Create | `src/cards/task-list.ts` |
| Create | `src/cards/task-detail.ts` |
| Create | `src/cards/write-preview.ts` |
| Create | `src/cards/workload.ts` |
| Create | `src/cards/scope-decline.ts` |
| Create | `src/workflows/bulk-update.ts` |
| Create | `src/workflows/generate-report.ts` |
| Create | `src/indexer.ts` |
| Create | `src/seeds/planner.ts` |
| Create | `src/index.ts` |
| Create | `src/tools/read/list_my_tasks.test.ts` |
| Create | `src/tools/read/list_plan_tasks.test.ts` |
| Create | `src/tools/read/get_task.test.ts` |
| Create | `src/tools/read/list_plans.test.ts` |
| Create | `src/tools/read/list_buckets.test.ts` |
| Create | `src/tools/write/_continuation.test.ts` |

---

## Task 1: Scaffold package + install dependencies

**Files:**
- Create: `modules/products/planner/` (via scaffold)

- [ ] **Step 1: Scaffold the package**

```bash
pnpm new:package
```

When prompted:
- Kind: `product`
- Short name: `planner`

This creates `modules/products/planner/` with package name `@seta/planner`.

- [ ] **Step 2: Add runtime dependencies**

```bash
pnpm --filter @seta/planner add \
  @seta/agent-core@workspace:* \
  @seta/agent-embeddings@workspace:* \
  @seta/agent-vector@workspace:* \
  @seta/agent-workflows@workspace:* \
  @seta/connector-ms365-planner@workspace:* \
  @seta/connector-ms365-directory@workspace:* \
  @seta/middleware@workspace:* \
  @seta/ms-graph@workspace:* \
  @seta/tenant@workspace:* \
  @seta/db@workspace:* \
  drizzle-orm@0.45.2 \
  p-queue@8.1.0 \
  zod@4.4.3
```

```bash
pnpm --filter @seta/planner add -D \
  drizzle-kit@0.31.10
```

- [ ] **Step 3: Create `drizzle.config.ts`**

```typescript
// modules/products/planner/drizzle.config.ts
import { defineConfig } from 'drizzle-kit'
export default defineConfig({
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  schemaFilter: ['planner'],
  casing: 'snake_case',
})
```

- [ ] **Step 4: Commit scaffold**

```bash
git add modules/products/planner/
git commit -m "feat(planner): scaffold @seta/planner ERP module"
```

---

## Task 2: DB schema — `planner.write_continuations` + permission views

**Files:**
- Create: `modules/products/planner/src/schema.ts`
- Generate: `modules/products/planner/migrations/`

- [ ] **Step 1: Create `schema.ts`**

```typescript
// modules/products/planner/src/schema.ts
import { index, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const plannerSchema = pgSchema('planner')

export const writeContinuations = plannerSchema.table(
  'write_continuations',
  {
    token: text('token').primaryKey(),
    uuid: text('uuid').notNull().unique(),
    tenantId: uuid('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    toolId: text('tool_id').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    etagSnapshot: jsonb('etag_snapshot').$type<Record<string, string>>().notNull(),
    resultCard: jsonb('result_card').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (t) => [index('write_continuations_active').on(t.tenantId, t.userId, t.expiresAt)],
)

export type WriteContinuationRow = typeof writeContinuations.$inferSelect
export type NewWriteContinuation = typeof writeContinuations.$inferInsert
```

- [ ] **Step 2: Generate DDL migration**

```bash
pnpm --filter @seta/planner exec drizzle-kit generate
```

Expected: new `.sql` in `migrations/` with `CREATE SCHEMA planner` and `CREATE TABLE planner.write_continuations ...`.

- [ ] **Step 3: Generate custom migration for RLS + permission views**

```bash
pnpm --filter @seta/planner exec drizzle-kit generate --custom --name rls-and-permission-views
```

- [ ] **Step 4: Write the custom migration SQL**

Open the generated empty `.sql` file and write:

```sql
-- RLS on write_continuations
ALTER TABLE planner.write_continuations ENABLE ROW LEVEL SECURITY;
CREATE POLICY write_continuations_tenant ON planner.write_continuations
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Permission views: intra-tenant task + plan visibility
CREATE VIEW planner.v_visible_tasks AS
SELECT t.*
FROM connector_ms365_planner.planner_tasks_cache t
WHERE t.tenant_id       = current_setting('app.tenant_id')::uuid
  AND t.soft_deleted_at IS NULL
  AND (
    -- Rule 1: actor is a plan member
    EXISTS (
      SELECT 1
      FROM connector_ms365_planner.plan_members pm
      WHERE pm.tenant_id = t.tenant_id
        AND pm.plan_id   = t.plan_id
        AND pm.user_id   = current_setting('app.user_id')
    )
    OR
    -- Rule 2: actor manages any assignee
    EXISTS (
      SELECT 1
      FROM connector_ms365_directory.directory_users du
      WHERE du.tenant_id       = t.tenant_id
        AND du.entra_object_id = ANY(t.assignee_ids)
        AND du.manager_id      = current_setting('app.user_id')
    )
  );

CREATE VIEW planner.v_visible_plans AS
SELECT p.*
FROM connector_ms365_planner.planner_plans_cache p
WHERE p.tenant_id       = current_setting('app.tenant_id')::uuid
  AND p.soft_deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM connector_ms365_planner.plan_members pm
    WHERE pm.tenant_id = p.tenant_id
      AND pm.plan_id   = p.graph_plan_id
      AND pm.user_id   = current_setting('app.user_id')
  );
```

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @seta/planner typecheck
```

- [ ] **Step 6: Commit**

```bash
git add modules/products/planner/src/schema.ts modules/products/planner/migrations/ modules/products/planner/drizzle.config.ts
git commit -m "feat(planner): planner schema with write_continuations + permission views"
```

---

## Task 3: Move + update `_continuation.ts` (schema ref change)

The continuation store is moved from `modules/products/agent` and updated to reference `planner.write_continuations` instead of `agent.write_continuations`.

**Files:**
- Create: `modules/products/planner/src/tools/write/_continuation.ts`
- Create: `modules/products/planner/src/tools/write/_continuation.test.ts`
- Create: `modules/products/planner/src/tools/write/_errors.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// modules/products/planner/src/tools/write/_continuation.test.ts
import { describe, expect, it, vi } from 'vitest'
import { ContinuationConsumed, ContinuationExpired } from './_errors'
import { createContinuationStore } from './_continuation'

function makeSql(rows: unknown[]) {
  return vi.fn<(strings: TemplateStringsArray, ...v: unknown[]) => Promise<unknown[]>>()
    .mockResolvedValue(rows)
}

describe('createContinuationStore', () => {
  it('mint inserts a row and returns a token with a dot', async () => {
    const sql = makeSql([])
    const store = createContinuationStore({ sql: sql as never, hmacKey: '00'.repeat(32), ttlMin: 10 })
    const { token } = await store.mint({
      tenantId: 't1', userId: 'u1', toolId: 'planner.update_tasks',
      payload: { updates: [] }, etagSnapshot: {},
    })
    expect(token).toContain('.')
    expect(sql).toHaveBeenCalledOnce()
  })

  it('verify throws ContinuationExpired when expiresAt is in the past', async () => {
    const past = new Date(Date.now() - 1000)
    const sql = makeSql([{
      uuid: 'test-uuid', payload: {}, etagSnapshot: {}, resultCard: null,
      expiresAt: past, consumedAt: null, userId: 'u1', toolId: 'planner.update_tasks',
      tenantId: 't1',
    }])
    const store = createContinuationStore({ sql: sql as never, hmacKey: '00'.repeat(32), ttlMin: 10 })
    await expect(
      store.verify({ token: 'test-uuid.fakesig', userId: 'u1', tenantId: 't1', toolId: 'planner.update_tasks' }),
    ).rejects.toBeInstanceOf(ContinuationExpired)
  })

  it('verify throws ContinuationConsumed when consumedAt is set', async () => {
    const sql = makeSql([{
      uuid: 'test-uuid', payload: {}, etagSnapshot: {}, resultCard: { ok: true },
      expiresAt: new Date(Date.now() + 60_000), consumedAt: new Date(),
      userId: 'u1', toolId: 'planner.update_tasks', tenantId: 't1',
    }])
    const store = createContinuationStore({ sql: sql as never, hmacKey: '00'.repeat(32), ttlMin: 10 })
    await expect(
      store.verify({ token: 'test-uuid.fakesig', userId: 'u1', tenantId: 't1', toolId: 'planner.update_tasks' }),
    ).rejects.toBeInstanceOf(ContinuationConsumed)
  })
})
```

- [ ] **Step 2: Run — verify fail**

```bash
pnpm --filter @seta/planner test:unit
```

Expected: FAIL "Cannot find module".

- [ ] **Step 3: Create `_errors.ts`** — copy from `modules/products/agent/src/tools/planner/_errors.ts` verbatim:

```typescript
// modules/products/planner/src/tools/write/_errors.ts
export class ContinuationBadHmac extends Error {
  constructor() { super('invalid continuation token') }
}

export class ContinuationConsumed extends Error {
  cachedResultCard: Record<string, unknown> | undefined
  constructor(cachedResultCard?: Record<string, unknown>) {
    super('continuation already consumed')
    this.cachedResultCard = cachedResultCard
  }
}

export class ContinuationExpired extends Error {
  constructor() { super('continuation expired') }
}

export class ContinuationUserMismatch extends Error {
  constructor() { super('continuation belongs to a different user') }
}
```

- [ ] **Step 4: Create `_continuation.ts`** — copy from `modules/products/agent/src/tools/planner/_continuation.ts`, change the two SQL table references:

Change `FROM agent.write_continuations` → `FROM planner.write_continuations` and `INTO agent.write_continuations` → `INTO planner.write_continuations` and `UPDATE agent.write_continuations` → `UPDATE planner.write_continuations`.

```typescript
// modules/products/planner/src/tools/write/_continuation.ts
import { Buffer } from 'node:buffer'
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import {
  ContinuationBadHmac, ContinuationConsumed, ContinuationExpired, ContinuationUserMismatch,
} from './_errors'

export interface ContinuationStoreDeps {
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>
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

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  const sorted = Object.keys(value as Record<string, unknown>).sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`).join(',')
  return `{${sorted}}`
}

function shaPayload(payload: unknown): string {
  return b64url(createHash('sha256').update(canonicalize(payload)).digest())
}

export function createContinuationStore(deps: ContinuationStoreDeps) {
  const now = deps.now ?? Date.now

  async function mint(input: MintInput): Promise<{ token: string; expiresAt: Date }> {
    const uuid = randomUUID()
    const sig = hmac(deps.hmacKey, [uuid, input.toolId, shaPayload(input.payload)])
    const token = `${uuid}.${sig}`
    const expiresAt = new Date(now() + deps.ttlMin * 60_000)
    await deps.sql`
      INSERT INTO planner.write_continuations
        (token, uuid, tenant_id, user_id, tool_id, payload, etag_snapshot, expires_at)
      VALUES
        (${token}, ${uuid}, ${input.tenantId}, ${input.userId}, ${input.toolId},
         ${input.payload}, ${input.etagSnapshot}, ${expiresAt})
    `
    return { token, expiresAt }
  }

  async function verify(v: VerifyInput): Promise<{
    payload: Record<string, unknown>
    etagSnapshot: Record<string, string>
  }> {
    const dotIdx = v.token.lastIndexOf('.')
    if (dotIdx < 1) throw new ContinuationBadHmac()
    const uuid = v.token.slice(0, dotIdx)
    const sig = v.token.slice(dotIdx + 1)

    const rows = await deps.sql`
      SELECT uuid, payload, etag_snapshot AS "etagSnapshot",
             result_card AS "resultCard", expires_at AS "expiresAt",
             consumed_at AS "consumedAt", user_id AS "userId", tool_id AS "toolId",
             tenant_id AS "tenantId"
      FROM planner.write_continuations
      WHERE uuid = ${uuid} AND tenant_id = ${v.tenantId}
      LIMIT 1
    `
    const row = rows[0] as {
      uuid: string; payload: Record<string, unknown>; etagSnapshot: Record<string, string>
      resultCard: Record<string, unknown> | null; expiresAt: Date; consumedAt: Date | null
      userId: string; toolId: string; tenantId: string
    } | undefined
    if (!row) throw new ContinuationBadHmac()

    const expectedSig = hmac(deps.hmacKey, [row.uuid, row.toolId, shaPayload(row.payload)])
    if (sig.length !== expectedSig.length) throw new ContinuationBadHmac()
    const a = Buffer.from(sig)
    const b = Buffer.from(expectedSig)
    if (!timingSafeEqual(a, b)) throw new ContinuationBadHmac()

    if (row.consumedAt) throw new ContinuationConsumed(row.resultCard ?? undefined)
    if (row.expiresAt.getTime() < now()) throw new ContinuationExpired()
    if (row.userId !== v.userId) throw new ContinuationUserMismatch()

    return { payload: row.payload, etagSnapshot: row.etagSnapshot }
  }

  async function markConsumed(token: string, resultCard: Record<string, unknown>): Promise<void> {
    await deps.sql`
      UPDATE planner.write_continuations
      SET consumed_at = NOW(), result_card = ${resultCard}
      WHERE token = ${token} AND consumed_at IS NULL
    `
  }

  return { mint, verify, markConsumed }
}
```

- [ ] **Step 5: Run — verify pass**

```bash
pnpm --filter @seta/planner test:unit
```

- [ ] **Step 6: Commit**

```bash
git add modules/products/planner/src/tools/write/
git commit -m "feat(planner): move continuation store — planner.write_continuations"
```

---

## Task 4: DB-first read tools (rewrite from Graph-live to Postgres)

All five existing read tools are rewritten to query `planner.v_visible_tasks` / `planner.v_visible_plans` via `sql` dep. The `ReadToolDeps` interface changes — no more `tokenForUser` / `buildClient` / `buildCache` deps; just a `sql` tagged-template function.

**Files:**
- Create: `modules/products/planner/src/tools/read/list_my_tasks.ts` + test
- Create: `modules/products/planner/src/tools/read/list_plan_tasks.ts` + test
- Create: `modules/products/planner/src/tools/read/get_task.ts` + test
- Create: `modules/products/planner/src/tools/read/list_plans.ts` + test
- Create: `modules/products/planner/src/tools/read/list_buckets.ts` + test

- [ ] **Step 1: Write failing tests**

```typescript
// modules/products/planner/src/tools/read/list_my_tasks.test.ts
import { describe, expect, it, vi } from 'vitest'
import { listMyTasksTool } from './list_my_tasks'

const makeSql = (rows: unknown[]) =>
  vi.fn<(strings: TemplateStringsArray, ...v: unknown[]) => Promise<unknown[]>>().mockResolvedValue(rows)

describe('listMyTasksTool', () => {
  it('returns tasks from planner.v_visible_tasks', async () => {
    const sql = makeSql([{ graph_task_id: 't1', title: 'Fix bug', percent_complete: 0, due_date: null, assignee_ids: ['u1'] }])
    const tool = listMyTasksTool({ sql: sql as never })
    const ctx = { surface: 'direct', abortSignal: new AbortController().signal, runId: 'r1', requestContext: { runId: 'r1', signal: new AbortController().signal, retryCount: 0, now: Date.now, generateId: () => 'id', currentDate: () => new Date() } } as never
    const result = await tool.execute({ timeRange: 'today', limit: 20 }, ctx)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.tasks).toHaveLength(1)
  })

  it('returns empty when view returns no rows', async () => {
    const sql = makeSql([])
    const tool = listMyTasksTool({ sql: sql as never })
    const ctx = { surface: 'direct', abortSignal: new AbortController().signal, runId: 'r1', requestContext: { runId: 'r1', signal: new AbortController().signal, retryCount: 0, now: Date.now, generateId: () => 'id', currentDate: () => new Date() } } as never
    const result = await tool.execute({ timeRange: 'today', limit: 20 }, ctx)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.tasks).toHaveLength(0)
      expect(result.value.summary.total).toBe(0)
    }
  })
})
```

- [ ] **Step 2: Run — verify fail**

```bash
pnpm --filter @seta/planner test:unit
```

- [ ] **Step 3: Implement `list_my_tasks.ts`**

```typescript
// modules/products/planner/src/tools/read/list_my_tasks.ts
import type { Tool } from '@seta/agent-core'
import { tenantContext } from '@seta/tenant'
import { z } from 'zod'

type DbSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>

export interface ReadToolDeps {
  sql: DbSql
}

const Input = z.object({
  timeRange: z.enum(['today', 'this_week', 'overdue', 'all']).default('today'),
  planId:    z.string().optional(),
  status:    z.enum(['not_started', 'in_progress', 'completed']).optional(),
  limit:     z.number().min(1).max(50).default(20),
})

const TaskRow = z.object({
  graph_task_id:    z.string(),
  title:            z.string(),
  percent_complete: z.number(),
  due_date:         z.coerce.date().nullable(),
  assignee_ids:     z.array(z.string()),
  plan_id:          z.string().optional(),
  priority:         z.number().optional(),
})

const Output = z.object({
  tasks:   z.array(TaskRow),
  summary: z.object({ total: z.number(), overdue: z.number(), dueToday: z.number() }),
})

function statusPredicate(status: 'not_started' | 'in_progress' | 'completed' | undefined): string {
  if (!status) return ''
  if (status === 'not_started')  return 'AND percent_complete = 0'
  if (status === 'in_progress')  return 'AND percent_complete BETWEEN 1 AND 99'
  return 'AND percent_complete = 100'
}

export function listMyTasksTool(deps: ReadToolDeps): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'planner.list_my_tasks',
    description: 'List Planner tasks assigned to the caller from the synced local database.',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { readOnlyHint: true, idempotentHint: true },
    async execute(input, _ctx) {
      try {
        const userId = tenantContext.getUserId()
        const now = new Date()
        const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999)

        const rows = (await deps.sql`
          SELECT graph_task_id, title, percent_complete, due_date, assignee_ids, plan_id, priority
          FROM planner.v_visible_tasks
          WHERE ${userId} = ANY(assignee_ids)
            ${input.timeRange === 'today'     ? deps.sql`AND (due_date <= ${todayEnd} AND percent_complete < 100 OR percent_complete BETWEEN 1 AND 99 AND due_date IS NULL)` : deps.sql``}
            ${input.timeRange === 'overdue'   ? deps.sql`AND due_date < ${now} AND percent_complete < 100` : deps.sql``}
            ${input.timeRange === 'this_week' ? deps.sql`AND due_date <= ${new Date(now.getTime() + 7 * 86400_000)} AND percent_complete < 100` : deps.sql``}
            ${input.planId   ? deps.sql`AND plan_id = ${input.planId}` : deps.sql``}
            ${input.status   ? deps.sql`${deps.sql.unsafe(statusPredicate(input.status))}` : deps.sql``}
          ORDER BY due_date NULLS LAST, priority DESC NULLS LAST
          LIMIT ${input.limit}
        `) as z.infer<typeof TaskRow>[]

        const overdue  = rows.filter((t) => t.due_date && t.due_date < now && t.percent_complete < 100).length
        const dueToday = rows.filter((t) => t.due_date && t.due_date <= todayEnd && t.percent_complete < 100).length
        return { ok: true, value: { tasks: rows, summary: { total: rows.length, overdue, dueToday } } }
      } catch (e) {
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
```

> **Note:** `deps.sql.unsafe()` is available on the postgres.js tagged-template function. If using a plain DbSql type that doesn't expose `.unsafe`, replace the status predicate with explicit conditional branches using `if/else` before the query. Check the `@seta/db` export for the actual sql type used in this project.

- [ ] **Step 4: Implement `list_plan_tasks.ts`**

```typescript
// modules/products/planner/src/tools/read/list_plan_tasks.ts
import type { Tool } from '@seta/agent-core'
import { z } from 'zod'
import type { ReadToolDeps } from './list_my_tasks'

const Input = z.object({
  planId:     z.string(),
  bucketId:   z.string().optional(),
  status:     z.enum(['not_started', 'in_progress', 'completed']).optional(),
  assigneeId: z.string().optional(),
  limit:      z.number().min(1).max(100).default(50),
})

const Output = z.object({ tasks: z.array(z.unknown()) })

export function listPlanTasksTool(deps: ReadToolDeps): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'planner.list_plan_tasks',
    description: 'List tasks in a specific Planner plan. Reads from local synced database.',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { readOnlyHint: true, idempotentHint: true },
    async execute(input, _ctx) {
      try {
        const percentFilter =
          input.status === 'not_started'  ? 'AND percent_complete = 0'    :
          input.status === 'in_progress'  ? 'AND percent_complete BETWEEN 1 AND 99' :
          input.status === 'completed'    ? 'AND percent_complete = 100'   : ''
        const rows = await deps.sql`
          SELECT *
          FROM planner.v_visible_tasks
          WHERE plan_id = ${input.planId}
            AND (${input.bucketId ?? null}::text IS NULL OR bucket_id = ${input.bucketId ?? null})
            AND (${input.assigneeId ?? null}::text IS NULL OR ${input.assigneeId ?? null} = ANY(assignee_ids))
          ORDER BY due_date NULLS LAST, priority DESC NULLS LAST
          LIMIT ${input.limit}
        `
        const filtered = percentFilter
          ? (rows as Array<{ percent_complete: number }>).filter((r) =>
              percentFilter.includes('= 0')     ? r.percent_complete === 0   :
              percentFilter.includes('BETWEEN') ? r.percent_complete > 0 && r.percent_complete < 100 :
              r.percent_complete === 100)
          : rows
        return { ok: true, value: { tasks: filtered } }
      } catch (e) {
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
```

- [ ] **Step 5: Implement `get_task.ts`**

```typescript
// modules/products/planner/src/tools/read/get_task.ts
import type { Tool } from '@seta/agent-core'
import { z } from 'zod'
import type { ReadToolDeps } from './list_my_tasks'

const Input  = z.object({ taskId: z.string() })
const Output = z.object({ task: z.unknown().nullable() })

export function getTaskTool(deps: ReadToolDeps): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'planner.get_task',
    description: 'Get details for a single Planner task including description and checklist.',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { readOnlyHint: true, idempotentHint: true },
    async execute(input, _ctx) {
      try {
        const rows = await deps.sql`
          SELECT t.*, d.description, d.checklist
          FROM planner.v_visible_tasks t
          LEFT JOIN connector_ms365_planner.planner_task_details_cache d
            ON d.graph_task_id = t.graph_task_id AND d.tenant_id = t.tenant_id
          WHERE t.graph_task_id = ${input.taskId}
          LIMIT 1
        `
        return { ok: true, value: { task: rows[0] ?? null } }
      } catch (e) {
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
```

- [ ] **Step 6: Implement `list_plans.ts`**

```typescript
// modules/products/planner/src/tools/read/list_plans.ts
import type { Tool } from '@seta/agent-core'
import { z } from 'zod'
import type { ReadToolDeps } from './list_my_tasks'

const Input  = z.object({ limit: z.number().min(1).max(50).default(20) })
const Output = z.object({ plans: z.array(z.unknown()) })

export function listPlansTool(deps: ReadToolDeps): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'planner.list_plans',
    description: 'List Planner plans the caller is a member of, from local synced database.',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { readOnlyHint: true, idempotentHint: true },
    async execute(input, _ctx) {
      try {
        const plans = await deps.sql`
          SELECT * FROM planner.v_visible_plans ORDER BY title LIMIT ${input.limit}
        `
        return { ok: true, value: { plans } }
      } catch (e) {
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
```

- [ ] **Step 7: Implement `list_buckets.ts`**

```typescript
// modules/products/planner/src/tools/read/list_buckets.ts
import type { Tool } from '@seta/agent-core'
import { tenantContext } from '@seta/tenant'
import { z } from 'zod'
import type { ReadToolDeps } from './list_my_tasks'

const Input  = z.object({ planId: z.string() })
const Output = z.object({ buckets: z.array(z.unknown()) })

export function listBucketsTool(deps: ReadToolDeps): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'planner.list_buckets',
    description: 'List Planner buckets in a plan.',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { readOnlyHint: true, idempotentHint: true },
    async execute(input, _ctx) {
      try {
        const tenantId = tenantContext.getTenantId()
        const buckets = await deps.sql`
          SELECT * FROM connector_ms365_planner.planner_buckets_cache
          WHERE plan_id = ${input.planId} AND tenant_id = ${tenantId}
            AND soft_deleted_at IS NULL
          ORDER BY order_hint
        `
        return { ok: true, value: { buckets } }
      } catch (e) {
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
```

- [ ] **Step 8: Add tests for list_plan_tasks, get_task, list_plans, list_buckets** — follow the same pattern as `list_my_tasks.test.ts`. Create `list_plan_tasks.test.ts`, `get_task.test.ts`, `list_plans.test.ts`, `list_buckets.test.ts` with one passing-rows test and one empty-rows test each.

```typescript
// modules/products/planner/src/tools/read/list_plans.test.ts
import { describe, expect, it, vi } from 'vitest'
import { listPlansTool } from './list_plans'
const makeSql = (rows: unknown[]) =>
  vi.fn<(strings: TemplateStringsArray, ...v: unknown[]) => Promise<unknown[]>>().mockResolvedValue(rows)
describe('listPlansTool', () => {
  it('returns plans from v_visible_plans', async () => {
    const sql = makeSql([{ graph_plan_id: 'p1', title: 'Atlas' }])
    const tool = listPlansTool({ sql: sql as never })
    const ctx = { surface: 'direct', abortSignal: new AbortController().signal, runId: 'r1', requestContext: { runId: 'r1', signal: new AbortController().signal, retryCount: 0, now: Date.now, generateId: () => 'id', currentDate: () => new Date() } } as never
    const result = await tool.execute({ limit: 20 }, ctx)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.plans).toHaveLength(1)
  })
})
```

- [ ] **Step 9: Run — verify pass**

```bash
pnpm --filter @seta/planner test:unit
```

- [ ] **Step 10: Commit**

```bash
git add modules/products/planner/src/tools/read/
git commit -m "feat(planner): DB-first read tools querying planner.v_visible_tasks + v_visible_plans"
```

---

## Task 5: Move write tools (copy from `modules/products/agent`, no logic changes)

The write tools work with Graph OBO and the continuation store. The only change needed is updating imports from the old agent package to the new planner paths.

**Files:**
- Create: `modules/products/planner/src/tools/write/_classify.ts`
- Create: `modules/products/planner/src/tools/write/_card.ts`
- Create: `modules/products/planner/src/tools/write/update_tasks.preview.ts`
- Create: `modules/products/planner/src/tools/write/update_tasks.commit.ts`
- Create: `modules/products/planner/src/tools/write/create_tasks.preview.ts`
- Create: `modules/products/planner/src/tools/write/create_tasks.commit.ts`
- Create: `modules/products/planner/src/tools/write/complete_tasks.preview.ts`
- Create: `modules/products/planner/src/tools/write/complete_tasks.commit.ts`
- Create: `modules/products/planner/src/tools/write/add_comments.preview.ts`
- Create: `modules/products/planner/src/tools/write/add_comments.commit.ts`
- Create: `modules/products/planner/src/tools/write/create_plan.preview.ts`
- Create: `modules/products/planner/src/tools/write/create_plan.commit.ts`

- [ ] **Step 1: Copy write tool files**

Copy each file from `modules/products/agent/src/tools/planner/write/` to `modules/products/planner/src/tools/write/`. Copy `_classify.ts` and `_card.ts` as well. Update all relative import paths:
- `from '../_continuation'` → `from './_continuation'` (same dir now)
- `from '../_errors'` → `from './_errors'`
- No other imports change — `@seta/connector-ms365-planner`, `@seta/ms-graph`, `@seta/middleware`, `@seta/tenant`, `@seta/agent-core` remain the same package names.

The `CommitDeps` and `PreviewDeps` interfaces reference `PlannerCache`, `PlannerClient`, `GraphFetch` from the connector/ms-graph packages — those imports are unchanged.

```bash
cp modules/products/agent/src/tools/planner/write/_classify.ts modules/products/planner/src/tools/write/_classify.ts
cp modules/products/agent/src/tools/planner/write/_card.ts modules/products/planner/src/tools/write/_card.ts
cp modules/products/agent/src/tools/planner/write/update_tasks.preview.ts modules/products/planner/src/tools/write/update_tasks.preview.ts
cp modules/products/agent/src/tools/planner/write/update_tasks.commit.ts modules/products/planner/src/tools/write/update_tasks.commit.ts
cp modules/products/agent/src/tools/planner/write/create_tasks.preview.ts modules/products/planner/src/tools/write/create_tasks.preview.ts
cp modules/products/agent/src/tools/planner/write/create_tasks.commit.ts modules/products/planner/src/tools/write/create_tasks.commit.ts
cp modules/products/agent/src/tools/planner/write/complete_tasks.preview.ts modules/products/planner/src/tools/write/complete_tasks.preview.ts
cp modules/products/agent/src/tools/planner/write/complete_tasks.commit.ts modules/products/planner/src/tools/write/complete_tasks.commit.ts
cp modules/products/agent/src/tools/planner/write/add_comments.preview.ts modules/products/planner/src/tools/write/add_comments.preview.ts
cp modules/products/agent/src/tools/planner/write/add_comments.commit.ts modules/products/planner/src/tools/write/add_comments.commit.ts
cp modules/products/agent/src/tools/planner/write/create_plan.preview.ts modules/products/planner/src/tools/write/create_plan.preview.ts
cp modules/products/agent/src/tools/planner/write/create_plan.commit.ts modules/products/planner/src/tools/write/create_plan.commit.ts
```

- [ ] **Step 2: Fix import paths in each copied file**

In every copied file, change:
- `from '../_continuation'` → `from './_continuation.js'`
- `from '../_errors'` → `from './_errors.js'`
- `from './_card'` → `from './_card.js'`
- `from './_classify'` → `from './_classify.js'`
- `from './update_tasks.commit'` → `from './update_tasks.commit.js'` (in complete_tasks.commit.ts)

Also remove the `.preview.ts` → `.preview` relative imports in commit files — they now import `CommitDeps` from the same write directory.

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @seta/planner typecheck
```

Fix any remaining import path issues.

- [ ] **Step 4: Commit**

```bash
git add modules/products/planner/src/tools/write/
git commit -m "feat(planner): migrate write tools from modules/products/agent"
```

---

## Task 6: New T2 read tools — semantic search, project status, 1:1 prep

**Files:**
- Create: `modules/products/planner/src/tools/read/search_tasks_semantic.ts`
- Create: `modules/products/planner/src/tools/read/get_project_status.ts`
- Create: `modules/products/planner/src/tools/read/get_one_on_one_prep.ts`

- [ ] **Step 1: Implement `search_tasks_semantic.ts`**

```typescript
// modules/products/planner/src/tools/read/search_tasks_semantic.ts
import type { Tool } from '@seta/agent-core'
import type { EmbeddingProvider } from '@seta/agent-embeddings'
import type { VectorStore } from '@seta/agent-vector'
import { tenantContext } from '@seta/tenant'
import { z } from 'zod'
import type { ReadToolDeps } from './list_my_tasks'

export interface SemanticSearchDeps extends ReadToolDeps {
  embeddings: EmbeddingProvider
  vector: VectorStore
}

const Input = z.object({
  query:  z.string().min(2),
  planId: z.string().optional(),
  topK:   z.number().min(1).max(20).default(8),
})

const Output = z.object({
  results: z.array(z.object({
    taskId:   z.string(),
    title:    z.string(),
    planId:   z.string(),
    score:    z.number(),
    snippet:  z.string(),
  })),
})

export function searchTasksSemanticTool(deps: SemanticSearchDeps): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'planner.search_tasks_semantic',
    description: 'Find Planner tasks by semantic meaning. Use for "find tasks about X", "similar to Y", "have we done Z".',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { readOnlyHint: true, idempotentHint: true },
    async execute(input, _ctx) {
      try {
        const tenantId = tenantContext.getTenantId()
        const vec = await deps.embeddings.embed(input.query)

        const chunks = await deps.vector.search({
          tenantId,
          vector: vec,
          topK: input.topK * 2,
          filter: {
            'metadata.type': 'planner_task',
            ...(input.planId ? { 'metadata.plan_id': input.planId } : {}),
          },
        })

        const taskIds = chunks.map((c) => c.sourceId)

        if (taskIds.length === 0) return { ok: true, value: { results: [] } }

        const visibleRows = (await deps.sql`
          SELECT graph_task_id, title, plan_id
          FROM planner.v_visible_tasks
          WHERE graph_task_id = ANY(${taskIds}::text[])
        `) as Array<{ graph_task_id: string; title: string; plan_id: string }>

        const visibleSet = new Set(visibleRows.map((r) => r.graph_task_id))
        const rowMap = new Map(visibleRows.map((r) => [r.graph_task_id, r]))

        const results = chunks
          .filter((c) => visibleSet.has(c.sourceId))
          .slice(0, input.topK)
          .map((c) => ({
            taskId:  c.sourceId,
            title:   rowMap.get(c.sourceId)?.title ?? '',
            planId:  rowMap.get(c.sourceId)?.plan_id ?? '',
            score:   c.score,
            snippet: c.content.slice(0, 200),
          }))

        return { ok: true, value: { results } }
      } catch (e) {
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
```

- [ ] **Step 2: Implement `get_project_status.ts`**

```typescript
// modules/products/planner/src/tools/read/get_project_status.ts
import type { Tool } from '@seta/agent-core'
import { tenantContext } from '@seta/tenant'
import PQueue from 'p-queue'
import { z } from 'zod'
import type { ReadToolDeps } from './list_my_tasks'

const Input = z.object({
  planId: z.string(),
  since:  z.string().default('7 days ago'),
})

const TaskRow = z.array(z.unknown())

const Output = z.object({
  planName:   z.string().nullable(),
  completed:  TaskRow,
  inProgress: TaskRow,
  blocked:    TaskRow,
  upcoming:   TaskRow,
  unassigned: TaskRow,
})

export function getProjectStatusTool(deps: ReadToolDeps): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'planner.get_project_status',
    description: 'Get a project status overview: completed, in-progress, blocked, upcoming, and unassigned tasks.',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { readOnlyHint: true, idempotentHint: true },
    async execute(input, _ctx) {
      try {
        const tenantId = tenantContext.getTenantId()
        const sinceDate = new Date(input.since === '7 days ago'
          ? Date.now() - 7 * 86400_000
          : input.since)
        const blockedThreshold = new Date(Date.now() - 3 * 86400_000)
        const upcomingThreshold = new Date(Date.now() + 7 * 86400_000)

        const queue = new PQueue({ concurrency: 5 })
        const [planRows, completed, inProgress, blocked, upcoming, unassigned] = await Promise.all([
          queue.add(() => deps.sql`
            SELECT title FROM connector_ms365_planner.planner_plans_cache
            WHERE graph_plan_id = ${input.planId} AND tenant_id = ${tenantId} LIMIT 1
          `),
          queue.add(() => deps.sql`
            SELECT * FROM planner.v_visible_tasks
            WHERE plan_id = ${input.planId} AND percent_complete = 100
              AND last_modified_at_graph > ${sinceDate}
            LIMIT 20
          `),
          queue.add(() => deps.sql`
            SELECT * FROM planner.v_visible_tasks
            WHERE plan_id = ${input.planId} AND percent_complete BETWEEN 1 AND 99
            LIMIT 20
          `),
          queue.add(() => deps.sql`
            SELECT * FROM planner.v_visible_tasks
            WHERE plan_id = ${input.planId} AND percent_complete BETWEEN 1 AND 99
              AND last_modified_at_graph < ${blockedThreshold}
            LIMIT 20
          `),
          queue.add(() => deps.sql`
            SELECT * FROM planner.v_visible_tasks
            WHERE plan_id = ${input.planId} AND percent_complete = 0
              AND due_date <= ${upcomingThreshold}
            LIMIT 20
          `),
          queue.add(() => deps.sql`
            SELECT * FROM planner.v_visible_tasks
            WHERE plan_id = ${input.planId} AND percent_complete < 100
              AND (assignee_ids IS NULL OR array_length(assignee_ids, 1) IS NULL)
            LIMIT 20
          `),
        ])

        const planName = (planRows as Array<{ title: string }>)[0]?.title ?? null
        return {
          ok: true,
          value: { planName, completed: completed!, inProgress: inProgress!, blocked: blocked!, upcoming: upcoming!, unassigned: unassigned! },
        }
      } catch (e) {
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
```

- [ ] **Step 3: Implement `get_one_on_one_prep.ts`**

```typescript
// modules/products/planner/src/tools/read/get_one_on_one_prep.ts
import type { Tool } from '@seta/agent-core'
import { tenantContext } from '@seta/tenant'
import { z } from 'zod'
import type { ReadToolDeps } from './list_my_tasks'

const Input = z.object({
  targetUserId: z.string(),
  lookbackDays: z.number().int().min(1).max(30).default(14),
})

const Output = z.object({
  targetName:      z.string().nullable(),
  completed:       z.array(z.unknown()),
  inProgress:      z.array(z.unknown()),
  blocked:         z.array(z.unknown()),
  workloadPercent: z.number(),
  talkingPoints:   z.array(z.string()),
})

export function getOneOnOnePrepTool(deps: ReadToolDeps): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'planner.get_one_on_one_prep',
    description: '1:1 prep: completed/in-progress/blocked tasks + workload % for a direct report.',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { readOnlyHint: true, idempotentHint: true },
    async execute(input, _ctx) {
      try {
        const tenantId = tenantContext.getTenantId()
        const userId   = tenantContext.getUserId()

        const managerCheck = await deps.sql`
          SELECT manager_id FROM connector_ms365_directory.directory_users
          WHERE entra_object_id = ${input.targetUserId} AND tenant_id = ${tenantId}
          LIMIT 1
        `
        const managerId = (managerCheck[0] as { manager_id: string | null } | undefined)?.manager_id
        if (managerId !== userId) {
          return { ok: false, error: { name: 'Forbidden', message: 'Target user is not your direct report' } }
        }

        const nameRow = (await deps.sql`
          SELECT display_name FROM connector_ms365_directory.directory_users
          WHERE entra_object_id = ${input.targetUserId} AND tenant_id = ${tenantId} LIMIT 1
        `) as Array<{ display_name: string }>
        const targetName = nameRow[0]?.display_name ?? null

        const sinceDate = new Date(Date.now() - input.lookbackDays * 86400_000)
        const blockedThreshold = new Date(Date.now() - 3 * 86400_000)

        const [completed, inProgress, allOpen] = await Promise.all([
          deps.sql`
            SELECT * FROM planner.v_visible_tasks
            WHERE ${input.targetUserId} = ANY(assignee_ids)
              AND percent_complete = 100 AND last_modified_at_graph > ${sinceDate}
            LIMIT 20
          `,
          deps.sql`
            SELECT * FROM planner.v_visible_tasks
            WHERE ${input.targetUserId} = ANY(assignee_ids)
              AND percent_complete BETWEEN 1 AND 99
            LIMIT 20
          `,
          deps.sql`
            SELECT * FROM planner.v_visible_tasks
            WHERE ${input.targetUserId} = ANY(assignee_ids) AND percent_complete < 100
          `,
        ])

        const blocked = (inProgress as Array<{ last_modified_at_graph: Date | null }>)
          .filter((t) => !t.last_modified_at_graph || t.last_modified_at_graph < blockedThreshold)

        const open    = allOpen.length
        const done    = (completed as unknown[]).length
        const workloadPercent = open + done > 0 ? Math.round((open / (open + done)) * 100) : 0

        const talkingPoints: string[] = []
        if (blocked.length > 0) talkingPoints.push(`${blocked.length} task(s) appear stuck (no update in 3+ days)`)
        if (workloadPercent > 80) talkingPoints.push('High open-task load — check if anything can be deprioritised')

        return { ok: true, value: { targetName, completed, inProgress, blocked, workloadPercent, talkingPoints } }
      } catch (e) {
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @seta/planner typecheck
```

- [ ] **Step 5: Commit**

```bash
git add modules/products/planner/src/tools/read/search_tasks_semantic.ts modules/products/planner/src/tools/read/get_project_status.ts modules/products/planner/src/tools/read/get_one_on_one_prep.ts
git commit -m "feat(planner): T2 tools — semantic search, project status, 1:1 prep"
```

---

## Task 7: TaskIndexer

**Files:**
- Create: `modules/products/planner/src/indexer.ts`

- [ ] **Step 1: Implement `indexer.ts`** (no unit test — requires vector store + embedding provider; exercised via integration)

```typescript
// modules/products/planner/src/indexer.ts
import type { EmbeddingProvider } from '@seta/agent-embeddings'
import type { VectorStore } from '@seta/agent-vector'
import PQueue from 'p-queue'

type DbSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>

export interface TaskIndexerDeps {
  sql:          DbSql
  embeddings:   EmbeddingProvider
  vector:       VectorStore
  concurrency?: number
}

interface TaskRow {
  graph_task_id: string
  tenant_id: string
  title: string
  plan_id: string
  description?: string | null
}

export function createTaskIndexer(deps: TaskIndexerDeps) {
  const queue = new PQueue({ concurrency: deps.concurrency ?? 5 })

  async function indexTasks(tenantId: string, taskIds: string[]): Promise<void> {
    await Promise.all(
      taskIds.map((taskId) =>
        queue.add(async () => {
          const rows = (await deps.sql`
            SELECT t.graph_task_id, t.tenant_id, t.title, t.plan_id, d.description
            FROM connector_ms365_planner.planner_tasks_cache t
            LEFT JOIN connector_ms365_planner.planner_task_details_cache d
              ON d.graph_task_id = t.graph_task_id AND d.tenant_id = t.tenant_id
            WHERE t.graph_task_id = ${taskId} AND t.tenant_id = ${tenantId}
            LIMIT 1
          `) as TaskRow[]

          const task = rows[0]
          if (!task) return

          const content = [task.title, task.description ?? ''].join('\n').slice(0, 2000)
          const embedding = await deps.embeddings.embed(content)

          await deps.vector.upsert({
            sourceId: task.graph_task_id,
            tenantId: task.tenant_id,
            content,
            charRange: { start: 0, end: content.length },
            metadata: { type: 'planner_task', plan_id: task.plan_id },
            embedding,
          })
        }),
      ),
    )
  }

  return { indexTasks }
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @seta/planner typecheck
```

- [ ] **Step 3: Commit**

```bash
git add modules/products/planner/src/indexer.ts
git commit -m "feat(planner): TaskIndexer — embeds changed tasks after sync"
```

---

## Task 8: Seed constants

**Files:**
- Create: `modules/products/planner/src/seeds/planner.ts`

- [ ] **Step 1: Create seed file**

```typescript
// modules/products/planner/src/seeds/planner.ts
import type { AgentProfileSeed } from '@seta/agent-server'

export const PLANNER_SLUG = 'planner'

export const PLANNER_TOOL_IDS = [
  'planner.list_my_tasks',
  'planner.list_plan_tasks',
  'planner.get_task',
  'planner.list_plans',
  'planner.list_buckets',
  'planner.search_tasks_semantic',
  'planner.get_project_status',
  'planner.get_one_on_one_prep',
  'planner.update_tasks.preview',
  'planner.update_tasks.commit',
  'planner.create_tasks.preview',
  'planner.create_tasks.commit',
  'planner.complete_tasks.preview',
  'planner.complete_tasks.commit',
  'planner.add_comments.preview',
  'planner.add_comments.commit',
  'planner.create_plan.preview',
  'planner.create_plan.commit',
]

export const PLANNER_WORKING_MEMORY_TEMPLATE = `Active context:
- Last referenced plan: {{activePlan}}
- Last referenced task: {{lastTaskId}}
- Pending clarification: {{pendingQuestion}}
- User timezone: {{timezone}}`.trim()

export const PLANNER_INSTRUCTIONS = `You are the Planner Agent for SETA International — an IT services company with offices in Vietnam, the US, Ireland, and Japan. You help employees read and manage Microsoft Planner tasks through Microsoft Teams.

Capabilities:
- Read: list tasks, get task details, search tasks by meaning, analyse workload, get project status, prepare 1:1 meeting briefs
- Write: create tasks, update tasks, mark tasks complete, add comments, create plans (all writes require a preview confirmation before executing)

You cannot access plans or tasks the user is not authorised to see. Decline politely and show the user their visible plans via list_plans.

Detect the dominant language in the user's message — English, Vietnamese, or EN-VN mix. Respond in that same dominant language. SETA's Hanoi office uses EN-VN code-switching constantly; match their style. Never switch languages mid-response.

Tool selection:
- "my tasks", "what do I have", "on my plate"           → planner.list_my_tasks
- "tasks in plan X", "show [plan name] tasks"            → planner.list_plan_tasks
- "find tasks about X", "similar to Y", "have we done Z" → planner.search_tasks_semantic
- "who's overloaded", "team capacity", "workload"        → planner.get_project_status
- "project status", "what shipped", "blocked on [plan]"  → planner.get_project_status
- "1:1 prep for [person]", "[name]'s snapshot"           → planner.get_one_on_one_prep
- creating / updating / completing / commenting          → preview tool first, commit only after explicit user confirmation
- "create a plan"                                        → planner.create_plan.preview → commit

For ambiguous write requests ask ONE focused clarifying question before calling any preview tool. Never guess plan names or assignee names — confirm with list_plans first.

Write flow — always follow this order:
1. If any required field is missing or ambiguous, ask one question.
2. Call the preview tool once you have enough information.
3. Present the preview card. Explain the proposed change clearly.
4. Wait. Do NOT call the commit tool until the user explicitly confirms.
5. On confirm: call the commit tool with the continuation_id from the preview.
6. On cancel or silence: do nothing.

Never re-supply the write payload at commit — the continuation_id contains it.

If a plan or task query returns empty because the user lacks access:
- Do not confirm or deny whether the plan exists.
- Say: "I don't have visibility into that for your account."
- Follow with the user's visible plans: call planner.list_plans.

Conversation type: {{convType}}
{{convType=personal}} → 1:1 chat. Personal queries ("my tasks", "my workload") are primary.
{{convType!=personal}} → Shared conversation. Avoid surfacing private individual details unless directly asked.

User timezone: {{timezone}}
Resolve "today", "this week", "end of day", "before US comes online" relative to this timezone. Hanoi–California gap ≈ 15 h — "handoff before EOD" means before ~17:00 ICT.`.trim()

export const PLANNER_PROFILE_SEED: AgentProfileSeed = {
  slug:                  PLANNER_SLUG,
  name:                  'Planner Agent',
  description:           'Task and plan management for Microsoft Planner',
  instructions:          PLANNER_INSTRUCTIONS,
  model:                 'default',
  toolIds:               PLANNER_TOOL_IDS,
  workingMemoryTemplate: PLANNER_WORKING_MEMORY_TEMPLATE,
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @seta/planner typecheck
```

- [ ] **Step 3: Commit**

```bash
git add modules/products/planner/src/seeds/
git commit -m "feat(planner): PLANNER_PROFILE_SEED constants"
```

---

## Task 9: Factory + public exports

**Files:**
- Create: `modules/products/planner/src/index.ts`

- [ ] **Step 1: Create `index.ts`**

```typescript
// modules/products/planner/src/index.ts
import type { Tool } from '@seta/agent-core'
import type { ConnectorRegistry } from '@seta/connector-registry'
import { createEtagStore } from '@seta/connector-ms365-planner'
import type { GraphFetch } from '@seta/ms-graph'
import type { TokenVault } from '@seta/oauth'
import type { EmbeddingProvider } from '@seta/agent-embeddings'
import type { VectorStore } from '@seta/agent-vector'
import { Unauthorized } from '@seta/middleware'
import { tenantContext } from '@seta/tenant'
import { createContinuationStore } from './tools/write/_continuation.js'
import { listMyTasksTool } from './tools/read/list_my_tasks.js'
import { listPlanTasksTool } from './tools/read/list_plan_tasks.js'
import { getTaskTool } from './tools/read/get_task.js'
import { listPlansTool } from './tools/read/list_plans.js'
import { listBucketsTool } from './tools/read/list_buckets.js'
import { searchTasksSemanticTool } from './tools/read/search_tasks_semantic.js'
import { getProjectStatusTool } from './tools/read/get_project_status.js'
import { getOneOnOnePrepTool } from './tools/read/get_one_on_one_prep.js'
import { updateTasksPreviewTool } from './tools/write/update_tasks.preview.js'
import { updateTasksCommitTool } from './tools/write/update_tasks.commit.js'
import { createTasksPreviewTool } from './tools/write/create_tasks.preview.js'
import { createTasksCommitTool } from './tools/write/create_tasks.commit.js'
import { completeTasksPreviewTool } from './tools/write/complete_tasks.preview.js'
import { completeTasksCommitTool } from './tools/write/complete_tasks.commit.js'
import { addCommentsPreviewTool } from './tools/write/add_comments.preview.js'
import { addCommentsCommitTool } from './tools/write/add_comments.commit.js'
import { createPlanPreviewTool } from './tools/write/create_plan.preview.js'
import { createPlanCommitTool } from './tools/write/create_plan.commit.js'

type DbSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>

export interface PlannerToolsDeps {
  registry: ConnectorRegistry
  vault: TokenVault
  graph: GraphFetch
  sql: DbSql
  hmacKey: string
  ttlMin: number
  batchConcurrency: number
  embeddings: EmbeddingProvider
  vector: VectorStore
}

export function createPlannerTools(deps: PlannerToolsDeps): Record<string, Tool> {
  const tokenForUser = async (tenantId: string, userId: string) => {
    const bundle = await deps.vault.get(tenantId, 'entra', `user:${userId}`)
    if (!bundle) throw new Unauthorized('no token for user')
    return { accessToken: bundle.accessToken }
  }

  const continuationStore = createContinuationStore({
    sql: deps.sql,
    hmacKey: deps.hmacKey,
    ttlMin: deps.ttlMin,
  })

  const etagStore = createEtagStore(deps.sql)

  const readDeps = { sql: deps.sql }

  const previewBase = {
    registry: deps.registry,
    tokenForUser,
    sql: deps.sql,
    continuationStore,
    ttlMinutes: deps.ttlMin,
  }

  const previewFull = { ...previewBase, etagStore }

  const commitDeps = {
    registry: deps.registry,
    tokenForUser,
    buildGraph: () => deps.graph,
    buildCache: () => ({ task: { upsert: async () => {}, softDelete: async () => {} } } as never),
    continuationStore,
    batchConcurrency: deps.batchConcurrency,
  }

  const tools = [
    listMyTasksTool(readDeps),
    listPlanTasksTool(readDeps),
    getTaskTool(readDeps),
    listPlansTool(readDeps),
    listBucketsTool(readDeps),
    searchTasksSemanticTool({ ...readDeps, embeddings: deps.embeddings, vector: deps.vector }),
    getProjectStatusTool(readDeps),
    getOneOnOnePrepTool(readDeps),
    updateTasksPreviewTool(previewFull),
    updateTasksCommitTool(commitDeps),
    createTasksPreviewTool(previewBase),
    createTasksCommitTool(commitDeps),
    completeTasksPreviewTool(previewFull),
    completeTasksCommitTool(commitDeps),
    addCommentsPreviewTool(previewBase),
    addCommentsCommitTool({ registry: deps.registry, continuationStore }),
    createPlanPreviewTool({ registry: deps.registry, continuationStore, ttlMinutes: deps.ttlMin }),
    createPlanCommitTool({
      registry: deps.registry,
      tokenForUser,
      buildGraph: () => deps.graph,
      buildCache: () => ({ task: { upsert: async () => {} } } as never),
      continuationStore,
    }),
  ]

  return Object.fromEntries(tools.map((t) => [t.id, t]))
}

export { createTaskIndexer } from './indexer.js'
export type { TaskIndexerDeps } from './indexer.js'
export { PLANNER_PROFILE_SEED, PLANNER_TOOL_IDS, PLANNER_SLUG } from './seeds/planner.js'
export { plannerSchema, writeContinuations } from './schema.js'
export type { WriteContinuationRow, NewWriteContinuation } from './schema.js'
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @seta/planner typecheck
```

Fix any type errors — particularly the `buildCache` shape in `commitDeps` (must match what the commit tools expect from `PlannerCache`).

- [ ] **Step 3: Build**

```bash
pnpm --filter @seta/planner build
```

- [ ] **Step 4: Run all tests**

```bash
pnpm --filter @seta/planner test:unit
```

- [ ] **Step 5: Commit**

```bash
git add modules/products/planner/src/index.ts
git commit -m "feat(planner): public API — createPlannerTools factory + plannerTools export"
```

---

*Plan 3 of 5. Next: Plan 4 — `@seta/analytics` ERP Module #2.*
