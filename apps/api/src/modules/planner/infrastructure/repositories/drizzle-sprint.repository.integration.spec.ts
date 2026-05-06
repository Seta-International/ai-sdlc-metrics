import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { sql } from 'drizzle-orm'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  truncateCoreSchema,
  truncatePlannerSchema,
} from '@future/db/test-helpers'
import { DrizzleSprintRepository } from './drizzle-sprint.repository'

const TENANT_ID = '01900000-0000-7fff-8000-000000098001'
const ACTOR_ID = '01900000-0000-7fff-8000-000000098009'
const PLAN_ID = '01900000-0000-7fff-8000-000000098002'
const SPRINT_ID_1 = '01900000-0000-7fff-8000-000000098003'
const SPRINT_ID_2 = '01900000-0000-7fff-8000-000000098004'

describe('DrizzleSprintRepository (integration)', () => {
  const db = createTestDb()
  let repo: DrizzleSprintRepository

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_ID, slug: 'sprint-integration' })

    // Seed plan
    await db.execute(
      sql`INSERT INTO planner.plan (id, tenant_id, name, description, created_by, created_at, updated_at)
          VALUES (${PLAN_ID}, ${TENANT_ID}, 'Sprint Test Plan', '', ${ACTOR_ID}, NOW(), NOW())`,
    )

    repo = new DrizzleSprintRepository(db)
  })

  afterEach(async () => {
    await db.execute(sql`DELETE FROM planner.sprint WHERE tenant_id = ${TENANT_ID}`)
  })

  it('saves and retrieves a sprint by id', async () => {
    await repo.save({
      id: SPRINT_ID_1,
      tenantId: TENANT_ID,
      planId: PLAN_ID,
      name: 'Sprint 1',
      startDate: '2026-06-01',
      endDate: '2026-06-14',
      completedAt: null,
    })

    const found = await repo.findById(SPRINT_ID_1, TENANT_ID)
    expect(found).not.toBeNull()
    expect(found!.id).toBe(SPRINT_ID_1)
    expect(found!.name).toBe('Sprint 1')
    expect(found!.startDate).toBe('2026-06-01')
    expect(found!.endDate).toBe('2026-06-14')
    expect(found!.completedAt).toBeNull()
  })

  it('listByPlan returns all sprints for the plan', async () => {
    await repo.save({
      id: SPRINT_ID_1,
      tenantId: TENANT_ID,
      planId: PLAN_ID,
      name: 'Sprint 1',
      startDate: '2026-06-01',
      endDate: '2026-06-14',
      completedAt: null,
    })
    await repo.save({
      id: SPRINT_ID_2,
      tenantId: TENANT_ID,
      planId: PLAN_ID,
      name: 'Sprint 2',
      startDate: '2026-06-15',
      endDate: '2026-06-28',
      completedAt: null,
    })

    const sprints = await repo.listByPlan(PLAN_ID, TENANT_ID)
    expect(sprints).toHaveLength(2)
    expect(sprints.map((s) => s.id)).toContain(SPRINT_ID_1)
    expect(sprints.map((s) => s.id)).toContain(SPRINT_ID_2)
  })

  it('complete sets completedAt timestamp', async () => {
    await repo.save({
      id: SPRINT_ID_1,
      tenantId: TENANT_ID,
      planId: PLAN_ID,
      name: 'Sprint 1',
      startDate: '2026-06-01',
      endDate: '2026-06-14',
      completedAt: null,
    })

    const completedAt = new Date('2026-06-14T18:00:00.000Z')
    await repo.complete(SPRINT_ID_1, TENANT_ID, completedAt)

    const found = await repo.findById(SPRINT_ID_1, TENANT_ID)
    expect(found!.completedAt).not.toBeNull()
    expect(found!.completedAt).toBeInstanceOf(Date)
  })
})
