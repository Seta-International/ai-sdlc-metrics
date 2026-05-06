import { beforeAll, afterEach, afterAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  truncateCoreSchema,
  truncatePlannerSchema,
} from '@future/db/test-helpers'
import type { Db } from '@future/db'
import { DrizzleTaskCustomFieldValueRepository } from './drizzle-task-custom-field-value.repository'

const TENANT_ID = '01900000-0000-7fff-8000-000000099001'

async function seedPlan(db: Db, tenantId: string): Promise<string> {
  const planId = uuidv7()
  const createdBy = uuidv7()
  await db.execute(
    sql`INSERT INTO planner.plan (id, tenant_id, name, description, created_by, created_at, updated_at)
        VALUES (${planId}, ${tenantId}, 'CFV Test Plan', '', ${createdBy}, NOW(), NOW())`,
  )
  return planId
}

async function seedBucket(db: Db, tenantId: string, planId: string): Promise<string> {
  const bucketId = uuidv7()
  await db.execute(
    sql`INSERT INTO planner.bucket (id, tenant_id, plan_id, name, order_hint, created_at, updated_at)
        VALUES (${bucketId}, ${tenantId}, ${planId}, 'Bucket', '1|a:', NOW(), NOW())`,
  )
  return bucketId
}

async function seedTask(
  db: Db,
  tenantId: string,
  planId: string,
  bucketId: string,
): Promise<string> {
  const taskId = uuidv7()
  const createdBy = uuidv7()
  await db.execute(
    sql`INSERT INTO planner.task
        (id, tenant_id, plan_id, bucket_id, title, description, progress, priority, order_hint,
         checklist_item_count, checklist_checked_count, created_by, created_at, updated_at)
        VALUES (${taskId}, ${tenantId}, ${planId}, ${bucketId}, 'Task', '', 0, 5, '1|a:',
                0, 0, ${createdBy}, NOW(), NOW())`,
  )
  return taskId
}

async function seedCustomFieldDef(db: Db, tenantId: string, planId: string): Promise<string> {
  const defId = uuidv7()
  await db.execute(
    sql`INSERT INTO planner.custom_field_def (id, tenant_id, plan_id, name, kind, choice_options, position, created_at)
        VALUES (${defId}, ${tenantId}, ${planId}, 'Score', 'number', '[]'::jsonb, 0, NOW())`,
  )
  return defId
}

describe('DrizzleTaskCustomFieldValueRepository (integration)', () => {
  const db = createTestDb() as Db
  let repo: DrizzleTaskCustomFieldValueRepository
  let taskId: string
  let fieldDefId: string

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_ID, slug: 'cfv-integration' })

    const planId = await seedPlan(db, TENANT_ID)
    const bucketId = await seedBucket(db, TENANT_ID, planId)
    taskId = await seedTask(db, TENANT_ID, planId, bucketId)
    fieldDefId = await seedCustomFieldDef(db, TENANT_ID, planId)

    repo = new DrizzleTaskCustomFieldValueRepository(db as never)
  })

  afterEach(async () => {
    await db.execute(sql`DELETE FROM planner.task_custom_field_value WHERE task_id = ${taskId}`)
  })

  afterAll(async () => {
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
  })

  it('upsert creates a new value row', async () => {
    await repo.upsert({
      taskId,
      fieldDefId,
      tenantId: TENANT_ID,
      value: { number: 42 },
    })

    const rows = await repo.listByTask(taskId, TENANT_ID)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.fieldDefId).toBe(fieldDefId)
    expect(rows[0]?.value).toEqual({ number: 42 })
  })

  it('upsert updates an existing value row (on conflict)', async () => {
    await repo.upsert({
      taskId,
      fieldDefId,
      tenantId: TENANT_ID,
      value: { number: 10 },
    })

    await repo.upsert({
      taskId,
      fieldDefId,
      tenantId: TENANT_ID,
      value: { number: 99 },
    })

    const rows = await repo.listByTask(taskId, TENANT_ID)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.value).toEqual({ number: 99 })
  })

  it('listByTask returns all values for the task', async () => {
    // Empty initially
    const empty = await repo.listByTask(taskId, TENANT_ID)
    expect(empty).toHaveLength(0)

    await repo.upsert({
      taskId,
      fieldDefId,
      tenantId: TENANT_ID,
      value: { number: 7 },
    })

    const rows = await repo.listByTask(taskId, TENANT_ID)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.taskId).toBe(taskId)
    expect(rows[0]?.fieldDefId).toBe(fieldDefId)
    expect(rows[0]?.tenantId).toBe(TENANT_ID)
  })
})
