# R-19: Knowledge Base Ingestion Pipeline (Demo-Critical MVP) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the end-to-end knowledge base pipeline: admin upload (presigned S3 PUT) → pg-boss ingestion worker (chunk + embed) → `kb.retrieve` tRPC tool (pgvector HNSW cosine search) → admin list UI.

**Architecture:** Four new Drizzle tables (`agent_kb_document`, `agent_kb_chunk`, `agent_kb_embedding`, `agent_kb_ingestion_run`) with HNSW pgvector index and RLS. `KbIngestionWorker` (pg-boss) downloads via presigned GET URL, extracts text (`@future/documents` `parsePdf` for PDFs, UTF-8 for `.txt`/`.md`), chunks at 512 tokens, embeds in batches of 25 via `text-embedding-3-small` using `withProviderRetry`, inserts rows. `kb.retrieve` is a tRPC `.query()` that embeds the user query and runs HNSW `<=>` cosine scan (top-K ≤ 8). Admin page at `apps/web-admin/src/app/agents/knowledge-base/page.tsx`.

**Tech Stack:** TypeScript, Drizzle ORM + pgvector customType, pg-boss, `@future/documents` (parsePdf), `@future/storage` (S3StorageClient.getObjectBuffer), `text-embedding-3-small`, `withProviderRetry` (Plan 01), `gpt-tokenizer`

**Prerequisites:** Plan 01 (R-13) merged. Run `bun run --filter "@future/*" build` before tests.

---

## File Map

| Action           | Path                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------- |
| Modify           | `apps/api/src/modules/agents/infrastructure/schema/agents.schema.ts`                   |
| Modify           | `packages/db/src/append-rls.ts`                                                        |
| Modify           | `packages/storage/src/s3-storage-client.ts`                                            |
| Migration squash | `packages/db/drizzle/migrations/`                                                      |
| Create           | `apps/api/src/modules/agents/infrastructure/workers/kb-ingestion.worker.ts`            |
| Create           | `apps/api/src/modules/agents/infrastructure/workers/kb-ingestion.worker.spec.ts`       |
| Create           | `apps/api/src/modules/agents/infrastructure/retrieval/kb-retriever.ts`                 |
| Create           | `apps/api/src/modules/agents/infrastructure/retrieval/kb-retriever.spec.ts`            |
| Create           | `apps/api/src/modules/agents/intents/kb-retrieve.ts`                                   |
| Modify           | `apps/api/src/modules/agents/intents/index.ts`                                         |
| Create           | `apps/api/src/modules/agents/interface/trpc/kb.router.ts`                              |
| Modify           | `apps/api/src/modules/agents/interface/trpc/agents.router.ts`                          |
| Modify           | `apps/api/src/modules/agents/agents.module.ts`                                         |
| Modify           | `apps/api/src/modules/agents/infrastructure/schema/rls-all-tables.integration.spec.ts` |
| Create           | `apps/web-admin/src/app/agents/knowledge-base/page.tsx`                                |

---

## Task 1: Install `gpt-tokenizer` and Add `getObjectBuffer` to Storage

- [ ] **Step 1.1: Install `gpt-tokenizer` in the API app**

  ```bash
  bun add gpt-tokenizer --filter apps/api
  ```

  Verify it now appears in `apps/api/package.json` under `dependencies`.

- [ ] **Step 1.2: Add `getObjectBuffer` to `S3StorageClient`**

  In `packages/storage/src/s3-storage-client.ts`, after the `putObject` method, add:

  ```typescript
  async getObjectBuffer(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key })
    const response = await this.s3.send(command)
    if (!response.Body) throw new Error(`S3StorageClient: empty body for key ${key}`)
    const chunks: Uint8Array[] = []
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk)
    }
    return Buffer.concat(chunks)
  }
  ```

  Confirm `GetObjectCommand` is already imported (it is used by `getDownloadUrl`). If not, add it to the AWS SDK import line.

- [ ] **Step 1.3: Rebuild the storage package**

  ```bash
  bun run --filter @future/storage build
  ```

- [ ] **Step 1.4: Commit**

  ```bash
  git add packages/storage/src/s3-storage-client.ts apps/api/package.json bun.lock
  git commit -m "feat(storage): add getObjectBuffer to S3StorageClient"
  ```

---

## Task 2: Four KB Tables + pgvector + Migration Squash

- [ ] **Step 2.1: Add vector `customType` near the top of `agents.schema.ts`**

  In `apps/api/src/modules/agents/infrastructure/schema/agents.schema.ts`, directly after the existing `bytea` customType definition, add:

  ```typescript
  const vector = customType<{
    data: number[]
    driverData: string
    config: { dimensions: number }
  }>({
    dataType(config) {
      return `vector(${config?.dimensions ?? 1536})`
    },
    fromDriver(value: string): number[] {
      return JSON.parse(value) as number[]
    },
    toDriver(value: number[]): string {
      return `[${value.join(',')}]`
    },
  })
  ```

- [ ] **Step 2.2: Add the four KB tables to `agents.schema.ts`**

  Add after the `agentWriteDedup` table (or at the bottom of the table definitions, before the export type lines):

  ```typescript
  // ─── KB: Tenant Knowledge Base (R-19) ────────────────────────────────────

  export const agentKbDocument = agentsSchema.table(
    'agent_kb_document',
    {
      id: uuid('id').primaryKey().defaultRandom(),
      tenantId: uuid('tenant_id').notNull(),
      title: text('title').notNull(),
      description: text('description'),
      s3Key: text('s3_key').notNull(),
      visibilityScope: text('visibility_scope').notNull().default('all'),
      status: text('status').notNull().default('pending'),
      fileSizeBytes: integer('file_size_bytes'),
      chunkCount: integer('chunk_count'),
      errorMessage: text('error_message'),
      createdBy: uuid('created_by').notNull(),
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
      index('agent_kb_document_tenant_status_idx').on(t.tenantId, t.status),
      check(
        'agent_kb_document_status_check',
        sql`${t.status} IN ('pending', 'processing', 'ready', 'failed')`,
      ),
    ],
  )

  export const agentKbChunk = agentsSchema.table(
    'agent_kb_chunk',
    {
      id: uuid('id').primaryKey().defaultRandom(),
      documentId: uuid('document_id').notNull(),
      tenantId: uuid('tenant_id').notNull(),
      content: text('content').notNull(),
      position: integer('position').notNull(),
      tokenCount: integer('token_count').notNull(),
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [index('agent_kb_chunk_document_position_idx').on(t.documentId, t.position)],
  )

  export const agentKbEmbedding = agentsSchema.table('agent_kb_embedding', {
    chunkId: uuid('chunk_id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }).notNull(),
  })

  export const agentKbIngestionRun = agentsSchema.table(
    'agent_kb_ingestion_run',
    {
      id: uuid('id').primaryKey().defaultRandom(),
      documentId: uuid('document_id').notNull(),
      tenantId: uuid('tenant_id').notNull(),
      status: text('status').notNull().default('started'),
      chunksWritten: integer('chunks_written'),
      errorMessage: text('error_message'),
      startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
      finishedAt: timestamp('finished_at', { withTimezone: true }),
    },
    (t) => [
      index('agent_kb_ingestion_run_document_idx').on(t.documentId, t.startedAt.desc()),
      check(
        'agent_kb_ingestion_run_status_check',
        sql`${t.status} IN ('started', 'completed', 'failed')`,
      ),
    ],
  )

  export type AgentKbDocumentRow = typeof agentKbDocument.$inferSelect
  export type NewAgentKbDocumentRow = typeof agentKbDocument.$inferInsert
  export type AgentKbChunkRow = typeof agentKbChunk.$inferSelect
  export type NewAgentKbChunkRow = typeof agentKbChunk.$inferInsert
  export type AgentKbIngestionRunRow = typeof agentKbIngestionRun.$inferSelect
  export type NewAgentKbIngestionRunRow = typeof agentKbIngestionRun.$inferInsert
  ```

- [ ] **Step 2.3: Add four KB tables to `AGENTS_TABLES` in `packages/db/src/append-rls.ts`**

  Append after `'agent_write_dedup'` (or `'agent_semantic_index'` if R-12 is not yet merged):

  ```typescript
  'agent_kb_document',
  'agent_kb_chunk',
  'agent_kb_embedding',
  'agent_kb_ingestion_run',
  ```

- [ ] **Step 2.4: Add pgvector extension + HNSW index to `append-rls.ts` `main()`**

  In `packages/db/src/append-rls.ts`, in the `main()` function, prepend the extension DDL before the RLS blocks are pushed, and append the HNSW index at the very end. Locate the line `const blocks: string[] = [` and make these additions:

  **Before the RLS blocks (prepend):**

  ```typescript
  const blocks: string[] = [
    '',
    '-- Enable pgvector extension (required for VECTOR column and HNSW index)',
    'CREATE EXTENSION IF NOT EXISTS vector;',
    '',
    RLS_SENTINEL,
    // ... rest as before
  ```

  **After all RLS blocks (append, before `fs.appendFileSync`):**

  ```typescript
  blocks.push(
    '',
    '-- HNSW cosine-distance index for KB embeddings (SAD §5.3.1)',
    'CREATE INDEX IF NOT EXISTS agent_kb_embedding_hnsw_idx',
    '  ON agents.agent_kb_embedding USING hnsw (embedding vector_cosine_ops)',
    '  WITH (m = 16, ef_construction = 64);',
    '',
  )
  ```

- [ ] **Step 2.5: Squash the migration**

  ```bash
  rm packages/db/drizzle/migrations/*.sql
  rm -rf packages/db/drizzle/migrations/meta
  bun run db:generate --name initial
  ```

  Verify output:

  ```bash
  grep "CREATE EXTENSION IF NOT EXISTS vector" packages/db/drizzle/migrations/0000_initial.sql
  grep "agent_kb_embedding_hnsw_idx" packages/db/drizzle/migrations/0000_initial.sql
  grep -c "agent_kb_document\|agent_kb_chunk\|agent_kb_embedding\|agent_kb_ingestion_run" \
       packages/db/drizzle/migrations/0000_initial.sql
  ```

  Expected: each grep prints at least one line; count is ≥ 16 (4 tables × 4 DDL statements each).

- [ ] **Step 2.6: Re-migrate local DB**

  ```bash
  bun run db:down -v && bun run db:up && bun run db:migrate
  ```

- [ ] **Step 2.7: Run the RLS integration spec**

  ```bash
  cd apps/api && bun run test:integration -- rls-all-tables 2>&1 | tail -10
  ```

  Expected: all pass. The four KB tables are auto-covered because they are in `AGENTS_TABLES`.

- [ ] **Step 2.8: Commit**

  ```bash
  git add apps/api/src/modules/agents/infrastructure/schema/agents.schema.ts \
          packages/db/src/append-rls.ts \
          packages/db/drizzle/migrations/
  git commit -m "feat(agents/r19): add KB schema tables (document, chunk, embedding, ingestion_run) with HNSW + RLS"
  ```

---

## Task 3: `KbIngestionWorker`

- [ ] **Step 3.1: Write failing unit test**

  Create `apps/api/src/modules/agents/infrastructure/workers/kb-ingestion.worker.spec.ts`:

  ```typescript
  import { describe, expect, it, vi } from 'vitest'

  vi.mock('@future/documents', () => ({
    parsePdf: vi.fn().mockResolvedValue({ text: 'pdf text content' }),
  }))

  const mockS3 = { getObjectBuffer: vi.fn() }
  const mockEmbed = vi.fn()

  function makeDb(docStatus = 'pending') {
    const limitFn = vi
      .fn()
      .mockResolvedValue([
        { id: 'doc-1', status: docStatus, s3Key: 'test.txt', tenantId: 't1', title: 'Test' },
      ])
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn })
    const fromFn = vi.fn().mockReturnValue({ where: whereFn })
    const selectFn = vi.fn().mockReturnValue({ from: fromFn })
    const insertFn = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'chunk-1' }]),
      }),
    })
    const updateFn = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    })
    return { select: selectFn, insert: insertFn, update: updateFn }
  }

  describe('KbIngestionWorker', () => {
    it('skips a document whose status is not pending or processing', async () => {
      const { KbIngestionWorker } = await import('./kb-ingestion.worker')
      const db = makeDb('ready')
      const worker = new KbIngestionWorker(db as never, mockS3 as never, mockEmbed)
      await worker.handle({ documentId: 'doc-1', tenantId: 't1' })
      expect(mockS3.getObjectBuffer).not.toHaveBeenCalled()
    })

    it('processes a txt document end-to-end', async () => {
      const { KbIngestionWorker } = await import('./kb-ingestion.worker')
      const db = makeDb('pending')
      mockS3.getObjectBuffer.mockResolvedValue(Buffer.from('Hello. This is test content.'))
      mockEmbed.mockResolvedValue([[0.1, 0.2]])
      const worker = new KbIngestionWorker(db as never, mockS3 as never, mockEmbed)
      await worker.handle({ documentId: 'doc-1', tenantId: 't1' })
      expect(mockS3.getObjectBuffer).toHaveBeenCalledWith('test.txt')
      expect(db.insert).toHaveBeenCalled()
      expect(mockEmbed).toHaveBeenCalled()
    })
  })
  ```

- [ ] **Step 3.2: Run to confirm fail**

  ```bash
  cd apps/api && bun run test:unit -- kb-ingestion.worker.spec 2>&1 | tail -5
  ```

- [ ] **Step 3.3: Implement `KbIngestionWorker`**

  Create `apps/api/src/modules/agents/infrastructure/workers/kb-ingestion.worker.ts`:

  ```typescript
  import { Inject, Injectable, Logger } from '@nestjs/common'
  import { encode } from 'gpt-tokenizer'
  import { eq } from 'drizzle-orm'
  import type { Db } from '@future/db'
  import { S3StorageClient } from '@future/storage'
  import { parsePdf } from '@future/documents'
  import { BASE_DB_TOKEN } from '../../../../common/db/db.module'
  import {
    agentKbDocument,
    agentKbChunk,
    agentKbEmbedding,
    agentKbIngestionRun,
  } from '../schema/agents.schema'
  import { withProviderRetry } from '../adapters/provider-retry'

  export type KbIngestionJob = { documentId: string; tenantId: string }
  export type EmbedBatchFn = (inputs: string[]) => Promise<number[][]>

  const CHUNK_TOKEN_LIMIT = 512
  const CHUNK_OVERLAP_TOKENS = 50
  const EMBED_BATCH_SIZE = 25

  @Injectable()
  export class KbIngestionWorker {
    private readonly logger = new Logger(KbIngestionWorker.name)

    constructor(
      @Inject(BASE_DB_TOKEN) private readonly db: Db,
      private readonly storage: S3StorageClient,
      private readonly embedBatch: EmbedBatchFn,
    ) {}

    async registerJob(pgBoss: {
      work: (name: string, fn: (job: { data: KbIngestionJob }) => Promise<void>) => void
    }): Promise<void> {
      pgBoss.work('kb-ingestion', async (job) => {
        await this.handle(job.data)
      })
    }

    async handle(payload: KbIngestionJob): Promise<void> {
      const { documentId, tenantId } = payload

      const docs = await this.db
        .select()
        .from(agentKbDocument)
        .where(eq(agentKbDocument.id, documentId))
        .limit(1)

      const doc = docs[0]
      if (!doc || (doc.status !== 'pending' && doc.status !== 'processing')) {
        return
      }

      const runRows = await this.db
        .insert(agentKbIngestionRun)
        .values({ documentId, tenantId, status: 'started' })
        .returning({ id: agentKbIngestionRun.id })
      const runId = runRows[0]!.id

      await this.db
        .update(agentKbDocument)
        .set({ status: 'processing' })
        .where(eq(agentKbDocument.id, documentId))

      try {
        const fileBuffer = await this.storage.getObjectBuffer(doc.s3Key)

        let text: string
        if (doc.s3Key.endsWith('.pdf')) {
          const parsed = await parsePdf(fileBuffer)
          text = parsed.text
        } else {
          text = fileBuffer.toString('utf-8')
        }

        const chunks = splitIntoChunks(text, CHUNK_TOKEN_LIMIT, CHUNK_OVERLAP_TOKENS)

        const chunkRows = await this.db
          .insert(agentKbChunk)
          .values(
            chunks.map((c, i) => ({
              documentId,
              tenantId,
              content: c.text,
              position: i,
              tokenCount: c.tokenCount,
            })),
          )
          .returning({ id: agentKbChunk.id })

        for (let i = 0; i < chunkRows.length; i += EMBED_BATCH_SIZE) {
          const batchIds = chunkRows.slice(i, i + EMBED_BATCH_SIZE)
          const batchTexts = chunks.slice(i, i + EMBED_BATCH_SIZE).map((c) => c.text)

          const vectors = await withProviderRetry(() => this.embedBatch(batchTexts), {
            maxAttempts: 2,
          })

          await this.db.insert(agentKbEmbedding).values(
            batchIds.map((row, j) => ({
              chunkId: row.id,
              tenantId,
              embedding: vectors[j]!,
            })),
          )
        }

        await this.db
          .update(agentKbDocument)
          .set({ status: 'ready', chunkCount: chunkRows.length })
          .where(eq(agentKbDocument.id, documentId))

        await this.db
          .update(agentKbIngestionRun)
          .set({ status: 'completed', chunksWritten: chunkRows.length, finishedAt: new Date() })
          .where(eq(agentKbIngestionRun.id, runId))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await this.db
          .update(agentKbDocument)
          .set({ status: 'failed', errorMessage: msg })
          .where(eq(agentKbDocument.id, documentId))
        await this.db
          .update(agentKbIngestionRun)
          .set({ status: 'failed', errorMessage: msg, finishedAt: new Date() })
          .where(eq(agentKbIngestionRun.id, runId))
        this.logger.error(`kb-ingestion failed documentId=${documentId}: ${msg}`)
      }
    }
  }

  interface Chunk {
    text: string
    tokenCount: number
  }

  function splitIntoChunks(text: string, maxTokens: number, overlapTokens: number): Chunk[] {
    const sentences = text.split(/(?<=[.!?])\s+/)
    const chunks: Chunk[] = []
    let current = ''
    let currentTokens = 0

    for (const sentence of sentences) {
      const stokens = encode(sentence).length
      if (currentTokens + stokens > maxTokens && current.length > 0) {
        chunks.push({ text: current.trimEnd(), tokenCount: currentTokens })
        // carry overlap
        const words = current.split(' ')
        let overlapText = ''
        let overlapCount = 0
        for (let i = words.length - 1; i >= 0 && overlapCount < overlapTokens; i--) {
          overlapText = (words[i] ?? '') + ' ' + overlapText
          overlapCount += encode(words[i] ?? '').length
        }
        current = overlapText
        currentTokens = overlapCount
      }
      current += sentence + ' '
      currentTokens += stokens
    }

    if (current.trim().length > 0) {
      chunks.push({ text: current.trimEnd(), tokenCount: currentTokens })
    }

    return chunks.length > 0 ? chunks : [{ text: text.slice(0, 4000), tokenCount: maxTokens }]
  }
  ```

- [ ] **Step 3.4: Run tests — expect pass**

  ```bash
  cd apps/api && bun run test:unit -- kb-ingestion.worker.spec 2>&1 | tail -10
  ```

- [ ] **Step 3.5: Commit**

  ```bash
  git add apps/api/src/modules/agents/infrastructure/workers/kb-ingestion.worker.ts \
          apps/api/src/modules/agents/infrastructure/workers/kb-ingestion.worker.spec.ts
  git commit -m "feat(agents/r19): KbIngestionWorker — download, chunk, embed, store"
  ```

---

## Task 4: `KbRetriever` Service

- [ ] **Step 4.1: Write failing unit test**

  Create `apps/api/src/modules/agents/infrastructure/retrieval/kb-retriever.spec.ts`:

  ```typescript
  import { describe, expect, it, vi } from 'vitest'

  const mockEmbed = vi.fn()

  describe('KbRetriever', () => {
    it('returns mapped results from the DB query', async () => {
      const { KbRetriever } = await import('./kb-retriever')
      mockEmbed.mockResolvedValue([0.1, 0.2, 0.3])
      const mockDb = {
        execute: vi.fn().mockResolvedValue({
          rows: [
            {
              chunk_id: 'c1',
              content: 'Policy text',
              position: 0,
              document_id: 'd1',
              title: 'HR Handbook',
              score: 0.92,
            },
          ],
        }),
      }
      const retriever = new KbRetriever(mockDb as never, mockEmbed)
      const results = await retriever.retrieve('What is the leave policy?')
      expect(results).toHaveLength(1)
      expect(results[0]!.documentTitle).toBe('HR Handbook')
      expect(results[0]!.score).toBeCloseTo(0.92)
    })

    it('returns empty array when no results', async () => {
      const { KbRetriever } = await import('./kb-retriever')
      mockEmbed.mockResolvedValue([0.1])
      const mockDb = { execute: vi.fn().mockResolvedValue({ rows: [] }) }
      const retriever = new KbRetriever(mockDb as never, mockEmbed)
      expect(await retriever.retrieve('anything')).toEqual([])
    })
  })
  ```

- [ ] **Step 4.2: Run to confirm fail**

  ```bash
  cd apps/api && bun run test:unit -- kb-retriever.spec 2>&1 | tail -5
  ```

- [ ] **Step 4.3: Implement `KbRetriever`**

  Create `apps/api/src/modules/agents/infrastructure/retrieval/kb-retriever.ts`:

  ```typescript
  import { Injectable } from '@nestjs/common'
  import { sql } from 'drizzle-orm'
  import type { Db } from '@future/db'

  export type EmbedQueryFn = (query: string) => Promise<number[]>

  export interface KbChunkResult {
    chunkId: string
    documentId: string
    documentTitle: string
    section: string
    chunkContent: string
    score: number
  }

  const TOP_K = 8

  @Injectable()
  export class KbRetriever {
    constructor(
      private readonly db: Db,
      private readonly embedQuery: EmbedQueryFn,
    ) {}

    async retrieve(query: string): Promise<KbChunkResult[]> {
      const embedding = await this.embedQuery(query)
      const vectorLiteral = `[${embedding.join(',')}]`

      const result = (await this.db.execute(sql`
        SELECT
          c.id          AS chunk_id,
          c.content,
          c.position,
          d.id          AS document_id,
          d.title,
          1 - (e.embedding <=> ${vectorLiteral}::vector) AS score
        FROM   agents.agent_kb_chunk     c
        JOIN   agents.agent_kb_document  d ON d.id = c.document_id
        JOIN   agents.agent_kb_embedding e ON e.chunk_id = c.id
        WHERE  d.tenant_id = current_setting('app.tenant_id', true)::uuid
          AND  d.status    = 'ready'
        ORDER  BY e.embedding <=> ${vectorLiteral}::vector
        LIMIT  ${TOP_K}
      `)) as unknown as {
        rows: Array<{
          chunk_id: string
          content: string
          position: number
          document_id: string
          title: string
          score: number
        }>
      }

      return result.rows.map((r) => ({
        chunkId: r.chunk_id,
        documentId: r.document_id,
        documentTitle: r.title,
        section: `chunk ${r.position + 1}`,
        chunkContent: r.content,
        score: Number(r.score),
      }))
    }
  }
  ```

- [ ] **Step 4.4: Run tests — expect pass**

  ```bash
  cd apps/api && bun run test:unit -- kb-retriever.spec 2>&1 | tail -10
  ```

- [ ] **Step 4.5: Commit**

  ```bash
  git add apps/api/src/modules/agents/infrastructure/retrieval/kb-retriever.ts \
          apps/api/src/modules/agents/infrastructure/retrieval/kb-retriever.spec.ts
  git commit -m "feat(agents/r19): KbRetriever — HNSW cosine-distance retrieval top-K ≤ 8"
  ```

---

## Task 5: Intent Declaration and tRPC KB Router

- [ ] **Step 5.1: Create `kb-retrieve.ts` intent**

  Create `apps/api/src/modules/agents/intents/kb-retrieve.ts`:

  ```typescript
  import type { IntentDescriptor } from '../declare'

  export const kbRetrieveIntent: IntentDescriptor = {
    slug: 'kb.retrieve',
    domain: 'agents',
    description:
      'User is asking a question answerable from the tenant knowledge base (policies, handbooks, FAQs, process guides).',
  }
  ```

- [ ] **Step 5.2: Export from the barrel**

  In `apps/api/src/modules/agents/intents/index.ts`, add:

  ```typescript
  export { kbRetrieveIntent } from './kb-retrieve'
  ```

- [ ] **Step 5.3: Create `kb.router.ts`**

  Create `apps/api/src/modules/agents/interface/trpc/kb.router.ts`:

  ```typescript
  import { z } from 'zod'
  import { router, agentProcedure } from '../../../../common/trpc/trpc-init'
  import type { KbRetriever } from '../../infrastructure/retrieval/kb-retriever'
  import type { S3StorageClient } from '@future/storage'
  import { agentKbDocument } from '../../infrastructure/schema/agents.schema'
  import { desc, eq } from 'drizzle-orm'
  import type { Db } from '@future/db'

  let _retriever: KbRetriever
  let _storage: S3StorageClient
  let _db: Db

  export function setKbHandlers(retriever: KbRetriever, storage: S3StorageClient, db: Db): void {
    _retriever = retriever
    _storage = storage
    _db = db
  }

  const MAX_FILE_BYTES = 5 * 1024 * 1024
  const PRESIGNED_TTL_SEC = 600

  export const kbRouter = router({
    requestUpload: agentProcedure
      .input(
        z.object({
          title: z.string().min(1).max(200),
          description: z.string().max(1000).optional(),
          fileSizeBytes: z.number().int().positive(),
          contentType: z.enum(['text/plain', 'text/markdown', 'application/pdf']),
          fileName: z.string().min(1),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        if (input.fileSizeBytes > MAX_FILE_BYTES) {
          throw new Error(`File exceeds 5 MB limit`)
        }
        const s3Key = `kb/${ctx.tenantId}/${Date.now()}-${input.fileName}`
        const docs = await _db
          .insert(agentKbDocument)
          .values({
            tenantId: ctx.tenantId!,
            title: input.title,
            description: input.description ?? null,
            s3Key,
            status: 'pending',
            fileSizeBytes: input.fileSizeBytes,
            createdBy: ctx.actorId!,
          })
          .returning({ id: agentKbDocument.id })
        const documentId = docs[0]!.id
        const { url } = await _storage.getUploadUrl(s3Key, {
          contentType: input.contentType,
          expiresIn: PRESIGNED_TTL_SEC,
        })
        return { documentId, presignedUrl: url }
      }),

    confirmUpload: agentProcedure
      .input(z.object({ documentId: z.string().uuid() }))
      .mutation(async ({ input }) => {
        await _db
          .update(agentKbDocument)
          .set({ status: 'processing' })
          .where(eq(agentKbDocument.id, input.documentId))
        // pg-boss dispatch is handled by KbIngestionWorker.dispatchJob() called from the module
        return { ok: true }
      }),

    listDocuments: agentProcedure.query(async ({ ctx }) => {
      return _db
        .select()
        .from(agentKbDocument)
        .where(eq(agentKbDocument.tenantId, ctx.tenantId!))
        .orderBy(desc(agentKbDocument.createdAt))
    }),

    retrieve: agentProcedure
      .meta({
        agent: {
          whenToUse:
            'Use when the user asks about company policies, HR rules, onboarding procedures, internal FAQs, or any question whose answer is likely in a tenant-curated reference document.',
          whenNotToUse:
            'Do not use for questions about live operational data (tasks, plans, timesheets). Do not use when the answer is derivable from structured domain data alone.',
          examples: [
            {
              input: 'What is our parental leave policy?',
              callArgs: { query: 'parental leave policy' },
            },
            {
              input: 'How many days of annual leave do I have left?',
              callArgs: { query: 'annual leave days remaining' },
            },
          ],
          cacheable: { ttlSeconds: 300 },
        },
      })
      .input(z.object({ query: z.string().min(1).max(1000) }))
      .query(async ({ input }) => {
        return _retriever.retrieve(input.query)
      }),
  })
  ```

- [ ] **Step 5.4: Register `kbRouter` in `agents.router.ts`**

  In `apps/api/src/modules/agents/interface/trpc/agents.router.ts`:

  ```typescript
  import { kbRouter } from './kb.router'
  // add to router object:
  kb: kbRouter,
  ```

- [ ] **Step 5.5: Run lint:agent-authoring to verify kb.retrieve meta**

  ```bash
  bun run lint:agent-authoring 2>&1 | tail -10
  ```

  Expected: no drift errors for `kb.retrieve`.

- [ ] **Step 5.6: Commit**

  ```bash
  git add apps/api/src/modules/agents/intents/kb-retrieve.ts \
          apps/api/src/modules/agents/intents/index.ts \
          apps/api/src/modules/agents/interface/trpc/kb.router.ts \
          apps/api/src/modules/agents/interface/trpc/agents.router.ts
  git commit -m "feat(agents/r19): add kb.retrieve tRPC tool (SAD tool name) and kbRouter"
  ```

---

## Task 6: Wire into `agents.module.ts`

- [ ] **Step 6.1: Add imports**

  ```typescript
  import { KbIngestionWorker } from './infrastructure/workers/kb-ingestion.worker'
  import { KbRetriever } from './infrastructure/retrieval/kb-retriever'
  import { setKbHandlers } from './interface/trpc/kb.router'
  ```

- [ ] **Step 6.2: Add to `providers`**

  ```typescript
  KbIngestionWorker,
  KbRetriever,
  ```

- [ ] **Step 6.3: Call `setKbHandlers` in `onModuleInit`**

  Inject `KbRetriever`, the `S3StorageClient` token (or however storage is injected in the module), and the `BASE_DB_TOKEN`. Then:

  ```typescript
  setKbHandlers(this.kbRetriever, this.storageClient, this.db)
  ```

- [ ] **Step 6.4: Register the ingestion job in `onApplicationBootstrap`**

  ```typescript
  await this.kbIngestionWorker.registerJob(this.pgBossService)
  ```

- [ ] **Step 6.5: Typecheck**

  ```bash
  cd apps/api && bun run typecheck 2>&1 | tail -10
  ```

- [ ] **Step 6.6: Commit**

  ```bash
  git add apps/api/src/modules/agents/agents.module.ts
  git commit -m "feat(agents/r19): wire KbIngestionWorker and KbRetriever into AgentsModule"
  ```

---

## Task 7: Admin UI — Knowledge Base Page

- [ ] **Step 7.1: Create the page**

  Create `apps/web-admin/src/app/agents/knowledge-base/page.tsx`:

  ```tsx
  'use client'

  import { useState } from 'react'
  import { trpc } from '@/utils/trpc'
  import { Button } from '@future/ui'
  import { Input } from '@future/ui'
  import { Textarea } from '@future/ui'
  import { Badge } from '@future/ui'
  import { Skeleton } from '@future/ui'
  import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@future/ui'
  import { AdminPageHeader } from '@/components/admin-page-header'

  export default function KnowledgeBasePage() {
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [file, setFile] = useState<File | null>(null)
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const {
      data: documents,
      isLoading,
      refetch,
    } = trpc.agents.kb.listDocuments.useQuery(undefined, {
      refetchInterval: (data) => (data?.some((d) => d.status === 'processing') ? 5_000 : false),
    })
    const requestUpload = trpc.agents.kb.requestUpload.useMutation()
    const confirmUpload = trpc.agents.kb.confirmUpload.useMutation()

    async function handleSubmit(e: React.FormEvent) {
      e.preventDefault()
      if (!file || !title.trim()) return
      setUploading(true)
      setError(null)
      try {
        const { documentId, presignedUrl } = await requestUpload.mutateAsync({
          title: title.trim(),
          description: description.trim() || undefined,
          fileSizeBytes: file.size,
          contentType: file.type as 'text/plain' | 'text/markdown' | 'application/pdf',
          fileName: file.name,
        })
        await fetch(presignedUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        })
        await confirmUpload.mutateAsync({ documentId })
        setTitle('')
        setDescription('')
        setFile(null)
        void refetch()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed')
      } finally {
        setUploading(false)
      }
    }

    return (
      <div className="p-6 space-y-8">
        <AdminPageHeader
          title="Knowledge Base"
          description="Upload reference documents for the agent to answer tenant-specific questions."
        />

        <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
          <div className="space-y-1">
            <label className="text-sm font-medium">Title *</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Employee Handbook 2026"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional summary"
              rows={2}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">File (.txt, .md, .pdf — max 5 MB)</label>
            {/* file input is structural HTML per CLAUDE.md; interactive button wraps it */}
            <input
              type="file"
              accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block text-sm text-foreground"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={uploading || !file || !title.trim()}>
            {uploading ? 'Uploading…' : 'Upload Document'}
          </Button>
        </form>

        <div>
          <h2 className="text-lg font-medium mb-3">Documents</h2>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((n) => (
                <Skeleton key={n} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Chunks</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(documents ?? []).map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">{doc.title}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          doc.status === 'ready'
                            ? 'default'
                            : doc.status === 'failed'
                              ? 'destructive'
                              : 'secondary'
                        }
                      >
                        {doc.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {doc.fileSizeBytes != null
                        ? `${Math.round(doc.fileSizeBytes / 1024)} KB`
                        : '—'}
                    </TableCell>
                    <TableCell>{doc.chunkCount ?? '—'}</TableCell>
                    <TableCell>{new Date(doc.createdAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 7.2: Verify page renders in dev**

  ```bash
  bun run dev --filter apps/web-admin &
  # Open http://localhost:<web-admin-port>/agents/knowledge-base
  ```

  Confirm: header, upload form, and document table (with skeletons) render without console errors.

- [ ] **Step 7.3: Commit**

  ```bash
  git add apps/web-admin/src/app/agents/knowledge-base/page.tsx
  git commit -m "feat(web-admin/r19): Knowledge Base admin page — upload form + document list"
  ```

---

## Self-Review

- pgvector `CREATE EXTENSION IF NOT EXISTS vector` precedes all table DDL in the migration.
- All four KB tables are in `AGENTS_TABLES` — confirmed by RLS integration spec green.
- `KbRetriever` SQL uses `current_setting('app.tenant_id', true)::uuid` (2-arg, SAD §5.3.1).
- `LIMIT 8` enforces SAD NFR top-K ≤ 8.
- `kb.retrieve` is `.query()` (no `approvalFreshness`) with `cacheable: { ttlSeconds: 300 }`.
- `KbIngestionWorker` uses `withProviderRetry` for embedding calls.
- Admin file input is structural HTML; all interactive buttons use `<Button>` from `@future/ui`.
- Full suite: `cd apps/api && bun run test:unit && bun run test:integration`.
