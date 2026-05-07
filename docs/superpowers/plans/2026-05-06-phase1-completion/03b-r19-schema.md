# R-19-B: KB Schema — Four Tables + pgvector + HNSW + Migration Squash

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the four KB Drizzle tables, enable pgvector, add the HNSW index, register RLS, and squash the migration.

**Prerequisites:** 03a-r19-foundation.md must be merged.

---

## File Map

| Action           | Path                                                                 |
| ---------------- | -------------------------------------------------------------------- |
| Modify           | `apps/api/src/modules/agents/infrastructure/schema/agents.schema.ts` |
| Modify           | `packages/db/src/append-rls.ts`                                      |
| Migration squash | `packages/db/drizzle/migrations/`                                    |

---

## Task 1: Add `vector` customType to `agents.schema.ts`

- [ ] **Step 1.1: Add the customType**

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

---

## Task 2: Add the four KB tables to `agents.schema.ts`

- [ ] **Step 2.1: Add tables**

  Add after the `agentWriteDedup` table (before export type lines):

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

---

## Task 3: Register KB tables in RLS and add pgvector + HNSW index

- [ ] **Step 3.1: Add four KB tables to `AGENTS_TABLES` in `packages/db/src/append-rls.ts`**

  Append after `'agent_write_dedup'`:

  ```typescript
  'agent_kb_document',
  'agent_kb_chunk',
  'agent_kb_embedding',
  'agent_kb_ingestion_run',
  ```

- [ ] **Step 3.2: Add pgvector extension before RLS blocks**

  In `packages/db/src/append-rls.ts`, locate `const blocks: string[] = [` in `main()` and prepend:

  ```typescript
  const blocks: string[] = [
    '',
    '-- Enable pgvector extension (required for VECTOR column and HNSW index)',
    'CREATE EXTENSION IF NOT EXISTS vector;',
    '',
    RLS_SENTINEL,
    // ... rest as before
  ```

- [ ] **Step 3.3: Append HNSW index after all RLS blocks**

  Before `fs.appendFileSync`, push:

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

---

## Task 4: Squash the migration

- [ ] **Step 4.1: Delete existing migration files**

  ```bash
  rm packages/db/drizzle/migrations/*.sql
  rm -rf packages/db/drizzle/migrations/meta
  ```

- [ ] **Step 4.2: Generate fresh migration**

  ```bash
  bun run db:generate --name initial
  ```

- [ ] **Step 4.3: Verify migration content**

  ```bash
  grep "CREATE EXTENSION IF NOT EXISTS vector" packages/db/drizzle/migrations/0000_initial.sql
  grep "agent_kb_embedding_hnsw_idx" packages/db/drizzle/migrations/0000_initial.sql
  grep -c "agent_kb_document\|agent_kb_chunk\|agent_kb_embedding\|agent_kb_ingestion_run" \
       packages/db/drizzle/migrations/0000_initial.sql
  ```

  Expected: each grep prints at least one line; count is ≥ 16 (4 tables × 4 DDL statements each).

- [ ] **Step 4.4: Re-migrate local DB**

  ```bash
  bun run db:down -v && bun run db:up && bun run db:migrate
  ```

---

## Task 5: Verify RLS integration spec

- [ ] **Step 5.1: Run the spec**

  ```bash
  cd apps/api && bun run test:integration -- rls-all-tables 2>&1 | tail -10
  ```

  Expected: all pass. The four KB tables are auto-covered because they are in `AGENTS_TABLES`.

---

## Task 6: Commit

- [ ] **Step 6.1: Commit**

  ```bash
  git add apps/api/src/modules/agents/infrastructure/schema/agents.schema.ts \
          packages/db/src/append-rls.ts \
          packages/db/drizzle/migrations/
  git commit -m "feat(agents/r19): add KB schema tables (document, chunk, embedding, ingestion_run) with HNSW + RLS"
  ```
