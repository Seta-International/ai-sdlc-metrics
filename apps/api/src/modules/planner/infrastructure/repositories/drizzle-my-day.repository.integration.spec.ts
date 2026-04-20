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
import { DrizzleMyDayRepository } from './drizzle-my-day.repository'

const TENANT_A = '01900000-0000-7fff-8000-000000007001'

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

describe('DrizzleMyDayRepository.insertMany — integration', () => {
  const db = createTestDb() as Db
  let repo: DrizzleMyDayRepository

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'my-day-insert-many-tenant' })
    await setTenantContext(db, TENANT_A)
    repo = new DrizzleMyDayRepository(db as never)
  })

  afterAll(async () => {
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
  })

  it('inserts every row on the first call and is idempotent on the second', async () => {
    const actorId = uuidv7()
    const planId = await seedPersonalPlan(db, TENANT_A, actorId)
    const bucketId = await seedBucket(db, planId, TENANT_A)
    const t1 = await seedTask(db, planId, bucketId, TENANT_A, actorId)
    const t2 = await seedTask(db, planId, bucketId, TENANT_A, actorId)
    const t3 = await seedTask(db, planId, bucketId, TENANT_A, actorId)

    const date = '2026-04-20'
    const rows = [
      { actorId, tenantId: TENANT_A, taskId: t1, addedDate: date },
      { actorId, tenantId: TENANT_A, taskId: t2, addedDate: date },
      { actorId, tenantId: TENANT_A, taskId: t3, addedDate: date },
    ]

    const firstCount = await repo.insertMany(rows)
    expect(firstCount).toBe(3)

    // Re-run the same set — every row hits ON CONFLICT DO NOTHING, so nothing is inserted.
    const secondCount = await repo.insertMany(rows)
    expect(secondCount).toBe(0)

    // Adding a NEW task alongside the existing ones: only the new one is returned.
    const t4 = await seedTask(db, planId, bucketId, TENANT_A, actorId)
    const mixedCount = await repo.insertMany([
      { actorId, tenantId: TENANT_A, taskId: t1, addedDate: date }, // dup
      { actorId, tenantId: TENANT_A, taskId: t4, addedDate: date }, // new
    ])
    expect(mixedCount).toBe(1)
  })

  it('returns 0 without issuing any query for an empty input', async () => {
    const count = await repo.insertMany([])
    expect(count).toBe(0)
  })
})
