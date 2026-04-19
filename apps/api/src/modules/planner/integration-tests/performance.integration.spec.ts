// Performance spec — tagged `performance` for CI.
// Benchmarks key planner query/command handlers against a 200-task seed dataset.
// Run with: bunx vitest run --reporter=verbose src/modules/planner/integration-tests/performance.integration.spec.ts
// Skip budget assertions locally: SKIP_PERF_ASSERT=1 bunx vitest run ...

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  setTenantContext,
  truncateCoreSchema,
  truncatePlannerSchema,
} from '@future/db/test-helpers'
import type { Db } from '@future/db'

import { DrizzleTaskRepository } from '../infrastructure/repositories/drizzle-task.repository'
import { DrizzleTaskCommentRepository } from '../infrastructure/repositories/drizzle-task-comment.repository'
import { PlanAuthorizationService } from '../application/services/plan-authorization.service'

import { GetBoardHandler } from '../application/queries/tasks/get-board.handler'
import { GetBoardQuery } from '../application/queries/tasks/get-board.query'

import { MoveTaskHandler } from '../application/commands/tasks/move-task.handler'
import { MoveTaskCommand } from '../application/commands/tasks/move-task.command'

import { GetTaskDetailHandler } from '../application/queries/tasks/get-task-detail.handler'
import { GetTaskDetailQuery } from '../application/queries/tasks/get-task-detail.query'

import { RequestUploadHandler } from '../application/commands/attachments/request-upload.handler'
import { RequestUploadCommand } from '../application/commands/attachments/request-upload.command'

import { ListTaskCommentsHandler } from '../application/queries/comments/list-task-comments.handler'
import { ListTaskCommentsQuery } from '../application/queries/comments/list-task-comments.query'

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = '01900000-0000-7fff-8000-000000099002'
const ACTOR_ID = uuidv7()
const ASSERT_BUDGETS = !process.env['SKIP_PERF_ASSERT']

// 5 actor IDs used as assignee pool
const ACTOR_POOL = [uuidv7(), uuidv7(), uuidv7(), uuidv7(), uuidv7()]

// 20 label slots (category1 – category20)
const LABEL_SLOTS = Array.from({ length: 20 }, (_, i) => `category${i + 1}`)

// ─── Benchmark utility ────────────────────────────────────────────────────────

async function benchmark(
  fn: () => Promise<unknown>,
  runs = 20,
): Promise<{ p50: number; p95: number; p99: number }> {
  const times: number[] = []
  for (let i = 0; i < runs; i++) {
    const start = performance.now()
    await fn()
    times.push(performance.now() - start)
  }
  times.sort((a, b) => a - b)
  // p99 and p95 resolve to the same index at 20 runs (floor(19.8) = floor(19) = 19); increase runs for meaningful p99.
  return {
    p50: times[Math.floor(runs * 0.5)]!,
    p95: times[Math.floor(runs * 0.95)]!,
    p99: times[Math.floor(runs * 0.99)]!,
  }
}

// ─── Mock factories ───────────────────────────────────────────────────────────

function makeAuthSvc(): PlanAuthorizationService {
  return {
    assertCanCreatePlan: async () => undefined,
    assertCanReadPlan: async () => undefined,
    assertCanEditPlan: async () => undefined,
    assertCanAdminPlan: async () => undefined,
    assertCanManageMembers: async () => undefined,
    assertCanUpdateOwnTaskProgress: async () => undefined,
    assertCanDeleteTask: async () => undefined,
    assertIsPlanMember: async () => undefined,
  } as unknown as PlanAuthorizationService
}

function makeKernelQueryFacade() {
  return {
    getActorsByIds: async (_ids: string[], _tenantId: string) =>
      new Map<string, { displayName: string }>(),
  }
}

function makeStorageClient() {
  return {
    getUploadUrl: async (_key: string, _opts: unknown) => ({
      url: 'https://s3.example.com/upload',
      expiresAt: new Date(Date.now() + 900_000),
    }),
    headObject: async () => ({ contentType: 'application/octet-stream', sizeBytes: 1024 }),
    getDownloadUrl: async () => ({ url: 'https://s3.example.com/download', expiresAt: new Date() }),
    deleteObject: async () => undefined,
  }
}

function makeEventBus() {
  return { publish: async () => undefined } as never
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('Planner performance benchmarks (tagged: performance)', () => {
  const db = createTestDb() as Db

  let planId: string
  let bucketIds: string[]
  /** Task IDs distributed across buckets */
  let taskIds: string[]
  /** 20 fresh task IDs pre-created for MoveTask benchmark (one-shot moves) */
  let moveTaskIds: string[]
  /** The target bucket for MoveTask (bucket[1]) */
  let moveToBucketId: string
  /** Pick any task to benchmark GetTaskDetail */
  let detailTaskId: string
  /** A task with comments seeded for ListTaskComments */
  let commentTaskId: string

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_ID, slug: 'planner-perf-tenant' })
    await setTenantContext(db, TENANT_ID)

    planId = uuidv7()
    bucketIds = Array.from({ length: 10 }, () => uuidv7())
    moveToBucketId = bucketIds[1]!

    // ── Seed plan ────────────────────────────────────────────────────────────
    await db.execute(
      sql`INSERT INTO planner.plan (id, tenant_id, name, created_by, created_at, updated_at)
          VALUES (${planId}, ${TENANT_ID}, 'Perf Test Plan', ${ACTOR_ID}, NOW(), NOW())`,
    )

    // ── Seed plan member (actor must be a member to query board/detail) ──────
    await db.execute(
      sql`INSERT INTO planner.plan_member (plan_id, actor_id, role, added_by, added_at, tenant_id)
          VALUES (${planId}, ${ACTOR_ID}, 'owner', ${ACTOR_ID}, NOW(), ${TENANT_ID})`,
    )

    // ── Seed 10 buckets ──────────────────────────────────────────────────────
    const bucketValues = bucketIds
      .map(
        (bid, i) =>
          `('${bid}', '${TENANT_ID}', '${planId}', 'Bucket ${i + 1}', '${String.fromCharCode(65 + i)} !', NOW(), NOW())`,
      )
      .join(',\n')
    await db.execute(
      sql.raw(
        `INSERT INTO planner.bucket (id, tenant_id, plan_id, name, order_hint, created_at, updated_at)
         VALUES ${bucketValues}`,
      ),
    )

    // ── Seed 20 labels (category1–category20) ────────────────────────────────
    const labelValues = LABEL_SLOTS.map(
      (slot) =>
        `('${planId}', '${slot}', 'Label ${slot}', '#${Math.floor(Math.random() * 0xffffff)
          .toString(16)
          .padStart(6, '0')}', '${TENANT_ID}')`,
    ).join(',\n')
    await db.execute(
      sql.raw(
        `INSERT INTO planner.plan_label (plan_id, slot, name, color, tenant_id)
         VALUES ${labelValues}`,
      ),
    )

    // ── Seed 200 tasks (20 per bucket) ───────────────────────────────────────
    taskIds = Array.from({ length: 200 }, () => uuidv7())
    const taskValues = taskIds
      .map((tid, i) => {
        const bucketId = bucketIds[i % 10]!
        const orderHint = `${String.fromCharCode(65 + (i % 10))} ${i.toString().padStart(4, '0')}`
        return `('${tid}', '${TENANT_ID}', '${planId}', '${bucketId}', 'Task ${i + 1}', '', 0, 5, '${orderHint}', '${ACTOR_ID}', NOW(), NOW())`
      })
      .join(',\n')
    await db.execute(
      sql.raw(
        `INSERT INTO planner.task (id, tenant_id, plan_id, bucket_id, title, description, progress, priority, order_hint, created_by, created_at, updated_at)
         VALUES ${taskValues}`,
      ),
    )

    // ── Seed mixed data: ~40% of tasks get assignees + checklist + label ─────
    const assigneeValues: string[] = []
    const checklistValues: string[] = []
    const labelApplyValues: string[] = []

    for (let i = 0; i < taskIds.length; i++) {
      const tid = taskIds[i]!
      if (i % 5 < 2) {
        // ~40% of tasks
        const actorId = ACTOR_POOL[i % ACTOR_POOL.length]!
        assigneeValues.push(`('${tid}', '${actorId}', '${ACTOR_ID}', NOW(), '${TENANT_ID}')`)

        const numItems = 1 + (i % 3) // 1, 2, or 3 items
        for (let j = 0; j < numItems; j++) {
          const itemId = uuidv7()
          const itemHint = `${j.toString().padStart(4, '0')} !`
          checklistValues.push(
            `('${itemId}', '${tid}', 'Step ${j + 1}', false, '${itemHint}', '${TENANT_ID}', '${ACTOR_ID}', NOW(), NOW())`,
          )
        }

        const slot = LABEL_SLOTS[i % LABEL_SLOTS.length]!
        labelApplyValues.push(`('${tid}', '${slot}', '${TENANT_ID}', '${planId}')`)
      }
    }

    if (assigneeValues.length > 0) {
      await db.execute(
        sql.raw(
          `INSERT INTO planner.task_assignee (task_id, actor_id, assigned_by, assigned_at, tenant_id)
           VALUES ${assigneeValues.join(',\n')}
           ON CONFLICT (task_id, actor_id) DO NOTHING`,
        ),
      )
    }

    if (checklistValues.length > 0) {
      await db.execute(
        sql.raw(
          `INSERT INTO planner.task_checklist_item (id, task_id, title, is_checked, order_hint, tenant_id, created_by, created_at, updated_at)
           VALUES ${checklistValues.join(',\n')}`,
        ),
      )
    }

    if (labelApplyValues.length > 0) {
      await db.execute(
        sql.raw(
          `INSERT INTO planner.task_applied_label (task_id, slot, tenant_id, plan_id)
           VALUES ${labelApplyValues.join(',\n')}
           ON CONFLICT (task_id, slot) DO NOTHING`,
        ),
      )
    }

    // ── Pre-create 20 fresh tasks for MoveTask benchmark ─────────────────────
    moveTaskIds = Array.from({ length: 20 }, () => uuidv7())
    const moveTaskValues = moveTaskIds
      .map((tid, i) => {
        const bucketId = bucketIds[0]! // all start in bucket[0]
        const orderHint = `Z ${i.toString().padStart(4, '0')} !`
        // Use date_trunc('milliseconds', NOW()) so the stored timestamp is exactly ms-precision.
        // This ensures JS Date round-trip (toISOString → new Date → pg comparison) works reliably.
        return `('${tid}', '${TENANT_ID}', '${planId}', '${bucketId}', 'MoveTask ${i + 1}', '', 0, 5, '${orderHint}', '${ACTOR_ID}', date_trunc('milliseconds', NOW()), date_trunc('milliseconds', NOW()))`
      })
      .join(',\n')
    await db.execute(
      sql.raw(
        `INSERT INTO planner.task (id, tenant_id, plan_id, bucket_id, title, description, progress, priority, order_hint, created_by, created_at, updated_at)
         VALUES ${moveTaskValues}`,
      ),
    )

    // ── Pick a detail task and seed it with a comment ─────────────────────────
    detailTaskId = taskIds[42]!
    commentTaskId = taskIds[10]!

    const commentValues = Array.from({ length: 5 }, (_, i) => {
      const cid = uuidv7()
      return `('${cid}', '${commentTaskId}', '${ACTOR_ID}', 'Comment body ${i + 1}', NOW(), '${TENANT_ID}')`
    }).join(',\n')
    await db.execute(
      sql.raw(
        `INSERT INTO planner.task_comment (id, task_id, author_actor_id, body, posted_at, tenant_id)
         VALUES ${commentValues}`,
      ),
    )
  }, 60_000)

  afterAll(async () => {
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
  })

  // ── Benchmark: GetBoardHandler ────────────────────────────────────────────

  it(
    'GetBoardHandler — p95 < 150 ms over 200 tasks',
    { timeout: 60_000, tags: ['performance'] },
    async () => {
      const handler = new GetBoardHandler(db, makeKernelQueryFacade() as never)
      const query = new GetBoardQuery(planId, ACTOR_ID, TENANT_ID)

      const result = await benchmark(() => handler.execute(query))

      console.log('[perf] GetBoardHandler:', result)
      expect(result.p50).toBeGreaterThan(0)

      if (ASSERT_BUDGETS) {
        expect(result.p95).toBeLessThan(150)
      }
    },
  )

  // ── Benchmark: MoveTaskHandler ────────────────────────────────────────────

  it(
    'MoveTaskHandler — p95 < 200 ms round-trip',
    { timeout: 60_000, tags: ['performance'] },
    async () => {
      const taskRepo = new DrizzleTaskRepository(db as never)
      const handler = new MoveTaskHandler(taskRepo, makeAuthSvc(), makeEventBus())

      // Pre-read all expectedVersions before benchmarking to avoid version reads
      // polluting the timing measurements.
      const expectedVersions: string[] = []
      for (const tid of moveTaskIds) {
        const task = await taskRepo.findById(tid, TENANT_ID)
        expectedVersions.push(task!.updatedAt.toISOString())
      }

      // Pool is exactly 20 tasks for 20 runs; increasing benchmark runs requires a larger pool.
      let runIndex = 0

      const result = await benchmark(async () => {
        const tid = moveTaskIds[runIndex]!
        const expectedVersion = expectedVersions[runIndex]!
        runIndex++
        const cmd = new MoveTaskCommand(
          TENANT_ID,
          planId,
          tid,
          ACTOR_ID,
          expectedVersion,
          moveToBucketId,
        )
        await handler.execute(cmd)
      }, 20)

      console.log('[perf] MoveTaskHandler:', result)
      expect(result.p50).toBeGreaterThan(0)

      if (ASSERT_BUDGETS) {
        expect(result.p95).toBeLessThan(200)
      }
    },
  )

  // ── Benchmark: GetTaskDetailHandler ──────────────────────────────────────

  it('GetTaskDetailHandler — p95 < 80 ms', { timeout: 60_000, tags: ['performance'] }, async () => {
    const handler = new GetTaskDetailHandler(
      db,
      makeKernelQueryFacade() as never,
      makeStorageClient() as never,
    )
    const query = new GetTaskDetailQuery(planId, detailTaskId, ACTOR_ID, TENANT_ID)

    const result = await benchmark(() => handler.execute(query))

    console.log('[perf] GetTaskDetailHandler:', result)
    expect(result.p50).toBeGreaterThan(0)

    if (ASSERT_BUDGETS) {
      expect(result.p95).toBeLessThan(80)
    }
  })

  // ── Benchmark: RequestUploadHandler ──────────────────────────────────────

  it(
    'RequestUploadHandler — p95 < 100 ms (no S3 round-trip)',
    { timeout: 60_000, tags: ['performance'] },
    async () => {
      const taskRepo = new DrizzleTaskRepository(db as never)
      const handler = new RequestUploadHandler(
        taskRepo,
        makeStorageClient() as never,
        makeAuthSvc(),
      )
      // Use a stable task that exists in the plan
      const stableTaskId = taskIds[0]!
      const cmd = new RequestUploadCommand(
        TENANT_ID,
        planId,
        stableTaskId,
        ACTOR_ID,
        'report.pdf',
        'application/pdf',
        1024,
      )

      const result = await benchmark(() => handler.execute(cmd))

      console.log('[perf] RequestUploadHandler:', result)
      expect(result.p50).toBeGreaterThan(0)

      if (ASSERT_BUDGETS) {
        expect(result.p95).toBeLessThan(100)
      }
    },
  )

  // ── Benchmark: ListTaskCommentsHandler ────────────────────────────────────

  it(
    'ListTaskCommentsHandler — p95 < 60 ms',
    { timeout: 60_000, tags: ['performance'] },
    async () => {
      const commentRepo = new DrizzleTaskCommentRepository(db as never)
      const handler = new ListTaskCommentsHandler(commentRepo, makeAuthSvc())
      const query = new ListTaskCommentsQuery(
        TENANT_ID,
        planId,
        commentTaskId,
        ACTOR_ID,
        undefined,
        20,
      )

      const result = await benchmark(() => handler.execute(query))

      console.log('[perf] ListTaskCommentsHandler:', result)
      expect(result.p50).toBeGreaterThan(0)

      if (ASSERT_BUDGETS) {
        expect(result.p95).toBeLessThan(60)
      }
    },
  )
})
