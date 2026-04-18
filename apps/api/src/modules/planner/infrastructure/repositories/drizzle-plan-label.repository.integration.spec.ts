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
import { LabelSlot } from '../../domain/value-objects/label-slot.vo'
import type { Label } from '../../domain/entities/plan.entity'
import { DrizzlePlanLabelRepository } from './drizzle-plan-label.repository'

const TENANT_A = '01900000-0000-7fff-8000-000000000044'
const TENANT_B = '01900000-0000-7fff-8000-000000000045'

async function seedPlan(db: Db, tenantId: string): Promise<string> {
  const planId = uuidv7()
  const createdBy = uuidv7()
  await db.execute(
    sql`INSERT INTO planner.plan (id, tenant_id, name, description, created_by, created_at, updated_at)
        VALUES (${planId}, ${tenantId}, 'Label Test Plan', '', ${createdBy}, NOW(), NOW())`,
  )
  return planId
}

function makeLabel(slot: string, name: string, color: string): Label {
  return { slot: LabelSlot.of(slot), name, color }
}

describe('DrizzlePlanLabelRepository', () => {
  const db = createTestDb() as Db
  let repo: DrizzlePlanLabelRepository
  let planIdA: string
  let planIdB: string

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'label-repo-tenant-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'label-repo-tenant-b' })
    planIdA = await seedPlan(db, TENANT_A)
    planIdB = await seedPlan(db, TENANT_B)
    repo = new DrizzlePlanLabelRepository(db as never)
  })

  afterAll(async () => {
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
  })

  describe('upsert() + findByPlanId()', () => {
    it('inserts a label and retrieves it', async () => {
      await setTenantContext(db, TENANT_A)
      const label = makeLabel('category1', 'Urgent', '#ff0000')
      await repo.upsert(planIdA, TENANT_A, label)

      const labels = await repo.findByPlanId(planIdA, TENANT_A)
      expect(labels).toHaveLength(1)
      expect(labels[0]!.slot.value).toBe('category1')
      expect(labels[0]!.name).toBe('Urgent')
      expect(labels[0]!.color).toBe('#ff0000')
    })

    it('updates an existing label on second upsert (same slot)', async () => {
      await setTenantContext(db, TENANT_A)
      await repo.upsert(planIdA, TENANT_A, makeLabel('category2', 'Low', '#aaaaaa'))
      await repo.upsert(planIdA, TENANT_A, makeLabel('category2', 'High', '#00ff00'))

      const labels = await repo.findByPlanId(planIdA, TENANT_A)
      const cat2 = labels.find((l) => l.slot.value === 'category2')
      expect(cat2).toBeDefined()
      expect(cat2!.name).toBe('High')
      expect(cat2!.color).toBe('#00ff00')
    })
  })

  describe('delete()', () => {
    it('removes a label by planId + slot', async () => {
      await setTenantContext(db, TENANT_A)
      const slot = LabelSlot.of('category3')
      await repo.upsert(planIdA, TENANT_A, makeLabel('category3', 'Normal', '#cccccc'))

      await repo.delete(planIdA, slot, TENANT_A)

      const labels = await repo.findByPlanId(planIdA, TENANT_A)
      const cat3 = labels.find((l) => l.slot.value === 'category3')
      expect(cat3).toBeUndefined()
    })
  })

  describe('tenant isolation', () => {
    it('findByPlanId scoped to TENANT_B does not return TENANT_A labels', async () => {
      await setTenantContext(db, TENANT_A)
      await repo.upsert(planIdA, TENANT_A, makeLabel('category4', 'A Label', '#111111'))

      const labels = await repo.findByPlanId(planIdA, TENANT_B)
      expect(labels).toHaveLength(0)
    })
  })
})
