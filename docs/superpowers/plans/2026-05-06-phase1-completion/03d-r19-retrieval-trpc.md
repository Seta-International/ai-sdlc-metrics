# R-19-D: `KbRetriever` + tRPC KB Router

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the HNSW cosine-distance retriever and wire it into a tRPC `kb` router with `requestUpload`, `confirmUpload`, `listDocuments`, and `retrieve` procedures.

**Prerequisites:** 03b-r19-schema.md must be merged. (Can run in parallel with 03c-r19-ingestion-worker.md.)

---

## File Map

| Action | Path                                                                        |
| ------ | --------------------------------------------------------------------------- |
| Create | `apps/api/src/modules/agents/infrastructure/retrieval/kb-retriever.ts`      |
| Create | `apps/api/src/modules/agents/infrastructure/retrieval/kb-retriever.spec.ts` |
| Create | `apps/api/src/modules/agents/intents/kb-retrieve.ts`                        |
| Modify | `apps/api/src/modules/agents/intents/index.ts`                              |
| Create | `apps/api/src/modules/agents/interface/trpc/kb.router.ts`                   |
| Modify | `apps/api/src/modules/agents/interface/trpc/agents.router.ts`               |

---

## Task 1: Write the failing unit test for `KbRetriever` (TDD — test first)

- [ ] **Step 1.1: Create the spec file**

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

- [ ] **Step 1.2: Run to confirm it fails**

  ```bash
  cd apps/api && bun run test:unit -- kb-retriever.spec 2>&1 | tail -5
  ```

---

## Task 2: Implement `KbRetriever`

- [ ] **Step 2.1: Create the retriever**

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

- [ ] **Step 2.2: Run tests — expect pass**

  ```bash
  cd apps/api && bun run test:unit -- kb-retriever.spec 2>&1 | tail -10
  ```

- [ ] **Step 2.3: Commit**

  ```bash
  git add apps/api/src/modules/agents/infrastructure/retrieval/kb-retriever.ts \
          apps/api/src/modules/agents/infrastructure/retrieval/kb-retriever.spec.ts
  git commit -m "feat(agents/r19): KbRetriever — HNSW cosine-distance retrieval top-K ≤ 8"
  ```

---

## Task 3: Intent declaration

- [ ] **Step 3.1: Create `kb-retrieve.ts` intent**

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

- [ ] **Step 3.2: Export from the barrel**

  In `apps/api/src/modules/agents/intents/index.ts`, add:

  ```typescript
  export { kbRetrieveIntent } from './kb-retrieve'
  ```

---

## Task 4: Create `kb.router.ts` and register in agents router

- [ ] **Step 4.1: Create the router**

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
        // pg-boss dispatch is handled by KbIngestionWorker.registerJob() wired in AgentsModule
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

- [ ] **Step 4.2: Register `kbRouter` in `agents.router.ts`**

  In `apps/api/src/modules/agents/interface/trpc/agents.router.ts`, add the import and route:

  ```typescript
  import { kbRouter } from './kb.router'
  // add to router object:
  kb: kbRouter,
  ```

- [ ] **Step 4.3: Verify agent-authoring lint**

  ```bash
  bun run lint:agent-authoring 2>&1 | tail -10
  ```

  Expected: no drift errors for `kb.retrieve`.

- [ ] **Step 4.4: Commit**

  ```bash
  git add apps/api/src/modules/agents/intents/kb-retrieve.ts \
          apps/api/src/modules/agents/intents/index.ts \
          apps/api/src/modules/agents/interface/trpc/kb.router.ts \
          apps/api/src/modules/agents/interface/trpc/agents.router.ts
  git commit -m "feat(agents/r19): add kb.retrieve tRPC tool (SAD tool name) and kbRouter"
  ```
