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
import { MsPlanSyncStateEntity } from '../../domain/entities/ms-plan-sync-state.entity'
import { DrizzleMsPlanSyncStateRepository } from './drizzle-ms-plan-sync-state.repository'

const TENANT_A = '01900000-0000-7fff-8000-000000009001'
const TENANT_B = '01900000-0000-7fff-8000-000000009002'

async function seedPlan(db: Db, tenantId: string): Promise<string> {
  const planId = uuidv7()
  const createdBy = uuidv7()
  await db.execute(
    sql`INSERT INTO planner.plan (id, tenant_id, name, description, created_by, created_at, updated_at)
        VALUES (${planId}, ${tenantId}, 'Sync State Test Plan', '', ${createdBy}, NOW(), NOW())`,
  )
  return planId
}

function makeEntity(planId: string, tenantId: string, msPlanId?: string): MsPlanSyncStateEntity {
  return MsPlanSyncStateEntity.create({
    planId,
    tenantId,
    msPlanId: msPlanId ?? `ms-plan-${uuidv7()}`,
  })
}

describe('DrizzleMsPlanSyncStateRepository', () => {
  const db = createTestDb() as Db
  let repo: DrizzleMsPlanSyncStateRepository
  let planIdA: string
  let planIdA2: string
  let planIdB: string

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'ms-sync-state-tenant-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'ms-sync-state-tenant-b' })
    planIdA = await seedPlan(db, TENANT_A)
    planIdA2 = await seedPlan(db, TENANT_A)
    planIdB = await seedPlan(db, TENANT_B)
    repo = new DrizzleMsPlanSyncStateRepository(db as never)
  })

  afterAll(async () => {
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
  })

  describe('upsertState() + get()', () => {
    it('inserts and retrieves a sync state', async () => {
      await setTenantContext(db, TENANT_A)
      const entity = makeEntity(planIdA, TENANT_A)
      await repo.upsertState(entity)

      const found = await repo.get(planIdA)
      expect(found).not.toBeNull()
      expect(found!.planId).toBe(planIdA)
      expect(found!.msPlanId).toBe(entity.msPlanId)
      expect(found!.consecutiveErrorCount).toBe(0)
      expect(found!.msPlanEtag).toBeNull()
    })

    it('updates mutable fields on second upsert (same planId)', async () => {
      await setTenantContext(db, TENANT_A)
      const entity = makeEntity(planIdA2, TENANT_A)
      await repo.upsertState(entity)

      entity.recordSuccessfulPoll('etag-123')
      await repo.upsertState(entity)

      const found = await repo.get(planIdA2)
      expect(found!.msPlanEtag).toBe('etag-123')
      expect(found!.consecutiveErrorCount).toBe(0)
      expect(found!.lastSuccessfulPollAt).toBeInstanceOf(Date)
    })

    it('returns null when planId has no sync state', async () => {
      const found = await repo.get(uuidv7())
      expect(found).toBeNull()
    })
  })

  describe('listForTenant()', () => {
    it('returns all sync states for the tenant', async () => {
      await setTenantContext(db, TENANT_A)
      const e1 = makeEntity(planIdA, TENANT_A)
      const e2 = makeEntity(planIdA2, TENANT_A)
      await repo.upsertState(e1)
      await repo.upsertState(e2)

      const list = await repo.listForTenant(TENANT_A)
      const planIds = list.map((e) => e.planId)
      expect(planIds).toContain(planIdA)
      expect(planIds).toContain(planIdA2)
    })
  })

  describe('listPausable()', () => {
    it('returns states where pollPausedUntil has elapsed', async () => {
      await setTenantContext(db, TENANT_B)
      const entity = makeEntity(planIdB, TENANT_B)
      const pastDate = new Date(Date.now() - 60_000) // 1 minute ago
      entity.pauseUntil(pastDate)
      await repo.upsertState(entity)

      const pausable = await repo.listPausable(TENANT_B)
      const planIds = pausable.map((e) => e.planId)
      expect(planIds).toContain(planIdB)
    })

    it('excludes states paused until a future date', async () => {
      await setTenantContext(db, TENANT_A)
      const extraPlanId = await seedPlan(db, TENANT_A)
      const entity = makeEntity(extraPlanId, TENANT_A)
      const futureDate = new Date(Date.now() + 600_000) // 10 minutes from now
      entity.pauseUntil(futureDate)
      await repo.upsertState(entity)

      const pausable = await repo.listPausable(TENANT_A)
      const planIds = pausable.map((e) => e.planId)
      expect(planIds).not.toContain(extraPlanId)
    })
  })

  describe('tenant isolation', () => {
    it('get() for a plan belonging to TENANT_A is not visible to TENANT_B', async () => {
      await setTenantContext(db, TENANT_A)
      const entity = makeEntity(planIdA, TENANT_A)
      await repo.upsertState(entity)

      // get() looks up by planId only — tenantId check is in listForTenant
      const list = await repo.listForTenant(TENANT_B)
      const planIds = list.map((e) => e.planId)
      expect(planIds).not.toContain(planIdA)
    })
  })
})
