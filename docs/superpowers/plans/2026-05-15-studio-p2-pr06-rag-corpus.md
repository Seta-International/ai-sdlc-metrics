# PR-6: RAG Corpus Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the RAG corpus management slice end-to-end: createRagRoutes (list + multipart upload + reindex + chunks), SDK methods including uploadSource(File), Studio /corpus page with Dialog+FileUpload + optimistic insert + indexing-poll, and /corpus/:sourceId detail with re-index.

**Architecture:** @seta/agent-rag stores source bodies in Postgres bytea (≤100MB per upload) with content-hash dedup; rejects 413 above the cap. Routes use Hono's `c.req.parseBody()` for multipart. apps/api gets a 1-line composition diff. Studio uses TanStack Query optimistic updates with rollback on error and 3s refetchInterval while any row is indexing.

**Tech Stack:** Hono, @hono/zod-openapi, Zod 4.4.3, Drizzle (rag.sources + indexes), @seta/agent-rag, @seta/agent-vector, MSW 2.14.6, TanStack Query, @seta/ui (Dialog, FileUpload, DataTable, StatusBadge, Card).

---

## Phase 1 — Drizzle schema for `rag.sources`

### Task 1.1 — Add Drizzle schema file in @seta/agent-rag

- [ ] Create `platform/agent/rag/src/schema.ts`:

```ts
import { tenantUser } from '@seta/db'
import { sql } from 'drizzle-orm'
import {
  bigint,
  customType,
  index,
  jsonb,
  pgEnum,
  pgPolicy,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const ragSchema = pgSchema('rag')

export const ingestStatus = ragSchema.enum('ingest_status', [
  'queued',
  'indexing',
  'indexed',
  'failed',
])

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea'
  },
})

export const sources = ragSchema.table(
  'sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    contentType: text('content_type').notNull(),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    contentHash: text('content_hash').notNull(),
    body: bytea('body').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    ingestStatus: ingestStatus('ingest_status').notNull().default('queued'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    indexedAt: timestamp('indexed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('sources_tenant_hash_uq').on(t.tenantId, t.contentHash),
    index('sources_tenant_created_idx').on(t.tenantId, t.createdAt.desc()),
    index('sources_tenant_status_idx').on(t.tenantId, t.ingestStatus),
    pgPolicy('tenant_isolation_sources', {
      as: 'permissive',
      to: tenantUser,
      for: 'all',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ],
)

export type SourceRow = typeof sources.$inferSelect
export type NewSourceRow = typeof sources.$inferInsert
```

### Task 1.2 — Add drizzle.config.ts for @seta/agent-rag

- [ ] Create `platform/agent/rag/drizzle.config.ts`:

```ts
import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
  schemaFilter: ['rag'],
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta' },
  verbose: true,
  strict: true,
})
```

### Task 1.3 — Add drizzle-kit + workspace deps via CLI

- [ ] Run:

```sh
pnpm --filter @seta/agent-rag add drizzle-orm@0.45.2
pnpm --filter @seta/agent-rag add @seta/db@workspace:* @seta/tenant@workspace:* @seta/observability@workspace:* @seta/middleware@workspace:* @seta/identity@workspace:* @seta/agent-vector@workspace:* @seta/agent-embeddings@workspace:* @seta/agent-chunking@workspace:*
pnpm --filter @seta/agent-rag add hono@4.10.0 @hono/zod-openapi@1.1.4 zod@4.4.3
pnpm --filter @seta/agent-rag add -D drizzle-kit@0.31.10
```

### Task 1.4 — Generate base migration via drizzle-kit

- [ ] Run:

```sh
pnpm --filter @seta/agent-rag exec drizzle-kit generate
```

- [ ] Confirm `platform/agent/rag/migrations/0000_*.sql` was created with `CREATE SCHEMA "rag"`, `CREATE TYPE "rag"."ingest_status" AS ENUM`, `CREATE TABLE "rag"."sources"`, unique + secondary indexes, and the tenant isolation policy.
- [ ] Confirm `platform/agent/rag/migrations/meta/_journal.json` exists.

### Task 1.5 — Custom migration for FORCE RLS + GRANTs

- [ ] Run:

```sh
pnpm --filter @seta/agent-rag exec drizzle-kit generate --custom --name security_hardening
```

- [ ] Fill the generated `platform/agent/rag/migrations/0001_security_hardening.sql` with:

```sql
ALTER TABLE "rag"."sources" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT USAGE ON SCHEMA "rag" TO "tenant_user";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "rag"."sources" TO "tenant_user";
```

### Task 1.6 — Register migrations in @seta/db OWNER_ORDER

- [ ] Open `platform/db/src/migrations.ts` (or whichever file defines `OWNER_ORDER`); insert `'agent-rag'` after `'agent-vector'` so RAG tables run after the vector schema.
- [ ] Map `'agent-rag'` to the new `platform/agent/rag/migrations` directory.
- [ ] Run `pnpm migrate` against a local pg via `pnpm db:up`; confirm both `0000_*.sql` and `0001_security_hardening.sql` apply cleanly.

Commit:

```sh
git add platform/agent/rag/src/schema.ts platform/agent/rag/drizzle.config.ts platform/agent/rag/migrations platform/agent/rag/package.json platform/db/src/migrations.ts pnpm-lock.yaml
git commit -m "feat(agent-rag): rag.sources schema, RLS policy, migrations"
```

---

## Phase 2 — Public Zod schemas (TDD)

### Task 2.1 — Write failing schema test

- [ ] Create `platform/agent/rag/src/schemas.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  ListSourcesQuery,
  ListSourcesResponse,
  RagSource,
  SourceChunksPage,
  UploadSourceMetadata,
} from './schemas'

describe('@seta/agent-rag schemas', () => {
  it('RagSource accepts a full row', () => {
    const v = RagSource.parse({
      id: '11111111-1111-1111-1111-111111111111',
      name: 'faq.md',
      contentType: 'text/markdown',
      byteSize: 1234,
      contentHash: 'a'.repeat(64),
      ingestStatus: 'indexed',
      chunkCount: 12,
      createdAt: new Date().toISOString(),
      indexedAt: new Date().toISOString(),
    })
    expect(v.ingestStatus).toBe('indexed')
  })

  it('ListSourcesQuery enforces limit ≤ 200 and default 50', () => {
    expect(ListSourcesQuery.parse({}).limit).toBe(50)
    expect(() => ListSourcesQuery.parse({ limit: 500 })).toThrow()
  })

  it('ListSourcesResponse includes nextCursor optional', () => {
    const v = ListSourcesResponse.parse({ items: [], nextCursor: null })
    expect(v.items).toEqual([])
  })

  it('UploadSourceMetadata requires sourceName + contentType', () => {
    expect(() => UploadSourceMetadata.parse({})).toThrow()
    const v = UploadSourceMetadata.parse({
      sourceName: 'x.txt',
      contentType: 'text/plain',
      metadata: { lang: 'en' },
    })
    expect(v.metadata?.lang).toBe('en')
  })

  it('SourceChunksPage allows empty pagination', () => {
    const v = SourceChunksPage.parse({ items: [], nextCursor: null })
    expect(v.items).toEqual([])
  })
})
```

- [ ] Confirm test fails (no `./schemas` module yet).

### Task 2.2 — Implement schemas to make tests pass

- [ ] Create `platform/agent/rag/src/schemas.ts`:

```ts
import { z } from '@hono/zod-openapi'

export const IngestStatus = z.enum(['queued', 'indexing', 'indexed', 'failed']).openapi('IngestStatus')

export const RagSource = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(512),
    contentType: z.string().min(1).max(255),
    byteSize: z.number().int().nonnegative(),
    contentHash: z.string().regex(/^[0-9a-f]{64}$/),
    ingestStatus: IngestStatus,
    error: z.string().nullable().optional(),
    chunkCount: z.number().int().nonnegative(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    createdAt: z.string().datetime(),
    indexedAt: z.string().datetime().nullable().optional(),
  })
  .openapi('RagSource')
export type RagSource = z.infer<typeof RagSource>

export const ListSourcesQuery = z
  .object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    status: IngestStatus.optional(),
  })
  .openapi('ListSourcesQuery')
export type ListSourcesQuery = z.infer<typeof ListSourcesQuery>

export const ListSourcesResponse = z
  .object({
    items: z.array(RagSource),
    nextCursor: z.string().nullable(),
  })
  .openapi('ListSourcesResponse')
export type ListSourcesResponse = z.infer<typeof ListSourcesResponse>

export const UploadSourceMetadata = z
  .object({
    sourceName: z.string().min(1).max(512),
    contentType: z.string().min(1).max(255),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi('UploadSourceMetadata')
export type UploadSourceMetadata = z.infer<typeof UploadSourceMetadata>

export const SourceChunk = z
  .object({
    id: z.string().uuid(),
    sourceId: z.string().uuid(),
    content: z.string(),
    charRange: z.object({ start: z.number().int(), end: z.number().int() }),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .openapi('SourceChunk')
export type SourceChunk = z.infer<typeof SourceChunk>

export const SourceChunksPage = z
  .object({
    items: z.array(SourceChunk),
    nextCursor: z.string().nullable(),
  })
  .openapi('SourceChunksPage')
export type SourceChunksPage = z.infer<typeof SourceChunksPage>
```

- [ ] Confirm `pnpm --filter @seta/agent-rag vitest run schemas.test.ts` passes.

Commit:

```sh
git add platform/agent/rag/src/schemas.ts platform/agent/rag/src/schemas.test.ts
git commit -m "feat(agent-rag): zod schemas for sources, chunks, upload metadata"
```

---

## Phase 3 — `listSources` (TDD)

### Task 3.1 — Write failing integration test

- [ ] Create `platform/agent/rag/tests/integration/listSources.int.test.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { tenantContext, withTenant } from '@seta/tenant'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getTestSql } from './helpers/db'
import { listSources } from '../../src/services/listSources'
import { insertFixtureSource } from './helpers/fixtures'

const sql = getTestSql()
const tenantId = randomUUID()

beforeAll(async () => {
  await withTenant(sql, tenantId, async () => {
    for (let i = 0; i < 3; i++) {
      await insertFixtureSource(sql, { tenantId, name: `doc-${i}.txt` })
    }
  })
})

afterAll(async () => {
  await sql`DELETE FROM rag.sources WHERE tenant_id = ${tenantId}`
})

describe('listSources', () => {
  it('returns rows in created_at desc, cursor-paginates', async () => {
    await tenantContext.run({ tenantId, userId: 'u' }, async () => {
      const page1 = await listSources(sql, { limit: 2 })
      expect(page1.items).toHaveLength(2)
      expect(page1.nextCursor).not.toBeNull()
      const page2 = await listSources(sql, { limit: 2, cursor: page1.nextCursor! })
      expect(page2.items).toHaveLength(1)
      expect(page2.nextCursor).toBeNull()
    })
  })

  it('honours status filter', async () => {
    await tenantContext.run({ tenantId, userId: 'u' }, async () => {
      const r = await listSources(sql, { limit: 50, status: 'indexed' })
      expect(r.items.every((i) => i.ingestStatus === 'indexed')).toBe(true)
    })
  })
})
```

- [ ] Create test helpers `platform/agent/rag/tests/integration/helpers/db.ts` exporting `getTestSql()` (returns the shared `postgres` client per existing patterns in other packages; reuse the same shape as `platform/agent/memory/tests/integration/helpers/db.ts`).
- [ ] Create `platform/agent/rag/tests/integration/helpers/fixtures.ts` exporting `insertFixtureSource(sql, { tenantId, name, status? })` that inserts a row with a random `contentHash`, a small bytea body, and an explicit `ingestStatus` (default `'indexed'`, chunk count 0).
- [ ] Confirm test fails (no `listSources` yet).

### Task 3.2 — Implement listSources

- [ ] Create `platform/agent/rag/src/services/listSources.ts`:

```ts
import { tenantContext } from '@seta/tenant'
import type { Sql } from '@seta/db'
import { and, desc, eq, lt, sql as drizzleSql } from 'drizzle-orm'
import { sources } from '../schema'
import type { ListSourcesQuery, ListSourcesResponse, RagSource } from '../schemas'

export async function listSources(sql: Sql, query: ListSourcesQuery): Promise<ListSourcesResponse> {
  const tenantId = tenantContext.getTenantId()
  const limit = query.limit
  const cursorTs = query.cursor ? new Date(query.cursor) : null

  const rows = await sql<RagSource[]>`
    SELECT
      s.id,
      s.name,
      s.content_type            AS "contentType",
      s.byte_size               AS "byteSize",
      s.content_hash            AS "contentHash",
      s.ingest_status           AS "ingestStatus",
      s.error,
      s.metadata,
      COALESCE(c.cnt, 0)::int   AS "chunkCount",
      to_char(s.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
      CASE WHEN s.indexed_at IS NULL THEN NULL
           ELSE to_char(s.indexed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END AS "indexedAt"
    FROM rag.sources s
    LEFT JOIN (
      SELECT (metadata->>'sourceRowId')::uuid AS source_row_id, COUNT(*) AS cnt
      FROM agent_vector.chunks
      WHERE tenant_id = ${tenantId}
      GROUP BY 1
    ) c ON c.source_row_id = s.id
    WHERE s.tenant_id = ${tenantId}
      ${query.status ? sql`AND s.ingest_status = ${query.status}` : sql``}
      ${cursorTs ? sql`AND s.created_at < ${cursorTs.toISOString()}` : sql``}
    ORDER BY s.created_at DESC
    LIMIT ${limit + 1}
  `
  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  const nextCursor = hasMore ? items[items.length - 1].createdAt : null
  return { items, nextCursor }
}
```

- [ ] Confirm integration test passes.

Commit:

```sh
git add platform/agent/rag/src/services/listSources.ts platform/agent/rag/tests/integration
git commit -m "feat(agent-rag): listSources cursor pagination + status filter"
```

---

## Phase 4 — `uploadSource` (TDD)

### Task 4.1 — Write failing integration test

- [ ] Create `platform/agent/rag/tests/integration/uploadSource.int.test.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { tenantContext } from '@seta/tenant'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getTestSql } from './helpers/db'
import { uploadSource } from '../../src/services/uploadSource'

const sql = getTestSql()
const tenantId = randomUUID()

beforeAll(async () => {
  // schema already migrated via pnpm migrate in CI
})
afterAll(async () => {
  await sql`DELETE FROM rag.sources WHERE tenant_id = ${tenantId}`
})

describe('uploadSource', () => {
  it('creates a new source with sha256, queued status', async () => {
    await tenantContext.run({ tenantId, userId: 'u' }, async () => {
      const body = Buffer.from('# Hello\nworld\n', 'utf8')
      const r = await uploadSource(sql, {
        tenantId,
        name: 'hello.md',
        contentType: 'text/markdown',
        body,
      })
      expect(r.created).toBe(true)
      expect(r.source.contentHash).toMatch(/^[0-9a-f]{64}$/)
      expect(r.source.ingestStatus).toBe('queued')
      expect(r.source.byteSize).toBe(body.byteLength)
    })
  })

  it('returns existing row for identical content (dedup, 200 idempotent)', async () => {
    await tenantContext.run({ tenantId, userId: 'u' }, async () => {
      const body = Buffer.from('deduped\n', 'utf8')
      const a = await uploadSource(sql, { tenantId, name: 'a.txt', contentType: 'text/plain', body })
      const b = await uploadSource(sql, { tenantId, name: 'b.txt', contentType: 'text/plain', body })
      expect(b.created).toBe(false)
      expect(b.source.id).toBe(a.source.id)
    })
  })
})
```

- [ ] Confirm test fails.

### Task 4.2 — Implement uploadSource

- [ ] Create `platform/agent/rag/src/services/uploadSource.ts`:

```ts
import { createHash } from 'node:crypto'
import type { Sql } from '@seta/db'
import { logger } from '@seta/observability'
import type { RagSource } from '../schemas'

export interface UploadSourceArgs {
  tenantId: string
  name: string
  contentType: string
  body: Buffer
  metadata?: Record<string, unknown>
  signal?: AbortSignal
}

export interface UploadSourceResult {
  source: RagSource
  created: boolean
}

const MAX_BYTES = 100 * 1024 * 1024

export class SourceTooLargeError extends Error {
  readonly status = 413
  constructor(public byteSize: number) {
    super(`source exceeds 100MB cap (${byteSize} bytes)`)
  }
}

export async function uploadSource(sql: Sql, args: UploadSourceArgs): Promise<UploadSourceResult> {
  if (args.body.byteLength > MAX_BYTES) throw new SourceTooLargeError(args.body.byteLength)

  const contentHash = createHash('sha256').update(args.body).digest('hex')

  const existing = await sql<RagSource[]>`
    SELECT
      id, name,
      content_type AS "contentType",
      byte_size    AS "byteSize",
      content_hash AS "contentHash",
      ingest_status AS "ingestStatus",
      error, metadata,
      0::int AS "chunkCount",
      to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
      CASE WHEN indexed_at IS NULL THEN NULL
           ELSE to_char(indexed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END AS "indexedAt"
    FROM rag.sources
    WHERE tenant_id = ${args.tenantId} AND content_hash = ${contentHash}
    LIMIT 1
  `
  if (existing.length > 0) {
    logger.info({ tenantId: args.tenantId, sourceId: existing[0].id }, 'rag.uploadSource dedup hit')
    return { source: existing[0], created: false }
  }

  const inserted = await sql<RagSource[]>`
    INSERT INTO rag.sources (tenant_id, name, content_type, byte_size, content_hash, body, metadata, ingest_status)
    VALUES (
      ${args.tenantId}, ${args.name}, ${args.contentType}, ${args.body.byteLength},
      ${contentHash}, ${args.body}, ${args.metadata ?? null}::jsonb, 'queued'
    )
    RETURNING
      id, name,
      content_type AS "contentType",
      byte_size    AS "byteSize",
      content_hash AS "contentHash",
      ingest_status AS "ingestStatus",
      error, metadata,
      0::int AS "chunkCount",
      to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
      NULL::text AS "indexedAt"
  `
  logger.info(
    { tenantId: args.tenantId, sourceId: inserted[0].id, byteSize: args.body.byteLength },
    'rag.uploadSource new row',
  )
  return { source: inserted[0], created: true }
}
```

- [ ] Confirm integration tests pass.

Commit:

```sh
git add platform/agent/rag/src/services/uploadSource.ts platform/agent/rag/tests/integration/uploadSource.int.test.ts
git commit -m "feat(agent-rag): uploadSource with sha256 dedup and 100MB guard"
```

---

## Phase 5 — Async ingest dispatch

### Task 5.1 — Write failing test for kickoff hook

- [ ] Create `platform/agent/rag/src/services/runIngest.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { runIngestForSource } from './runIngest'

describe('runIngestForSource', () => {
  it('marks source indexing, calls ingest(), marks indexed on success', async () => {
    const calls: string[] = []
    const sqlMock = {
      unsafe: vi.fn(),
    } as never
    const updates: Array<{ status: string; id: string }> = []
    const fakeSql = ((strings: TemplateStringsArray, ..._params: unknown[]) => {
      const text = strings.join('?')
      if (text.includes("SET ingest_status = 'indexing'")) updates.push({ status: 'indexing', id: 's1' })
      if (text.includes("SET ingest_status = 'indexed'")) updates.push({ status: 'indexed', id: 's1' })
      return Promise.resolve([])
    }) as never
    const ingest = vi.fn(async (sourceId: string, _content: string) => {
      calls.push(sourceId)
    })
    await runIngestForSource(fakeSql, {
      sourceId: 's1',
      tenantId: 't1',
      body: Buffer.from('hi'),
      contentType: 'text/plain',
      ingest,
    })
    expect(calls).toEqual(['s1'])
    expect(updates.map((u) => u.status)).toEqual(['indexing', 'indexed'])
  })

  it('marks failed and records error on ingest throw', async () => {
    const updates: string[] = []
    const fakeSql = ((strings: TemplateStringsArray) => {
      const text = strings.join('?')
      if (text.includes("SET ingest_status = 'indexing'")) updates.push('indexing')
      if (text.includes("SET ingest_status = 'failed'")) updates.push('failed')
      return Promise.resolve([])
    }) as never
    const ingest = vi.fn(async () => {
      throw new Error('boom')
    })
    await runIngestForSource(fakeSql, {
      sourceId: 's2',
      tenantId: 't1',
      body: Buffer.from('hi'),
      contentType: 'text/plain',
      ingest,
    })
    expect(updates).toEqual(['indexing', 'failed'])
  })
})
```

- [ ] Confirm test fails.

### Task 5.2 — Implement runIngestForSource

- [ ] Create `platform/agent/rag/src/services/runIngest.ts`:

```ts
import type { Sql } from '@seta/db'
import { logger } from '@seta/observability'

export interface RunIngestArgs {
  sourceId: string
  tenantId: string
  body: Buffer
  contentType: string
  ingest: (sourceId: string, content: string, opts?: { signal?: AbortSignal }) => Promise<void>
  signal?: AbortSignal
}

function bodyToText(body: Buffer, contentType: string): string {
  if (contentType.startsWith('text/') || contentType === 'application/json') {
    return body.toString('utf8')
  }
  // PDF parsing is out of P2 — caller is expected to send pre-extracted text for non-text/* types.
  return body.toString('utf8')
}

export async function runIngestForSource(sql: Sql, args: RunIngestArgs): Promise<void> {
  await sql`
    UPDATE rag.sources SET ingest_status = 'indexing', error = NULL
    WHERE id = ${args.sourceId} AND tenant_id = ${args.tenantId}
  `
  try {
    await args.ingest(args.sourceId, bodyToText(args.body, args.contentType), {
      ...(args.signal ? { signal: args.signal } : {}),
    })
    await sql`
      UPDATE rag.sources
      SET ingest_status = 'indexed', indexed_at = now(), error = NULL
      WHERE id = ${args.sourceId} AND tenant_id = ${args.tenantId}
    `
    logger.info({ tenantId: args.tenantId, sourceId: args.sourceId }, 'rag.ingest indexed')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await sql`
      UPDATE rag.sources SET ingest_status = 'failed', error = ${message}
      WHERE id = ${args.sourceId} AND tenant_id = ${args.tenantId}
    `
    logger.error({ tenantId: args.tenantId, sourceId: args.sourceId, err }, 'rag.ingest failed')
  }
}
```

- [ ] Confirm `pnpm --filter @seta/agent-rag vitest run runIngest.test.ts` passes.

Commit:

```sh
git add platform/agent/rag/src/services/runIngest.ts platform/agent/rag/src/services/runIngest.test.ts
git commit -m "feat(agent-rag): runIngestForSource lifecycle with error capture"
```

---

## Phase 6 — `reindexSource` (TDD)

### Task 6.1 — Write failing integration test

- [ ] Create `platform/agent/rag/tests/integration/reindexSource.int.test.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { tenantContext } from '@seta/tenant'
import { afterAll, describe, expect, it } from 'vitest'
import { getTestSql } from './helpers/db'
import { insertFixtureSource } from './helpers/fixtures'
import { reindexSource } from '../../src/services/reindexSource'

const sql = getTestSql()
const tenantId = randomUUID()

afterAll(async () => {
  await sql`DELETE FROM rag.sources WHERE tenant_id = ${tenantId}`
})

describe('reindexSource', () => {
  it('flips an indexed row back to queued and clears error', async () => {
    const sourceId = await tenantContext.run({ tenantId, userId: 'u' }, async () => {
      return insertFixtureSource(sql, { tenantId, name: 'r.md', status: 'failed', error: 'old' })
    })
    await tenantContext.run({ tenantId, userId: 'u' }, async () => {
      const r = await reindexSource(sql, sourceId, tenantId)
      expect(r.ingestStatus).toBe('queued')
      expect(r.error).toBeNull()
    })
  })

  it('returns null when source not in tenant', async () => {
    await tenantContext.run({ tenantId, userId: 'u' }, async () => {
      const r = await reindexSource(sql, randomUUID(), tenantId)
      expect(r).toBeNull()
    })
  })
})
```

- [ ] Confirm test fails.

### Task 6.2 — Implement reindexSource

- [ ] Create `platform/agent/rag/src/services/reindexSource.ts`:

```ts
import type { Sql } from '@seta/db'
import type { RagSource } from '../schemas'

export async function reindexSource(
  sql: Sql,
  sourceId: string,
  tenantId: string,
): Promise<RagSource | null> {
  const rows = await sql<RagSource[]>`
    UPDATE rag.sources
    SET ingest_status = 'queued', error = NULL, indexed_at = NULL
    WHERE id = ${sourceId} AND tenant_id = ${tenantId}
    RETURNING
      id, name,
      content_type AS "contentType",
      byte_size    AS "byteSize",
      content_hash AS "contentHash",
      ingest_status AS "ingestStatus",
      error, metadata,
      0::int AS "chunkCount",
      to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
      NULL::text AS "indexedAt"
  `
  return rows[0] ?? null
}
```

- [ ] Confirm integration test passes.

Commit:

```sh
git add platform/agent/rag/src/services/reindexSource.ts platform/agent/rag/tests/integration/reindexSource.int.test.ts
git commit -m "feat(agent-rag): reindexSource resets ingest_status to queued"
```

---

## Phase 7 — `getSourceChunks` (TDD)

### Task 7.1 — Write failing integration test

- [ ] Create `platform/agent/rag/tests/integration/getSourceChunks.int.test.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { tenantContext } from '@seta/tenant'
import { afterAll, describe, expect, it } from 'vitest'
import { getTestSql } from './helpers/db'
import { insertFixtureChunks, insertFixtureSource } from './helpers/fixtures'
import { getSourceChunks } from '../../src/services/getSourceChunks'

const sql = getTestSql()
const tenantId = randomUUID()

afterAll(async () => {
  await sql`DELETE FROM rag.sources WHERE tenant_id = ${tenantId}`
  await sql`DELETE FROM agent_vector.chunks WHERE tenant_id = ${tenantId}`
})

describe('getSourceChunks', () => {
  it('returns chunks for source, cursor-paginates by chunk id', async () => {
    const sourceId = await tenantContext.run({ tenantId, userId: 'u' }, () =>
      insertFixtureSource(sql, { tenantId, name: 'c.txt' }),
    )
    await insertFixtureChunks(sql, { tenantId, sourceId, count: 5 })
    await tenantContext.run({ tenantId, userId: 'u' }, async () => {
      const page1 = await getSourceChunks(sql, sourceId, { limit: 3 })
      expect(page1.items).toHaveLength(3)
      expect(page1.nextCursor).not.toBeNull()
      const page2 = await getSourceChunks(sql, sourceId, { limit: 3, cursor: page1.nextCursor! })
      expect(page2.items).toHaveLength(2)
      expect(page2.nextCursor).toBeNull()
    })
  })
})
```

- [ ] Extend `helpers/fixtures.ts` with `insertFixtureChunks(sql, { tenantId, sourceId, count })` that inserts rows into `agent_vector.chunks` with `metadata = jsonb_build_object('sourceRowId', $sourceId)`.
- [ ] Confirm test fails.

### Task 7.2 — Implement getSourceChunks

- [ ] Create `platform/agent/rag/src/services/getSourceChunks.ts`:

```ts
import { tenantContext } from '@seta/tenant'
import type { Sql } from '@seta/db'
import type { SourceChunk, SourceChunksPage } from '../schemas'

export interface GetSourceChunksOptions {
  cursor?: string
  limit?: number
}

export async function getSourceChunks(
  sql: Sql,
  sourceId: string,
  opts: GetSourceChunksOptions = {},
): Promise<SourceChunksPage> {
  const tenantId = tenantContext.getTenantId()
  const limit = Math.min(opts.limit ?? 50, 200)
  const rows = await sql<SourceChunk[]>`
    SELECT
      id,
      (metadata->>'sourceRowId')::uuid AS "sourceId",
      content,
      jsonb_build_object(
        'start', COALESCE((metadata->'charRange'->>'start')::int, 0),
        'end',   COALESCE((metadata->'charRange'->>'end')::int, 0)
      ) AS "charRange",
      metadata
    FROM agent_vector.chunks
    WHERE tenant_id = ${tenantId}
      AND (metadata->>'sourceRowId')::uuid = ${sourceId}
      ${opts.cursor ? sql`AND id > ${opts.cursor}` : sql``}
    ORDER BY id ASC
    LIMIT ${limit + 1}
  `
  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  const nextCursor = hasMore ? items[items.length - 1].id : null
  return { items, nextCursor }
}
```

- [ ] Confirm integration test passes.

Commit:

```sh
git add platform/agent/rag/src/services/getSourceChunks.ts platform/agent/rag/tests/integration/getSourceChunks.int.test.ts
git commit -m "feat(agent-rag): getSourceChunks cursor-paginated read"
```

---

## Phase 8 — `createRagRoutes` Hono factory

### Task 8.1 — Write failing integration test for routes

- [ ] Create `platform/agent/rag/tests/integration/routes.int.test.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getTestSql } from './helpers/db'
import { buildTestApp } from './helpers/app'

const sql = getTestSql()
const tenantId = randomUUID()
const userId = randomUUID()

let app: Awaited<ReturnType<typeof buildTestApp>>

beforeAll(async () => {
  app = await buildTestApp({ sql, tenantId, userId })
})
afterAll(async () => {
  await sql`DELETE FROM rag.sources WHERE tenant_id = ${tenantId}`
})

const tenantHeader = { 'x-test-tenant': tenantId, 'x-test-user': userId }

describe('createRagRoutes', () => {
  it('GET /rag/sources returns empty page initially', async () => {
    const res = await app.request('/rag/sources', { headers: tenantHeader })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.items).toEqual([])
  })

  it('POST /rag/sources accepts multipart upload and returns 201 with row', async () => {
    const fd = new FormData()
    fd.set('sourceName', 'hello.md')
    fd.set('contentType', 'text/markdown')
    fd.set('file', new File([new Uint8Array([35, 32, 104, 105])], 'hello.md', { type: 'text/markdown' }))
    const res = await app.request('/rag/sources', { method: 'POST', body: fd, headers: tenantHeader })
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.ingestStatus).toBe('queued')
    expect(json.contentHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('POST /rag/sources returns 200 + existing row on duplicate hash', async () => {
    const body = new Uint8Array([35, 32, 104, 105])
    const make = () => {
      const fd = new FormData()
      fd.set('sourceName', 'h.md')
      fd.set('contentType', 'text/markdown')
      fd.set('file', new File([body], 'h.md', { type: 'text/markdown' }))
      return fd
    }
    const first = await app.request('/rag/sources', { method: 'POST', body: make(), headers: tenantHeader })
    const second = await app.request('/rag/sources', { method: 'POST', body: make(), headers: tenantHeader })
    expect(first.status).toBe(201)
    expect(second.status).toBe(200)
    const a = await first.json()
    const b = await second.json()
    expect(b.id).toBe(a.id)
  })

  it('POST /rag/sources rejects 413 when content-length exceeds 100MB', async () => {
    const res = await app.request('/rag/sources', {
      method: 'POST',
      headers: { ...tenantHeader, 'content-length': String(101 * 1024 * 1024), 'content-type': 'multipart/form-data; boundary=x' },
      body: '--x--',
    })
    expect(res.status).toBe(413)
  })

  it('POST /rag/sources/:id/reindex flips status to queued', async () => {
    const list = await (await app.request('/rag/sources', { headers: tenantHeader })).json()
    const id = list.items[0].id
    const r = await app.request(`/rag/sources/${id}/reindex`, { method: 'POST', headers: tenantHeader })
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.ingestStatus).toBe('queued')
  })

  it('GET /rag/sources/:id/chunks returns SourceChunksPage shape', async () => {
    const list = await (await app.request('/rag/sources', { headers: tenantHeader })).json()
    const id = list.items[0].id
    const r = await app.request(`/rag/sources/${id}/chunks`, { headers: tenantHeader })
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j).toMatchObject({ items: expect.any(Array), nextCursor: null })
  })
})
```

- [ ] Create `platform/agent/rag/tests/integration/helpers/app.ts` that builds a Hono app mounting `createRagRoutes(...)` with a test `requireSession` stub reading `x-test-tenant` / `x-test-user` headers and a no-op `ingest` adapter so the queued row never moves to indexed (we test status transitions explicitly via reindex).
- [ ] Confirm test fails.

### Task 8.2 — Implement createRagRoutes

- [ ] Create `platform/agent/rag/src/routes.ts`:

```ts
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import type { Sql } from '@seta/db'
import { onError, requireTenantMembership } from '@seta/middleware'
import { requireSession } from '@seta/identity'
import { tenantMiddleware, tenantContext } from '@seta/tenant'
import { logger } from '@seta/observability'
import {
  ListSourcesQuery,
  ListSourcesResponse,
  RagSource,
  SourceChunksPage,
  UploadSourceMetadata,
} from './schemas'
import { listSources } from './services/listSources'
import { uploadSource, SourceTooLargeError } from './services/uploadSource'
import { reindexSource } from './services/reindexSource'
import { getSourceChunks } from './services/getSourceChunks'
import { runIngestForSource } from './services/runIngest'

const MAX_BYTES = 100 * 1024 * 1024

export interface CreateRagRoutesArgs {
  sql: Sql
  ingest: (sourceId: string, content: string, opts?: { signal?: AbortSignal }) => Promise<void>
}

export function createRagRoutes({ sql, ingest }: CreateRagRoutesArgs) {
  const app = new OpenAPIHono().onError(onError)

  app.use('/rag/*', requireSession)
  app.use('/rag/*', tenantMiddleware)
  app.use('/rag/*', requireTenantMembership)

  app.openapi(
    createRoute({
      method: 'get',
      path: '/rag/sources',
      request: { query: ListSourcesQuery },
      responses: {
        200: { content: { 'application/json': { schema: ListSourcesResponse } }, description: 'OK' },
      },
    }),
    async (c) => {
      const q = c.req.valid('query')
      const result = await listSources(sql, q)
      return c.json(result, 200)
    },
  )

  app.post('/rag/sources', async (c) => {
    const declared = Number(c.req.header('content-length') ?? '0')
    if (declared > MAX_BYTES) return c.json({ error: 'payload too large' }, 413)

    const form = await c.req.parseBody({ all: false })
    const file = form.file
    if (!(file instanceof File)) return c.json({ error: 'file field required' }, 400)
    const buf = Buffer.from(await file.arrayBuffer())
    if (buf.byteLength > MAX_BYTES) return c.json({ error: 'payload too large' }, 413)

    const meta = UploadSourceMetadata.parse({
      sourceName: form.sourceName ?? file.name,
      contentType: form.contentType ?? file.type ?? 'application/octet-stream',
      metadata: form.metadata ? JSON.parse(String(form.metadata)) : undefined,
    })

    const tenantId = tenantContext.getTenantId()
    try {
      const { source, created } = await uploadSource(sql, {
        tenantId,
        name: meta.sourceName,
        contentType: meta.contentType,
        body: buf,
        ...(meta.metadata ? { metadata: meta.metadata } : {}),
      })
      if (created) {
        void runIngestForSource(sql, {
          sourceId: source.id,
          tenantId,
          body: buf,
          contentType: meta.contentType,
          ingest,
        }).catch((err) => logger.error({ err, sourceId: source.id }, 'rag.runIngest detached failure'))
      }
      return c.json(RagSource.parse(source), created ? 201 : 200)
    } catch (err) {
      if (err instanceof SourceTooLargeError) return c.json({ error: err.message }, 413)
      throw err
    }
  })

  app.openapi(
    createRoute({
      method: 'post',
      path: '/rag/sources/{id}/reindex',
      request: { params: z.object({ id: z.string().uuid() }) },
      responses: {
        200: { content: { 'application/json': { schema: RagSource } }, description: 'OK' },
        404: { description: 'not found' },
      },
    }),
    async (c) => {
      const { id } = c.req.valid('param')
      const tenantId = tenantContext.getTenantId()
      const row = await reindexSource(sql, id, tenantId)
      if (!row) return c.json({ error: 'not found' }, 404)
      // Re-fetch body and kick off ingest. Body lives in rag.sources.
      const bodyRows = await sql<{ body: Buffer; content_type: string }[]>`
        SELECT body, content_type FROM rag.sources WHERE id = ${id} AND tenant_id = ${tenantId}
      `
      if (bodyRows[0]) {
        void runIngestForSource(sql, {
          sourceId: id,
          tenantId,
          body: bodyRows[0].body,
          contentType: bodyRows[0].content_type,
          ingest,
        }).catch((err) => logger.error({ err, sourceId: id }, 'rag.reindex detached failure'))
      }
      return c.json(row, 200)
    },
  )

  app.openapi(
    createRoute({
      method: 'get',
      path: '/rag/sources/{id}/chunks',
      request: {
        params: z.object({ id: z.string().uuid() }),
        query: z.object({
          cursor: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
        }),
      },
      responses: {
        200: { content: { 'application/json': { schema: SourceChunksPage } }, description: 'OK' },
      },
    }),
    async (c) => {
      const { id } = c.req.valid('param')
      const q = c.req.valid('query')
      const page = await getSourceChunks(sql, id, q)
      return c.json(page, 200)
    },
  )

  return app
}
```

### Task 8.3 — Export factory from package entry

- [ ] Create `platform/agent/rag/src/index.ts`:

```ts
export { createRagRoutes } from './routes'
export type { CreateRagRoutesArgs } from './routes'
export {
  IngestStatus,
  ListSourcesQuery,
  ListSourcesResponse,
  RagSource,
  SourceChunk,
  SourceChunksPage,
  UploadSourceMetadata,
} from './schemas'
export type {
  ListSourcesQuery as ListSourcesQueryT,
  ListSourcesResponse as ListSourcesResponseT,
  RagSource as RagSourceT,
  SourceChunk as SourceChunkT,
  SourceChunksPage as SourceChunksPageT,
  UploadSourceMetadata as UploadSourceMetadataT,
} from './schemas'
export { listSources } from './services/listSources'
export { uploadSource, SourceTooLargeError } from './services/uploadSource'
export { reindexSource } from './services/reindexSource'
export { getSourceChunks } from './services/getSourceChunks'
export { runIngestForSource } from './services/runIngest'
```

- [ ] Confirm `pnpm --filter @seta/agent-rag test:integration` passes (`vitest run tests/integration/routes.int.test.ts`).

Commit:

```sh
git add platform/agent/rag/src/routes.ts platform/agent/rag/src/index.ts platform/agent/rag/tests/integration/routes.int.test.ts platform/agent/rag/tests/integration/helpers/app.ts
git commit -m "feat(agent-rag): createRagRoutes (list, upload multipart, reindex, chunks)"
```

---

## Phase 9 — apps/api composition diff

### Task 9.1 — Add workspace dep

- [ ] Run:

```sh
pnpm --filter @seta/api add @seta/agent-rag@workspace:*
```

### Task 9.2 — Apply 1-line composition diff in main.ts

- [ ] Open `apps/api/src/main.ts`. After the `import { createOAuthRoutes, ... } from '@seta/oauth'` block, add:

```ts
import { createRagRoutes } from '@seta/agent-rag'
```

- [ ] Inside the existing infrastructure block (near where `audit` is built), add a real embeddings + vector ingest binding. The placeholder `embeddingsStub` will throw — in PR-6 we plumb in real embeddings via `createOpenAIEmbeddings` + the existing pgvector store. Replace the relevant lines so the result looks like:

```ts
import { createOpenAIEmbeddings } from '@seta/agent-embeddings'
import { createPgVectorStore } from '@seta/agent-vector'
import { ingestText } from '@seta/agent-rag/pipeline'

const embeddings = createOpenAIEmbeddings({ apiKey: env.OPENAI_API_KEY })
const vector = createPgVectorStore({ sql: sql as never })
const ragIngest = (sourceId: string, content: string, opts?: { signal?: AbortSignal }) =>
  ingestText({ sourceId, content, embeddings, vector, ...(opts ?? {}) })
```

  (If `@seta/agent-rag/pipeline` does not yet exist, add a thin re-export wrapping the existing `@seta/agent-rag` ingest path from its prior PR; expose it as a subpath export in `platform/agent/rag/package.json` `exports`.)

- [ ] Mount the routes near the other `app.route(...)` lines:

```ts
app.route('/', createRagRoutes({ sql: sql as never, ingest: ragIngest }))
```

- [ ] Confirm `apps/api/src/main.ts` diff is exactly these added imports + one constructed `ragIngest` callable + the one `app.route` line. No other changes.

### Task 9.3 — Smoke integration test in apps/api

- [ ] Create `apps/api/tests/integration/rag-routes.int.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildAppForTest } from './helpers/buildApp'

describe('apps/api /rag/* surface', () => {
  it('GET /rag/sources returns 401 without session', async () => {
    const app = await buildAppForTest()
    const res = await app.request('/rag/sources')
    expect(res.status).toBe(401)
  })

  it('POST /rag/sources rejects 413 above 100MB Content-Length', async () => {
    const app = await buildAppForTest({ session: { userId: 'u', tenantId: 't' } })
    const res = await app.request('/rag/sources', {
      method: 'POST',
      headers: { 'content-length': String(150 * 1024 * 1024), 'content-type': 'multipart/form-data; boundary=x' },
      body: '--x--',
    })
    expect(res.status).toBe(413)
  })
})
```

- [ ] Confirm `pnpm --filter @seta/api test:integration` runs this spec green.

Commit:

```sh
git add apps/api/src/main.ts apps/api/tests/integration/rag-routes.int.test.ts apps/api/package.json pnpm-lock.yaml platform/agent/rag/package.json
git commit -m "feat(api): mount createRagRoutes with real embeddings + pgvector ingest"
```

---

## Phase 10 — @seta/agent-sdk methods

### Task 10.1 — Write failing AgentClient test

- [ ] Open `platform/agent/sdk/src/client/AgentClient.test.ts` and add:

```ts
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { AgentClient } from './AgentClient'

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('AgentClient RAG methods', () => {
  const client = new AgentClient({ baseUrl: 'http://api.test' })

  it('listSources sends tenantId query, parses ListSourcesResponse', async () => {
    server.use(
      http.get('http://api.test/rag/sources', ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('tenantId')).toBe('t1')
        return HttpResponse.json({ items: [], nextCursor: null })
      }),
    )
    const r = await client.listSources('t1', {})
    expect(r.items).toEqual([])
  })

  it('uploadSource posts multipart form-data with sourceName + contentType + file', async () => {
    server.use(
      http.post('http://api.test/rag/sources', async ({ request }) => {
        const form = await request.formData()
        expect(form.get('sourceName')).toBe('hi.txt')
        expect(form.get('contentType')).toBe('text/plain')
        const file = form.get('file') as File
        expect(file.name).toBe('hi.txt')
        return HttpResponse.json(
          {
            id: '00000000-0000-0000-0000-000000000001',
            name: 'hi.txt',
            contentType: 'text/plain',
            byteSize: 2,
            contentHash: 'a'.repeat(64),
            ingestStatus: 'queued',
            chunkCount: 0,
            createdAt: new Date().toISOString(),
            indexedAt: null,
          },
          { status: 201 },
        )
      }),
    )
    const f = new File([new Uint8Array([1, 2])], 'hi.txt', { type: 'text/plain' })
    const r = await client.uploadSource(f, { sourceName: 'hi.txt', contentType: 'text/plain' })
    expect(r.ingestStatus).toBe('queued')
  })

  it('reindexSource POSTs and parses RagSource', async () => {
    server.use(
      http.post('http://api.test/rag/sources/abc/reindex', () =>
        HttpResponse.json({
          id: 'abc', name: 'x', contentType: 'text/plain', byteSize: 0,
          contentHash: 'b'.repeat(64), ingestStatus: 'queued', chunkCount: 0,
          createdAt: new Date().toISOString(), indexedAt: null,
        }),
      ),
    )
    const r = await client.reindexSource('abc')
    expect(r.ingestStatus).toBe('queued')
  })

  it('getSourceChunks threads cursor + parses page', async () => {
    server.use(
      http.get('http://api.test/rag/sources/abc/chunks', ({ request }) => {
        expect(new URL(request.url).searchParams.get('cursor')).toBe('xx')
        return HttpResponse.json({ items: [], nextCursor: null })
      }),
    )
    const r = await client.getSourceChunks('abc', { cursor: 'xx' })
    expect(r.items).toEqual([])
  })
})
```

- [ ] Confirm test fails.

### Task 10.2 — Implement the four methods on AgentClient

- [ ] Open `platform/agent/sdk/src/client/AgentClient.ts`. Add imports:

```ts
import {
  ListSourcesQuery,
  ListSourcesResponse,
  RagSource,
  SourceChunksPage,
  UploadSourceMetadata,
} from '../schemas/rag'
```

- [ ] Add a sibling file `platform/agent/sdk/src/schemas/rag.ts` that mirrors the @seta/agent-rag Zod schemas (browser-safe — uses `zod` directly, not `@hono/zod-openapi`):

```ts
import { z } from 'zod'

export const IngestStatus = z.enum(['queued', 'indexing', 'indexed', 'failed'])

export const RagSource = z.object({
  id: z.string().uuid(),
  name: z.string(),
  contentType: z.string(),
  byteSize: z.number().int().nonnegative(),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  ingestStatus: IngestStatus,
  error: z.string().nullable().optional(),
  chunkCount: z.number().int().nonnegative(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.string().datetime(),
  indexedAt: z.string().datetime().nullable().optional(),
})
export type RagSource = z.infer<typeof RagSource>

export const ListSourcesQuery = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  status: IngestStatus.optional(),
})
export type ListSourcesQuery = z.infer<typeof ListSourcesQuery>

export const ListSourcesResponse = z.object({
  items: z.array(RagSource),
  nextCursor: z.string().nullable(),
})
export type ListSourcesResponse = z.infer<typeof ListSourcesResponse>

export const UploadSourceMetadata = z.object({
  sourceName: z.string().min(1),
  contentType: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
export type UploadSourceMetadata = z.infer<typeof UploadSourceMetadata>

export const SourceChunk = z.object({
  id: z.string().uuid(),
  sourceId: z.string().uuid(),
  content: z.string(),
  charRange: z.object({ start: z.number().int(), end: z.number().int() }),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
})
export type SourceChunk = z.infer<typeof SourceChunk>

export const SourceChunksPage = z.object({
  items: z.array(SourceChunk),
  nextCursor: z.string().nullable(),
})
export type SourceChunksPage = z.infer<typeof SourceChunksPage>
```

- [ ] Add methods to `AgentClient`:

```ts
listSources(
  tenantId: string,
  filters: { cursor?: string; limit?: number; status?: 'queued' | 'indexing' | 'indexed' | 'failed' } = {},
  init: { signal?: AbortSignal } = {},
): Promise<ListSourcesResponse> {
  const search = new URLSearchParams({ tenantId })
  if (filters.cursor) search.set('cursor', filters.cursor)
  if (filters.limit) search.set('limit', String(filters.limit))
  if (filters.status) search.set('status', filters.status)
  const reqInit: { schema: typeof ListSourcesResponse; signal?: AbortSignal } = { schema: ListSourcesResponse }
  if (init.signal) reqInit.signal = init.signal
  return request(this.opts, `/rag/sources?${search.toString()}`, reqInit)
}

uploadSource(
  file: File,
  metadata: UploadSourceMetadata,
  init: { signal?: AbortSignal } = {},
): Promise<RagSource> {
  const form = new FormData()
  form.set('sourceName', metadata.sourceName)
  form.set('contentType', metadata.contentType)
  if (metadata.metadata) form.set('metadata', JSON.stringify(metadata.metadata))
  form.set('file', file, file.name)
  const reqInit: { schema: typeof RagSource; method: 'POST'; body: FormData; signal?: AbortSignal } = {
    schema: RagSource,
    method: 'POST',
    body: form,
  }
  if (init.signal) reqInit.signal = init.signal
  return request(this.opts, '/rag/sources', reqInit)
}

reindexSource(sourceId: string, init: { signal?: AbortSignal } = {}): Promise<RagSource> {
  const reqInit: { schema: typeof RagSource; method: 'POST'; signal?: AbortSignal } = {
    schema: RagSource,
    method: 'POST',
  }
  if (init.signal) reqInit.signal = init.signal
  return request(this.opts, `/rag/sources/${encodeURIComponent(sourceId)}/reindex`, reqInit)
}

getSourceChunks(
  sourceId: string,
  opts: { cursor?: string; limit?: number } = {},
  init: { signal?: AbortSignal } = {},
): Promise<SourceChunksPage> {
  const search = new URLSearchParams()
  if (opts.cursor) search.set('cursor', opts.cursor)
  if (opts.limit) search.set('limit', String(opts.limit))
  const qs = search.toString() ? `?${search.toString()}` : ''
  const reqInit: { schema: typeof SourceChunksPage; signal?: AbortSignal } = { schema: SourceChunksPage }
  if (init.signal) reqInit.signal = init.signal
  return request(this.opts, `/rag/sources/${encodeURIComponent(sourceId)}/chunks${qs}`, reqInit)
}
```

### Task 10.3 — Body.formData parsing test

- [ ] Create `platform/agent/sdk/src/client/uploadSource.formdata.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

describe('uploadSource FormData wire shape', () => {
  it('builds a Request whose body.formData() round-trips fields + file', async () => {
    const form = new FormData()
    form.set('sourceName', 'name.txt')
    form.set('contentType', 'text/plain')
    const file = new File([new Uint8Array([1, 2, 3])], 'name.txt', { type: 'text/plain' })
    form.set('file', file, file.name)
    const req = new Request('http://api.test/rag/sources', { method: 'POST', body: form })
    const parsed = await req.formData()
    expect(parsed.get('sourceName')).toBe('name.txt')
    expect(parsed.get('contentType')).toBe('text/plain')
    const got = parsed.get('file') as File
    expect(got.name).toBe('name.txt')
    expect(got.type).toBe('text/plain')
    expect(got.size).toBe(3)
  })
})
```

### Task 10.4 — Export schemas + types from package entry

- [ ] Edit `platform/agent/sdk/src/index.ts` and add:

```ts
export {
  IngestStatus,
  ListSourcesQuery,
  ListSourcesResponse,
  RagSource,
  SourceChunk,
  SourceChunksPage,
  UploadSourceMetadata,
} from './schemas/rag'
```

- [ ] Confirm `pnpm --filter @seta/agent-sdk test:unit` runs all three new specs green.

### Task 10.5 — MSW recording fixtures

- [ ] Create `platform/agent/sdk/__recordings__/rag/list-sources.json` and `upload-source.json` capturing the expected request/response shape. Match the shape used elsewhere in the package's existing `__recordings__/` directory (one JSON per scenario with `request` + `response` keys).

Commit:

```sh
git add platform/agent/sdk/src/client/AgentClient.ts platform/agent/sdk/src/client/AgentClient.test.ts platform/agent/sdk/src/client/uploadSource.formdata.test.ts platform/agent/sdk/src/schemas/rag.ts platform/agent/sdk/src/index.ts platform/agent/sdk/__recordings__/rag
git commit -m "feat(agent-sdk): listSources, uploadSource, reindexSource, getSourceChunks"
```

---

## Phase 11 — Studio TanStack Query bindings

### Task 11.1 — Add queryOptions + mutations

- [ ] Edit `apps/studio/src/api/queries.ts` (created in PR-3) and append:

```ts
import { queryOptions, type UseMutationOptions } from '@tanstack/react-query'
import type {
  ListSourcesResponse,
  RagSource,
  SourceChunksPage,
  UploadSourceMetadata,
} from '@seta/agent-sdk'
import { client } from './client'

export const sourcesQueryOptions = (tenantId: string, filters: { status?: RagSource['ingestStatus'] } = {}) =>
  queryOptions({
    queryKey: ['rag', 'sources', tenantId, filters],
    queryFn: ({ signal }) => client.listSources(tenantId, filters, { signal }),
    refetchInterval: (q) => {
      const data = q.state.data as ListSourcesResponse | undefined
      if (!data) return false
      return data.items.some((i) => i.ingestStatus === 'queued' || i.ingestStatus === 'indexing')
        ? 3000
        : false
    },
  })

export const sourceChunksQueryOptions = (sourceId: string, cursor?: string) =>
  queryOptions({
    queryKey: ['rag', 'sources', sourceId, 'chunks', cursor ?? null],
    queryFn: ({ signal }) =>
      client.getSourceChunks(sourceId, cursor ? { cursor } : {}, { signal }),
  })

export interface UploadVars {
  tenantId: string
  file: File
  metadata: UploadSourceMetadata
}

export const uploadSourceMutationOptions = (
  tenantId: string,
): UseMutationOptions<RagSource, Error, UploadVars, { previous?: ListSourcesResponse }> => ({
  mutationFn: ({ file, metadata }) => client.uploadSource(file, metadata),
  onMutate: async (vars) => {
    const qc = (await import('./client')).queryClient
    const key = ['rag', 'sources', vars.tenantId, {}]
    await qc.cancelQueries({ queryKey: key })
    const previous = qc.getQueryData<ListSourcesResponse>(key)
    const optimistic: RagSource = {
      id: `optimistic-${crypto.randomUUID()}`,
      name: vars.metadata.sourceName,
      contentType: vars.metadata.contentType,
      byteSize: vars.file.size,
      contentHash: '0'.repeat(64),
      ingestStatus: 'queued',
      chunkCount: 0,
      createdAt: new Date().toISOString(),
      indexedAt: null,
    }
    qc.setQueryData<ListSourcesResponse>(key, (prev) => ({
      items: [optimistic, ...(prev?.items ?? [])],
      nextCursor: prev?.nextCursor ?? null,
    }))
    return previous ? { previous } : {}
  },
  onError: (_err, vars, ctx) => {
    if (!ctx?.previous) return
    void import('./client').then(({ queryClient }) =>
      queryClient.setQueryData(['rag', 'sources', vars.tenantId, {}], ctx.previous),
    )
  },
  onSettled: (_d, _e, vars) => {
    void import('./client').then(({ queryClient }) =>
      queryClient.invalidateQueries({ queryKey: ['rag', 'sources', vars.tenantId] }),
    )
  },
})

export const reindexSourceMutationOptions = (
  tenantId: string,
): UseMutationOptions<RagSource, Error, string> => ({
  mutationFn: (sourceId) => client.reindexSource(sourceId),
  onSettled: () =>
    import('./client').then(({ queryClient }) =>
      queryClient.invalidateQueries({ queryKey: ['rag', 'sources', tenantId] }),
    ),
})
```

Commit:

```sh
git add apps/studio/src/api/queries.ts
git commit -m "feat(studio): rag query + mutation options with optimistic upload"
```

---

## Phase 12 — Studio /corpus page

### Task 12.1 — Build the list route

- [ ] Replace the stub at `apps/studio/src/routes/_authed/tenants.$id.corpus.tsx` with:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'
import {
  Button,
  Card,
  DataTable,
  Dialog,
  EmptyState,
  FileUpload,
  Input,
  StatusBadge,
  useToast,
} from '@seta/ui'
import type { RagSource } from '@seta/agent-sdk'
import {
  sourcesQueryOptions,
  uploadSourceMutationOptions,
} from '../../api/queries'

export const Route = createFileRoute('/_authed/tenants/$id/corpus')({
  loader: async ({ params, context }) => {
    await context.queryClient.ensureQueryData(sourcesQueryOptions(params.id))
  },
  component: CorpusPage,
})

const ACCEPT = '.pdf,.md,.txt,application/pdf,text/markdown,text/plain'
const ACCEPT_MIME = new Set(['application/pdf', 'text/markdown', 'text/plain'])

function CorpusPage() {
  const { id: tenantId } = Route.useParams()
  const { data } = useSuspenseQuery(sourcesQueryOptions(tenantId))
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<File | null>(null)
  const [name, setName] = useState('')
  const upload = useMutation(uploadSourceMutationOptions(tenantId))

  const submit = async () => {
    if (!pending) return
    try {
      await upload.mutateAsync({
        tenantId,
        file: pending,
        metadata: {
          sourceName: name || pending.name,
          contentType: pending.type || 'application/octet-stream',
        },
      })
      toast({ title: 'Uploaded', description: pending.name })
      setOpen(false)
      setPending(null)
      setName('')
    } catch (err) {
      toast({ title: 'Upload failed', description: (err as Error).message, variant: 'destructive' })
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-[20px] font-semibold">Corpus</h1>
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger asChild>
            <Button>Upload</Button>
          </Dialog.Trigger>
          <Dialog.Content>
            <Dialog.Title>Upload source</Dialog.Title>
            <Dialog.Description>PDF, Markdown, or plain text up to 100 MB.</Dialog.Description>
            <div className="mt-4 flex flex-col gap-3">
              <FileUpload
                accept={ACCEPT}
                maxSizeMb={100}
                onFilesSelected={(files) => {
                  const f = files[0]
                  if (!f) return
                  if (!ACCEPT_MIME.has(f.type) && !/\.(pdf|md|txt)$/i.test(f.name)) {
                    toast({ title: 'Unsupported file', description: f.name, variant: 'destructive' })
                    return
                  }
                  setPending(f)
                  setName(f.name)
                }}
                onReject={(f, reason) =>
                  toast({
                    title: reason === 'size' ? 'Too large' : 'Unsupported',
                    description: f.name,
                    variant: 'destructive',
                  })
                }
              />
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={submit} disabled={!pending || upload.isPending}>
                  {upload.isPending ? 'Uploading…' : 'Upload'}
                </Button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Root>
      </header>

      {data.items.length === 0 ? (
        <Card>
          <EmptyState title="No sources yet" description="Upload a PDF, MD, or TXT file to seed the corpus." />
        </Card>
      ) : (
        <DataTable<RagSource>
          rows={data.items}
          rowHref={(r) => `/tenants/${tenantId}/corpus/${r.id}`}
          columns={[
            { key: 'name', header: 'Name', cell: (r) => r.name },
            { key: 'contentType', header: 'Type', cell: (r) => r.contentType },
            {
              key: 'chunkCount',
              header: 'Chunks',
              align: 'right',
              cell: (r) => <span className="tabular-nums">{r.chunkCount}</span>,
            },
            {
              key: 'ingestStatus',
              header: 'Status',
              cell: (r) => (
                <StatusBadge
                  variant={
                    r.ingestStatus === 'indexed'
                      ? 'success'
                      : r.ingestStatus === 'failed'
                        ? 'error'
                        : 'info'
                  }
                >
                  {r.ingestStatus}
                </StatusBadge>
              ),
            },
            {
              key: 'indexedAt',
              header: 'Indexed',
              cell: (r) => (r.indexedAt ? new Date(r.indexedAt).toLocaleString() : '—'),
            },
          ]}
        />
      )}
    </div>
  )
}
```

### Task 12.2 — Build the detail route

- [ ] Replace the stub at `apps/studio/src/routes/_authed/tenants.$id.corpus.$sourceId.tsx` with:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { Button, Card, Code, DataTable, StatusBadge, useToast } from '@seta/ui'
import type { SourceChunk } from '@seta/agent-sdk'
import {
  reindexSourceMutationOptions,
  sourceChunksQueryOptions,
  sourcesQueryOptions,
} from '../../api/queries'

export const Route = createFileRoute('/_authed/tenants/$id/corpus/$sourceId')({
  loader: async ({ params, context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(sourcesQueryOptions(params.id)),
      context.queryClient.ensureQueryData(sourceChunksQueryOptions(params.sourceId)),
    ])
  },
  component: CorpusDetail,
})

function CorpusDetail() {
  const { id: tenantId, sourceId } = Route.useParams()
  const list = useSuspenseQuery(sourcesQueryOptions(tenantId))
  const chunks = useSuspenseQuery(sourceChunksQueryOptions(sourceId))
  const reindex = useMutation(reindexSourceMutationOptions(tenantId))
  const { toast } = useToast()
  const source = list.data.items.find((s) => s.id === sourceId)
  if (!source) return null

  return (
    <div className="flex flex-col gap-6 p-6">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-[20px] font-semibold">{source.name}</h1>
            <div className="flex gap-3 text-[13px] text-ink-mute">
              <span>{source.contentType}</span>
              <span className="tabular-nums">{source.byteSize.toLocaleString()} bytes</span>
              <span className="tabular-nums">{source.chunkCount} chunks</span>
              <StatusBadge
                variant={
                  source.ingestStatus === 'indexed'
                    ? 'success'
                    : source.ingestStatus === 'failed'
                      ? 'error'
                      : 'info'
                }
              >
                {source.ingestStatus}
              </StatusBadge>
              {source.indexedAt && <span>indexed {new Date(source.indexedAt).toLocaleString()}</span>}
            </div>
            {source.error && <Code>{source.error}</Code>}
          </div>
          <Button
            variant="secondary"
            disabled={reindex.isPending || source.ingestStatus === 'indexing'}
            onClick={async () => {
              try {
                await reindex.mutateAsync(source.id)
                toast({ title: 'Reindex started', description: source.name })
              } catch (err) {
                toast({ title: 'Reindex failed', description: (err as Error).message, variant: 'destructive' })
              }
            }}
          >
            Re-index
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-[15px] font-medium">Chunks</h2>
        <DataTable<SourceChunk>
          rows={chunks.data.items}
          columns={[
            { key: 'id', header: 'Id', cell: (c) => <span className="font-mono text-[12px]">{c.id.slice(0, 8)}</span> },
            { key: 'content', header: 'Preview', cell: (c) => c.content.slice(0, 120) },
            {
              key: 'charRange',
              header: 'Range',
              cell: (c) => <span className="tabular-nums">{c.charRange.start}–{c.charRange.end}</span>,
            },
          ]}
        />
      </Card>
    </div>
  )
}
```

Commit:

```sh
git add apps/studio/src/routes/_authed/tenants.$id.corpus.tsx apps/studio/src/routes/_authed/tenants.$id.corpus.$sourceId.tsx
git commit -m "feat(studio): /corpus list with optimistic upload + /corpus/:sourceId detail"
```

---

## Phase 13 — Agent panel route context — N/A in Studio

> Studio is admin-only and does NOT mount the right-side `AgentPanel` (master plan §0). There is no `apps/studio/src/nav/agentContext.ts` to extend for `/corpus` or `/corpus/:sourceId`. The `'corpus' | 'corpus-detail'` `AgentContext['page']` union values remain reserved in `@seta/ui` for OTHER Workspace modules that may surface RAG sources contextually. This phase is kept as a no-op marker so phase numbering matches the master plan.

---

## Phase 14 — Studio component tests (MSW)

### Task 14.1 — List page polls 3s while indexing

- [ ] Create `apps/studio/src/features/corpus/CorpusPage.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { CorpusPage } from './CorpusPage' // extract default export from the route file

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const indexing = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'doc.md', contentType: 'text/markdown', byteSize: 10,
  contentHash: 'a'.repeat(64), ingestStatus: 'indexing' as const,
  chunkCount: 0, createdAt: new Date().toISOString(), indexedAt: null,
}
const indexed = { ...indexing, ingestStatus: 'indexed' as const, chunkCount: 3, indexedAt: new Date().toISOString() }

describe('CorpusPage', () => {
  it('repolls and flips status from indexing → indexed within 3s window', async () => {
    vi.useFakeTimers()
    let call = 0
    server.use(
      http.get('http://api.test/rag/sources', () => {
        call++
        return HttpResponse.json({ items: [call === 1 ? indexing : indexed], nextCursor: null })
      }),
    )
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <CorpusPage />
      </QueryClientProvider>,
    )
    await screen.findByText('indexing')
    await vi.advanceTimersByTimeAsync(3100)
    await waitFor(() => expect(screen.queryByText('indexing')).not.toBeInTheDocument())
    expect(screen.getByText('indexed')).toBeInTheDocument()
    vi.useRealTimers()
  })
})
```

### Task 14.2 — Optimistic upload renders pending row then settles

- [ ] Add a second spec asserting that, after `userEvent` clicks Upload and selects a file, an `info` status row appears synchronously and is replaced by the server response on POST resolution.

### Task 14.3 — Reindex toast

- [ ] Create `apps/studio/src/features/corpus/CorpusDetail.test.tsx` that mocks `GET /rag/sources` + `GET /rag/sources/:id/chunks` + `POST /rag/sources/:id/reindex`, clicks the Re-index button, and asserts the success toast appears.

Commit:

```sh
git add apps/studio/src/features/corpus
git commit -m "test(studio): corpus list polling, optimistic upload, reindex toast"
```

---

## Phase 15 — E2E

### Task 15.1 — Playwright spec

- [ ] Create `tests/e2e/studio/corpus.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('upload tiny txt → indexing → indexed → reindex round-trip', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: /microsoft/i }).click()
  await page.waitForURL(/\/tenants/)
  await page.goto('/tenants/00000000-0000-0000-0000-000000000001/corpus')
  await page.getByRole('button', { name: 'Upload' }).click()
  const fileInput = page.locator('input[type=file]')
  await fileInput.setInputFiles({ name: 'demo.txt', mimeType: 'text/plain', buffer: Buffer.from('hello world\n') })
  await page.getByRole('button', { name: /^Upload$/ }).click()
  await expect(page.getByText('indexing')).toBeVisible()
  await expect(page.getByText('indexed')).toBeVisible({ timeout: 15_000 })
  await page.getByText('demo.txt').click()
  await page.getByRole('button', { name: 'Re-index' }).click()
  await expect(page.getByText('indexing')).toBeVisible()
  await expect(page.getByText('indexed')).toBeVisible({ timeout: 15_000 })
})

test('upload above 100MB cap is rejected with toast', async ({ page }) => {
  await page.goto('/tenants/00000000-0000-0000-0000-000000000001/corpus')
  await page.getByRole('button', { name: 'Upload' }).click()
  const huge = Buffer.alloc(101 * 1024 * 1024, 0)
  await page.locator('input[type=file]').setInputFiles({ name: 'big.txt', mimeType: 'text/plain', buffer: huge })
  await expect(page.getByText(/too large/i)).toBeVisible()
})
```

- [ ] Confirm `pnpm test:e2e --grep corpus` runs the spec green against the dockerized stack (`pnpm db:up` + `apps/api` boot).

Commit:

```sh
git add tests/e2e/studio/corpus.spec.ts
git commit -m "test(studio): e2e for corpus upload, reindex, and 100MB rejection"
```

---

## Phase 16 — Scope docs

### Task 16.1 — Update apps/api/SCOPE.md

- [ ] Add `/rag/*` to the "Routes mounted in `apps/api`" section, citing `@seta/agent-rag.createRagRoutes` as the owner. Remove the open-question line about `/rag/*` being unowned.

### Task 16.2 — Update apps/studio/SCOPE.md

- [ ] In §5 "Public interface → HTTP endpoints consumed", mark the four `/rag/*` rows as **implemented** (was: pending).
- [ ] In §4 "Tech stack", confirm the corpus slice uses `Dialog`, `FileUpload`, `DataTable`, `StatusBadge`, `Card`, `Code` from `@seta/ui` and TanStack Query optimistic updates.

Commit:

```sh
git add apps/api/SCOPE.md apps/studio/SCOPE.md
git commit -m "docs(scope): mark /rag/* mounted and corpus slice shipped"
```

---

## Phase 17 — Verification & demo

### Task 17.1 — Full repo gates

- [ ] Run `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:integration`. All green.
- [ ] Run `pnpm --filter @seta/studio build`. Bundle within budget.

### Task 17.2 — Demo state

- [ ] Bring up the local stack: `pnpm db:up` then `pnpm dev` (which runs `apps/api` and Studio).
- [ ] In a browser, log in via SSO and navigate to `/tenants/<id>/corpus`.
- [ ] Click **Upload**, choose a 10 KB markdown file (`demo.md`).
- [ ] Observe: an optimistic row with `info` status appears immediately.
- [ ] Observe: within ~3 s the row's status flips to `indexed` (live poll closes once no row is `queued`/`indexing`).
- [ ] Click the row → `/corpus/:sourceId`. Confirm:
  - `Card` shows name, content type, byte size, chunk count, and `indexed` `StatusBadge`.
  - The chunk preview `DataTable` lists the produced chunks.
  - Clicking **Re-index** flips the status back to `indexing`, triggers a `toast({ title: 'Reindex started' })`, then settles back to `indexed`.

- [ ] Confirm CI workflow passes on the PR.
