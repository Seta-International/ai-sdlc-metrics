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
import { MyDayOrphanSweepJob } from './my-day-orphan-sweep.job'

const TENANT_ID = '01900000-0000-7fff-8000-0000000070aa'

async function seedPersonalPlan(db: Db, tenantId: string, ownerActorId: string): Promise<string> {
  const planId = uuidv7()
  await db.execute(
    sql`INSERT INTO planner.plan (id, tenant_id, name, description, owner_actor_id, sync_enabled, created_by, created_at, updated_at)
        VALUES (${planId}, ${tenantId}, 'Personal', '', ${ownerActorId}, false, ${ownerActorId}, NOW(), NOW())`,
  )
  return planId
}

async function seedBucket(db: Db, planId: string, tenantId: string): Promise<string> {
  const bucketId = uuidv7()
  await db.execute(
    sql`INSERT INTO planner.bucket (id, tenant_id, plan_id, name, order_hint, created_at, updated_at)
        VALUES (${bucketId}, ${tenantId}, ${planId}, 'B', '1|a:', NOW(), NOW())`,
  )
  return bucketId
}

async function seedTask(
  db: Db,
  planId: string,
  bucketId: string,
  tenantId: string,
  actorId: string,
): Promise<string> {
  const taskId = uuidv7()
  await db.execute(
    sql`INSERT INTO planner.task
        (id, tenant_id, plan_id, bucket_id, title, description, progress, priority,
         order_hint, checklist_item_count, checklist_checked_count,
         created_by, created_at, updated_at)
        VALUES (
          ${taskId}, ${tenantId}, ${planId}, ${bucketId},
          'Task', '', 0, 5,
          '1|a:',
          0, 0,
          ${actorId}, NOW(), NOW()
        )`,
  )
  return taskId
}

async function softDeleteTask(db: Db, taskId: string): Promise<void> {
  await db.execute(sql`UPDATE planner.task SET deleted_at = NOW() WHERE id = ${taskId}`)
}

async function seedMyDayEntry(
  db: Db,
  actorId: string,
  taskId: string,
  tenantId: string,
  addedDate: string,
): Promise<void> {
  await db.execute(
    sql`INSERT INTO planner.my_day_entry (actor_id, task_id, added_date, tenant_id)
        VALUES (${actorId}, ${taskId}, ${addedDate}, ${tenantId})`,
  )
}

describe('MyDayOrphanSweepJob.handle — integration', () => {
  const db = createTestDb() as Db

  beforeAll(async () => {
    await migrateForTest()
    // Wipe schemas so we get a deterministic count. Other integration tests may leave rows
    // behind when running in the same worker process.
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_ID, slug: 'my-day-orphan-sweep-tenant' })
    await setTenantContext(db, TENANT_ID)
  })

  afterAll(async () => {
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
  })

  it('deletes rows whose task is missing or soft-deleted, preserves the rest', async () => {
    const actorId = uuidv7()
    const planId = await seedPersonalPlan(db, TENANT_ID, actorId)
    const bucketId = await seedBucket(db, planId, TENANT_ID)

    // tA: valid, two entries on different dates
    const tA = await seedTask(db, planId, bucketId, TENANT_ID, actorId)
    // tB: valid, one entry
    const tB = await seedTask(db, planId, bucketId, TENANT_ID, actorId)
    // tC: task exists but soft-deleted → my-day row must be swept
    const tC = await seedTask(db, planId, bucketId, TENANT_ID, actorId)
    await softDeleteTask(db, tC)
    // tD: hard orphan — no task row; just the task_id on my_day_entry
    const tD = uuidv7()

    await seedMyDayEntry(db, actorId, tA, TENANT_ID, '2026-04-18')
    await seedMyDayEntry(db, actorId, tA, TENANT_ID, '2026-04-19')
    await seedMyDayEntry(db, actorId, tB, TENANT_ID, '2026-04-19')
    await seedMyDayEntry(db, actorId, tC, TENANT_ID, '2026-04-19')
    await seedMyDayEntry(db, actorId, tD, TENANT_ID, '2026-04-19')

    const before = await db.execute<{ count: string }>(
      sql`SELECT COUNT(*)::text AS count FROM planner.my_day_entry`,
    )
    expect(before.rows[0]!.count).toBe('5')

    const job = new MyDayOrphanSweepJob(db)
    await job.handle()

    const after = await db.execute<{ task_id: string; added_date: string }>(
      sql`SELECT task_id::text AS task_id, added_date::text AS added_date
          FROM planner.my_day_entry
          ORDER BY added_date, task_id`,
    )

    expect(after.rows).toHaveLength(3)
    const survivingTasks = after.rows.map((r) => r.task_id).sort()
    expect(survivingTasks).toEqual([tA, tA, tB].sort())

    // tC and tD must be gone
    expect(survivingTasks).not.toContain(tC)
    expect(survivingTasks).not.toContain(tD)
  })
})
