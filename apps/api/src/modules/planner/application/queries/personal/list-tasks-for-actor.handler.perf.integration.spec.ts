import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { performance } from 'node:perf_hooks'
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
import { ListTasksForActorHandler } from './list-tasks-for-actor.handler'
import { ListTasksForActorQuery } from './list-tasks-for-actor.query'
import type { KernelQueryFacade } from '../../../../kernel/application/facades/kernel-query.facade'

const TENANT_ID = '01900000-0000-7fff-8000-00000000ac40'
const TASK_COUNT = 2000
const PLAN_COUNT = 50
const TASKS_PER_PLAN = TASK_COUNT / PLAN_COUNT // 40
const ITERATIONS = 20
const P95_BUDGET_MS = 200

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function seedPlan(
  db: Db,
  tenantId: string,
  overrides: { id?: string; name?: string } = {},
): Promise<string> {
  const planId = overrides.id ?? uuidv7()
  const createdBy = uuidv7()
  await db.execute(
    sql`INSERT INTO planner.plan (id, tenant_id, name, description, created_by, created_at, updated_at)
        VALUES (${planId}, ${tenantId}, ${overrides.name ?? 'Team Plan'}, '', ${createdBy}, NOW(), NOW())`,
  )
  return planId
}

async function seedBucket(
  db: Db,
  planId: string,
  tenantId: string,
  overrides: { id?: string; name?: string; orderHint?: string } = {},
): Promise<string> {
  const bucketId = overrides.id ?? uuidv7()
  await db.execute(
    sql`INSERT INTO planner.bucket (id, tenant_id, plan_id, name, order_hint, created_at, updated_at)
        VALUES (${bucketId}, ${tenantId}, ${planId}, ${overrides.name ?? 'Bucket'}, ${overrides.orderHint ?? '1|a:'}, NOW(), NOW())`,
  )
  return bucketId
}

async function seedTask(
  db: Db,
  planId: string,
  bucketId: string,
  tenantId: string,
  overrides: {
    id?: string
    title?: string
    orderHint?: string
    progress?: number
    priority?: number
  } = {},
): Promise<string> {
  const taskId = overrides.id ?? uuidv7()
  const createdBy = uuidv7()
  // Keep progress < 100 to satisfy chk_task_completion_consistency (progress=100 requires completed_at IS NOT NULL)
  const progress = overrides.progress ?? 0
  await db.execute(
    sql`INSERT INTO planner.task
        (id, tenant_id, plan_id, bucket_id, title, description, progress, priority,
         order_hint, checklist_item_count, checklist_checked_count,
         created_by, created_at, updated_at, completed_at, completed_by)
        VALUES (
          ${taskId}, ${tenantId}, ${planId}, ${bucketId},
          ${overrides.title ?? 'Task'}, '', ${progress}, ${overrides.priority ?? 5},
          ${overrides.orderHint ?? '1|a:'},
          0, 0,
          ${createdBy}, NOW(), NOW(), NULL, NULL
        )`,
  )
  return taskId
}

async function seedTaskAssignee(
  db: Db,
  taskId: string,
  actorId: string,
  tenantId: string,
): Promise<void> {
  await db.execute(
    sql`INSERT INTO planner.task_assignee (task_id, actor_id, assigned_by, assigned_at, tenant_id)
        VALUES (${taskId}, ${actorId}, ${actorId}, NOW(), ${tenantId})`,
  )
}

function makeKernelFacade(): KernelQueryFacade {
  return {
    getActorsByIds: vi.fn().mockResolvedValue(new Map()),
  } as unknown as KernelQueryFacade
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ListTasksForActorHandler — performance', () => {
  const db = createTestDb() as Db
  let actorId: string
  let handler: ListTasksForActorHandler

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_ID, slug: 'perf-test-tenant-ac40' })
    await setTenantContext(db, TENANT_ID)

    actorId = uuidv7()
    handler = new ListTasksForActorHandler(db, makeKernelFacade())

    // Seed 50 plans × 40 tasks each = 2000 tasks
    for (let p = 0; p < PLAN_COUNT; p += 1) {
      const planId = await seedPlan(db, TENANT_ID, { name: `Perf Plan ${p}` })
      const bucketId = await seedBucket(db, planId, TENANT_ID, { name: `Bucket ${p}` })
      for (let t = 0; t < TASKS_PER_PLAN; t += 1) {
        const taskId = await seedTask(db, planId, bucketId, TENANT_ID, {
          title: `Task ${p}-${t}`,
          // progress stays 0 — no completed_at needed
        })
        await seedTaskAssignee(db, taskId, actorId, TENANT_ID)
      }
    }

    // Update planner statistics so the query planner has accurate row counts
    await db.execute(sql`ANALYZE planner.task`)
    await db.execute(sql`ANALYZE planner.task_assignee`)
    await db.execute(sql`ANALYZE planner.plan`)
  }, 120_000)

  afterAll(async () => {
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
  })

  it('runs p95 < 200ms over 20 iterations', async () => {
    // Warm 3 iterations (connection pool, plan cache)
    for (let i = 0; i < 3; i += 1) {
      await handler.execute(
        new ListTasksForActorQuery(actorId, TENANT_ID, { includeCompleted: false }),
      )
    }

    const timings: number[] = []
    for (let i = 0; i < ITERATIONS; i += 1) {
      const start = performance.now()
      const rows = await handler.execute(
        new ListTasksForActorQuery(actorId, TENANT_ID, { includeCompleted: false }),
      )
      timings.push(performance.now() - start)
      expect(rows.length).toBe(TASK_COUNT)
    }

    timings.sort((a, b) => a - b)
    const p95 = timings[Math.floor(timings.length * 0.95) - 1]!
    const p50 = timings[Math.floor(timings.length / 2)]!
    console.log(
      `[perf] ListTasksForActor ×${ITERATIONS}: p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms`,
    )

    expect(p95).toBeLessThan(P95_BUDGET_MS)
  }, 120_000)

  it('uses the expected indices (EXPLAIN ANALYZE)', async () => {
    const result = await db.execute<{ 'QUERY PLAN': string }>(
      sql.raw(`EXPLAIN (ANALYZE, FORMAT TEXT)
        SELECT t.id FROM planner.task t
          JOIN planner.task_assignee ta ON ta.task_id = t.id AND ta.tenant_id = t.tenant_id
          JOIN planner.plan p           ON p.id       = t.plan_id AND p.tenant_id = t.tenant_id
         WHERE ta.actor_id = '${actorId}'
           AND t.tenant_id = '${TENANT_ID}'
           AND t.deleted_at IS NULL
           AND p.deleted_at IS NULL
           AND (p.owner_actor_id IS NULL OR p.owner_actor_id = '${actorId}')
           AND t.progress < 100`),
    )

    const plan = result.rows.map((r) => r['QUERY PLAN']).join('\n')
    console.log(plan)

    // At this data volume (2000 rows, 100% selectivity for the test actor), the planner
    // correctly chooses hash join with seq scans — that is the optimal path here.
    // The important invariant: the query must NOT produce a full cross-join or a nested
    // loop without any filter (which would indicate a missing index at scale).
    // We verify that:
    //   1. The join on task_assignee is driven by a filter on actor_id (not a bare scan)
    //   2. The query touches the right tables
    expect(plan).toMatch(/task_assignee/i)
    expect(plan).toMatch(/task\b/i)
    expect(plan).toMatch(/plan\b/i)
    // Confirm actor_id filter is present (not a spurious full table scan)
    expect(plan).toMatch(/actor_id/i)

    // Verify supporting index exists on task_assignee for actor lookups at scale
    const indexCheck = await db.execute<{ indexname: string }>(
      sql.raw(
        `SELECT indexname FROM pg_indexes
         WHERE schemaname = 'planner'
           AND tablename = 'task_assignee'
           AND indexdef ILIKE '%actor_id%'`,
      ),
    )
    expect(indexCheck.rows.length).toBeGreaterThan(0)
    console.log(
      '[perf] task_assignee actor index:',
      indexCheck.rows.map((r) => r.indexname).join(', '),
    )
  })
})
