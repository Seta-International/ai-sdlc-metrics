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
import { Bucket } from '../../domain/entities/bucket.entity'
import { DrizzleBucketRepository } from './drizzle-bucket.repository'

const TENANT_A = '01900000-0000-7fff-8000-000000000042'
const TENANT_B = '01900000-0000-7fff-8000-000000000043'

async function seedPlan(db: Db, tenantId: string): Promise<string> {
  const planId = uuidv7()
  const createdBy = uuidv7()
  await db.execute(
    sql`INSERT INTO planner.plan (id, tenant_id, name, description, created_by, created_at, updated_at)
        VALUES (${planId}, ${tenantId}, 'Test Plan', '', ${createdBy}, NOW(), NOW())`,
  )
  return planId
}

function makeBucket(
  planId: string,
  tenantId: string,
  overrides: Partial<{ id: string; name: string; orderHint: string }> = {},
): Bucket {
  return Bucket.create({
    id: overrides.id ?? uuidv7(),
    tenantId,
    planId,
    name: overrides.name ?? 'Test Bucket',
    orderHint: overrides.orderHint ?? '1|a:',
  })
}

describe('DrizzleBucketRepository', () => {
  const db = createTestDb() as Db
  let repo: DrizzleBucketRepository
  let planIdA: string
  let planIdB: string

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'bucket-repo-tenant-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'bucket-repo-tenant-b' })
    planIdA = await seedPlan(db, TENANT_A)
    planIdB = await seedPlan(db, TENANT_B)
    repo = new DrizzleBucketRepository(db as never)
  })

  afterAll(async () => {
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
  })

  describe('save() + findById()', () => {
    it('inserts a bucket and retrieves it by id', async () => {
      await setTenantContext(db, TENANT_A)
      const bucket = makeBucket(planIdA, TENANT_A, { name: 'Backlog' })
      await repo.save(bucket)

      const found = await repo.findById(bucket.id, TENANT_A)
      expect(found).not.toBeNull()
      expect(found!.id).toBe(bucket.id)
      expect(found!.name).toBe('Backlog')
      expect(found!.planId).toBe(planIdA)
      expect(found!.tenantId).toBe(TENANT_A)
    })

    it('updates an existing bucket on second save (upsert)', async () => {
      await setTenantContext(db, TENANT_A)
      const bucket = makeBucket(planIdA, TENANT_A, { name: 'Original' })
      await repo.save(bucket)

      bucket.rename('Renamed')
      await repo.save(bucket)

      const found = await repo.findById(bucket.id, TENANT_A)
      expect(found!.name).toBe('Renamed')
    })
  })

  describe('findByPlanId()', () => {
    it('returns all non-deleted buckets for a plan', async () => {
      await setTenantContext(db, TENANT_A)
      const b1 = makeBucket(planIdA, TENANT_A, { name: 'Todo', orderHint: '1|b:' })
      const b2 = makeBucket(planIdA, TENANT_A, { name: 'Done', orderHint: '1|c:' })
      await repo.save(b1)
      await repo.save(b2)

      const buckets = await repo.findByPlanId(planIdA, TENANT_A)
      const ids = buckets.map((b) => b.id)
      expect(ids).toContain(b1.id)
      expect(ids).toContain(b2.id)
    })
  })

  describe('softDelete()', () => {
    it('sets deleted_at; findById() returns null after soft delete', async () => {
      await setTenantContext(db, TENANT_A)
      const bucket = makeBucket(planIdA, TENANT_A, { name: 'Delete Me', orderHint: '1|d:' })
      await repo.save(bucket)

      await repo.softDelete(bucket.id, TENANT_A)

      const found = await repo.findById(bucket.id, TENANT_A)
      expect(found).toBeNull()
    })

    it('soft-deleted bucket is excluded from findByPlanId()', async () => {
      await setTenantContext(db, TENANT_A)
      const bucket = makeBucket(planIdA, TENANT_A, { name: 'Excluded', orderHint: '1|e:' })
      await repo.save(bucket)
      await repo.softDelete(bucket.id, TENANT_A)

      const buckets = await repo.findByPlanId(planIdA, TENANT_A)
      const ids = buckets.map((b) => b.id)
      expect(ids).not.toContain(bucket.id)
    })
  })

  describe('tenant isolation', () => {
    it('returns null for bucket queried under a different tenant', async () => {
      await setTenantContext(db, TENANT_A)
      const bucket = makeBucket(planIdA, TENANT_A, { orderHint: '1|f:' })
      await repo.save(bucket)

      const found = await repo.findById(bucket.id, TENANT_B)
      expect(found).toBeNull()
    })

    it('findByPlanId() scoped to TENANT_B does not return TENANT_A buckets', async () => {
      await setTenantContext(db, TENANT_A)
      const bucket = makeBucket(planIdA, TENANT_A, { orderHint: '1|g:' })
      await repo.save(bucket)

      // Query planIdA with TENANT_B scope — should return empty (different tenant)
      const buckets = await repo.findByPlanId(planIdA, TENANT_B)
      expect(buckets.every((b) => b.tenantId === TENANT_B)).toBe(true)
    })
  })
})
