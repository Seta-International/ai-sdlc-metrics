# PR-7: Audit Log Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the audit log viewer end-to-end: createAuditRoutes (cursor-paginated query + streaming CSV export), Drizzle indexes, SDK methods, Studio /audit page with filters + DataTable + "Load more" + Export CSV.

**Architecture:** @seta/audit exposes createAuditRoutes wrapped with requireSession + tenantMiddleware + requireTenantMembership. Cursor pagination keyed on (ts, id). CSV export streams text/csv via Hono streaming. New indexes on (tenant_id, ts), (tenant_id, actor_id, ts), (tenant_id, operation, ts). Studio uses TanStack Query cursor pagination with "Load more".

**Tech Stack:** Hono, @hono/zod-openapi, Zod 4.4.3, Drizzle (custom migration for indexes), @seta/audit, TanStack Query + Router, @seta/ui (DataTable, Select, DateRangePicker, Button).

> **Schema mapping (important):** The existing `audit.audit_log` table uses `ts`/`actor_id`/`operation` — not `created_at`/`user_id`/`tool`. This plan adapts the user-facing filter and SDK names to match the source-of-truth column names (`from`/`to` map to `ts`, `userId` filter maps to `actor_id`, `operation` is the dotted namespace already documented in `platform/audit/SCOPE.md`).

---

## Phase 1 — Drizzle indexes (custom migration)

### Task 1.1 — Verify schema state

- [ ] Read `/Users/canh/Projects/Seta/seta-os/platform/audit/src/schema.ts` to confirm columns: `id` (bigserial pk), `tenantId` (uuid), `actorType`, `actorId`, `providerId?`, `connectorId?`, `operation`, `resourceType?`, `resourceIds?`, `result`, `metadata` (jsonb), `ts` (timestamptz default now()).
- [ ] Read `/Users/canh/Projects/Seta/seta-os/platform/audit/migrations/0000_milky_omega_red.sql` to confirm only pk exists; no indexes on this table yet.
- [ ] Read `/Users/canh/Projects/Seta/seta-os/platform/audit/drizzle.config.ts` to confirm `schemaFilter: ['audit']`.

No code change in this task — research only.

### Task 1.2 — Generate empty custom migration

- [ ] Run from repo root:

```sh
pnpm --filter @seta/audit exec drizzle-kit generate --custom --name audit_query_indexes
```

- [ ] This creates `platform/audit/migrations/0001_audit_query_indexes.sql` containing only a `-- Custom SQL migration file, put your code below!` placeholder.
- [ ] Run `pnpm --filter @seta/audit exec drizzle-kit up` is **NOT** required (drizzle-kit only updates `_journal.json` on `generate`; verify the journal got a new entry).
- [ ] Confirm `platform/audit/migrations/meta/_journal.json` has a new entry for `0001_audit_query_indexes`.

### Task 1.3 — Fill in the custom migration

- [ ] Replace the contents of `platform/audit/migrations/0001_audit_query_indexes.sql` with:

```sql
-- Indexes for audit log read patterns: tenant scan, per-actor, per-operation.
-- All three start with tenant_id and end with ts DESC so cursor pagination
-- (ts, id) walks the index in reverse without a sort.

CREATE INDEX IF NOT EXISTS "audit_log_tenant_ts_idx"
  ON "audit"."audit_log" ("tenant_id", "ts" DESC, "id" DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "audit_log_tenant_actor_ts_idx"
  ON "audit"."audit_log" ("tenant_id", "actor_id", "ts" DESC, "id" DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "audit_log_tenant_operation_ts_idx"
  ON "audit"."audit_log" ("tenant_id", "operation", "ts" DESC, "id" DESC);
```

- [ ] Do NOT add a back-pointer in `schema.ts` — these are explicit DDL only, per CLAUDE.md "Can't-express cases → `drizzle-kit generate --custom`". A regen of `schema.ts`-derived migrations would otherwise drop them.

### Task 1.4 — Migration runs cleanly

- [ ] `pnpm db:up` and then from repo root: `pnpm migrate`.
- [ ] Verify all three indexes exist:

```sh
psql "$DATABASE_URL" -c "\d audit.audit_log"
```

Expect three new entries under "Indexes:" matching the names above.

Commit:

```sh
git add platform/audit/migrations/0001_audit_query_indexes.sql platform/audit/migrations/meta/_journal.json
git commit -m "feat(audit): add (tenant_id, ts), (tenant_id, actor_id, ts), (tenant_id, operation, ts) indexes"
```

---

## Phase 2 — Zod schemas (TDD)

### Task 2.1 — Add workspace deps for the routes module

- [ ] Run:

```sh
pnpm --filter @seta/audit add hono@4.10.5
pnpm --filter @seta/audit add @hono/zod-openapi@0.20.0
pnpm --filter @seta/audit add @seta/identity@workspace:* @seta/tenant@workspace:* @seta/middleware@workspace:* @seta/observability@workspace:*
```

(Confirm the pinned versions of `hono` and `@hono/zod-openapi` first via `pnpm view <pkg> version` and the lockfile of any sibling routes package such as `platform/oauth`; if those packages pin different versions, match them — never bifurcate.)

- [ ] Verify `pnpm-lock.yaml` updated; no manual `package.json` edits.

Commit:

```sh
git add platform/audit/package.json pnpm-lock.yaml
git commit -m "chore(audit): add hono + zod-openapi + sso/tenant/middleware deps for createAuditRoutes"
```

### Task 2.2 — Failing test for Zod schemas

Create `/Users/canh/Projects/Seta/seta-os/platform/audit/src/routes/schemas.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { AuditRow, QueryAuditFilters, QueryAuditResponse } from './schemas'

describe('audit Zod schemas', () => {
  it('AuditRow parses a fully-populated row', () => {
    const row = AuditRow.parse({
      id: 42,
      tenantId: '33333333-3333-3333-3333-333333333333',
      ts: '2026-05-15T12:34:56.000Z',
      actorType: 'user',
      actorId: 'user-1',
      providerId: 'entra',
      connectorId: 'planner',
      operation: 'graph.planner.tasks.patch',
      resourceType: 'task',
      resourceIds: ['t-1', 't-2'],
      result: 'ok',
      metadata: { foo: 'bar' },
    })
    expect(row.id).toBe(42)
    expect(row.resourceIds).toEqual(['t-1', 't-2'])
  })

  it('AuditRow accepts nullable optional columns', () => {
    AuditRow.parse({
      id: 1,
      tenantId: '33333333-3333-3333-3333-333333333333',
      ts: '2026-05-15T00:00:00.000Z',
      actorType: 'system',
      actorId: 'planner-sync',
      providerId: null,
      connectorId: null,
      operation: 'planner.sync.run',
      resourceType: null,
      resourceIds: null,
      result: 'failure',
      metadata: {},
    })
  })

  it('QueryAuditFilters coerces limit and parses cursor', () => {
    const f = QueryAuditFilters.parse({
      cursor: '2026-05-15T12:00:00.000Z|123',
      limit: '50',
      from: '2026-05-01',
      to: '2026-05-15',
    })
    expect(f.limit).toBe(50)
    expect(f.cursor).toBe('2026-05-15T12:00:00.000Z|123')
  })

  it('QueryAuditFilters clamps limit to [1,200] with default 50', () => {
    expect(QueryAuditFilters.parse({}).limit).toBe(50)
    expect(() => QueryAuditFilters.parse({ limit: 0 })).toThrow()
    expect(() => QueryAuditFilters.parse({ limit: 201 })).toThrow()
  })

  it('QueryAuditResponse round-trips with nextCursor', () => {
    const r = QueryAuditResponse.parse({
      items: [],
      nextCursor: '2026-05-15T00:00:00.000Z|99',
    })
    expect(r.nextCursor).toBe('2026-05-15T00:00:00.000Z|99')
  })
})
```

- [ ] Run `pnpm --filter @seta/audit test:unit` — expect failure (`./schemas` does not exist).

### Task 2.3 — Implement schemas

Create `/Users/canh/Projects/Seta/seta-os/platform/audit/src/routes/schemas.ts`:

```ts
import { z } from '@hono/zod-openapi'

export const AuditRow = z
  .object({
    id: z.number().int().nonnegative(),
    tenantId: z.string().uuid(),
    ts: z.string(),
    actorType: z.enum(['user', 'system']),
    actorId: z.string(),
    providerId: z.string().nullable(),
    connectorId: z.string().nullable(),
    operation: z.string(),
    resourceType: z.string().nullable(),
    resourceIds: z.array(z.string()).nullable(),
    result: z.enum(['ok', 'failure']),
    metadata: z.record(z.string(), z.unknown()),
  })
  .openapi('AuditRow')

export type AuditRow = z.infer<typeof AuditRow>

export const QueryAuditFilters = z
  .object({
    actorId: z.string().min(1).optional(),
    operation: z.string().min(1).optional(),
    result: z.enum(['ok', 'failure']).optional(),
    connectorId: z.string().min(1).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    cursor: z
      .string()
      .regex(/^[^|]+\|\d+$/, 'cursor must be "<iso-ts>|<id>"')
      .optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .openapi('QueryAuditFilters')

export type QueryAuditFilters = z.infer<typeof QueryAuditFilters>

export const QueryAuditResponse = z
  .object({
    items: z.array(AuditRow),
    nextCursor: z.string().optional(),
  })
  .openapi('QueryAuditResponse')

export type QueryAuditResponse = z.infer<typeof QueryAuditResponse>
```

- [ ] Run `pnpm --filter @seta/audit test:unit` — expect green.

Commit:

```sh
git add platform/audit/src/routes/schemas.ts platform/audit/src/routes/schemas.test.ts
git commit -m "feat(audit): add AuditRow, QueryAuditFilters, QueryAuditResponse Zod schemas"
```

---

## Phase 3 — queryAudit (TDD, integration)

### Task 3.1 — Failing integration test

Create `/Users/canh/Projects/Seta/seta-os/platform/audit/src/routes/queryAudit.test.ts`:

```ts
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { recordAudit } from '../writer'
import { queryAudit } from './queryAudit'

const URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
const TENANT = '44444444-4444-4444-4444-444444444441'
const OTHER = '44444444-4444-4444-4444-444444444442'

describe('queryAudit', () => {
  const sql = postgres(URL, { max: 1, prepare: false })

  beforeAll(async () => {
    await sql`DELETE FROM audit.audit_log WHERE tenant_id IN (${TENANT}, ${OTHER})`
    for (let i = 0; i < 30; i++) {
      await recordAudit(sql, {
        tenantId: TENANT,
        actor: i % 2 === 0 ? { type: 'user', userId: 'alice' } : { type: 'system', label: 'sync' },
        operation: i < 10 ? 'graph.planner.tasks.patch' : 'oauth.consent.granted',
        result: i === 7 ? 'failure' : 'ok',
        connectorId: 'planner',
        metadata: { i },
      })
    }
    // Cross-tenant noise:
    await recordAudit(sql, {
      tenantId: OTHER,
      actor: { type: 'user', userId: 'eve' },
      operation: 'graph.planner.tasks.patch',
      result: 'ok',
    })
  })

  afterAll(async () => {
    await sql`DELETE FROM audit.audit_log WHERE tenant_id IN (${TENANT}, ${OTHER})`
    await sql.end()
  })

  it('returns rows for the requested tenant only', async () => {
    const res = await queryAudit(sql, { tenantId: TENANT, limit: 50 })
    expect(res.items.length).toBe(30)
    for (const row of res.items) expect(row.tenantId).toBe(TENANT)
  })

  it('paginates by (ts DESC, id DESC) cursor', async () => {
    const first = await queryAudit(sql, { tenantId: TENANT, limit: 10 })
    expect(first.items.length).toBe(10)
    expect(first.nextCursor).toBeDefined()

    const second = await queryAudit(sql, {
      tenantId: TENANT,
      limit: 10,
      cursor: first.nextCursor!,
    })
    expect(second.items.length).toBe(10)
    // No overlap.
    const firstIds = new Set(first.items.map((r) => r.id))
    for (const r of second.items) expect(firstIds.has(r.id)).toBe(false)
  })

  it('filters by actorId', async () => {
    const res = await queryAudit(sql, { tenantId: TENANT, actorId: 'alice', limit: 50 })
    expect(res.items.length).toBe(15)
    for (const r of res.items) expect(r.actorId).toBe('alice')
  })

  it('filters by operation', async () => {
    const res = await queryAudit(sql, {
      tenantId: TENANT,
      operation: 'oauth.consent.granted',
      limit: 50,
    })
    expect(res.items.length).toBe(20)
  })

  it('filters by from/to ts window', async () => {
    const all = await queryAudit(sql, { tenantId: TENANT, limit: 50 })
    const cutoff = all.items[15]!.ts
    const res = await queryAudit(sql, { tenantId: TENANT, from: cutoff, limit: 50 })
    for (const r of res.items) expect(r.ts >= cutoff).toBe(true)
  })

  it('omits nextCursor when result set fits in one page', async () => {
    const res = await queryAudit(sql, { tenantId: TENANT, limit: 200 })
    expect(res.nextCursor).toBeUndefined()
  })
})
```

- [ ] Run `pnpm --filter @seta/audit test:unit` — expect failure.

### Task 3.2 — Implement queryAudit

Create `/Users/canh/Projects/Seta/seta-os/platform/audit/src/routes/queryAudit.ts`:

```ts
import type { Sql } from 'postgres'
import { AuditRow, type QueryAuditFilters, type QueryAuditResponse } from './schemas'

interface DbInput {
  tenantId: string
  actorId?: string
  operation?: string
  result?: 'ok' | 'failure'
  connectorId?: string
  from?: string
  to?: string
  cursor?: string
  limit?: number
}

interface AuditLogDbRow {
  id: number
  tenant_id: string
  ts: Date
  actor_type: 'user' | 'system'
  actor_id: string
  provider_id: string | null
  connector_id: string | null
  operation: string
  resource_type: string | null
  resource_ids: string[] | null
  result: 'ok' | 'failure'
  metadata: Record<string, unknown>
}

function parseCursor(cursor: string): { ts: string; id: number } {
  const idx = cursor.lastIndexOf('|')
  const ts = cursor.slice(0, idx)
  const id = Number(cursor.slice(idx + 1))
  return { ts, id }
}

function encodeCursor(row: AuditRow): string {
  return `${row.ts}|${row.id}`
}

export async function queryAudit(sql: Sql, input: DbInput): Promise<QueryAuditResponse> {
  const limit = input.limit ?? 50
  const cur = input.cursor ? parseCursor(input.cursor) : null

  const rows = await sql<AuditLogDbRow[]>`
    SELECT id, tenant_id, ts, actor_type, actor_id, provider_id, connector_id,
           operation, resource_type, resource_ids, result, metadata
      FROM audit.audit_log
     WHERE tenant_id = ${input.tenantId}
       ${input.actorId ? sql`AND actor_id = ${input.actorId}` : sql``}
       ${input.operation ? sql`AND operation = ${input.operation}` : sql``}
       ${input.result ? sql`AND result = ${input.result}` : sql``}
       ${input.connectorId ? sql`AND connector_id = ${input.connectorId}` : sql``}
       ${input.from ? sql`AND ts >= ${input.from}` : sql``}
       ${input.to ? sql`AND ts <= ${input.to}` : sql``}
       ${cur ? sql`AND (ts, id) < (${cur.ts}, ${cur.id})` : sql``}
     ORDER BY ts DESC, id DESC
     LIMIT ${limit + 1}
  `

  const overflow = rows.length > limit
  const page = overflow ? rows.slice(0, limit) : rows

  const items = page.map((r): AuditRow =>
    AuditRow.parse({
      id: r.id,
      tenantId: r.tenant_id,
      ts: r.ts.toISOString(),
      actorType: r.actor_type,
      actorId: r.actor_id,
      providerId: r.provider_id,
      connectorId: r.connector_id,
      operation: r.operation,
      resourceType: r.resource_type,
      resourceIds: r.resource_ids,
      result: r.result,
      metadata: r.metadata ?? {},
    }),
  )

  const out: QueryAuditResponse = { items }
  if (overflow) out.nextCursor = encodeCursor(items[items.length - 1]!)
  return out
}

export type { QueryAuditFilters }
```

- [ ] Run `DATABASE_URL=postgres://seta:dev@localhost:5432/seta pnpm --filter @seta/audit test:unit` — expect green (all six tests pass).

Commit:

```sh
git add platform/audit/src/routes/queryAudit.ts platform/audit/src/routes/queryAudit.test.ts
git commit -m "feat(audit): add queryAudit() cursor-paginated reader"
```

---

## Phase 4 — streamAuditCsv (TDD, unit)

### Task 4.1 — Failing unit test

Create `/Users/canh/Projects/Seta/seta-os/platform/audit/src/routes/streamAuditCsv.test.ts`:

```ts
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { recordAudit } from '../writer'
import { csvEscape, streamAuditCsv } from './streamAuditCsv'

describe('csvEscape (RFC 4180)', () => {
  it('passes plain strings through unquoted', () => {
    expect(csvEscape('hello')).toBe('hello')
  })

  it('quotes values containing a comma', () => {
    expect(csvEscape('a,b')).toBe('"a,b"')
  })

  it('quotes values containing a double quote and doubles the inner quote', () => {
    expect(csvEscape('she said "hi"')).toBe('"she said ""hi"""')
  })

  it('quotes values containing newlines', () => {
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"')
  })

  it('returns empty string for null/undefined', () => {
    expect(csvEscape(null)).toBe('')
    expect(csvEscape(undefined)).toBe('')
  })

  it('serialises objects as JSON', () => {
    expect(csvEscape({ foo: 'bar, baz' })).toBe('"{""foo"":""bar, baz""}"')
  })

  it('serialises arrays as JSON', () => {
    expect(csvEscape(['a', 'b'])).toBe('"[""a"",""b""]"')
  })
})

const URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
const TENANT = '44444444-4444-4444-4444-444444444443'

describe('streamAuditCsv', () => {
  const sql = postgres(URL, { max: 1, prepare: false })

  beforeAll(async () => {
    await sql`DELETE FROM audit.audit_log WHERE tenant_id = ${TENANT}`
    await recordAudit(sql, {
      tenantId: TENANT,
      actor: { type: 'user', userId: 'alice, the admin' },
      operation: 'graph.planner.tasks.patch',
      result: 'ok',
      resource: { type: 'task', ids: ['t-1', 't-2'] },
      metadata: { quoted: 'she said "hi"' },
    })
  })

  afterAll(async () => {
    await sql`DELETE FROM audit.audit_log WHERE tenant_id = ${TENANT}`
    await sql.end()
  })

  it('yields a header line first, then one line per row', async () => {
    const chunks: string[] = []
    for await (const chunk of streamAuditCsv(sql, { tenantId: TENANT })) chunks.push(chunk)
    expect(chunks.length).toBe(2)
    expect(chunks[0]).toBe(
      'id,ts,tenant_id,actor_type,actor_id,provider_id,connector_id,operation,resource_type,resource_ids,result,metadata\n',
    )
    expect(chunks[1]).toContain('"alice, the admin"')
    expect(chunks[1]).toContain('"she said ""hi"""')
    expect(chunks[1]!.endsWith('\n')).toBe(true)
  })
})
```

- [ ] Run `pnpm --filter @seta/audit test:unit` — expect failure.

### Task 4.2 — Implement streamAuditCsv

Create `/Users/canh/Projects/Seta/seta-os/platform/audit/src/routes/streamAuditCsv.ts`:

```ts
import type { Sql } from 'postgres'

interface DbInput {
  tenantId: string
  actorId?: string
  operation?: string
  result?: 'ok' | 'failure'
  connectorId?: string
  from?: string
  to?: string
}

interface AuditLogDbRow {
  id: number
  tenant_id: string
  ts: Date
  actor_type: 'user' | 'system'
  actor_id: string
  provider_id: string | null
  connector_id: string | null
  operation: string
  resource_type: string | null
  resource_ids: string[] | null
  result: 'ok' | 'failure'
  metadata: Record<string, unknown>
}

const HEADER = [
  'id',
  'ts',
  'tenant_id',
  'actor_type',
  'actor_id',
  'provider_id',
  'connector_id',
  'operation',
  'resource_type',
  'resource_ids',
  'result',
  'metadata',
] as const

export function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const raw = typeof v === 'string' ? v : JSON.stringify(v)
  const needsQuote = /[",\n\r]/.test(raw)
  if (!needsQuote) return raw
  return `"${raw.replace(/"/g, '""')}"`
}

function rowToCsv(r: AuditLogDbRow): string {
  return (
    [
      csvEscape(r.id),
      csvEscape(r.ts.toISOString()),
      csvEscape(r.tenant_id),
      csvEscape(r.actor_type),
      csvEscape(r.actor_id),
      csvEscape(r.provider_id),
      csvEscape(r.connector_id),
      csvEscape(r.operation),
      csvEscape(r.resource_type),
      csvEscape(r.resource_ids),
      csvEscape(r.result),
      csvEscape(r.metadata ?? {}),
    ].join(',') + '\n'
  )
}

export async function* streamAuditCsv(sql: Sql, input: DbInput): AsyncIterable<string> {
  yield `${HEADER.join(',')}\n`

  const cursor = sql<AuditLogDbRow[]>`
    SELECT id, tenant_id, ts, actor_type, actor_id, provider_id, connector_id,
           operation, resource_type, resource_ids, result, metadata
      FROM audit.audit_log
     WHERE tenant_id = ${input.tenantId}
       ${input.actorId ? sql`AND actor_id = ${input.actorId}` : sql``}
       ${input.operation ? sql`AND operation = ${input.operation}` : sql``}
       ${input.result ? sql`AND result = ${input.result}` : sql``}
       ${input.connectorId ? sql`AND connector_id = ${input.connectorId}` : sql``}
       ${input.from ? sql`AND ts >= ${input.from}` : sql``}
       ${input.to ? sql`AND ts <= ${input.to}` : sql``}
     ORDER BY ts DESC, id DESC
  `.cursor(500)

  for await (const batch of cursor) {
    for (const row of batch) yield rowToCsv(row)
  }
}
```

- [ ] Run `DATABASE_URL=… pnpm --filter @seta/audit test:unit` — expect green.

Commit:

```sh
git add platform/audit/src/routes/streamAuditCsv.ts platform/audit/src/routes/streamAuditCsv.test.ts
git commit -m "feat(audit): add streamAuditCsv() — RFC-4180 CSV streamed via postgres-js cursor"
```

---

## Phase 5 — createAuditRoutes factory

### Task 5.1 — Failing integration test for the factory

Create `/Users/canh/Projects/Seta/seta-os/platform/audit/src/routes/createAuditRoutes.test.ts`:

```ts
import { Hono } from 'hono'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { recordAudit } from '../writer'
import { createAuditRoutes } from './createAuditRoutes'

const URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
const TENANT = '44444444-4444-4444-4444-444444444444'
const USER_ID = 'test-user-1'

function buildApp(sql: ReturnType<typeof postgres>) {
  const app = new Hono()
  // Test-only auth/tenant fakes — the factory accepts middleware as injected props.
  const fakeRequireSession = async (c: any, next: any) => {
    c.set('session', { user: { id: USER_ID, email: 'a@b.com', name: 'A' } })
    return next()
  }
  const fakeTenantMiddleware = async (c: any, next: any) => {
    c.set('tenantId', TENANT)
    return next()
  }
  const fakeRequireMembership = async (_c: any, next: any) => next()
  app.route(
    '/',
    createAuditRoutes({
      sql,
      requireSession: fakeRequireSession,
      tenantMiddleware: fakeTenantMiddleware,
      requireTenantMembership: fakeRequireMembership,
    }),
  )
  return app
}

describe('createAuditRoutes', () => {
  const sql = postgres(URL, { max: 1, prepare: false })

  beforeAll(async () => {
    await sql`DELETE FROM audit.audit_log WHERE tenant_id = ${TENANT}`
    for (let i = 0; i < 5; i++) {
      await recordAudit(sql, {
        tenantId: TENANT,
        actor: { type: 'user', userId: 'alice' },
        operation: 'graph.planner.tasks.patch',
        result: 'ok',
        metadata: { i },
      })
    }
  })

  afterAll(async () => {
    await sql`DELETE FROM audit.audit_log WHERE tenant_id = ${TENANT}`
    await sql.end()
  })

  it('GET /audit returns paginated items', async () => {
    const app = buildApp(sql)
    const res = await app.request(`/audit?tenantId=${TENANT}&limit=3`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: unknown[]; nextCursor?: string }
    expect(body.items.length).toBe(3)
    expect(body.nextCursor).toBeDefined()
  })

  it('GET /audit/export.csv streams text/csv with Content-Disposition', async () => {
    const app = buildApp(sql)
    const res = await app.request(`/audit/export.csv?tenantId=${TENANT}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="audit-.+\.csv"/)
    const text = await res.text()
    const lines = text.split('\n').filter(Boolean)
    expect(lines[0]).toContain('id,ts,tenant_id')
    expect(lines.length).toBe(6) // header + 5 rows
  })

  it('GET /audit/export.csv applies filters', async () => {
    const app = buildApp(sql)
    const res = await app.request(
      `/audit/export.csv?tenantId=${TENANT}&operation=does.not.exist`,
    )
    const text = await res.text()
    const lines = text.split('\n').filter(Boolean)
    expect(lines.length).toBe(1) // header only
  })
})
```

- [ ] Run `pnpm --filter @seta/audit test:unit` — expect failure.

### Task 5.2 — Implement createAuditRoutes

Create `/Users/canh/Projects/Seta/seta-os/platform/audit/src/routes/createAuditRoutes.ts`:

```ts
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import type { MiddlewareHandler } from 'hono'
import { stream } from 'hono/streaming'
import type { Sql } from 'postgres'
import { queryAudit } from './queryAudit'
import { QueryAuditFilters, QueryAuditResponse } from './schemas'
import { streamAuditCsv } from './streamAuditCsv'

export interface CreateAuditRoutesOpts {
  sql: Sql
  requireSession: MiddlewareHandler
  tenantMiddleware: MiddlewareHandler
  requireTenantMembership: MiddlewareHandler
}

const QueryParams = QueryAuditFilters.extend({
  tenantId: z.string().uuid().openapi({ param: { name: 'tenantId', in: 'query' } }),
})

export function createAuditRoutes(opts: CreateAuditRoutesOpts): OpenAPIHono {
  const app = new OpenAPIHono()

  app.use('*', opts.requireSession)
  app.use('*', opts.tenantMiddleware)
  app.use('*', opts.requireTenantMembership)

  const listRoute = createRoute({
    method: 'get',
    path: '/audit',
    request: { query: QueryParams },
    responses: {
      200: {
        description: 'Audit log page',
        content: { 'application/json': { schema: QueryAuditResponse } },
      },
    },
  })

  app.openapi(listRoute, async (c) => {
    const q = c.req.valid('query')
    const res = await queryAudit(opts.sql, q)
    return c.json(res, 200)
  })

  app.get('/audit/export.csv', async (c) => {
    const parsed = QueryParams.safeParse(c.req.query())
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
    const filters = parsed.data
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    c.header('content-type', 'text/csv; charset=utf-8')
    c.header('content-disposition', `attachment; filename="audit-${ts}.csv"`)
    c.header('cache-control', 'no-store')
    return stream(c, async (s) => {
      for await (const chunk of streamAuditCsv(opts.sql, filters)) {
        await s.write(chunk)
      }
    })
  })

  return app
}
```

- [ ] Run `DATABASE_URL=… pnpm --filter @seta/audit test:unit` — expect green.

### Task 5.3 — Re-export public API

Edit `/Users/canh/Projects/Seta/seta-os/platform/audit/src/index.ts`:

```ts
export * from './schema'
export type { AuditActor, AuditEntry, AuditWriter } from './writer'
export { createAuditWriter, recordAudit } from './writer'
export { createAuditRoutes, type CreateAuditRoutesOpts } from './routes/createAuditRoutes'
export {
  AuditRow,
  QueryAuditFilters,
  QueryAuditResponse,
} from './routes/schemas'
export { queryAudit } from './routes/queryAudit'
export { streamAuditCsv } from './routes/streamAuditCsv'
```

- [ ] Run `pnpm --filter @seta/audit typecheck`.
- [ ] Run `pnpm --filter @seta/audit build`.

Commit:

```sh
git add platform/audit/src/routes/createAuditRoutes.ts platform/audit/src/routes/createAuditRoutes.test.ts platform/audit/src/index.ts
git commit -m "feat(audit): add createAuditRoutes — GET /audit + GET /audit/export.csv"
```

---

## Phase 6 — apps/api composition

### Task 6.1 — Mount createAuditRoutes

Diff (apply minimum surgical change — do not refactor unrelated lines):

```diff
*** a/apps/api/src/main.ts
--- b/apps/api/src/main.ts
@@
-import { createAuditWriter } from '@seta/audit'
+import { createAuditRoutes, createAuditWriter } from '@seta/audit'
@@
+import { requireSession } from '@seta/identity'
+import { requireTenantMembership, tenantMiddleware } from '@seta/tenant'
@@
 app.route('/agent', agentRouter)
+
+app.route(
+  '/',
+  createAuditRoutes({
+    sql: sql as never,
+    requireSession,
+    tenantMiddleware,
+    requireTenantMembership,
+  }),
+)
```

- [ ] Edit `apps/api/src/main.ts` to match the diff. If `requireTenantMembership` is not yet exported from `@seta/tenant` (it lands in PR-4), block this task until PR-4 has merged; do NOT stub a local copy.
- [ ] `pnpm --filter @seta/api typecheck`.

### Task 6.2 — Smoke integration test in apps/api

Create `/Users/canh/Projects/Seta/seta-os/apps/api/tests/integration/audit-routes.smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

const BASE = process.env.API_BASE_URL ?? 'http://localhost:8080'

describe('audit routes smoke', () => {
  it('GET /audit without session returns 401', async () => {
    const res = await fetch(`${BASE}/audit?tenantId=00000000-0000-0000-0000-000000000000`, {
      headers: { accept: 'application/json' },
    })
    expect([401, 403]).toContain(res.status)
  })

  it('GET /audit/export.csv without session returns 401', async () => {
    const res = await fetch(
      `${BASE}/audit/export.csv?tenantId=00000000-0000-0000-0000-000000000000`,
    )
    expect([401, 403]).toContain(res.status)
  })
})
```

- [ ] `pnpm test:integration` after `pnpm dev` is up locally — expect green.

Commit:

```sh
git add apps/api/src/main.ts apps/api/tests/integration/audit-routes.smoke.test.ts
git commit -m "feat(api): mount createAuditRoutes at /audit + /audit/export.csv"
```

---

## Phase 7 — @seta/agent-sdk additions

### Task 7.1 — Add Zod schemas mirroring @seta/audit

Create `/Users/canh/Projects/Seta/seta-os/platform/agent/sdk/src/schemas/audit.ts`:

```ts
import { z } from 'zod'

export const AuditRowSchema = z.object({
  id: z.number().int().nonnegative(),
  tenantId: z.string().uuid(),
  ts: z.string(),
  actorType: z.enum(['user', 'system']),
  actorId: z.string(),
  providerId: z.string().nullable(),
  connectorId: z.string().nullable(),
  operation: z.string(),
  resourceType: z.string().nullable(),
  resourceIds: z.array(z.string()).nullable(),
  result: z.enum(['ok', 'failure']),
  metadata: z.record(z.string(), z.unknown()),
})
export type AuditRow = z.infer<typeof AuditRowSchema>

export const QueryAuditResponseSchema = z.object({
  items: z.array(AuditRowSchema),
  nextCursor: z.string().optional(),
})
export type QueryAuditResponse = z.infer<typeof QueryAuditResponseSchema>

export interface AuditFilters {
  tenantId: string
  actorId?: string
  operation?: string
  result?: 'ok' | 'failure'
  connectorId?: string
  from?: string
  to?: string
  cursor?: string
  limit?: number
}
```

> The SDK keeps a *local* Zod copy (rather than depending on `@seta/audit`) because `@seta/audit` is a server-side package (it imports `postgres`), and the SDK is browser-targeted. Schemas are intentionally duplicated; the CI route-contract test (added below) keeps them in sync.

### Task 7.2 — Failing test for AgentClient.queryAudit + exportAuditCsv

Add to `/Users/canh/Projects/Seta/seta-os/platform/agent/sdk/src/client/AgentClient.test.ts`:

```ts
import type { AuditRow } from '../schemas/audit'

describe('AgentClient.queryAudit', () => {
  it('serialises filters as query params and parses the response', async () => {
    const sample: AuditRow = {
      id: 1,
      tenantId: 't-1',
      ts: '2026-05-15T00:00:00.000Z',
      actorType: 'user',
      actorId: 'alice',
      providerId: null,
      connectorId: 'planner',
      operation: 'graph.planner.tasks.patch',
      resourceType: 'task',
      resourceIds: ['t-1'],
      result: 'ok',
      metadata: { foo: 'bar' },
    }
    server.use(
      http.get('https://api.test/audit', ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('tenantId')).toBe('t-1')
        expect(url.searchParams.get('actorId')).toBe('alice')
        expect(url.searchParams.get('limit')).toBe('25')
        return HttpResponse.json({ items: [sample], nextCursor: '2026-05-15T00:00:00.000Z|1' })
      }),
    )
    const c = new AgentClient({ baseUrl })
    const res = await c.queryAudit({ tenantId: 't-1', actorId: 'alice', limit: 25 })
    expect(res.items[0]?.operation).toBe('graph.planner.tasks.patch')
    expect(res.nextCursor).toBe('2026-05-15T00:00:00.000Z|1')
  })

  it('throws kind=http on 403', async () => {
    server.use(http.get('https://api.test/audit', () => HttpResponse.json({}, { status: 403 })))
    const c = new AgentClient({ baseUrl })
    await expect(c.queryAudit({ tenantId: 't-1' })).rejects.toMatchObject({
      kind: 'http',
      status: 403,
    })
  })
})

describe('AgentClient.exportAuditCsv', () => {
  it('returns a ReadableStream<Uint8Array>', async () => {
    server.use(
      http.get(
        'https://api.test/audit/export.csv',
        () =>
          new HttpResponse('id,ts\n1,2026-05-15T00:00:00.000Z\n', {
            headers: {
              'content-type': 'text/csv; charset=utf-8',
              'content-disposition': 'attachment; filename="audit-2026.csv"',
            },
          }),
      ),
    )
    const c = new AgentClient({ baseUrl })
    const res = await c.exportAuditCsv({ tenantId: 't-1' })
    expect(res.body).toBeInstanceOf(ReadableStream)
    expect(res.headers.get('content-disposition')).toContain('audit-2026.csv')
    const text = await res.text()
    expect(text).toContain('id,ts')
  })

  it('forwards filters as query params', async () => {
    let captured: URLSearchParams | null = null
    server.use(
      http.get('https://api.test/audit/export.csv', ({ request }) => {
        captured = new URL(request.url).searchParams
        return new HttpResponse('id,ts\n', {
          headers: { 'content-type': 'text/csv; charset=utf-8' },
        })
      }),
    )
    const c = new AgentClient({ baseUrl })
    await c.exportAuditCsv({ tenantId: 't-1', operation: 'op.x', from: '2026-05-01' })
    expect(captured!.get('operation')).toBe('op.x')
    expect(captured!.get('from')).toBe('2026-05-01')
  })
})
```

- [ ] Run `pnpm --filter @seta/agent-sdk test:unit` — expect failure.

### Task 7.3 — Implement the methods

Edit `/Users/canh/Projects/Seta/seta-os/platform/agent/sdk/src/client/AgentClient.ts`. Add the imports and methods:

```ts
import {
  type AuditFilters,
  type QueryAuditResponse,
  QueryAuditResponseSchema,
} from '../schemas/audit'
```

Append inside the `AgentClient` class:

```ts
  queryAudit(
    filters: AuditFilters,
    init: { signal?: AbortSignal } = {},
  ): Promise<QueryAuditResponse> {
    const path = `/audit?${this.toQuery(filters)}`
    const reqInit: { schema: typeof QueryAuditResponseSchema; signal?: AbortSignal } = {
      schema: QueryAuditResponseSchema,
    }
    if (init.signal) reqInit.signal = init.signal
    return request(this.opts, path, reqInit)
  }

  exportAuditCsv(
    filters: AuditFilters,
    init: { signal?: AbortSignal } = {},
  ): Promise<Response> {
    const path = `/audit/export.csv?${this.toQuery(filters)}`
    const reqInit: {
      expect: 'stream'
      headers: Record<string, string>
      signal?: AbortSignal
    } = { expect: 'stream', headers: { accept: 'text/csv' } }
    if (init.signal) reqInit.signal = init.signal
    return request(this.opts, path, reqInit)
  }

  private toQuery(filters: AuditFilters): string {
    const u = new URLSearchParams()
    for (const [k, v] of Object.entries(filters)) {
      if (v === undefined || v === null || v === '') continue
      u.set(k, String(v))
    }
    return u.toString()
  }
```

- [ ] Run `pnpm --filter @seta/agent-sdk test:unit` — expect green for all five new assertions.

### Task 7.4 — Re-export schemas

Edit `/Users/canh/Projects/Seta/seta-os/platform/agent/sdk/src/index.ts`. Add:

```ts
export {
  AuditRowSchema,
  type AuditFilters,
  type AuditRow,
  type QueryAuditResponse,
  QueryAuditResponseSchema,
} from './schemas/audit'
```

- [ ] `pnpm --filter @seta/agent-sdk typecheck && pnpm --filter @seta/agent-sdk build`.

Commit:

```sh
git add platform/agent/sdk/src/schemas/audit.ts platform/agent/sdk/src/client/AgentClient.ts platform/agent/sdk/src/client/AgentClient.test.ts platform/agent/sdk/src/index.ts
git commit -m "feat(agent-sdk): add queryAudit + exportAuditCsv methods"
```

---

## Phase 8 — Studio query options

### Task 8.1 — Add auditQueryOptions

Edit `/Users/canh/Projects/Seta/seta-os/apps/studio/src/api/queries.ts`. Append:

```ts
import type { AuditFilters, QueryAuditResponse } from '@seta/agent-sdk'
import { infiniteQueryOptions } from '@tanstack/react-query'
import { client } from './client'

export function auditQueryOptions(filters: AuditFilters) {
  return infiniteQueryOptions<
    QueryAuditResponse,
    Error,
    { pages: QueryAuditResponse[]; pageParams: (string | undefined)[] },
    readonly unknown[],
    string | undefined
  >({
    queryKey: ['audit', filters] as const,
    initialPageParam: undefined,
    queryFn: ({ pageParam, signal }) =>
      client.queryAudit({ ...filters, cursor: pageParam }, { signal }),
    getNextPageParam: (last) => last.nextCursor,
  })
}
```

- [ ] Confirm `client.ts` exposes the singleton `AgentClient` already (per PR-3). If not, this task is blocked on PR-3.

Commit:

```sh
git add apps/studio/src/api/queries.ts
git commit -m "feat(studio): add auditQueryOptions infinite-query helper"
```

---

## Phase 9 — Studio /audit feature

### Task 9.1 — Agent panel route mapping — N/A in Studio

> Studio is admin-only and does NOT mount the right-side `AgentPanel` (master plan §0). There is no `apps/studio/src/nav/agentContext.ts` to extend for `/audit`. The `'audit'` `AgentContext['page']` value remains reserved in `@seta/ui` for OTHER Workspace modules that may surface audit context. Skip to Task 9.2.

### Task 9.2 — Filter bar component

Create `/Users/canh/Projects/Seta/seta-os/apps/studio/src/features/audit/AuditFilterBar.tsx`:

```tsx
import type { AuditFilters } from '@seta/agent-sdk'
import { DateRangePicker, Input, Select } from '@seta/ui'

interface Props {
  tenantId: string
  filters: AuditFilters
  onChange: (next: AuditFilters) => void
}

const OPERATION_OPTIONS = [
  { label: 'All', value: '' },
  { label: 'Planner: patch task', value: 'graph.planner.tasks.patch' },
  { label: 'OAuth: consent', value: 'oauth.consent.granted' },
  { label: 'Connector sync', value: 'connector.sync.run' },
]

const RESULT_OPTIONS = [
  { label: 'Any result', value: '' },
  { label: 'ok', value: 'ok' },
  { label: 'failure', value: 'failure' },
] as const

export function AuditFilterBar({ tenantId, filters, onChange }: Props) {
  const reset = (patch: Partial<AuditFilters>) =>
    onChange({ tenantId, ...filters, ...patch, cursor: undefined })

  return (
    <div className="flex flex-wrap items-center gap-3" data-testid="audit-filter-bar">
      <Input
        aria-label="Actor"
        placeholder="actor (user id or system label)"
        defaultValue={filters.actorId ?? ''}
        onBlur={(e) => reset({ actorId: e.target.value || undefined })}
      />
      <Select.Root
        value={filters.operation ?? ''}
        onValueChange={(v) => reset({ operation: v || undefined })}
      >
        <Select.Trigger aria-label="Operation" placeholder="Operation" />
        <Select.Content>
          {OPERATION_OPTIONS.map((o) => (
            <Select.Item key={o.value} value={o.value}>
              {o.label}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
      <Select.Root
        value={filters.result ?? ''}
        onValueChange={(v) => reset({ result: (v || undefined) as 'ok' | 'failure' | undefined })}
      >
        <Select.Trigger aria-label="Result" placeholder="Result" />
        <Select.Content>
          {RESULT_OPTIONS.map((o) => (
            <Select.Item key={o.value} value={o.value}>
              {o.label}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
      <DateRangePicker
        value={filters.from && filters.to ? { from: filters.from, to: filters.to } : null}
        onChange={(v) => reset({ from: v?.from, to: v?.to })}
      />
    </div>
  )
}
```

### Task 9.3 — Page route

Create `/Users/canh/Projects/Seta/seta-os/apps/studio/src/routes/_authed/tenants.$id.audit.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { AuditPage } from '../../features/audit/AuditPage'

export const Route = createFileRoute('/_authed/tenants/$id/audit')({
  component: () => {
    const { id } = Route.useParams()
    return <AuditPage tenantId={id} />
  },
})
```

### Task 9.4 — Page component (table + Load more + Export CSV)

Create `/Users/canh/Projects/Seta/seta-os/apps/studio/src/features/audit/AuditPage.tsx`:

```tsx
import type { AuditFilters, AuditRow } from '@seta/agent-sdk'
import { Button, type Column, DataTable, EmptyState } from '@seta/ui'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { client } from '../../api/client'
import { auditQueryOptions } from '../../api/queries'
import { AuditFilterBar } from './AuditFilterBar'

const COLUMNS: readonly Column<AuditRow>[] = [
  { key: 'ts', header: 'Time', cell: (r) => new Date(r.ts).toISOString() },
  { key: 'actor', header: 'Actor', cell: (r) => `${r.actorType}:${r.actorId}` },
  { key: 'operation', header: 'Operation', cell: (r) => r.operation },
  { key: 'result', header: 'Result', cell: (r) => r.result },
  {
    key: 'resource',
    header: 'Resource',
    cell: (r) => (r.resourceType ? `${r.resourceType}:${(r.resourceIds ?? []).join(',')}` : '—'),
  },
]

export function AuditPage({ tenantId }: { tenantId: string }) {
  const [filters, setFilters] = useState<AuditFilters>({ tenantId, limit: 50 })
  const q = useInfiniteQuery(auditQueryOptions(filters))

  const rows = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data])

  const onExport = async () => {
    const res = await client.exportAuditCsv(filters)
    const blob = await res.blob()
    const cd = res.headers.get('content-disposition') ?? ''
    const m = /filename="([^"]+)"/.exec(cd)
    const filename = m?.[1] ?? `audit-${Date.now()}.csv`
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-ink">Audit log</h1>
        <Button variant="ghost" onClick={onExport} data-testid="audit-export-csv">
          Export CSV
        </Button>
      </header>
      <AuditFilterBar tenantId={tenantId} filters={filters} onChange={setFilters} />
      <DataTable
        rows={rows}
        columns={COLUMNS}
        rowKey={(r) => String(r.id)}
        empty={<EmptyState title="No audit events" description="Adjust filters or try again." />}
      />
      {q.hasNextPage && (
        <div className="flex justify-center pt-2">
          <Button
            variant="ghost"
            onClick={() => q.fetchNextPage()}
            disabled={q.isFetchingNextPage}
            data-testid="audit-load-more"
          >
            {q.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </section>
  )
}
```

Commit:

```sh
git add apps/studio/src/features/audit apps/studio/src/routes/_authed/tenants.\$id.audit.tsx
git commit -m "feat(studio): add /audit page with filter bar, cursor pagination, CSV export"
```

---

## Phase 10 — Studio component tests (MSW)

### Task 10.1 — MSW recording for /audit

Create `/Users/canh/Projects/Seta/seta-os/apps/studio/src/test/__recordings__/sdk/audit.json`:

```json
{
  "page1": {
    "items": [
      {
        "id": 100,
        "tenantId": "11111111-1111-1111-1111-111111111111",
        "ts": "2026-05-15T12:00:00.000Z",
        "actorType": "user",
        "actorId": "alice",
        "providerId": null,
        "connectorId": "planner",
        "operation": "graph.planner.tasks.patch",
        "resourceType": "task",
        "resourceIds": ["t-1"],
        "result": "ok",
        "metadata": {}
      },
      {
        "id": 99,
        "tenantId": "11111111-1111-1111-1111-111111111111",
        "ts": "2026-05-15T11:00:00.000Z",
        "actorType": "system",
        "actorId": "sync",
        "providerId": null,
        "connectorId": "planner",
        "operation": "connector.sync.run",
        "resourceType": null,
        "resourceIds": null,
        "result": "ok",
        "metadata": {}
      }
    ],
    "nextCursor": "2026-05-15T11:00:00.000Z|99"
  },
  "page2": {
    "items": [
      {
        "id": 98,
        "tenantId": "11111111-1111-1111-1111-111111111111",
        "ts": "2026-05-15T10:00:00.000Z",
        "actorType": "user",
        "actorId": "bob",
        "providerId": null,
        "connectorId": null,
        "operation": "oauth.consent.granted",
        "resourceType": null,
        "resourceIds": null,
        "result": "ok",
        "metadata": {}
      }
    ]
  }
}
```

### Task 10.2 — AuditPage tests

Create `/Users/canh/Projects/Seta/seta-os/apps/studio/src/features/audit/AuditPage.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../../test/setup'
import audit from '../../test/__recordings__/sdk/audit.json'
import { AuditPage } from './AuditPage'

const TENANT = '11111111-1111-1111-1111-111111111111'

function withClient(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>
}

describe('AuditPage', () => {
  it('renders the first page and appends on Load more', async () => {
    let call = 0
    server.use(
      http.get('http://localhost/audit', ({ request }) => {
        call++
        const cursor = new URL(request.url).searchParams.get('cursor')
        if (!cursor) return HttpResponse.json(audit.page1)
        return HttpResponse.json(audit.page2)
      }),
    )
    render(withClient(<AuditPage tenantId={TENANT} />))
    await waitFor(() => expect(screen.getByText('graph.planner.tasks.patch')).toBeInTheDocument())
    expect(screen.getByText('connector.sync.run')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('audit-load-more'))
    await waitFor(() => expect(screen.getByText('oauth.consent.granted')).toBeInTheDocument())
    expect(call).toBe(2)
  })

  it('resets the cursor when a filter changes', async () => {
    const captured: (string | null)[] = []
    server.use(
      http.get('http://localhost/audit', ({ request }) => {
        captured.push(new URL(request.url).searchParams.get('cursor'))
        return HttpResponse.json({ items: [], nextCursor: undefined })
      }),
    )
    render(withClient(<AuditPage tenantId={TENANT} />))
    await waitFor(() => expect(captured.length).toBeGreaterThan(0))
    const actor = screen.getByPlaceholderText(/actor/i)
    await userEvent.type(actor, 'alice')
    actor.blur()
    await waitFor(() => expect(captured.length).toBeGreaterThanOrEqual(2))
    // Every refetch starts with no cursor.
    for (const c of captured) expect(c).toBeNull()
  })

  it('Export CSV triggers a blob download with the server-provided filename', async () => {
    server.use(
      http.get('http://localhost/audit', () => HttpResponse.json(audit.page1)),
      http.get(
        'http://localhost/audit/export.csv',
        () =>
          new HttpResponse('id,ts\n100,2026-05-15T12:00:00.000Z\n', {
            headers: {
              'content-type': 'text/csv; charset=utf-8',
              'content-disposition': 'attachment; filename="audit-2026-05-15.csv"',
            },
          }),
      ),
    )
    const createObjectURL = vi.fn().mockReturnValue('blob:fake')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true })

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(withClient(<AuditPage tenantId={TENANT} />))
    await waitFor(() => expect(screen.getByText('graph.planner.tasks.patch')).toBeInTheDocument())
    await userEvent.click(screen.getByTestId('audit-export-csv'))
    await waitFor(() => expect(clickSpy).toHaveBeenCalled())

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
    const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement
    expect(anchor.download).toBe('audit-2026-05-15.csv')
  })
})
```

- [ ] `pnpm --filter @seta/studio test:unit` — expect three new green tests.

Commit:

```sh
git add apps/studio/src/test/__recordings__/sdk/audit.json apps/studio/src/features/audit/AuditPage.test.tsx
git commit -m "test(studio): AuditPage cursor pagination + CSV download (MSW)"
```

---

## Phase 11 — E2E (Playwright)

### Task 11.1 — Seed fixture

Create `/Users/canh/Projects/Seta/seta-os/tests/e2e/fixtures/seedAudit.ts`:

```ts
import postgres from 'postgres'

export async function seedAudit(opts: {
  databaseUrl: string
  tenantId: string
}): Promise<{ tearDown: () => Promise<void> }> {
  const sql = postgres(opts.databaseUrl, { max: 1, prepare: false })
  await sql`DELETE FROM audit.audit_log WHERE tenant_id = ${opts.tenantId}`
  for (let i = 0; i < 12; i++) {
    const ts = new Date(Date.UTC(2026, 4, 15, 12 - i, 0, 0)).toISOString()
    await sql`
      INSERT INTO audit.audit_log
        (tenant_id, actor_type, actor_id, operation, result, metadata, ts)
      VALUES
        (${opts.tenantId}, 'user', 'e2e-actor',
         ${i % 2 === 0 ? 'graph.planner.tasks.patch' : 'oauth.consent.granted'},
         'ok', ${sql.json({ i })}, ${ts})
    `
  }
  return {
    tearDown: async () => {
      await sql`DELETE FROM audit.audit_log WHERE tenant_id = ${opts.tenantId}`
      await sql.end()
    },
  }
}
```

### Task 11.2 — E2E spec

Create `/Users/canh/Projects/Seta/seta-os/tests/e2e/studio/audit.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { seedAudit } from '../fixtures/seedAudit'

const TENANT = '99999999-9999-9999-9999-999999999999'
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'

test.describe('/audit', () => {
  let cleanup: { tearDown: () => Promise<void> }

  test.beforeAll(async () => {
    cleanup = await seedAudit({ databaseUrl: DATABASE_URL, tenantId: TENANT })
  })

  test.afterAll(async () => {
    await cleanup.tearDown()
  })

  test('filter by date range and Export CSV downloads matching rows', async ({ page }) => {
    await page.goto(`/tenants/${TENANT}/audit`)
    await expect(page.getByText('Audit log')).toBeVisible()

    // Date filter — only rows on 2026-05-15.
    await page.getByRole('button', { name: /pick dates/i }).click()
    await page.locator('#from').fill('2026-05-15')
    await page.locator('#to').fill('2026-05-15')
    await page.getByRole('button', { name: /apply/i }).click()

    await expect(page.getByText('graph.planner.tasks.patch').first()).toBeVisible()

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('audit-export-csv').click(),
    ])

    expect(download.suggestedFilename()).toMatch(/^audit-.+\.csv$/)
    const path = await download.path()
    expect(path).toBeTruthy()
    const fs = await import('node:fs/promises')
    const text = await fs.readFile(path!, 'utf-8')
    const lines = text.split('\n').filter(Boolean)
    expect(lines[0]).toContain('id,ts,tenant_id')
    expect(lines.length).toBe(13) // header + 12 rows
    expect(text).toContain('e2e-actor')
    expect(text).toContain('graph.planner.tasks.patch')
  })
})
```

- [ ] Run `pnpm test:e2e` with the dockerized stack up (`pnpm db:up`, `pnpm dev`, then `pnpm test:e2e`) — expect green.

Commit:

```sh
git add tests/e2e/fixtures/seedAudit.ts tests/e2e/studio/audit.spec.ts
git commit -m "test(e2e): /audit filter + Export CSV round-trip"
```

---

## Phase 12 — SCOPE updates

### Task 12.1 — Update apps/api/SCOPE.md

- [ ] Edit `/Users/canh/Projects/Seta/seta-os/apps/api/SCOPE.md` to list the two new route mounts under the route surface section:
  - `GET /audit` — owner `@seta/audit` (createAuditRoutes), cursor-paginated.
  - `GET /audit/export.csv` — owner `@seta/audit`, streams `text/csv`.

### Task 12.2 — Update apps/studio/SCOPE.md

- [ ] Edit `/Users/canh/Projects/Seta/seta-os/apps/studio/SCOPE.md` to add `/tenants/:id/audit` to the implemented-routes section, with a one-line note: "filter bar (actor / operation / result / date range) + DataTable with cursor Load-more + Export CSV via blob download."

### Task 12.3 — Update platform/audit/SCOPE.md

- [ ] Append a new "Reads (added P2 PR-7)" section to `/Users/canh/Projects/Seta/seta-os/platform/audit/SCOPE.md` documenting:
  - Exports `createAuditRoutes`, `queryAudit`, `streamAuditCsv`, `AuditRow`, `QueryAuditFilters`, `QueryAuditResponse`.
  - Routes: `GET /audit`, `GET /audit/export.csv`.
  - Indexes: `(tenant_id, ts DESC, id DESC)`, `(tenant_id, actor_id, ts DESC, id DESC)`, `(tenant_id, operation, ts DESC, id DESC)`.
  - Cursor format: `"<iso-ts>|<id>"`, walks `(ts, id) < (cursor.ts, cursor.id)` for stable DESC pagination.
  - RLS still **not** declared — admin reads remain cross-tenant by intent. The route layer enforces tenant scope via `tenantMiddleware` + `requireTenantMembership`; do not rely on RLS as backstop until the open question in this SCOPE is resolved.

Commit:

```sh
git add apps/api/SCOPE.md apps/studio/SCOPE.md platform/audit/SCOPE.md
git commit -m "docs(audit,api,studio): document audit query + CSV routes"
```

---

## Phase 13 — Changeset + final verification

### Task 13.1 — Add a changeset

- [ ] Run `pnpm changeset` and:
  - Select `@seta/audit` (minor) and `@seta/agent-sdk` (minor).
  - Summary: `Audit log query + CSV export: createAuditRoutes, queryAudit, streamAuditCsv, AgentClient.queryAudit/exportAuditCsv.`

### Task 13.2 — Repo-wide verification

- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm format`
- [ ] `pnpm test:unit`
- [ ] `pnpm test:integration` (needs `DATABASE_URL`)
- [ ] `pnpm test:e2e`
- [ ] `pnpm build`

All green is the prerequisite for opening the PR.

### Task 13.3 — Demo-state verification

- [ ] `pnpm db:up`
- [ ] `pnpm dev` (api + studio)
- [ ] In another shell, seed: `node tests/e2e/fixtures/seedAudit.ts` (or run `tests/e2e/studio/audit.spec.ts` once with `--headed` to seed and inspect).
- [ ] Open `http://localhost:5173/tenants/<seeded-tenant-id>/audit`.
- [ ] Apply `operation = graph.planner.tasks.patch`, pick a date range covering 2026-05-15.
- [ ] Verify the `DataTable` shows the matching rows (6 of 12 from the seed), with `tnum` numerals and DESC by `ts`.
- [ ] Click "Load more" if visible — verify rows append, the button hides when no `nextCursor`.
- [ ] Click "Export CSV" — verify the browser downloads `audit-<iso-ts>.csv` and the file contents include `id,ts,tenant_id…` header + only the filtered rows.
- [ ] Open Jaeger (`http://localhost:16686`) — confirm `GET /audit` + `GET /audit/export.csv` spans appear, parented to the inbound request span, with `tenant_id` attribute.

Commit (only if changeset wasn't yet committed):

```sh
git add .changeset/*.md
git commit -m "chore: changeset for audit log slice"
```

---

## Acceptance checklist (block PR until all green)

- [ ] `audit_log_tenant_ts_idx`, `audit_log_tenant_actor_ts_idx`, `audit_log_tenant_operation_ts_idx` exist after `pnpm migrate`.
- [ ] `queryAudit` filters by tenant, actor, operation, result, connector, from/to; cursor pagination strictly descending; no overlap between pages; `nextCursor` only when more rows remain.
- [ ] `streamAuditCsv` emits header first, escapes per RFC 4180, streams via `.cursor(500)` (no full-resultset buffer).
- [ ] `createAuditRoutes` returns 401/403 without session/membership; `text/csv; charset=utf-8` content-type + `attachment; filename="audit-<ts>.csv"` Content-Disposition.
- [ ] `AgentClient.queryAudit` and `AgentClient.exportAuditCsv` exist with Zod-validated responses; SDK tests cover happy path + 403 + filter-passthrough + streaming.
- [ ] Studio `/audit`: filter change resets cursor; "Load more" appends; Export CSV downloads a blob with the server-provided filename.
- [ ] E2E spec passes against the real dockerized stack.
- [ ] SCOPE docs updated for `@seta/audit`, `apps/api`, `apps/studio`.
- [ ] Changeset entries for `@seta/audit` + `@seta/agent-sdk`.

---

## Out of scope (explicitly deferred)

- RLS on `audit.audit_log` — still under open question in `platform/audit/SCOPE.md`. Tenant scoping is enforced at the route layer only.
- Retention / partitioning — separate ADR before P2 multi-tenant launch.
- Free-text search across `metadata` — Studio surfaces structured filters only in P2.
- Working-memory or thread cross-links — those land in PR-12.
- Audit-row drill-down dialog — relies on `KeyValueList`, which ships in PR-8; P2 PR-7 ends at the table row.
