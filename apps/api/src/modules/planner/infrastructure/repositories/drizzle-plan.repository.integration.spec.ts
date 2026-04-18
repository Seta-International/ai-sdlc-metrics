import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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
import { PlanContainer } from '../../domain/value-objects/plan-container.vo'
import { Plan } from '../../domain/entities/plan.entity'
import { DrizzlePlanRepository } from './drizzle-plan.repository'

const TENANT_A = '01900000-0000-7fff-8000-000000000040'
const TENANT_B = '01900000-0000-7fff-8000-000000000041'

function makePlan(tenantId: string, overrides: Partial<{ id: string; name: string }> = {}): Plan {
  return Plan.create({
    id: overrides.id ?? uuidv7(),
    tenantId,
    name: overrides.name ?? 'Test Plan',
    container: PlanContainer.of({ type: 'none' }),
    createdBy: uuidv7(),
    ownerActorId: uuidv7(),
  })
}

describe('DrizzlePlanRepository', () => {
  const db = createTestDb() as Db
  let repo: DrizzlePlanRepository

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'plan-repo-tenant-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'plan-repo-tenant-b' })
    repo = new DrizzlePlanRepository(db as never)
  })

  afterAll(async () => {
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
  })

  describe('save() + findById()', () => {
    it('inserts a new plan and retrieves it by id', async () => {
      await setTenantContext(db, TENANT_A)
      const plan = makePlan(TENANT_A, { name: 'Alpha Plan' })

      await repo.save(plan)

      const found = await repo.findById(plan.id, TENANT_A)
      expect(found).not.toBeNull()
      expect(found!.id).toBe(plan.id)
      expect(found!.name).toBe('Alpha Plan')
      expect(found!.tenantId).toBe(TENANT_A)
      expect(found!.deletedAt).toBeNull()
    })

    it('updates an existing plan on second save (upsert)', async () => {
      await setTenantContext(db, TENANT_A)
      const plan = makePlan(TENANT_A, { name: 'Original Name' })
      await repo.save(plan)

      plan.renameTo('Updated Name')
      await repo.save(plan)

      const found = await repo.findById(plan.id, TENANT_A)
      expect(found!.name).toBe('Updated Name')
    })
  })

  describe('findByTenantId()', () => {
    it('returns all non-deleted plans for a tenant', async () => {
      await setTenantContext(db, TENANT_B)
      const plan1 = makePlan(TENANT_B, { name: 'Plan B1' })
      const plan2 = makePlan(TENANT_B, { name: 'Plan B2' })
      await repo.save(plan1)
      await repo.save(plan2)

      const plans = await repo.findByTenantId(TENANT_B)
      expect(plans.length).toBeGreaterThanOrEqual(2)
      expect(plans.every((p) => p.tenantId === TENANT_B)).toBe(true)
    })

    it('does not return deleted plans', async () => {
      await setTenantContext(db, TENANT_B)
      const plan = makePlan(TENANT_B, { name: 'To Be Deleted' })
      await repo.save(plan)
      await repo.softDelete(plan.id, TENANT_B)

      const plans = await repo.findByTenantId(TENANT_B)
      const ids = plans.map((p) => p.id)
      expect(ids).not.toContain(plan.id)
    })
  })

  describe('softDelete()', () => {
    it('sets deleted_at; findById() returns null after soft delete', async () => {
      await setTenantContext(db, TENANT_A)
      const plan = makePlan(TENANT_A, { name: 'Soft Delete Me' })
      await repo.save(plan)

      await repo.softDelete(plan.id, TENANT_A)

      const found = await repo.findById(plan.id, TENANT_A)
      expect(found).toBeNull()
    })
  })

  describe('tenant isolation', () => {
    it('returns null when queried under a different tenant', async () => {
      await setTenantContext(db, TENANT_A)
      const plan = makePlan(TENANT_A)
      await repo.save(plan)

      const found = await repo.findById(plan.id, TENANT_B)
      expect(found).toBeNull()
    })
  })

  describe('cascade behaviour', () => {
    it('soft-delete of plan does NOT hard-delete associated bucket rows', async () => {
      await setTenantContext(db, TENANT_A)
      const { sql: sqlTag } = await import('drizzle-orm')
      const plan = makePlan(TENANT_A, { name: 'Plan With Bucket' })
      await repo.save(plan)

      // Insert a bucket directly via raw SQL
      const bucketId = uuidv7()
      await db.execute(
        sqlTag`INSERT INTO planner.bucket (id, tenant_id, plan_id, name, order_hint, created_at, updated_at)
               VALUES (${bucketId}, ${TENANT_A}, ${plan.id}, 'Bucket 1', '1|a:', NOW(), NOW())`,
      )

      // Soft-delete the plan
      await repo.softDelete(plan.id, TENANT_A)

      // Bucket row should still exist in DB (soft-delete of plan only sets deleted_at on plan)
      const result = await db.execute<{ id: string }>(
        sqlTag`SELECT id FROM planner.bucket WHERE id = ${bucketId}`,
      )
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0]!.id).toBe(bucketId)
    })
  })
})
