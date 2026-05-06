import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { sql } from 'drizzle-orm'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  truncateCoreSchema,
  truncatePlannerSchema,
} from '@future/db/test-helpers'
import { DrizzleTaskDependencyRepository } from './drizzle-task-dependency.repository'

const TENANT_ID = '01900000-0000-7fff-8000-000000099001'
const ACTOR_ID = '01900000-0000-7fff-8000-000000099009'

const PLAN_ID = '01900000-0000-7fff-8000-000000099002'
const BUCKET_ID = '01900000-0000-7fff-8000-000000099005'
const FROM_ID = '01900000-0000-7fff-8000-000000099003'
const TO_ID = '01900000-0000-7fff-8000-000000099004'

describe('DrizzleTaskDependencyRepository (integration)', () => {
  const db = createTestDb()
  let repo: DrizzleTaskDependencyRepository

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_ID, slug: 'dep-integration' })

    // Seed plan
    await db.execute(
      sql`INSERT INTO planner.plan (id, tenant_id, name, description, created_by, created_at, updated_at)
          VALUES (${PLAN_ID}, ${TENANT_ID}, 'Dep Test Plan', '', ${ACTOR_ID}, NOW(), NOW())`,
    )

    // Seed bucket
    await db.execute(
      sql`INSERT INTO planner.bucket (id, tenant_id, plan_id, name, order_hint, created_at, updated_at)
          VALUES (${BUCKET_ID}, ${TENANT_ID}, ${PLAN_ID}, 'Bucket', '1|a:', NOW(), NOW())`,
    )

    // Seed two tasks
    await db.execute(
      sql`INSERT INTO planner.task
          (id, tenant_id, plan_id, bucket_id, title, description, progress, priority, order_hint,
           checklist_item_count, checklist_checked_count, created_by, created_at, updated_at)
          VALUES (${FROM_ID}, ${TENANT_ID}, ${PLAN_ID}, ${BUCKET_ID}, 'From Task', '', 0, 5, '1|a:',
                  0, 0, ${ACTOR_ID}, NOW(), NOW())`,
    )
    await db.execute(
      sql`INSERT INTO planner.task
          (id, tenant_id, plan_id, bucket_id, title, description, progress, priority, order_hint,
           checklist_item_count, checklist_checked_count, created_by, created_at, updated_at)
          VALUES (${TO_ID}, ${TENANT_ID}, ${PLAN_ID}, ${BUCKET_ID}, 'To Task', '', 0, 5, '1|b:',
                  0, 0, ${ACTOR_ID}, NOW(), NOW())`,
    )

    repo = new DrizzleTaskDependencyRepository(db)
  })

  afterEach(async () => {
    await db.execute(sql`DELETE FROM planner.task_dependency WHERE tenant_id = ${TENANT_ID}`)
  })

  it('adds and retrieves dependency', async () => {
    await repo.add({
      fromTaskId: FROM_ID,
      toTaskId: TO_ID,
      kind: 'finish_to_start',
      tenantId: TENANT_ID,
      createdBy: 'actor-dep-test',
    })
    const { predecessors } = await repo.listForTask(TO_ID, TENANT_ID)
    expect(predecessors).toHaveLength(1)
    expect(predecessors[0]?.fromTaskId).toBe(FROM_ID)
  })

  it('exists returns true after add', async () => {
    await repo.add({
      fromTaskId: FROM_ID,
      toTaskId: TO_ID,
      kind: 'finish_to_start',
      tenantId: TENANT_ID,
      createdBy: 'actor-dep-test',
    })
    expect(await repo.exists(FROM_ID, TO_ID, 'finish_to_start', TENANT_ID)).toBe(true)
  })

  it('listEdgesForPlan returns edges for tenant', async () => {
    await repo.add({
      fromTaskId: FROM_ID,
      toTaskId: TO_ID,
      kind: 'finish_to_start',
      tenantId: TENANT_ID,
      createdBy: 'actor-dep-test',
    })
    const edges = await repo.listEdgesForPlan(PLAN_ID, TENANT_ID)
    expect(edges.length).toBeGreaterThan(0)
    expect(edges[0]?.from).toBe(FROM_ID)
  })

  it('remove deletes the edge', async () => {
    await repo.add({
      fromTaskId: FROM_ID,
      toTaskId: TO_ID,
      kind: 'finish_to_start',
      tenantId: TENANT_ID,
      createdBy: 'actor-dep-test',
    })
    await repo.remove(FROM_ID, TO_ID, 'finish_to_start', TENANT_ID)
    expect(await repo.exists(FROM_ID, TO_ID, 'finish_to_start', TENANT_ID)).toBe(false)
  })
})
