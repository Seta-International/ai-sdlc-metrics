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
import type { PlanMember } from '../../domain/entities/plan.entity'
import { DrizzlePlanMemberRepository } from './drizzle-plan-member.repository'

const TENANT_A = '01900000-0000-7fff-8000-000000000046'
const TENANT_B = '01900000-0000-7fff-8000-000000000047'

async function seedPlan(db: Db, tenantId: string): Promise<string> {
  const planId = uuidv7()
  const createdBy = uuidv7()
  await db.execute(
    sql`INSERT INTO planner.plan (id, tenant_id, name, description, created_by, created_at, updated_at)
        VALUES (${planId}, ${tenantId}, 'Member Test Plan', '', ${createdBy}, NOW(), NOW())`,
  )
  return planId
}

function makeMember(overrides: Partial<PlanMember> = {}): PlanMember {
  return {
    actorId: overrides.actorId ?? uuidv7(),
    role: overrides.role ?? 'editor',
    addedBy: overrides.addedBy ?? uuidv7(),
    addedAt: overrides.addedAt ?? new Date(),
  }
}

describe('DrizzlePlanMemberRepository', () => {
  const db = createTestDb() as Db
  let repo: DrizzlePlanMemberRepository
  let planIdA: string
  let planIdB: string

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'member-repo-tenant-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'member-repo-tenant-b' })
    planIdA = await seedPlan(db, TENANT_A)
    planIdB = await seedPlan(db, TENANT_B)
    repo = new DrizzlePlanMemberRepository(db as never)
  })

  afterAll(async () => {
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
  })

  describe('upsert() + findByPlanId()', () => {
    it('inserts a member and retrieves it', async () => {
      await setTenantContext(db, TENANT_A)
      const member = makeMember({ role: 'viewer' })
      await repo.upsert(planIdA, TENANT_A, member)

      const members = await repo.findByPlanId(planIdA, TENANT_A)
      const found = members.find((m) => m.actorId === member.actorId)
      expect(found).toBeDefined()
      expect(found!.role).toBe('viewer')
      expect(found!.addedBy).toBe(member.addedBy)
    })

    it('updates an existing member on second upsert (same actorId)', async () => {
      await setTenantContext(db, TENANT_A)
      const actorId = uuidv7()
      const addedBy = uuidv7()
      await repo.upsert(planIdA, TENANT_A, makeMember({ actorId, addedBy, role: 'viewer' }))
      await repo.upsert(planIdA, TENANT_A, makeMember({ actorId, addedBy, role: 'owner' }))

      const members = await repo.findByPlanId(planIdA, TENANT_A)
      const found = members.find((m) => m.actorId === actorId)
      expect(found).toBeDefined()
      expect(found!.role).toBe('owner')
    })
  })

  describe('delete()', () => {
    it('removes a member by planId + actorId', async () => {
      await setTenantContext(db, TENANT_A)
      const member = makeMember({ role: 'editor' })
      await repo.upsert(planIdA, TENANT_A, member)

      await repo.delete(planIdA, member.actorId, TENANT_A)

      const members = await repo.findByPlanId(planIdA, TENANT_A)
      const found = members.find((m) => m.actorId === member.actorId)
      expect(found).toBeUndefined()
    })
  })

  describe('tenant isolation', () => {
    it('findByPlanId scoped to TENANT_B does not return TENANT_A members', async () => {
      await setTenantContext(db, TENANT_A)
      const member = makeMember()
      await repo.upsert(planIdA, TENANT_A, member)

      const members = await repo.findByPlanId(planIdA, TENANT_B)
      expect(members.every((m) => m.actorId !== member.actorId)).toBe(true)
    })
  })
})
