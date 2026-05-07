# R-19-C: `KbIngestionWorker` — Download, Chunk, Embed, Store

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the pg-boss worker that downloads a document from S3, extracts text, splits into 512-token overlapping chunks, embeds in batches of 25, and persists chunks + embeddings to the DB.

**Prerequisites:** 03a-r19-foundation.md and 03b-r19-schema.md must be merged.

---

## File Map

| Action | Path                                                                             |
| ------ | -------------------------------------------------------------------------------- |
| Create | `apps/api/src/modules/agents/infrastructure/workers/kb-ingestion.worker.ts`      |
| Create | `apps/api/src/modules/agents/infrastructure/workers/kb-ingestion.worker.spec.ts` |

---

## Task 1: Write the failing unit test (TDD — test first)

- [ ] **Step 1.1: Create the spec file**

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

- [ ] **Step 1.2: Run to confirm it fails (no implementation yet)**

  ```bash
  cd apps/api && bun run test:unit -- kb-ingestion.worker.spec 2>&1 | tail -5
  ```

---

## Task 2: Implement `KbIngestionWorker`

- [ ] **Step 2.1: Create the worker**

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
        // carry overlap: keep last N tokens to preserve context across chunk boundary
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

---

## Task 3: Verify tests pass

- [ ] **Step 3.1: Run unit tests**

  ```bash
  cd apps/api && bun run test:unit -- kb-ingestion.worker.spec 2>&1 | tail -10
  ```

  Expected: both tests pass.

---

## Task 4: Commit

- [ ] **Step 4.1: Commit**

  ```bash
  git add apps/api/src/modules/agents/infrastructure/workers/kb-ingestion.worker.ts \
          apps/api/src/modules/agents/infrastructure/workers/kb-ingestion.worker.spec.ts
  git commit -m "feat(agents/r19): KbIngestionWorker — download, chunk, embed, store"
  ```
