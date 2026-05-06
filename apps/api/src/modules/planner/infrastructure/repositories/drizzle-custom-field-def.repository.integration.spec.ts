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
import { DrizzleCustomFieldDefRepository } from './drizzle-custom-field-def.repository'

const TENANT_ID = '01900000-0000-7fff-8000-000000098001'
const PLAN_ID = uuidv7()
const ACTOR_ID = uuidv7()

describe('DrizzleCustomFieldDefRepository (integration)', () => {
  const db = createTestDb()
  let repo: DrizzleCustomFieldDefRepository

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_ID, slug: 'cf-def-integration' })

    // Seed a plan (FK constraint from custom_field_def.plan_id → plan.id)
    await db.execute(
      sql`INSERT INTO planner.plan (id, tenant_id, name, created_by, created_at, updated_at)
          VALUES (${PLAN_ID}, ${TENANT_ID}, 'CF Def Test Plan', ${ACTOR_ID}, NOW(), NOW())`,
    )

    repo = new DrizzleCustomFieldDefRepository(db as never)
  })

  afterEach(async () => {
    await db.execute(sql`DELETE FROM planner.custom_field_def WHERE plan_id = ${PLAN_ID}`)
  })

  afterAll(async () => {
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
  })

  it('saves and retrieves a field def', async () => {
    await repo.save({
      id: uuidv7(),
      tenantId: TENANT_ID,
      planId: PLAN_ID,
      name: 'Score',
      kind: 'number',
      choiceOptions: null,
      position: 0,
    })
    const all = await repo.listByPlan(PLAN_ID, TENANT_ID)
    expect(all).toHaveLength(1)
    expect(all[0]?.name).toBe('Score')
    expect(all[0]?.kind).toBe('number')
  })

  it('findById returns correct record', async () => {
    const id = uuidv7()
    await repo.save({
      id,
      tenantId: TENANT_ID,
      planId: PLAN_ID,
      name: 'Score',
      kind: 'number',
      choiceOptions: null,
      position: 0,
    })
    const found = await repo.findById(id, TENANT_ID)
    expect(found?.name).toBe('Score')
    expect(found?.kind).toBe('number')
  })

  it('countByPlan returns correct count', async () => {
    await repo.save({
      id: uuidv7(),
      tenantId: TENANT_ID,
      planId: PLAN_ID,
      name: 'A',
      kind: 'text',
      choiceOptions: null,
      position: 0,
    })
    await repo.save({
      id: uuidv7(),
      tenantId: TENANT_ID,
      planId: PLAN_ID,
      name: 'B',
      kind: 'text',
      choiceOptions: null,
      position: 1,
    })
    expect(await repo.countByPlan(PLAN_ID, TENANT_ID)).toBe(2)
  })

  it('delete removes field def', async () => {
    const id = uuidv7()
    await repo.save({
      id,
      tenantId: TENANT_ID,
      planId: PLAN_ID,
      name: 'Del',
      kind: 'text',
      choiceOptions: null,
      position: 0,
    })
    await repo.delete(id, TENANT_ID)
    expect(await repo.findById(id, TENANT_ID)).toBeNull()
  })

  it('update modifies name and position', async () => {
    const id = uuidv7()
    await repo.save({
      id,
      tenantId: TENANT_ID,
      planId: PLAN_ID,
      name: 'Old',
      kind: 'text',
      choiceOptions: null,
      position: 0,
    })
    await repo.update({
      id,
      tenantId: TENANT_ID,
      planId: PLAN_ID,
      name: 'New',
      kind: 'text',
      choiceOptions: null,
      position: 5,
    })
    const found = await repo.findById(id, TENANT_ID)
    expect(found?.name).toBe('New')
    expect(found?.position).toBe(5)
  })
})
