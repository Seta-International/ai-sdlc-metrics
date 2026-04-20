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
import { DrizzleMyDayRepository } from '../../../infrastructure/repositories/drizzle-my-day.repository'
import { CarryOverMyDayHandler } from './carry-over.handler'
import { CarryOverMyDayCommand } from './carry-over.command'

const TENANT_A = '01900000-0000-7fff-8000-000000008001'

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

async function insertMyDayEntry(
  db: Db,
  actorId: string,
  taskId: string,
  addedDate: string,
  tenantId: string,
): Promise<void> {
  await db.execute(
    sql`INSERT INTO planner.my_day_entry (actor_id, task_id, added_date, added_at, tenant_id)
        VALUES (${actorId}, ${taskId}, ${addedDate}::date, NOW(), ${tenantId})`,
  )
}

describe('CarryOverMyDayHandler — integration', () => {
  const db = createTestDb() as Db

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'carry-over-handler-tenant' })
    await setTenantContext(db, TENANT_A)
  })

  afterAll(async () => {
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
  })

  it('carries over only tasks not already on today, returning the newly-inserted count', async () => {
    const actorId = uuidv7()
    const planId = await seedPersonalPlan(db, TENANT_A, actorId)
    const bucketId = await seedBucket(db, planId, TENANT_A)
    const t1 = await seedTask(db, planId, bucketId, TENANT_A, actorId)
    const t2 = await seedTask(db, planId, bucketId, TENANT_A, actorId)

    // t1 is already on today's list (user had manually added it)
    await insertMyDayEntry(db, actorId, t1, '2026-04-20', TENANT_A)

    const repo = new DrizzleMyDayRepository(db as never)
    const handler = new CarryOverMyDayHandler(repo)

    const result = await handler.execute(
      new CarryOverMyDayCommand(actorId, TENANT_A, '2026-04-19', '2026-04-20', [t1, t2]),
    )

    expect(result).toEqual({ carriedCount: 1 })

    const totalToday = await db.execute<{ task_id: string }>(
      sql`SELECT task_id FROM planner.my_day_entry
          WHERE actor_id = ${actorId} AND tenant_id = ${TENANT_A}
            AND added_date = '2026-04-20'::date`,
    )
    expect(totalToday.rows).toHaveLength(2)
    const ids = totalToday.rows.map((r) => r.task_id).sort()
    expect(ids).toEqual([t1, t2].sort())
  })
})
