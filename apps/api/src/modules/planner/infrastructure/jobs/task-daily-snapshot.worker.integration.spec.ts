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
import { DrizzleTaskDailySnapshotRepository } from '../repositories/drizzle-task-daily-snapshot.repository'
import { DrizzleTaskRepository } from '../repositories/drizzle-task.repository'
import { TaskDailySnapshotWorker } from './task-daily-snapshot.worker'
import type PgBoss from 'pg-boss'
import type { TaskDailySnapshotJobData } from './task-daily-snapshot.worker'

const TENANT = '01900000-0000-7fff-8000-000000009001'

async function seedPlan(db: Db, tenantId: string): Promise<string> {
  const planId = uuidv7()
  const createdBy = uuidv7()
  await db.execute(
    sql`INSERT INTO planner.plan (id, tenant_id, name, description, created_by, created_at, updated_at)
        VALUES (${planId}, ${tenantId}, 'Worker Test Plan', '', ${createdBy}, NOW(), NOW())`,
  )
  return planId
}

async function seedBucket(db: Db, tenantId: string, planId: string): Promise<string> {
  const bucketId = uuidv7()
  await db.execute(
    sql`INSERT INTO planner.bucket (id, tenant_id, plan_id, name, order_hint, created_at, updated_at)
        VALUES (${bucketId}, ${tenantId}, ${planId}, 'Test Bucket', '!', NOW(), NOW())`,
  )
  return bucketId
}

async function seedTask(
  db: Db,
  tenantId: string,
  planId: string,
  bucketId: string,
  opts: {
    id?: string
    progress?: 0 | 50 | 100
    priority?: 1 | 3 | 5 | 9
    completedAt?: string | null
  } = {},
): Promise<string> {
  const taskId = opts.id ?? uuidv7()
  const progress = opts.progress ?? 0
  const priority = opts.priority ?? 5
  const completedAt = opts.completedAt ?? null
  const createdBy = uuidv7()

  await db.execute(
    sql`INSERT INTO planner.task (
          id, tenant_id, plan_id, bucket_id, title, description,
          progress, priority, order_hint, created_by, created_at, updated_at,
          completed_by, completed_at,
          checklist_item_count, checklist_checked_count
        ) VALUES (
          ${taskId}, ${tenantId}, ${planId}, ${bucketId}, 'Task', '',
          ${progress}, ${priority}, '!', ${createdBy}, NOW(), NOW(),
          ${completedAt ? createdBy : null}, ${completedAt ?? null},
          0, 0
        )`,
  )
  return taskId
}

async function seedTaskAssignee(
  db: Db,
  tenantId: string,
  taskId: string,
  actorId: string,
): Promise<void> {
  await db.execute(
    sql`INSERT INTO planner.task_assignee (task_id, actor_id, assigned_by, assigned_at, tenant_id)
        VALUES (${taskId}, ${actorId}, ${actorId}, NOW(), ${tenantId})`,
  )
}

async function truncateSnapshotTable(db: Db): Promise<void> {
  await db.execute(sql`TRUNCATE planner.task_daily_snapshot`)
}

describe('TaskDailySnapshotWorker (integration)', () => {
  const db = createTestDb() as Db
  let snapshotRepo: DrizzleTaskDailySnapshotRepository
  let taskRepo: DrizzleTaskRepository
  let worker: TaskDailySnapshotWorker
  let planId: string
  let bucketId: string

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT, slug: 'snapshot-worker-tenant' })
    planId = await seedPlan(db, TENANT)
    bucketId = await seedBucket(db, TENANT, planId)
    snapshotRepo = new DrizzleTaskDailySnapshotRepository(db as never)
    taskRepo = new DrizzleTaskRepository(db as never)
    worker = new TaskDailySnapshotWorker(snapshotRepo, taskRepo)
  })

  afterAll(async () => {
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
  })

  it('produces correct snapshot counts from seeded tasks', async () => {
    await setTenantContext(db, TENANT)
    await truncateSnapshotTable(db)

    // Seed 4 tasks:
    // task1: open, medium (5), bucket-1, no assignee
    // task2: in-progress (50), important (3), bucket-1, assignee actor-A
    // task3: completed (100), urgent (1), bucket-1, completedAt=snapshotDate, assignee actor-A
    // task4: completed (100), low (9), bucket-1, completedAt=prior day, no assignee

    const snapshotDate = '2026-04-18'
    const priorDay = '2026-04-17T22:00:00Z'
    const onDay = '2026-04-18T09:00:00Z'

    const actorA = uuidv7()

    await seedTask(db, TENANT, planId, bucketId, {
      id: uuidv7(),
      progress: 0,
      priority: 5,
    })
    await seedTask(db, TENANT, planId, bucketId, {
      id: uuidv7(),
      progress: 50,
      priority: 3,
    })
    const task3 = await seedTask(db, TENANT, planId, bucketId, {
      id: uuidv7(),
      progress: 100,
      priority: 1,
      completedAt: onDay,
    })
    await seedTask(db, TENANT, planId, bucketId, {
      id: uuidv7(),
      progress: 100,
      priority: 9,
      completedAt: priorDay,
    })

    // Assign actor-A to task2 and task3
    const taskRows = await db.execute(
      sql`SELECT id FROM planner.task WHERE plan_id = ${planId} AND tenant_id = ${TENANT} AND progress = 50`,
    )
    const task2Id = (taskRows.rows[0] as { id: string }).id
    await seedTaskAssignee(db, TENANT, task2Id, actorA)
    await seedTaskAssignee(db, TENANT, task3, actorA)

    const job = {
      id: 'job-x',
      name: 'task-daily-snapshot',
      data: { tenantId: TENANT, planId, snapshotDate },
    } as PgBoss.Job<TaskDailySnapshotJobData>

    await worker.handle(job)

    const rows = await snapshotRepo.listForPlanInRange(planId, TENANT, snapshotDate, snapshotDate)
    expect(rows).toHaveLength(1)

    const snap = rows[0]!
    expect(snap.totalCount).toBe(4)
    expect(snap.openCount).toBe(2) // progress 0 and 50
    expect(snap.completedCount).toBe(2) // progress 100
    expect(snap.completedInDay).toBe(1) // only task3 (onDay)
    expect(snap.byPriority).toEqual({ urgent: 1, important: 1, medium: 1, low: 1 })
    expect(snap.byBucket[bucketId]).toBe(4)

    // actor-A contributed to task2 (open) and task3 (completed)
    const actorAEntry = snap.byAssignee.find((e) => e.actorId === actorA)
    expect(actorAEntry).toBeDefined()
    expect(actorAEntry!.open).toBe(1)
    expect(actorAEntry!.completed).toBe(1)
  })

  it('is idempotent — running worker twice yields one snapshot row with consistent values', async () => {
    await setTenantContext(db, TENANT)
    await truncateSnapshotTable(db)

    const snapshotDate = '2026-04-19'

    // Snapshot date tasks are already present from the previous test or we re-use the seeded plan
    // Clean task slate for this test

    await db.execute(sql`DELETE FROM planner.task_assignee WHERE tenant_id = ${TENANT}`)
    await db.execute(
      sql`DELETE FROM planner.task WHERE tenant_id = ${TENANT} AND plan_id = ${planId}`,
    )

    await seedTask(db, TENANT, planId, bucketId, { progress: 0, priority: 5 })
    await seedTask(db, TENANT, planId, bucketId, {
      progress: 100,
      priority: 1,
      completedAt: '2026-04-19T10:00:00Z',
    })

    const job = {
      id: 'job-y',
      name: 'task-daily-snapshot',
      data: { tenantId: TENANT, planId, snapshotDate },
    } as PgBoss.Job<TaskDailySnapshotJobData>

    await worker.handle(job)
    await worker.handle(job) // second run — upsert should update, not insert duplicate

    const rows = await snapshotRepo.listForPlanInRange(planId, TENANT, snapshotDate, snapshotDate)
    expect(rows).toHaveLength(1) // still one row
    expect(rows[0]!.totalCount).toBe(2)
    expect(rows[0]!.openCount).toBe(1)
    expect(rows[0]!.completedCount).toBe(1)
    expect(rows[0]!.completedInDay).toBe(1)
  })
})
