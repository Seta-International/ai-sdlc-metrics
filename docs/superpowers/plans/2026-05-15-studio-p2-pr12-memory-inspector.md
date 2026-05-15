# PR-12: Memory Inspector Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the memory inspector slice end-to-end: createMemoryAdminRoutes (threads list, thread, messages, working memory), Tree component, SDK methods, Studio /threads + /threads/:threadId (Tabs: Messages / Working memory) with virtualized message list.

**Architecture:** Read-only inspector in P2. Threads are tenant-scoped. Messages list virtualized for large threads. Working memory rendered as an expandable Tree; leaves show KeyValueList for primitives, raw JSON toggle via Code.

**Tech Stack:** Hono, @hono/zod-openapi, Zod 4.4.3, @seta/agent-memory (extended public exports), @seta/agent-sdk (new methods), @seta/ui (Tabs from PR-8, KeyValueList from PR-8, Searchbar from PR-8, Tree new, AgentMessageList reused, Code), @tanstack/react-virtual (new pinned dep in apps/studio).

---

## Phase 1 — `@seta/agent-memory` schemas (read-only API surface)

- [ ] **Task 1.1 — Add Zod schemas file (failing test first).** Create `platform/agent/memory/src/admin-schemas.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  MessagePage,
  ThreadDetail,
  ThreadSummary,
  WorkingMemorySnapshot,
} from './admin-schemas'

describe('agent-memory admin schemas', () => {
  it('ThreadSummary parses a minimal row', () => {
    const s = ThreadSummary.parse({
      id: '00000000-0000-0000-0000-000000000001',
      agentId: 'planner',
      userId: null,
      lastMessageAt: '2026-05-15T10:00:00.000Z',
      messageCount: 3,
      workingMemoryKeyCount: 0,
    })
    expect(s.messageCount).toBe(3)
  })

  it('ThreadDetail extends ThreadSummary with metadata', () => {
    const d = ThreadDetail.parse({
      id: '00000000-0000-0000-0000-000000000001',
      agentId: 'planner',
      userId: 'u1',
      lastMessageAt: '2026-05-15T10:00:00.000Z',
      messageCount: 3,
      workingMemoryKeyCount: 2,
      metadata: { topic: 'sprint' },
    })
    expect(d.metadata.topic).toBe('sprint')
  })

  it('MessagePage allows empty items + optional cursor', () => {
    const p = MessagePage.parse({ items: [] })
    expect(p.items).toEqual([])
    expect(p.nextCursor).toBeUndefined()
  })

  it('WorkingMemorySnapshot accepts arbitrary JSON object', () => {
    const wm = WorkingMemorySnapshot.parse({ values: { a: 1, b: { c: 'x' } } })
    expect(wm.values.a).toBe(1)
  })
})
```

Run `pnpm --filter @seta/agent-memory test:unit -- admin-schemas` → confirm failure (module missing).

- [ ] **Task 1.2 — Implement `platform/agent/memory/src/admin-schemas.ts`:**

```ts
import { z } from 'zod'

export const AdminMessagePart = z.object({
  type: z.string(),
  text: z.string().optional(),
  toolName: z.string().optional(),
  toolCallId: z.string().optional(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  errorText: z.string().optional(),
})
export type AdminMessagePart = z.infer<typeof AdminMessagePart>

export const AdminMessage = z.object({
  id: z.string(),
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  parts: z.array(AdminMessagePart),
  createdAt: z.string().datetime(),
  toolCallId: z.string().nullable().optional(),
})
export type AdminMessage = z.infer<typeof AdminMessage>

export const ThreadSummary = z.object({
  id: z.string(),
  agentId: z.string().nullable(),
  userId: z.string().nullable(),
  lastMessageAt: z.string().datetime(),
  messageCount: z.number().int().nonnegative(),
  workingMemoryKeyCount: z.number().int().nonnegative(),
})
export type ThreadSummary = z.infer<typeof ThreadSummary>

export const ThreadDetail = ThreadSummary.extend({
  metadata: z.record(z.string(), z.unknown()).default({}),
})
export type ThreadDetail = z.infer<typeof ThreadDetail>

export const MessagePage = z.object({
  items: z.array(AdminMessage),
  nextCursor: z.string().optional(),
})
export type MessagePage = z.infer<typeof MessagePage>

export const WorkingMemorySnapshot = z.object({
  resourceId: z.string().nullable(),
  values: z.record(z.string(), z.unknown()),
  rawText: z.string().nullable(),
})
export type WorkingMemorySnapshot = z.infer<typeof WorkingMemorySnapshot>

export const ThreadListQuery = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().optional(),
  agentId: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})
export type ThreadListQuery = z.infer<typeof ThreadListQuery>

export const ThreadListResponse = z.object({
  items: z.array(ThreadSummary),
  nextCursor: z.string().optional(),
})
export type ThreadListResponse = z.infer<typeof ThreadListResponse>
```

Run unit test → pass.

- [ ] **Task 1.3 — Re-export admin schemas from `platform/agent/memory/src/index.ts`:**

```ts
export {
  AdminMessage,
  AdminMessagePart,
  MessagePage,
  ThreadDetail,
  ThreadListQuery,
  ThreadListResponse,
  ThreadSummary,
  WorkingMemorySnapshot,
} from './admin-schemas'
```

- [ ] **Task 1.4 — Commit:** `git add -A && git commit -m "feat(agent-memory): add admin Zod schemas (ThreadSummary, ThreadDetail, MessagePage, WorkingMemorySnapshot)"`

---

## Phase 2 — `listThreads` admin query (cursor-paginated)

- [ ] **Task 2.1 — Failing integration test.** Create `platform/agent/memory/tests/integration/admin-list-threads.test.ts`:

```ts
import { withTenant } from '@seta/db'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { listThreadsAdmin } from '../../src/admin-queries'
import { createThread } from '../../src/thread-crud'
import { ensureMigrations, testSql, truncateMemoryTables } from './_helpers'

const tenantA = '11111111-1111-1111-1111-111111111111'

describe('listThreadsAdmin', () => {
  beforeEach(async () => {
    await ensureMigrations()
    await truncateMemoryTables()
  })
  afterAll(async () => {
    await testSql().end()
  })

  it('returns threads scoped to the tenant, newest-first', async () => {
    const sql = testSql()
    await withTenant(sql, tenantA, async (tx) => {
      await createThread(tx, tenantA, { resourceId: 'user-1', title: 't1' })
      await createThread(tx, tenantA, { resourceId: 'user-2', title: 't2' })
    })
    const page = await withTenant(sql, tenantA, (tx) =>
      listThreadsAdmin(tx, { tenantId: tenantA, limit: 50 }),
    )
    expect(page.items).toHaveLength(2)
    expect(page.items[0]?.id).toBeDefined()
    expect(page.nextCursor).toBeUndefined()
  })

  it('filters by userId (resourceId)', async () => {
    const sql = testSql()
    await withTenant(sql, tenantA, async (tx) => {
      await createThread(tx, tenantA, { resourceId: 'user-1' })
      await createThread(tx, tenantA, { resourceId: 'user-2' })
    })
    const page = await withTenant(sql, tenantA, (tx) =>
      listThreadsAdmin(tx, { tenantId: tenantA, userId: 'user-1', limit: 50 }),
    )
    expect(page.items).toHaveLength(1)
  })

  it('paginates with cursor', async () => {
    const sql = testSql()
    await withTenant(sql, tenantA, async (tx) => {
      for (let i = 0; i < 3; i++) {
        await createThread(tx, tenantA, { resourceId: `user-${i}` })
      }
    })
    const first = await withTenant(sql, tenantA, (tx) =>
      listThreadsAdmin(tx, { tenantId: tenantA, limit: 2 }),
    )
    expect(first.items).toHaveLength(2)
    expect(first.nextCursor).toBeDefined()
    const second = await withTenant(sql, tenantA, (tx) =>
      listThreadsAdmin(tx, { tenantId: tenantA, limit: 2, cursor: first.nextCursor }),
    )
    expect(second.items).toHaveLength(1)
    expect(second.nextCursor).toBeUndefined()
  })
})
```

Run `pnpm --filter @seta/agent-memory test:integration -- admin-list-threads` → confirm failure.

- [ ] **Task 2.2 — Implement `platform/agent/memory/src/admin-queries.ts` (listThreadsAdmin only for now):**

```ts
import type { TransactionSql } from 'postgres'
import type {
  MessagePage,
  ThreadDetail,
  ThreadListResponse,
  ThreadSummary,
  WorkingMemorySnapshot,
} from './admin-schemas'

interface ListThreadsArgs {
  tenantId: string
  userId?: string | undefined
  agentId?: string | undefined
  cursor?: string | undefined
  limit: number
}

interface ThreadAdminRow {
  id: string
  agent_id: string | null
  resource_id: string | null
  updated_at: Date
  message_count: number
  wm_key_count: number
  metadata: Record<string, unknown> | null
}

function encodeCursor(updatedAt: Date, id: string): string {
  return Buffer.from(`${updatedAt.toISOString()}|${id}`).toString('base64url')
}

function decodeCursor(cursor: string): { updatedAt: string; id: string } {
  const raw = Buffer.from(cursor, 'base64url').toString('utf8')
  const [updatedAt, id] = raw.split('|')
  if (!updatedAt || !id) throw new Error('invalid cursor')
  return { updatedAt, id }
}

function toSummary(r: ThreadAdminRow): ThreadSummary {
  return {
    id: r.id,
    agentId: r.agent_id,
    userId: r.resource_id,
    lastMessageAt: r.updated_at.toISOString(),
    messageCount: r.message_count,
    workingMemoryKeyCount: r.wm_key_count,
  }
}

export async function listThreadsAdmin(
  tx: TransactionSql,
  args: ListThreadsArgs,
): Promise<ThreadListResponse> {
  const userFilter = args.userId !== undefined ? tx`AND t.resource_id = ${args.userId}` : tx``
  const agentFilter =
    args.agentId !== undefined ? tx`AND (t.metadata->>'agentId') = ${args.agentId}` : tx``
  const cursorFilter = args.cursor
    ? (() => {
        const c = decodeCursor(args.cursor)
        return tx`AND (t.updated_at, t.id) < (${c.updatedAt}::timestamptz, ${c.id}::uuid)`
      })()
    : tx``

  const rows = await tx<ThreadAdminRow[]>`
    SELECT
      t.id,
      (t.metadata->>'agentId') AS agent_id,
      t.resource_id,
      t.updated_at,
      t.message_count,
      COALESCE(
        (SELECT jsonb_typeof(r.working_memory::jsonb) FROM agent_memory.resources r
          WHERE r.id = t.resource_id), null
      )::text AS _wm_unused,
      COALESCE(
        (SELECT
          CASE
            WHEN r.working_memory IS NULL THEN 0
            WHEN jsonb_typeof(NULLIF(r.working_memory,'')::jsonb) = 'object'
              THEN (SELECT COUNT(*)::int FROM jsonb_object_keys(NULLIF(r.working_memory,'')::jsonb))
            ELSE 0
          END
          FROM agent_memory.resources r WHERE r.id = t.resource_id),
        0
      ) AS wm_key_count,
      t.metadata
    FROM agent_memory.threads t
    WHERE TRUE ${userFilter} ${agentFilter} ${cursorFilter}
    ORDER BY t.updated_at DESC, t.id DESC
    LIMIT ${args.limit + 1}
  `

  const hasMore = rows.length > args.limit
  const slice = hasMore ? rows.slice(0, args.limit) : rows
  const last = slice[slice.length - 1]
  const result: ThreadListResponse = {
    items: slice.map(toSummary),
  }
  if (hasMore && last) result.nextCursor = encodeCursor(last.updated_at, last.id)
  return result
}
```

Run integration test → pass.

- [ ] **Task 2.3 — Commit:** `git commit -am "feat(agent-memory): add listThreadsAdmin cursor-paginated query"`

---

## Phase 3 — `getThreadAdmin`

- [ ] **Task 3.1 — Failing integration test.** Add to `platform/agent/memory/tests/integration/admin-get-thread.test.ts`:

```ts
import { withTenant } from '@seta/db'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { getThreadAdmin } from '../../src/admin-queries'
import { createThread } from '../../src/thread-crud'
import { ensureMigrations, testSql, truncateMemoryTables } from './_helpers'

const tenantA = '22222222-2222-2222-2222-222222222222'

describe('getThreadAdmin', () => {
  beforeEach(async () => {
    await ensureMigrations()
    await truncateMemoryTables()
  })
  afterAll(async () => {
    await testSql().end()
  })

  it('returns ThreadDetail by id', async () => {
    const sql = testSql()
    const created = await withTenant(sql, tenantA, (tx) =>
      createThread(tx, tenantA, { resourceId: 'u', title: 'x', metadata: { agentId: 'planner' } }),
    )
    const got = await withTenant(sql, tenantA, (tx) => getThreadAdmin(tx, created.id))
    expect(got?.id).toBe(created.id)
    expect(got?.agentId).toBe('planner')
    expect(got?.metadata.agentId).toBe('planner')
  })

  it('returns null when not found', async () => {
    const sql = testSql()
    const got = await withTenant(sql, tenantA, (tx) =>
      getThreadAdmin(tx, '00000000-0000-0000-0000-000000000099'),
    )
    expect(got).toBeNull()
  })
})
```

- [ ] **Task 3.2 — Implement in `admin-queries.ts`:**

```ts
export async function getThreadAdmin(
  tx: TransactionSql,
  threadId: string,
): Promise<ThreadDetail | null> {
  const rows = await tx<ThreadAdminRow[]>`
    SELECT
      t.id,
      (t.metadata->>'agentId') AS agent_id,
      t.resource_id,
      t.updated_at,
      t.message_count,
      COALESCE(
        (SELECT
          CASE
            WHEN r.working_memory IS NULL THEN 0
            WHEN jsonb_typeof(NULLIF(r.working_memory,'')::jsonb) = 'object'
              THEN (SELECT COUNT(*)::int FROM jsonb_object_keys(NULLIF(r.working_memory,'')::jsonb))
            ELSE 0
          END
          FROM agent_memory.resources r WHERE r.id = t.resource_id),
        0
      ) AS wm_key_count,
      t.metadata
    FROM agent_memory.threads t
    WHERE t.id = ${threadId}
    LIMIT 1
  `
  const r = rows[0]
  if (!r) return null
  return {
    id: r.id,
    agentId: r.agent_id,
    userId: r.resource_id,
    lastMessageAt: r.updated_at.toISOString(),
    messageCount: r.message_count,
    workingMemoryKeyCount: r.wm_key_count,
    metadata: r.metadata ?? {},
  }
}
```

Run test → pass.

- [ ] **Task 3.3 — Commit:** `git commit -am "feat(agent-memory): add getThreadAdmin"`

---

## Phase 4 — `listThreadMessagesAdmin`

- [ ] **Task 4.1 — Failing integration test.** `platform/agent/memory/tests/integration/admin-list-messages.test.ts`:

```ts
import { withTenant } from '@seta/db'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { listThreadMessagesAdmin } from '../../src/admin-queries'
import { createThread } from '../../src/thread-crud'
import { saveTurn } from '../../src/save-turn'
import { ensureMigrations, testSql, truncateMemoryTables } from './_helpers'

const tenantA = '33333333-3333-3333-3333-333333333333'

describe('listThreadMessagesAdmin', () => {
  beforeEach(async () => {
    await ensureMigrations()
    await truncateMemoryTables()
  })
  afterAll(async () => {
    await testSql().end()
  })

  it('returns admin messages oldest-first with cursor pagination', async () => {
    const sql = testSql()
    const thread = await withTenant(sql, tenantA, (tx) =>
      createThread(tx, tenantA, { resourceId: 'u' }),
    )
    await withTenant(sql, tenantA, async (tx) => {
      await saveTurn(tx, tenantA, {
        threadId: thread.id,
        resourceId: 'u',
        userMessage: { role: 'user', content: [{ type: 'text', text: 'hello' }] },
        assistantMessage: { role: 'assistant', content: [{ type: 'text', text: 'hi back' }] },
      })
    })
    const page = await withTenant(sql, tenantA, (tx) =>
      listThreadMessagesAdmin(tx, thread.id, { limit: 50 }),
    )
    expect(page.items.length).toBeGreaterThanOrEqual(2)
    expect(page.items[0]?.role).toBe('user')
  })
})
```

- [ ] **Task 4.2 — Implement in `admin-queries.ts`:**

```ts
interface MessageAdminRow {
  id: string
  role: string
  content: Array<Record<string, unknown>>
  tool_call_id: string | null
  created_at: Date
}

function toAdminMessage(r: MessageAdminRow): import('./admin-schemas').AdminMessage {
  return {
    id: r.id,
    role: r.role as 'system' | 'user' | 'assistant' | 'tool',
    parts: r.content.map((p) => ({ ...p, type: String(p.type ?? 'text') })),
    toolCallId: r.tool_call_id,
    createdAt: r.created_at.toISOString(),
  }
}

interface ListMessagesArgs {
  cursor?: string | undefined
  limit: number
}

export async function listThreadMessagesAdmin(
  tx: TransactionSql,
  threadId: string,
  args: ListMessagesArgs,
): Promise<MessagePage> {
  const cursorFilter = args.cursor
    ? (() => {
        const c = decodeCursor(args.cursor)
        return tx`AND (m.created_at, m.id) > (${c.updatedAt}::timestamptz, ${c.id}::uuid)`
      })()
    : tx``
  const rows = await tx<MessageAdminRow[]>`
    SELECT m.id, m.role, m.content, m.tool_call_id, m.created_at
    FROM agent_memory.messages m
    WHERE m.thread_id = ${threadId} ${cursorFilter}
    ORDER BY m.created_at ASC, m.id ASC
    LIMIT ${args.limit + 1}
  `
  const hasMore = rows.length > args.limit
  const slice = hasMore ? rows.slice(0, args.limit) : rows
  const last = slice[slice.length - 1]
  const out: MessagePage = { items: slice.map(toAdminMessage) }
  if (hasMore && last) out.nextCursor = encodeCursor(last.created_at, last.id)
  return out
}
```

Run test → pass.

- [ ] **Task 4.3 — Commit:** `git commit -am "feat(agent-memory): add listThreadMessagesAdmin"`

---

## Phase 5 — `getWorkingMemoryAdmin`

- [ ] **Task 5.1 — Failing integration test.** `platform/agent/memory/tests/integration/admin-working-memory.test.ts`:

```ts
import { withTenant } from '@seta/db'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { getWorkingMemoryAdmin } from '../../src/admin-queries'
import { createThread } from '../../src/thread-crud'
import { upsertWorkingMemoryByResource } from '../../src/working-memory'
import { ensureMigrations, testSql, truncateMemoryTables } from './_helpers'

const tenantA = '44444444-4444-4444-4444-444444444444'

describe('getWorkingMemoryAdmin', () => {
  beforeEach(async () => {
    await ensureMigrations()
    await truncateMemoryTables()
  })
  afterAll(async () => {
    await testSql().end()
  })

  it('returns parsed JSON values and rawText', async () => {
    const sql = testSql()
    const t = await withTenant(sql, tenantA, (tx) =>
      createThread(tx, tenantA, { resourceId: 'u' }),
    )
    await withTenant(sql, tenantA, (tx) =>
      upsertWorkingMemoryByResource(tx, tenantA, 'u', JSON.stringify({ a: 1, b: { c: 'x' } })),
    )
    const wm = await withTenant(sql, tenantA, (tx) => getWorkingMemoryAdmin(tx, t.id))
    expect(wm.resourceId).toBe('u')
    expect(wm.values.a).toBe(1)
    expect(typeof wm.rawText).toBe('string')
  })

  it('returns empty snapshot when thread has no resource', async () => {
    const sql = testSql()
    const t = await withTenant(sql, tenantA, (tx) =>
      createThread(tx, tenantA, { resourceId: 'orphan' }),
    )
    const wm = await withTenant(sql, tenantA, (tx) => getWorkingMemoryAdmin(tx, t.id))
    expect(wm.values).toEqual({})
    expect(wm.rawText).toBeNull()
  })
})
```

- [ ] **Task 5.2 — Implement in `admin-queries.ts`:**

```ts
export async function getWorkingMemoryAdmin(
  tx: TransactionSql,
  threadId: string,
): Promise<WorkingMemorySnapshot> {
  const trows = await tx<Array<{ resource_id: string | null }>>`
    SELECT resource_id FROM agent_memory.threads WHERE id = ${threadId} LIMIT 1
  `
  const t = trows[0]
  if (!t?.resource_id) return { resourceId: null, values: {}, rawText: null }
  const rrows = await tx<Array<{ working_memory: string | null }>>`
    SELECT working_memory FROM agent_memory.resources WHERE id = ${t.resource_id} LIMIT 1
  `
  const raw = rrows[0]?.working_memory ?? null
  let values: Record<string, unknown> = {}
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        values = parsed as Record<string, unknown>
      } else {
        values = { _value: parsed }
      }
    } catch {
      values = {}
    }
  }
  return { resourceId: t.resource_id, values, rawText: raw }
}
```

Run test → pass.

- [ ] **Task 5.3 — Re-export the four queries from index.ts** (append):

```ts
export {
  getThreadAdmin,
  getWorkingMemoryAdmin,
  listThreadMessagesAdmin,
  listThreadsAdmin,
} from './admin-queries'
```

- [ ] **Task 5.4 — Commit:** `git commit -am "feat(agent-memory): add getWorkingMemoryAdmin and export admin queries"`

---

## Phase 6 — `createMemoryAdminRoutes` factory

- [ ] **Task 6.1 — Failing integration test.** Create `platform/agent/memory/tests/integration/admin-routes.test.ts`:

```ts
import { withTenant } from '@seta/db'
import { tenantContext } from '@seta/tenant'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryAdminRoutes } from '../../src/admin-routes'
import { createThread } from '../../src/thread-crud'
import { ensureMigrations, testSql, truncateMemoryTables } from './_helpers'

const tenantA = '55555555-5555-5555-5555-555555555555'

function withSession() {
  return async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set('session', { userId: 'admin-user' })
    return next()
  }
}

function withMembership() {
  return async (_c: unknown, next: () => Promise<void>) => next()
}

describe('createMemoryAdminRoutes', () => {
  beforeEach(async () => {
    await ensureMigrations()
    await truncateMemoryTables()
  })
  afterAll(async () => {
    await testSql().end()
  })

  it('GET /threads returns thread list for tenant', async () => {
    const sql = testSql()
    await withTenant(sql, tenantA, (tx) => createThread(tx, tenantA, { resourceId: 'u' }))
    const app = createMemoryAdminRoutes({
      sql,
      requireSession: withSession(),
      requireTenantMembership: withMembership(),
    })
    const res = await tenantContext.run({ tenantId: tenantA, userId: 'admin-user' }, () =>
      app.request(`/threads?tenantId=${tenantA}`),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: unknown[] }
    expect(body.items.length).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Task 6.2 — Implement `platform/agent/memory/src/admin-routes.ts`:**

```ts
import type { DbSql } from '@seta/db'
import { withTenant } from '@seta/db'
import { tenantContext, tenantMiddleware } from '@seta/tenant'
import { z } from '@hono/zod-openapi'
import { Hono, type MiddlewareHandler } from 'hono'
import {
  getThreadAdmin,
  getWorkingMemoryAdmin,
  listThreadMessagesAdmin,
  listThreadsAdmin,
} from './admin-queries'
import { ThreadListQuery } from './admin-schemas'

export interface MemoryAdminRoutesOptions {
  sql: DbSql
  requireSession: MiddlewareHandler
  requireTenantMembership: MiddlewareHandler
}

const MessagesQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export function createMemoryAdminRoutes(opts: MemoryAdminRoutesOptions): Hono {
  const { sql, requireSession, requireTenantMembership } = opts
  const app = new Hono()
  app.use('*', requireSession)
  app.use('*', tenantMiddleware)
  app.use('*', requireTenantMembership)

  app.get('/threads', async (c) => {
    const parsed = ThreadListQuery.safeParse({
      tenantId: c.req.query('tenantId') ?? tenantContext.getTenantId(),
      userId: c.req.query('userId'),
      agentId: c.req.query('agentId'),
      cursor: c.req.query('cursor'),
      limit: c.req.query('limit'),
    })
    if (!parsed.success) return c.json({ error: parsed.error.message }, 400)
    const result = await withTenant(sql, parsed.data.tenantId, (tx) =>
      listThreadsAdmin(tx, parsed.data),
    )
    return c.json(result)
  })

  app.get('/threads/:threadId', async (c) => {
    const threadId = c.req.param('threadId')
    const tenantId = tenantContext.getTenantId()
    const result = await withTenant(sql, tenantId, (tx) => getThreadAdmin(tx, threadId))
    if (!result) return c.json({ error: 'not_found' }, 404)
    return c.json(result)
  })

  app.get('/threads/:threadId/messages', async (c) => {
    const threadId = c.req.param('threadId')
    const tenantId = tenantContext.getTenantId()
    const parsed = MessagesQuery.safeParse({
      cursor: c.req.query('cursor'),
      limit: c.req.query('limit'),
    })
    if (!parsed.success) return c.json({ error: parsed.error.message }, 400)
    const result = await withTenant(sql, tenantId, (tx) =>
      listThreadMessagesAdmin(tx, threadId, parsed.data),
    )
    return c.json(result)
  })

  app.get('/threads/:threadId/working-memory', async (c) => {
    const threadId = c.req.param('threadId')
    const tenantId = tenantContext.getTenantId()
    const result = await withTenant(sql, tenantId, (tx) => getWorkingMemoryAdmin(tx, threadId))
    return c.json(result)
  })

  return app
}
```

- [ ] **Task 6.3 — Add dep:** `pnpm --filter @seta/agent-memory add @hono/zod-openapi@<pin>` (use `pnpm view @hono/zod-openapi version` to choose pin matching other packages). Add `hono` as dep if not already.

- [ ] **Task 6.4 — Export factory from `platform/agent/memory/src/index.ts`:**

```ts
export { createMemoryAdminRoutes, type MemoryAdminRoutesOptions } from './admin-routes'
```

- [ ] **Task 6.5 — Run unit + integration:** `pnpm --filter @seta/agent-memory test:unit && pnpm --filter @seta/agent-memory test:integration` → all green.

- [ ] **Task 6.6 — Commit:** `git commit -am "feat(agent-memory): add createMemoryAdminRoutes (threads, messages, working memory)"`

---

## Phase 7 — `apps/api` composition

- [ ] **Task 7.1 — Compose in `apps/api/src/main.ts`.** Add import + mount (single-line diff plus import):

```ts
import { createMemoryAdminRoutes } from '@seta/agent-memory'
import { requireSession } from '@seta/identity'
import { requireTenantMembership } from '@seta/tenant'

const memoryAdmin = createMemoryAdminRoutes({ sql, requireSession, requireTenantMembership })
app.route('/', memoryAdmin)
```

- [ ] **Task 7.2 — Smoke integration test.** Add `apps/api/tests/integration/memory-admin.smoke.test.ts` that boots the Hono app, seeds one thread via `createThread`, and asserts `GET /threads?tenantId=<id>` returns 200 with at least one item. Reuse existing `_helpers.ts` patterns from agent-memory tests.

- [ ] **Task 7.3 — Run:** `pnpm --filter @seta/api test:integration -- memory-admin.smoke` → green.

- [ ] **Task 7.4 — Commit:** `git commit -am "feat(api): mount createMemoryAdminRoutes"`

---

## Phase 8 — `@seta/agent-sdk` admin methods

- [ ] **Task 8.1 — Add Zod schemas re-export.** Create `platform/agent/sdk/src/schemas/memory.ts`:

```ts
import { z } from 'zod'

export const SdkAdminMessagePart = z.object({
  type: z.string(),
  text: z.string().optional(),
  toolName: z.string().optional(),
  toolCallId: z.string().optional(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  errorText: z.string().optional(),
})

export const SdkAdminMessage = z.object({
  id: z.string(),
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  parts: z.array(SdkAdminMessagePart),
  createdAt: z.string(),
  toolCallId: z.string().nullable().optional(),
})

export const SdkThreadSummary = z.object({
  id: z.string(),
  agentId: z.string().nullable(),
  userId: z.string().nullable(),
  lastMessageAt: z.string(),
  messageCount: z.number(),
  workingMemoryKeyCount: z.number(),
})
export type SdkThreadSummary = z.infer<typeof SdkThreadSummary>

export const SdkThreadDetail = SdkThreadSummary.extend({
  metadata: z.record(z.string(), z.unknown()),
})
export type SdkThreadDetail = z.infer<typeof SdkThreadDetail>

export const SdkThreadListResponse = z.object({
  items: z.array(SdkThreadSummary),
  nextCursor: z.string().optional(),
})
export type SdkThreadListResponse = z.infer<typeof SdkThreadListResponse>

export const SdkMessagePage = z.object({
  items: z.array(SdkAdminMessage),
  nextCursor: z.string().optional(),
})
export type SdkMessagePage = z.infer<typeof SdkMessagePage>

export const SdkWorkingMemorySnapshot = z.object({
  resourceId: z.string().nullable(),
  values: z.record(z.string(), z.unknown()),
  rawText: z.string().nullable(),
})
export type SdkWorkingMemorySnapshot = z.infer<typeof SdkWorkingMemorySnapshot>
```

- [ ] **Task 8.2 — Failing unit test.** Add `platform/agent/sdk/src/client/AgentClient.memory.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { AgentClient } from './AgentClient'

function jsonResp(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('AgentClient memory methods', () => {
  it('listThreads issues GET with tenantId query', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResp({ items: [], nextCursor: undefined }))
    const c = new AgentClient({ baseUrl: 'http://x', fetch: fetchSpy as typeof fetch })
    const out = await c.listThreads('11111111-1111-1111-1111-111111111111', { userId: 'u' })
    expect(out.items).toEqual([])
    const url = String(fetchSpy.mock.calls[0]?.[0])
    expect(url).toContain('/threads?')
    expect(url).toContain('tenantId=11111111-1111-1111-1111-111111111111')
    expect(url).toContain('userId=u')
  })

  it('getThread issues GET /threads/:id', async () => {
    const body = {
      id: 't1', agentId: 'a', userId: 'u', lastMessageAt: '2026-05-15T00:00:00.000Z',
      messageCount: 0, workingMemoryKeyCount: 0, metadata: {},
    }
    const fetchSpy = vi.fn().mockResolvedValue(jsonResp(body))
    const c = new AgentClient({ baseUrl: 'http://x', fetch: fetchSpy as typeof fetch })
    const out = await c.getThread('t1')
    expect(out.id).toBe('t1')
  })

  it('listThreadMessages forwards cursor', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResp({ items: [] }))
    const c = new AgentClient({ baseUrl: 'http://x', fetch: fetchSpy as typeof fetch })
    await c.listThreadMessages('t1', { cursor: 'abc' })
    const url = String(fetchSpy.mock.calls[0]?.[0])
    expect(url).toContain('/threads/t1/messages')
    expect(url).toContain('cursor=abc')
  })

  it('getWorkingMemory returns snapshot', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(jsonResp({ resourceId: 'u', values: { a: 1 }, rawText: '{"a":1}' }))
    const c = new AgentClient({ baseUrl: 'http://x', fetch: fetchSpy as typeof fetch })
    const out = await c.getWorkingMemory('t1')
    expect(out.values).toEqual({ a: 1 })
  })
})
```

- [ ] **Task 8.3 — Extend `AgentClient` in `platform/agent/sdk/src/client/AgentClient.ts`.** Append methods inside the class:

```ts
async listThreads(
  tenantId: string,
  filters: { userId?: string; agentId?: string; cursor?: string; limit?: number } = {},
  init: { signal?: AbortSignal } = {},
): Promise<SdkThreadListResponse> {
  const qs = new URLSearchParams({ tenantId })
  if (filters.userId) qs.set('userId', filters.userId)
  if (filters.agentId) qs.set('agentId', filters.agentId)
  if (filters.cursor) qs.set('cursor', filters.cursor)
  if (filters.limit !== undefined) qs.set('limit', String(filters.limit))
  const reqInit: { schema: typeof SdkThreadListResponse; signal?: AbortSignal } = {
    schema: SdkThreadListResponse,
  }
  if (init.signal) reqInit.signal = init.signal
  return request(this.opts, `/threads?${qs.toString()}`, reqInit)
}

async getThread(
  threadId: string,
  init: { signal?: AbortSignal } = {},
): Promise<SdkThreadDetail> {
  const reqInit: { schema: typeof SdkThreadDetail; signal?: AbortSignal } = {
    schema: SdkThreadDetail,
  }
  if (init.signal) reqInit.signal = init.signal
  return request(this.opts, `/threads/${encodeURIComponent(threadId)}`, reqInit)
}

async listThreadMessages(
  threadId: string,
  page: { cursor?: string; limit?: number } = {},
  init: { signal?: AbortSignal } = {},
): Promise<SdkMessagePage> {
  const qs = new URLSearchParams()
  if (page.cursor) qs.set('cursor', page.cursor)
  if (page.limit !== undefined) qs.set('limit', String(page.limit))
  const q = qs.toString()
  const path = `/threads/${encodeURIComponent(threadId)}/messages${q ? `?${q}` : ''}`
  const reqInit: { schema: typeof SdkMessagePage; signal?: AbortSignal } = {
    schema: SdkMessagePage,
  }
  if (init.signal) reqInit.signal = init.signal
  return request(this.opts, path, reqInit)
}

async getWorkingMemory(
  threadId: string,
  init: { signal?: AbortSignal } = {},
): Promise<SdkWorkingMemorySnapshot> {
  const reqInit: { schema: typeof SdkWorkingMemorySnapshot; signal?: AbortSignal } = {
    schema: SdkWorkingMemorySnapshot,
  }
  if (init.signal) reqInit.signal = init.signal
  return request(this.opts, `/threads/${encodeURIComponent(threadId)}/working-memory`, reqInit)
}
```

Add imports at top of file:

```ts
import {
  SdkMessagePage,
  SdkThreadDetail,
  SdkThreadListResponse,
  SdkWorkingMemorySnapshot,
  type SdkThreadDetail as _SdkThreadDetail,
  type SdkThreadListResponse as _SdkThreadListResponse,
  type SdkMessagePage as _SdkMessagePage,
  type SdkWorkingMemorySnapshot as _SdkWorkingMemorySnapshot,
} from '../schemas/memory'
```

(Use unique aliases as needed to avoid type/value collision; remove dead aliases if not used.)

- [ ] **Task 8.4 — Export schemas from SDK barrel `platform/agent/sdk/src/index.ts`:**

```ts
export {
  SdkAdminMessage,
  SdkAdminMessagePart,
  SdkMessagePage,
  SdkThreadDetail,
  SdkThreadListResponse,
  SdkThreadSummary,
  SdkWorkingMemorySnapshot,
} from './schemas/memory'
```

- [ ] **Task 8.5 — Run SDK tests:** `pnpm --filter @seta/agent-sdk test:unit` → green.

- [ ] **Task 8.6 — Commit:** `git commit -am "feat(agent-sdk): add listThreads/getThread/listThreadMessages/getWorkingMemory"`

---

## Phase 9 — `@seta/ui` Tree component (TDD)

- [ ] **Task 9.1 — Failing test.** Create `platform/ui/src/components/data/Tree.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Tree, type TreeNode } from './Tree'

const nodes: TreeNode<unknown>[] = [
  {
    id: 'a',
    label: 'A',
    children: [
      { id: 'a.1', label: 'A1' },
      { id: 'a.2', label: 'A2', children: [{ id: 'a.2.x', label: 'A2X' }] },
    ],
  },
  { id: 'b', label: 'B' },
]

describe('Tree', () => {
  it('renders root nodes and respects defaultExpanded', () => {
    render(<Tree nodes={nodes} defaultExpanded={new Set(['a'])} />)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('A1')).toBeInTheDocument()
    expect(screen.queryByText('A2X')).not.toBeInTheDocument()
  })

  it('toggles expansion on click', () => {
    render(<Tree nodes={nodes} />)
    expect(screen.queryByText('A1')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('A'))
    expect(screen.getByText('A1')).toBeInTheDocument()
  })

  it('keyboard ArrowRight expands and ArrowLeft collapses', () => {
    render(<Tree nodes={nodes} />)
    const aRow = screen.getByText('A').closest('[role="treeitem"]') as HTMLElement
    aRow.focus()
    fireEvent.keyDown(aRow, { key: 'ArrowRight' })
    expect(screen.getByText('A1')).toBeInTheDocument()
    fireEvent.keyDown(aRow, { key: 'ArrowLeft' })
    expect(screen.queryByText('A1')).not.toBeInTheDocument()
  })

  it('Enter calls onNodeClick', () => {
    const onNodeClick = vi.fn()
    render(<Tree nodes={nodes} onNodeClick={onNodeClick} />)
    const b = screen.getByText('B').closest('[role="treeitem"]') as HTMLElement
    b.focus()
    fireEvent.keyDown(b, { key: 'Enter' })
    expect(onNodeClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }))
  })

  it('renderLeaf customizes leaf rendering', () => {
    render(
      <Tree
        nodes={[{ id: 'leaf', label: 'leaf', data: { v: 42 } }]}
        renderLeaf={(n) => <span data-testid="leaf">{String((n.data as { v: number }).v)}</span>}
      />,
    )
    expect(screen.getByTestId('leaf').textContent).toBe('42')
  })

  it('uses aria tree roles', () => {
    render(<Tree nodes={nodes} />)
    expect(screen.getByRole('tree')).toBeInTheDocument()
    expect(screen.getAllByRole('treeitem').length).toBeGreaterThanOrEqual(2)
  })
})
```

Run `pnpm --filter @seta/ui vitest run Tree.test` → confirm failure.

- [ ] **Task 9.2 — Implement `platform/ui/src/components/data/Tree.tsx`:**

```tsx
import { ChevronRight } from 'lucide-react'
import { type KeyboardEvent, type ReactNode, useState } from 'react'
import { cn } from '../../lib/cn'

export interface TreeNode<T = unknown> {
  id: string
  label: ReactNode
  children?: TreeNode<T>[]
  data?: T
}

export interface TreeProps<T = unknown> {
  nodes: TreeNode<T>[]
  defaultExpanded?: Set<string>
  onNodeClick?: (node: TreeNode<T>) => void
  renderLeaf?: (node: TreeNode<T>) => ReactNode
}

export function Tree<T = unknown>(props: TreeProps<T>) {
  const { nodes, defaultExpanded, onNodeClick, renderLeaf } = props
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(defaultExpanded ?? []))

  function toggle(id: string, force?: boolean) {
    setExpanded((prev) => {
      const next = new Set(prev)
      const isOpen = next.has(id)
      const shouldOpen = force ?? !isOpen
      if (shouldOpen) next.add(id)
      else next.delete(id)
      return next
    })
  }

  return (
    <div role="tree" className="text-[13px] text-ink">
      {nodes.map((n) => (
        <TreeRow
          key={n.id}
          node={n}
          depth={0}
          expanded={expanded}
          onToggle={toggle}
          onNodeClick={onNodeClick}
          renderLeaf={renderLeaf}
        />
      ))}
    </div>
  )
}

interface TreeRowProps<T> {
  node: TreeNode<T>
  depth: number
  expanded: Set<string>
  onToggle: (id: string, force?: boolean) => void
  onNodeClick?: (node: TreeNode<T>) => void
  renderLeaf?: (node: TreeNode<T>) => ReactNode
}

function TreeRow<T>(p: TreeRowProps<T>) {
  const { node, depth, expanded, onToggle, onNodeClick, renderLeaf } = p
  const hasChildren = !!node.children && node.children.length > 0
  const isOpen = expanded.has(node.id)

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowRight' && hasChildren) {
      e.preventDefault()
      onToggle(node.id, true)
    } else if (e.key === 'ArrowLeft' && hasChildren) {
      e.preventDefault()
      onToggle(node.id, false)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (hasChildren) onToggle(node.id)
      onNodeClick?.(node)
    }
  }

  return (
    <>
      <div
        role="treeitem"
        aria-expanded={hasChildren ? isOpen : undefined}
        aria-level={depth + 1}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onClick={() => {
          if (hasChildren) onToggle(node.id)
          onNodeClick?.(node)
        }}
        className={cn(
          'flex items-center gap-1 rounded px-1 py-0.5 outline-none',
          'hover:bg-canvas-soft focus:bg-canvas-soft focus:ring-1 focus:ring-primary',
          'cursor-pointer select-none',
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        {hasChildren ? (
          <ChevronRight
            className={cn('size-3 shrink-0 transition-transform', isOpen && 'rotate-90')}
            aria-hidden
          />
        ) : (
          <span className="inline-block size-3 shrink-0" aria-hidden />
        )}
        <span className="truncate">
          {!hasChildren && renderLeaf ? renderLeaf(node) : node.label}
        </span>
      </div>
      {hasChildren && isOpen && (
        <div role="group">
          {node.children?.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onNodeClick={onNodeClick}
              renderLeaf={renderLeaf}
            />
          ))}
        </div>
      )}
    </>
  )
}
```

Run test → pass.

- [ ] **Task 9.3 — Commit:** `git commit -am "feat(ui): add Tree component with keyboard navigation"`

---

## Phase 10 — Export Tree from `@seta/ui`

- [ ] **Task 10.1 — Add to `platform/ui/src/index.ts`** (alphabetical, in `Data` block):

```ts
export { Tree, type TreeNode, type TreeProps } from './components/data/Tree'
```

- [ ] **Task 10.2 — Run UI tests:** `pnpm --filter @seta/ui test:unit && pnpm --filter @seta/ui typecheck` → green.

- [ ] **Task 10.3 — Commit:** `git commit -am "feat(ui): export Tree from package barrel"`

---

## Phase 11 — Pin and add `@tanstack/react-virtual` in `apps/studio`

- [ ] **Task 11.1 — Resolve pin:** `pnpm view @tanstack/react-virtual version` → record output as `<VIRTUAL_PIN>` (e.g. `3.13.x`).

- [ ] **Task 11.2 — Add to studio:** `pnpm --filter @seta/studio add @tanstack/react-virtual@<VIRTUAL_PIN>`.

- [ ] **Task 11.3 — Verify lockfile + package.json diff** — only `apps/studio/package.json` dependencies block + `pnpm-lock.yaml` changed.

- [ ] **Task 11.4 — Commit:** `git commit -am "feat(studio): pin @tanstack/react-virtual for memory inspector"`

---

## Phase 12 — Studio query options

- [ ] **Task 12.1 — Extend `apps/studio/src/api/queries.ts`** with thread query options:

```ts
import { queryOptions } from '@tanstack/react-query'
import type { AgentClient } from '@seta/agent-sdk'

export const threadsQuery = (
  client: AgentClient,
  tenantId: string,
  filters: { userId?: string; agentId?: string } = {},
) =>
  queryOptions({
    queryKey: ['threads', tenantId, filters],
    queryFn: ({ signal }) => client.listThreads(tenantId, filters, { signal }),
  })

export const threadQuery = (client: AgentClient, threadId: string) =>
  queryOptions({
    queryKey: ['thread', threadId],
    queryFn: ({ signal }) => client.getThread(threadId, { signal }),
  })

export const threadMessagesQuery = (
  client: AgentClient,
  threadId: string,
  cursor?: string,
) =>
  queryOptions({
    queryKey: ['thread-messages', threadId, cursor ?? null],
    queryFn: ({ signal }) =>
      client.listThreadMessages(threadId, cursor ? { cursor } : {}, { signal }),
  })

export const workingMemoryQuery = (client: AgentClient, threadId: string) =>
  queryOptions({
    queryKey: ['working-memory', threadId],
    queryFn: ({ signal }) => client.getWorkingMemory(threadId, { signal }),
  })
```

- [ ] **Task 12.2 — Commit:** `git commit -am "feat(studio): add thread query options"`

---

## Phase 13a — `/tenants/:id/threads` page

- [ ] **Task 13a.1 — Create feature dir `apps/studio/src/features/threads/`** with `ThreadList.tsx`:

```tsx
import { Searchbar } from '@seta/ui'
import { DataTable, type Column } from '@seta/ui'
import type { SdkThreadSummary } from '@seta/agent-sdk'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useAgentClient } from '@seta/ui'
import { threadsQuery } from '../../api/queries'

interface Props {
  tenantId: string
}

export function ThreadList({ tenantId }: Props) {
  const client = useAgentClient()
  const [filter, setFilter] = useState('')
  const isUuid = /^[0-9a-fA-F-]{8,}$/.test(filter)
  const filters = filter ? (isUuid ? { userId: filter } : { agentId: filter }) : {}
  const { data, isLoading } = useQuery(threadsQuery(client, tenantId, filters))

  const cols: Column<SdkThreadSummary>[] = [
    {
      key: 'id',
      header: 'Thread',
      render: (r) => (
        <Link
          to="/tenants/$id/threads/$threadId"
          params={{ id: tenantId, threadId: r.id }}
          className="font-mono text-[12px] text-primary"
        >
          {r.id.slice(0, 8)}…
        </Link>
      ),
    },
    { key: 'agentId', header: 'Agent', render: (r) => r.agentId ?? '—' },
    { key: 'userId', header: 'User', render: (r) => r.userId ?? '—' },
    {
      key: 'messageCount',
      header: 'Messages',
      render: (r) => <span className="tabular-nums">{r.messageCount}</span>,
    },
    {
      key: 'lastMessageAt',
      header: 'Last message',
      render: (r) => new Date(r.lastMessageAt).toLocaleString(),
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      <Searchbar
        value={filter}
        onChange={setFilter}
        placeholder="Filter by user id (uuid) or agent id…"
      />
      <DataTable
        rows={data?.items ?? []}
        columns={cols}
        rowKey={(r) => r.id}
        loading={isLoading}
        emptyMessage="No threads yet"
      />
    </div>
  )
}
```

- [ ] **Task 13a.2 — Create route file `apps/studio/src/routes/_authed/tenants.$id.threads.tsx`:**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { ThreadList } from '../../features/threads/ThreadList'

export const Route = createFileRoute('/_authed/tenants/$id/threads')({
  component: ThreadsPage,
})

function ThreadsPage() {
  const { id } = Route.useParams()
  return <ThreadList tenantId={id} />
}
```

- [ ] **Task 13a.3 — Component test.** `apps/studio/src/features/threads/ThreadList.test.tsx` mounts the component with MSW recordings of `/threads?tenantId=…` returning two pages (cursor) and asserts the table renders the rows from page 1 and the search input filters by user id. Use the existing `test/setup.ts` + `__recordings__/sdk/*.json` pattern from PR-3.

---

## Phase 13b — `/tenants/:id/threads/:threadId` page (Tabs + virtualized + Tree)

- [ ] **Task 13b.1 — Create `apps/studio/src/features/threads/ThreadDetail.tsx`:**

```tsx
import { Code, KeyValueList, SectionCard, Tabs, TabsContent, TabsList, TabsTrigger, Tree, type TreeNode, useAgentClient } from '@seta/ui'
import type { SdkAdminMessage } from '@seta/agent-sdk'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef, useState } from 'react'
import { threadQuery, workingMemoryQuery } from '../../api/queries'
import { MessageRow } from './MessageRow'

interface Props { tenantId: string; threadId: string }

export function ThreadDetail({ threadId }: Props) {
  const client = useAgentClient()
  const { data: thread } = useQuery(threadQuery(client, threadId))
  return (
    <div className="flex flex-col gap-3">
      <SectionCard
        title={`Thread ${threadId.slice(0, 8)}…`}
        description={thread ? `${thread.messageCount} messages` : '—'}
      />
      <Tabs defaultValue="messages">
        <TabsList>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="working-memory">Working memory</TabsTrigger>
        </TabsList>
        <TabsContent value="messages">
          <MessagesTab threadId={threadId} />
        </TabsContent>
        <TabsContent value="working-memory">
          <WorkingMemoryTab threadId={threadId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function MessagesTab({ threadId }: { threadId: string }) {
  const client = useAgentClient()
  const query = useInfiniteQuery({
    queryKey: ['thread-messages-infinite', threadId],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      client.listThreadMessages(threadId, pageParam ? { cursor: pageParam } : {}, { signal }),
    getNextPageParam: (last) => last.nextCursor,
  })
  const items: SdkAdminMessage[] = query.data?.pages.flatMap((p) => p.items) ?? []
  const parentRef = useRef<HTMLDivElement>(null)
  const virt = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120,
    overscan: 5,
  })
  return (
    <div className="flex flex-col gap-2">
      <div ref={parentRef} className="h-[60vh] overflow-auto border border-hairline rounded">
        <div style={{ height: `${virt.getTotalSize()}px`, position: 'relative', width: '100%' }}>
          {virt.getVirtualItems().map((v) => {
            const m = items[v.index]
            if (!m) return null
            return (
              <div
                key={m.id}
                data-testid="virtual-message-row"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${v.start}px)`,
                }}
              >
                <MessageRow message={m} />
              </div>
            )
          })}
        </div>
      </div>
      {query.hasNextPage && (
        <button
          type="button"
          className="self-start rounded border border-hairline px-2 py-1 text-[12px]"
          onClick={() => query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
        >
          {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  )
}

function WorkingMemoryTab({ threadId }: { threadId: string }) {
  const client = useAgentClient()
  const { data } = useQuery(workingMemoryQuery(client, threadId))
  const [showRaw, setShowRaw] = useState(false)
  const nodes = toTreeNodes(data?.values ?? {})
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <button
          type="button"
          className="rounded border border-hairline px-2 py-1 text-[12px]"
          onClick={() => setShowRaw((v) => !v)}
        >
          {showRaw ? 'Tree view' : 'View JSON'}
        </button>
      </div>
      {showRaw ? (
        <Code lang="json">{data?.rawText ?? ''}</Code>
      ) : (
        <Tree
          nodes={nodes}
          renderLeaf={(n) => (
            <KeyValueList
              entries={[{ key: String(n.label), value: JSON.stringify((n.data as { v: unknown }).v) }]}
            />
          )}
        />
      )}
    </div>
  )
}

function toTreeNodes(obj: Record<string, unknown>, path = ''): TreeNode<{ v: unknown }>[] {
  return Object.entries(obj).map(([k, v]) => {
    const id = path ? `${path}.${k}` : k
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      return { id, label: k, children: toTreeNodes(v as Record<string, unknown>, id) }
    }
    return { id, label: k, data: { v } }
  })
}
```

- [ ] **Task 13b.2 — Create `apps/studio/src/features/threads/MessageRow.tsx`** reusing AgentMessageList bubble rendering pattern:

```tsx
import type { SdkAdminMessage } from '@seta/agent-sdk'
import { Code, StatusBadge } from '@seta/ui'

interface Props { message: SdkAdminMessage }

export function MessageRow({ message }: Props) {
  const isUser = message.role === 'user'
  return (
    <div className="px-3 py-2 border-b border-hairline">
      <div className="flex items-center gap-2 mb-1">
        <StatusBadge variant={isUser ? 'info' : 'neutral'}>{message.role}</StatusBadge>
        <span className="text-[12px] text-ink-subtle">
          {new Date(message.createdAt).toLocaleString()}
        </span>
      </div>
      {message.parts.map((part, idx) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: positional parts
        <PartView key={idx} part={part} />
      ))}
    </div>
  )
}

function PartView({ part }: { part: SdkAdminMessage['parts'][number] }) {
  if (part.type === 'text' && typeof part.text === 'string') {
    return <p className="text-[13px] whitespace-pre-wrap">{part.text}</p>
  }
  if (part.type === 'dynamic-tool' || part.toolName) {
    return (
      <div className="my-1 rounded-md border border-hairline bg-canvas-soft p-2">
        <StatusBadge variant="info">{part.toolName ?? 'tool'}</StatusBadge>
        {(part.input !== undefined || part.output !== undefined) && (
          <Code lang="json">
            {JSON.stringify({ input: part.input, output: part.output }, null, 2)}
          </Code>
        )}
      </div>
    )
  }
  return <span className="text-[12px] text-ink-subtle">[{part.type}]</span>
}
```

- [ ] **Task 13b.3 — Create route `apps/studio/src/routes/_authed/tenants.$id.threads.$threadId.tsx`:**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { ThreadDetail } from '../../features/threads/ThreadDetail'

export const Route = createFileRoute('/_authed/tenants/$id/threads/$threadId')({
  component: ThreadDetailPage,
})

function ThreadDetailPage() {
  const { id, threadId } = Route.useParams()
  return <ThreadDetail tenantId={id} threadId={threadId} />
}
```

- [ ] **Task 13b.4 — Commit:** `git commit -am "feat(studio): add threads list and thread detail pages with virtualized messages and working-memory Tree"`

---

## Phase 14 — `agentContext` mapping — N/A in Studio

> Studio is admin-only and does NOT mount the right-side `AgentPanel` (master plan §0). There is no `apps/studio/src/nav/agentContext.ts` to extend for `/threads` or `/threads/:threadId`. The `'threads' | 'thread-detail'` `AgentContext['page']` union values remain reserved in `@seta/ui` for OTHER Workspace modules. No commit required for this phase.

---

## Phase 15 — Component tests

- [ ] **Task 15.1 — ThreadList pagination test.** `apps/studio/src/features/threads/ThreadList.test.tsx` covers:
  - Renders initial rows from MSW recording.
  - Shows search input; typing a uuid filters by `userId`; typing a non-uuid filters by `agentId`.
  - Snapshot count of rendered `<tr>`.

- [ ] **Task 15.2 — Virtualized messages test.** `apps/studio/src/features/threads/ThreadDetail.test.tsx` mounts the component with a recording that returns 200 messages, sets the scroll container height to 600px in jsdom, asserts `screen.getAllByTestId('virtual-message-row').length < 200` (proves virtualization; only visible/overscan rows rendered).

- [ ] **Task 15.3 — Tree expand keyboard test (Studio side).** In the same `ThreadDetail.test.tsx`, switch to the Working memory tab, focus first row, press `ArrowRight`, expect a nested key to appear.

- [ ] **Task 15.4 — Run:** `pnpm --filter @seta/studio test:unit` → green.

- [ ] **Task 15.5 — Commit:** `git commit -am "test(studio): component tests for ThreadList pagination, virtualized messages, Tree keyboard"`

---

## Phase 16 — E2E

- [ ] **Task 16.1 — Create `/tests/e2e/studio/threads.spec.ts`:**

```ts
import { expect, test } from '@playwright/test'
import { seedThreadWithMessages } from './_seed'

test('memory inspector: list → detail → messages tab → working memory tab', async ({ page }) => {
  const { tenantId, threadId } = await seedThreadWithMessages({ messageCount: 30 })

  await page.goto(`/tenants/${tenantId}/threads`)
  await expect(page.getByRole('table')).toBeVisible()
  await page.getByRole('link', { name: new RegExp(threadId.slice(0, 6)) }).click()

  await expect(page.getByRole('tab', { name: 'Messages' })).toHaveAttribute(
    'data-state',
    'active',
  )
  const rows = page.getByTestId('virtual-message-row')
  await expect(rows.first()).toBeVisible()

  await page.getByRole('tab', { name: 'Working memory' }).click()
  await expect(page.getByRole('tree')).toBeVisible()

  // Expand the first key
  const firstItem = page.getByRole('treeitem').first()
  await firstItem.focus()
  await page.keyboard.press('ArrowRight')
  // any leaf value (json string) should be present
  await expect(page.getByText(/"|true|false|\d+/).first()).toBeVisible()
})
```

- [ ] **Task 16.2 — Add `tests/e2e/studio/_seed.ts`** helper that seeds via the test DB pool: inserts a thread + 30 messages + a working memory JSON `{"current_task":"x","prefs":{"theme":"dark"}}` for `resourceId="e2e-user"`. Returns `{ tenantId, threadId }`. Use `platform_admin` connection per CLAUDE.md.

- [ ] **Task 16.3 — Run E2E locally:** `pnpm test:e2e -- threads.spec.ts` → green.

- [ ] **Task 16.4 — Commit:** `git commit -am "test(e2e): seeded thread inspector flow (list → messages → working memory)"`

---

## Phase 17 — SCOPE.md updates

- [ ] **Task 17.1 — `apps/api/SCOPE.md`** — under the route-surface section, add row:

```
| GET /threads, /threads/:id, /threads/:id/messages, /threads/:id/working-memory | @seta/agent-memory.createMemoryAdminRoutes |
```

- [ ] **Task 17.2 — `apps/studio/SCOPE.md`** — under the routes section, add:

```
| /tenants/:id/threads             | Memory inspector — threads list with user/agent filter |
| /tenants/:id/threads/:threadId   | Thread detail — Messages (virtualized) + Working memory (Tree) |
```

- [ ] **Task 17.3 — Commit:** `git commit -am "docs(scope): document memory inspector routes and pages"`

---

## Phase 18 — Verification & demo state

- [ ] **Task 18.1 — Run full slate locally:** `pnpm lint && pnpm typecheck && pnpm test:unit && pnpm --filter @seta/agent-memory test:integration && pnpm --filter @seta/studio test:unit`.

- [ ] **Task 18.2 — Boot studio dev server:** `pnpm --filter @seta/studio dev`. Open `http://localhost:5173/tenants/<seeded-id>/threads`.

- [ ] **Task 18.3 — Exercise the demo:**
  - Confirm the threads table renders with seeded rows.
  - Click a thread → land on `/threads/:threadId`.
  - Messages tab: virtualized list renders, "Load more" pulls another page.
  - Working memory tab: Tree renders top-level keys; ArrowRight expands a nested key; "View JSON" toggles raw Code view.

- [ ] **Task 18.4 — Bundle-size check (CI gate per master plan §19.7):** `pnpm --filter @seta/studio build && node apps/studio/scripts/check-bundle-size.ts` → under budget.

- [ ] **Task 18.5 — Create PR** with `gh pr create`, title `feat(agent-memory,agent-sdk,ui,studio): memory inspector slice (PR-12)`.

---

## Cross-references

- Spec: `docs/superpowers/specs/2026-05-15-studio-p2-master-plan.md` §7 (route ownership table), §16 (PR-12), §18 (agent context).
- Owner: `@seta/agent-memory` (`platform/agent/memory/`) per CLAUDE.md "Schema-per-module (DDD)" and "Backend route ownership pattern".
- Reuse: `@seta/ui` `Tabs`, `KeyValueList`, `Searchbar`, `SectionCard` shipped in PR-8; `AgentMessageList` rendering pattern referenced in `MessageRow`.
- Mastra reference: `/Users/canh/Projects/Seta/mastra/packages/playground/src/domains/memory` for UX patterns (threads list + working memory inspector).
