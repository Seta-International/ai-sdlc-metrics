# R-12: Idempotency Schema for Write Tools — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `agent_write_dedup` table (SAD data invariant D-5) so write tool calls are retry-safe: a repeated call with the same `(turn_id, tool_call_id, canonicalArgs)` returns the cached result instead of re-executing.

**Architecture:** New Drizzle table `agents.agent_write_dedup` with `idempotency_key TEXT PRIMARY KEY`, 24-hour TTL, RLS tenant isolation. `ToolGateway.invoke()` computes `sha256(turnId:toolCallId:argsHash)` before write-tool execution; on dedup hit it returns cached `result_json`; on miss it executes and inserts. A new `SweepExpiredWriteDedupWorker` (pg-boss daily at 03:00 UTC) purges expired rows, following the `DraftExpirySweeper` pattern.

**Tech Stack:** TypeScript, Drizzle ORM, pg-boss, `canonicalize()` from `infrastructure/cache/canonical-args.ts`, `node:crypto`, PostgreSQL RLS

**Prerequisite:** Plan 01 must be merged (tests run on a green base). No direct code dependency on Plan 01.

---

## File Map

| Action           | Path                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| Modify           | `apps/api/src/modules/agents/infrastructure/schema/agents.schema.ts`                             |
| Modify           | `packages/db/src/append-rls.ts`                                                                  |
| Migration squash | `packages/db/drizzle/migrations/`                                                                |
| Create           | `apps/api/src/modules/agents/domain/repositories/write-dedup.repository.ts`                      |
| Create           | `apps/api/src/modules/agents/infrastructure/repositories/drizzle-write-dedup.repository.ts`      |
| Create           | `apps/api/src/modules/agents/infrastructure/repositories/drizzle-write-dedup.repository.spec.ts` |
| Create           | `apps/api/src/modules/agents/infrastructure/workers/sweep-expired-write-dedup.ts`                |
| Create           | `apps/api/src/modules/agents/infrastructure/workers/sweep-expired-write-dedup.spec.ts`           |
| Modify           | `apps/api/src/modules/agents/application/services/tool-gateway.ts`                               |
| Modify           | `apps/api/src/modules/agents/agents.module.ts`                                                   |
| Modify           | `apps/api/src/modules/agents/infrastructure/schema/rls-all-tables.integration.spec.ts`           |

---

## Task 1: Schema Table + AGENTS_TABLES + Migration Squash

- [ ] **Step 1.1: Add `agentWriteDedup` table to `agents.schema.ts`**

  In `apps/api/src/modules/agents/infrastructure/schema/agents.schema.ts`, add before the final `export type` block at the end of the file:

  ```typescript
  export const agentWriteDedup = agentsSchema.table(
    'agent_write_dedup',
    {
      idempotencyKey: text('idempotency_key').primaryKey(),
      tenantId: uuid('tenant_id').notNull(),
      turnId: uuid('turn_id').notNull(),
      toolName: text('tool_name').notNull(),
      resultJson: jsonb('result_json').notNull(),
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    },
    (t) => [index('agent_write_dedup_tenant_expires_idx').on(t.tenantId, t.expiresAt)],
  )

  export type AgentWriteDedupRow = typeof agentWriteDedup.$inferSelect
  export type NewAgentWriteDedupRow = typeof agentWriteDedup.$inferInsert
  ```

- [ ] **Step 1.2: Add `agent_write_dedup` to `AGENTS_TABLES` in `packages/db/src/append-rls.ts`**

  In `packages/db/src/append-rls.ts`, find `AGENTS_TABLES` and append `'agent_write_dedup'` as the last entry:

  ```typescript
  export const AGENTS_TABLES = [
    // ... existing entries ...
    'agent_semantic_index',
    'agent_write_dedup', // ← new
  ] as const
  ```

- [ ] **Step 1.3: Squash the migration**

  ```bash
  rm packages/db/drizzle/migrations/*.sql
  rm -rf packages/db/drizzle/migrations/meta
  bun run db:generate --name initial
  ```

  Verify the new table and its RLS policy appear in the generated SQL:

  ```bash
  grep -c "agent_write_dedup" packages/db/drizzle/migrations/0000_initial.sql
  ```

  Expected: at least 4 matches (CREATE TABLE, ENABLE RLS, FORCE RLS, CREATE POLICY).

- [ ] **Step 1.4: Re-migrate the local DB**

  ```bash
  bun run db:down -v && bun run db:up && bun run db:migrate
  ```

  Expected: completes without error.

- [ ] **Step 1.5: Run existing RLS integration spec**

  ```bash
  cd apps/api && bun run test:integration -- rls-all-tables 2>&1 | tail -10
  ```

  Expected: all tests pass. The `agent_write_dedup` RLS test is auto-generated because the table is in `AGENTS_TABLES`.

- [ ] **Step 1.6: Commit**

  ```bash
  git add apps/api/src/modules/agents/infrastructure/schema/agents.schema.ts \
          packages/db/src/append-rls.ts \
          packages/db/drizzle/migrations/
  git commit -m "feat(agents/r12): add agent_write_dedup schema with RLS (D-5)"
  ```

---

## Task 2: Repository Interface and Drizzle Implementation

- [ ] **Step 2.1: Write the failing integration test**

  Create `apps/api/src/modules/agents/infrastructure/repositories/drizzle-write-dedup.repository.spec.ts`:

  ```typescript
  import { sql } from 'drizzle-orm'
  import { beforeAll, describe, expect, it } from 'vitest'
  import { createTestDb, migrateForTest } from '@future/db/test-helpers'

  const TENANT_ID = '00000000-0000-0000-0000-000000000001'

  describe('DrizzleWriteDedupRepository', () => {
    const db = createTestDb()

    beforeAll(async () => {
      await migrateForTest()
    })

    it('inserts a row and findByKey returns it', async () => {
      const { DrizzleWriteDedupRepository } = await import('./drizzle-write-dedup.repository')
      const repo = new DrizzleWriteDedupRepository(db)
      await db.execute(sql`SET app.tenant_id = ${TENANT_ID}`)

      const key = `key-insert-${Date.now()}`
      await repo.insert({
        idempotencyKey: key,
        tenantId: TENANT_ID,
        turnId: '00000000-0000-0000-0000-000000000002',
        toolName: 'planner.create-task',
        resultJson: { taskId: 'abc' },
        expiresAt: new Date(Date.now() + 86_400_000),
      })

      const row = await repo.findByKey(key)
      expect(row).not.toBeNull()
      expect(row!.toolName).toBe('planner.create-task')
      expect(row!.resultJson).toEqual({ taskId: 'abc' })
    })

    it('returns null for an unknown key', async () => {
      const { DrizzleWriteDedupRepository } = await import('./drizzle-write-dedup.repository')
      const repo = new DrizzleWriteDedupRepository(db)
      await db.execute(sql`SET app.tenant_id = ${TENANT_ID}`)
      expect(await repo.findByKey('no-such-key')).toBeNull()
    })

    it('deleteExpired removes rows with expiresAt in the past', async () => {
      const { DrizzleWriteDedupRepository } = await import('./drizzle-write-dedup.repository')
      const repo = new DrizzleWriteDedupRepository(db)
      await db.execute(sql`SET app.tenant_id = ${TENANT_ID}`)

      const key = `key-expired-${Date.now()}`
      await repo.insert({
        idempotencyKey: key,
        tenantId: TENANT_ID,
        turnId: '00000000-0000-0000-0000-000000000003',
        toolName: 'planner.update-task',
        resultJson: { ok: true },
        expiresAt: new Date(Date.now() - 1000), // expired 1 s ago
      })

      await repo.deleteExpired()

      // Read without RLS filter to confirm row is gone
      await db.execute(sql`RESET app.tenant_id`)
      const rows = (await db.execute(
        sql`SELECT 1 FROM agents.agent_write_dedup WHERE idempotency_key = ${key}`,
      )) as unknown as { rows: unknown[] }
      expect(rows.rows).toHaveLength(0)
    })
  })
  ```

- [ ] **Step 2.2: Run to confirm fail**

  ```bash
  cd apps/api && bun run test:integration -- drizzle-write-dedup 2>&1 | tail -5
  ```

  Expected: import error — file does not exist yet.

- [ ] **Step 2.3: Create domain repository interface**

  Create `apps/api/src/modules/agents/domain/repositories/write-dedup.repository.ts`:

  ```typescript
  import type {
    AgentWriteDedupRow,
    NewAgentWriteDedupRow,
  } from '../../infrastructure/schema/agents.schema'

  export const WRITE_DEDUP_REPOSITORY = Symbol('WRITE_DEDUP_REPOSITORY')

  export interface IWriteDedupRepository {
    findByKey(idempotencyKey: string): Promise<AgentWriteDedupRow | null>
    insert(row: NewAgentWriteDedupRow): Promise<void>
    deleteExpired(): Promise<{ deletedCount: number }>
  }
  ```

- [ ] **Step 2.4: Create Drizzle implementation**

  Create `apps/api/src/modules/agents/infrastructure/repositories/drizzle-write-dedup.repository.ts`:

  ```typescript
  import { Injectable } from '@nestjs/common'
  import { eq, lt } from 'drizzle-orm'
  import type { Db } from '@future/db'
  import {
    agentWriteDedup,
    type AgentWriteDedupRow,
    type NewAgentWriteDedupRow,
  } from '../schema/agents.schema'
  import type { IWriteDedupRepository } from '../../domain/repositories/write-dedup.repository'

  @Injectable()
  export class DrizzleWriteDedupRepository implements IWriteDedupRepository {
    constructor(private readonly db: Db) {}

    async findByKey(idempotencyKey: string): Promise<AgentWriteDedupRow | null> {
      const rows = await this.db
        .select()
        .from(agentWriteDedup)
        .where(eq(agentWriteDedup.idempotencyKey, idempotencyKey))
        .limit(1)
      return rows[0] ?? null
    }

    async insert(row: NewAgentWriteDedupRow): Promise<void> {
      await this.db.insert(agentWriteDedup).values(row).onConflictDoNothing()
    }

    async deleteExpired(): Promise<{ deletedCount: number }> {
      const result = await this.db
        .delete(agentWriteDedup)
        .where(lt(agentWriteDedup.expiresAt, new Date()))
      return { deletedCount: result.rowCount ?? 0 }
    }
  }
  ```

- [ ] **Step 2.5: Run integration test — expect pass**

  ```bash
  cd apps/api && bun run test:integration -- drizzle-write-dedup 2>&1 | tail -10
  ```

- [ ] **Step 2.6: Commit**

  ```bash
  git add apps/api/src/modules/agents/domain/repositories/write-dedup.repository.ts \
          apps/api/src/modules/agents/infrastructure/repositories/drizzle-write-dedup.repository.ts \
          apps/api/src/modules/agents/infrastructure/repositories/drizzle-write-dedup.repository.spec.ts
  git commit -m "feat(agents/r12): add IWriteDedupRepository interface and DrizzleWriteDedupRepository"
  ```

---

## Task 3: Expiry Sweeper Worker

- [ ] **Step 3.1: Write failing unit test**

  Create `apps/api/src/modules/agents/infrastructure/workers/sweep-expired-write-dedup.spec.ts`:

  ```typescript
  import { describe, expect, it, vi } from 'vitest'
  import { SweepExpiredWriteDedupWorker } from './sweep-expired-write-dedup'
  import type { IWriteDedupRepository } from '../../domain/repositories/write-dedup.repository'

  function makeRepo(deletedCount = 0): IWriteDedupRepository {
    return {
      findByKey: vi.fn(),
      insert: vi.fn(),
      deleteExpired: vi.fn().mockResolvedValue({ deletedCount }),
    }
  }

  describe('SweepExpiredWriteDedupWorker', () => {
    it('calls deleteExpired and returns the count', async () => {
      const repo = makeRepo(3)
      const worker = new SweepExpiredWriteDedupWorker(repo)
      expect(await worker.run()).toEqual({ deletedCount: 3 })
      expect(repo.deleteExpired).toHaveBeenCalledOnce()
    })

    it('returns 0 when nothing is expired', async () => {
      expect(await new SweepExpiredWriteDedupWorker(makeRepo(0)).run()).toEqual({ deletedCount: 0 })
    })
  })
  ```

- [ ] **Step 3.2: Run to confirm fail**

  ```bash
  cd apps/api && bun run test:unit -- sweep-expired-write-dedup 2>&1 | tail -5
  ```

- [ ] **Step 3.3: Implement the worker**

  Create `apps/api/src/modules/agents/infrastructure/workers/sweep-expired-write-dedup.ts`:

  ```typescript
  import { Inject, Injectable } from '@nestjs/common'
  import {
    WRITE_DEDUP_REPOSITORY,
    type IWriteDedupRepository,
  } from '../../domain/repositories/write-dedup.repository'
  import type { PgBossService } from '../../../../common/jobs/pg-boss.service'

  export const SWEEP_WRITE_DEDUP_JOB_NAME = 'agents.write-dedup-sweep'

  @Injectable()
  export class SweepExpiredWriteDedupWorker {
    constructor(@Inject(WRITE_DEDUP_REPOSITORY) private readonly repo: IWriteDedupRepository) {}

    async registerJob(pgBossService: PgBossService): Promise<void> {
      await pgBossService.schedule(SWEEP_WRITE_DEDUP_JOB_NAME, '0 3 * * *')
      pgBossService.registerScheduledWorker(SWEEP_WRITE_DEDUP_JOB_NAME, async () => {
        await this.run()
      })
    }

    async run(): Promise<{ deletedCount: number }> {
      return this.repo.deleteExpired()
    }
  }
  ```

- [ ] **Step 3.4: Run tests — expect pass**

  ```bash
  cd apps/api && bun run test:unit -- sweep-expired-write-dedup 2>&1 | tail -10
  ```

- [ ] **Step 3.5: Commit**

  ```bash
  git add apps/api/src/modules/agents/infrastructure/workers/sweep-expired-write-dedup.ts \
          apps/api/src/modules/agents/infrastructure/workers/sweep-expired-write-dedup.spec.ts
  git commit -m "feat(agents/r12): add SweepExpiredWriteDedupWorker (daily purge)"
  ```

---

## Task 4: Idempotency Check in `ToolGateway`

- [ ] **Step 4.1: Add imports to `tool-gateway.ts`**

  ```typescript
  import { createHash } from 'node:crypto'
  import {
    WRITE_DEDUP_REPOSITORY,
    type IWriteDedupRepository,
  } from '../../domain/repositories/write-dedup.repository'
  ```

- [ ] **Step 4.2: Add `IWriteDedupRepository` injection to the gateway constructor**

  ```typescript
  @Inject(WRITE_DEDUP_REPOSITORY) private readonly writeDedupRepo: IWriteDedupRepository,
  ```

- [ ] **Step 4.3: Add the key computation helper method**

  ```typescript
  private computeIdempotencyKey(turnId: string, toolCallId: string, args: unknown): string {
    const { hash: argsHash } = canonicalize(args)
    return createHash('sha256').update(`${turnId}:${toolCallId}:${argsHash}`).digest('hex')
  }
  ```

  Note: `canonicalize` is already imported in `tool-gateway.ts`.

- [ ] **Step 4.4: Insert the dedup guard before `invokeStep()` for mutation tools**

  Find the write-tool execution path inside `invoke()`. After the `preWriteAbortCheck` step and before `let invokeResult = await invokeStep()`, add:

  ```typescript
  // D-5: idempotency dedup for mutation tools
  let _idempotencyKey: string | undefined
  if (descriptor.type === 'mutation' && requestContext.turnId && requestContext.toolCallId) {
    _idempotencyKey = this.computeIdempotencyKey(
      requestContext.turnId,
      requestContext.toolCallId,
      args,
    )
    const cached = await this.writeDedupRepo.findByKey(_idempotencyKey)
    if (cached !== null && cached.expiresAt > new Date()) {
      return ok(cached.resultJson)
    }
  }
  ```

  After a successful tool execution (where `ok(result)` is assembled), insert the dedup row:

  ```typescript
  if (_idempotencyKey && requestContext.turnId) {
    await this.writeDedupRepo.insert({
      idempotencyKey: _idempotencyKey,
      tenantId: requestContext.tenantId,
      turnId: requestContext.turnId,
      toolName: descriptor.name,
      resultJson: result as Record<string, unknown>,
      expiresAt: new Date(Date.now() + 86_400_000),
    })
  }
  ```

  If `requestContext` does not currently carry `turnId` / `toolCallId`, check `ToolGatewayInvokeInput` (in `tool-gateway-contracts.ts`) and add these as optional fields:

  ```typescript
  turnId?: string
  toolCallId?: string
  ```

- [ ] **Step 4.5: Run tool-gateway tests + add a dedup unit test**

  Add a test in `tool-gateway.spec.ts` (or create one if absent) that asserts:
  - When `writeDedupRepo.findByKey` returns a non-null non-expired row, `invoke()` returns the cached result without calling `invokeStep`.
  - When `findByKey` returns null, `invoke()` calls `invokeStep` and then calls `writeDedupRepo.insert`.

  ```bash
  cd apps/api && bun run test:unit -- tool-gateway 2>&1 | tail -15
  ```

- [ ] **Step 4.6: Commit**

  ```bash
  git add apps/api/src/modules/agents/application/services/tool-gateway.ts
  git commit -m "feat(agents/r12): D-5 idempotency dedup check in ToolGateway write-tool path"
  ```

---

## Task 5: Wire into `agents.module.ts`

- [ ] **Step 5.1: Add imports**

  ```typescript
  import { WRITE_DEDUP_REPOSITORY } from './domain/repositories/write-dedup.repository'
  import { DrizzleWriteDedupRepository } from './infrastructure/repositories/drizzle-write-dedup.repository'
  import { SweepExpiredWriteDedupWorker } from './infrastructure/workers/sweep-expired-write-dedup'
  ```

- [ ] **Step 5.2: Add to `providers` array**

  ```typescript
  { provide: WRITE_DEDUP_REPOSITORY, useClass: DrizzleWriteDedupRepository },
  SweepExpiredWriteDedupWorker,
  ```

- [ ] **Step 5.3: Register the sweeper job in `onApplicationBootstrap`**

  Inject `SweepExpiredWriteDedupWorker` in the module class constructor (if not already present) and call in the bootstrap hook:

  ```typescript
  await this.sweepExpiredWriteDedupWorker.registerJob(this.pgBossService)
  ```

- [ ] **Step 5.4: Typecheck**

  ```bash
  cd apps/api && bun run typecheck 2>&1 | tail -10
  ```

  Expected: no errors.

- [ ] **Step 5.5: Commit**

  ```bash
  git add apps/api/src/modules/agents/agents.module.ts
  git commit -m "feat(agents/r12): wire WriteDedupRepository and SweepExpiredWriteDedupWorker into AgentsModule"
  ```

---

## Task 6: Extend RLS Integration Spec (D-5)

- [ ] **Step 6.1: Add D-5 assertions to `rls-all-tables.integration.spec.ts`**

  After the existing Sub-fix D section, add:

  ```typescript
  // ─── Sub-fix D-5: agent_write_dedup PRIMARY KEY uniqueness ────────────────

  it('agents.agent_write_dedup: idempotency_key column exists', async () => {
    expect(await columnExists(db, 'agents', 'agent_write_dedup', 'idempotency_key')).toBe(true)
  })

  it('agents.agent_write_dedup: idempotency_key PRIMARY KEY unique constraint exists', async () => {
    expect(await uniqueConstraintExists(db, 'agents', 'agent_write_dedup_pkey')).toBe(true)
  })
  ```

- [ ] **Step 6.2: Run the spec**

  ```bash
  cd apps/api && bun run test:integration -- rls-all-tables 2>&1 | tail -10
  ```

  Expected: all pass including the two new assertions.

- [ ] **Step 6.3: Final full suite check**

  ```bash
  cd apps/api && bun run test:unit && bun run test:integration 2>&1 | tail -5
  ```

- [ ] **Step 6.4: Commit**

  ```bash
  git add apps/api/src/modules/agents/infrastructure/schema/rls-all-tables.integration.spec.ts
  git commit -m "test(agents/r12): extend RLS integration spec with D-5 unique-constraint assertions"
  ```

---

## Self-Review

- `agent_write_dedup` is in `AGENTS_TABLES` — the auto-generated RLS test covers it.
- `insert()` uses `onConflictDoNothing()` — concurrent inserts with the same key are idempotent.
- Dedup check only activates for `descriptor.type === 'mutation'` — read tools skip it.
- Expiry guard `cached.expiresAt > new Date()` prevents stale hits from expired rows.
- Full suite: `cd apps/api && bun run test:unit && bun run test:integration`.
