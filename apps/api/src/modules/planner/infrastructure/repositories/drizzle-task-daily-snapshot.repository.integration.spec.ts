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
import type { Snapshot } from '../../domain/repositories/task-daily-snapshot.repository'
import { DrizzleTaskDailySnapshotRepository } from './drizzle-task-daily-snapshot.repository'

const TENANT_A = '01900000-0000-7fff-8000-000000005001'
const TENANT_B = '01900000-0000-7fff-8000-000000005002'

async function seedPlan(db: Db, tenantId: string): Promise<string> {
  const planId = uuidv7()
  const createdBy = uuidv7()
  await db.execute(
    sql`INSERT INTO planner.plan (id, tenant_id, name, description, created_by, created_at, updated_at)
        VALUES (${planId}, ${tenantId}, 'Snapshot Test Plan', '', ${createdBy}, NOW(), NOW())`,
  )
  return planId
}

function makeSnapshot(
  overrides: Partial<Snapshot> & Pick<Snapshot, 'tenantId' | 'planId' | 'snapshotDate'>,
): Snapshot {
  return {
    totalCount: 10,
    openCount: 7,
    completedCount: 3,
    byPriority: { urgent: 2, important: 3, medium: 4, low: 1 },
    byBucket: { 'bucket-id-1': 6, 'bucket-id-2': 4 },
    byAssignee: [{ actorId: 'actor-1', open: 5, completed: 2 }],
    completedInDay: 1,
    ...overrides,
  }
}

describe('DrizzleTaskDailySnapshotRepository', () => {
  const db = createTestDb() as Db
  let repo: DrizzleTaskDailySnapshotRepository
  let planIdA: string
  let planIdB: string

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'snapshot-repo-tenant-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'snapshot-repo-tenant-b' })
    planIdA = await seedPlan(db, TENANT_A)
    planIdB = await seedPlan(db, TENANT_B)
    repo = new DrizzleTaskDailySnapshotRepository(db as never)
  })

  afterAll(async () => {
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
  })

  describe('upsert()', () => {
    it('inserts a new snapshot', async () => {
      await setTenantContext(db, TENANT_A)

      const snapshot = makeSnapshot({
        tenantId: TENANT_A,
        planId: planIdA,
        snapshotDate: '2026-04-18',
      })

      await repo.upsert(snapshot)

      const rows = await repo.listForPlanInRange(planIdA, TENANT_A, '2026-04-18', '2026-04-18')
      expect(rows).toHaveLength(1)
      expect(rows[0]!.snapshotDate).toBe('2026-04-18')
      expect(rows[0]!.totalCount).toBe(10)
      expect(rows[0]!.openCount).toBe(7)
      expect(rows[0]!.completedCount).toBe(3)
      expect(rows[0]!.byPriority).toEqual({ urgent: 2, important: 3, medium: 4, low: 1 })
      expect(rows[0]!.byBucket).toEqual({ 'bucket-id-1': 6, 'bucket-id-2': 4 })
      expect(rows[0]!.byAssignee).toEqual([{ actorId: 'actor-1', open: 5, completed: 2 }])
      expect(rows[0]!.completedInDay).toBe(1)
    })

    it('is idempotent — second upsert with same PK updates, second payload wins', async () => {
      await setTenantContext(db, TENANT_A)

      const first = makeSnapshot({
        tenantId: TENANT_A,
        planId: planIdA,
        snapshotDate: '2026-04-19',
        totalCount: 5,
        openCount: 4,
        completedCount: 1,
        completedInDay: 0,
        byPriority: { urgent: 1, important: 1, medium: 2, low: 1 },
        byBucket: { 'bucket-id-1': 5 },
        byAssignee: [{ actorId: 'actor-1', open: 3, completed: 1 }],
      })

      const second = makeSnapshot({
        tenantId: TENANT_A,
        planId: planIdA,
        snapshotDate: '2026-04-19',
        totalCount: 20,
        openCount: 15,
        completedCount: 5,
        completedInDay: 3,
        byPriority: { urgent: 5, important: 5, medium: 5, low: 5 },
        byBucket: { 'bucket-id-1': 10, 'bucket-id-2': 10 },
        byAssignee: [{ actorId: 'actor-2', open: 10, completed: 5 }],
      })

      await repo.upsert(first)
      await repo.upsert(second)

      const rows = await repo.listForPlanInRange(planIdA, TENANT_A, '2026-04-19', '2026-04-19')
      expect(rows).toHaveLength(1)
      // second payload must win
      expect(rows[0]!.totalCount).toBe(20)
      expect(rows[0]!.openCount).toBe(15)
      expect(rows[0]!.completedCount).toBe(5)
      expect(rows[0]!.completedInDay).toBe(3)
      expect(rows[0]!.byPriority).toEqual({ urgent: 5, important: 5, medium: 5, low: 5 })
      expect(rows[0]!.byBucket).toEqual({ 'bucket-id-1': 10, 'bucket-id-2': 10 })
      expect(rows[0]!.byAssignee).toEqual([{ actorId: 'actor-2', open: 10, completed: 5 }])
    })
  })

  describe('listForPlanInRange()', () => {
    it('returns snapshots ordered by snapshotDate ASC', async () => {
      await setTenantContext(db, TENANT_A)

      // Seed 3 snapshots out of chronological order
      await repo.upsert(
        makeSnapshot({
          tenantId: TENANT_A,
          planId: planIdA,
          snapshotDate: '2026-04-22',
          totalCount: 30,
        }),
      )
      await repo.upsert(
        makeSnapshot({
          tenantId: TENANT_A,
          planId: planIdA,
          snapshotDate: '2026-04-20',
          totalCount: 10,
        }),
      )
      await repo.upsert(
        makeSnapshot({
          tenantId: TENANT_A,
          planId: planIdA,
          snapshotDate: '2026-04-21',
          totalCount: 20,
        }),
      )

      const rows = await repo.listForPlanInRange(planIdA, TENANT_A, '2026-04-20', '2026-04-22')
      expect(rows).toHaveLength(3)
      expect(rows[0]!.snapshotDate).toBe('2026-04-20')
      expect(rows[1]!.snapshotDate).toBe('2026-04-21')
      expect(rows[2]!.snapshotDate).toBe('2026-04-22')
    })

    it('excludes snapshots outside the date range', async () => {
      await setTenantContext(db, TENANT_A)

      // Seed one outside the range
      await repo.upsert(
        makeSnapshot({
          tenantId: TENANT_A,
          planId: planIdA,
          snapshotDate: '2026-05-01',
          totalCount: 99,
        }),
      )

      const rows = await repo.listForPlanInRange(planIdA, TENANT_A, '2026-04-20', '2026-04-22')
      // Should only contain dates 2026-04-20, 2026-04-21, 2026-04-22 — not 2026-05-01
      const dates = rows.map((r) => r.snapshotDate)
      expect(dates).not.toContain('2026-05-01')
    })
  })

  describe('tenant isolation', () => {
    it('listForPlanInRange with TENANT_A tenantId returns zero rows for TENANT_B plan', async () => {
      // Seed a snapshot for TENANT_B
      await setTenantContext(db, TENANT_B)
      await repo.upsert(
        makeSnapshot({
          tenantId: TENANT_B,
          planId: planIdB,
          snapshotDate: '2026-04-18',
          totalCount: 42,
        }),
      )

      // Query TENANT_B's planId but with TENANT_A's tenantId — should return nothing
      await setTenantContext(db, TENANT_A)
      const rows = await repo.listForPlanInRange(planIdB, TENANT_A, '2026-04-01', '2026-04-30')
      expect(rows).toHaveLength(0)
    })
  })
})
