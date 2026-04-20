import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
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
import { GetTaskTrendsHandler } from './get-trends.handler'
import { GetTaskTrendsQuery } from './get-trends.query'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import type {
  ITaskDailySnapshotRepository,
  Snapshot,
} from '../../../domain/repositories/task-daily-snapshot.repository'
import type { PlanAuthorizationService } from '../../services/plan-authorization.service'

// Unique tenant UUID — must not collide with other integration specs
const TENANT_ID = '01900000-0000-7fff-8000-000000004070'

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function seedPlan(db: Db, tenantId: string): Promise<string> {
  const planId = uuidv7()
  const createdBy = uuidv7()
  await db.execute(
    sql`INSERT INTO planner.plan (id, tenant_id, name, description, created_by, created_at, updated_at)
        VALUES (${planId}, ${tenantId}, 'Trends Plan', '', ${createdBy}, NOW(), NOW())`,
  )
  return planId
}

async function seedMember(
  db: Db,
  planId: string,
  tenantId: string,
  actorId: string,
  role = 'owner',
): Promise<void> {
  await db.execute(
    sql`INSERT INTO planner.plan_member (plan_id, actor_id, role, added_by, added_at, tenant_id)
        VALUES (${planId}, ${actorId}, ${role}, ${actorId}, NOW(), ${tenantId})`,
  )
}

async function seedSnapshot(
  db: Db,
  planId: string,
  tenantId: string,
  snapshotDate: string,
  openCount: number,
  completedCount: number,
  completedInDay: number,
): Promise<void> {
  const totalCount = openCount + completedCount
  const byPriority = JSON.stringify({ urgent: 0, important: 0, medium: openCount, low: 0 })
  const byBucket = JSON.stringify({})
  const byAssignee = JSON.stringify([])

  await db.execute(
    sql`INSERT INTO planner.task_daily_snapshot
        (plan_id, tenant_id, snapshot_date, total_count, open_count, completed_count,
         by_priority, by_bucket, by_assignee, completed_in_day)
        VALUES (${planId}, ${tenantId}, ${snapshotDate}, ${totalCount}, ${openCount},
                ${completedCount}, ${byPriority}::jsonb, ${byBucket}::jsonb, ${byAssignee}::jsonb,
                ${completedInDay})
        ON CONFLICT (tenant_id, plan_id, snapshot_date) DO UPDATE
          SET total_count = EXCLUDED.total_count,
              open_count = EXCLUDED.open_count,
              completed_count = EXCLUDED.completed_count,
              by_priority = EXCLUDED.by_priority,
              by_bucket = EXCLUDED.by_bucket,
              by_assignee = EXCLUDED.by_assignee,
              completed_in_day = EXCLUDED.completed_in_day`,
  )
}

function makeSnapshotRepo(snapshots: Snapshot[]): ITaskDailySnapshotRepository {
  return {
    upsert: vi.fn(),
    listForPlanInRange: vi.fn().mockResolvedValue(snapshots),
  }
}

function makeAuthz(
  shouldReject?: UnauthorizedPlanAccessException,
): Pick<PlanAuthorizationService, 'assertCanReadPlan'> {
  return {
    assertCanReadPlan: shouldReject
      ? vi.fn().mockRejectedValue(shouldReject)
      : vi.fn().mockResolvedValue(undefined),
  }
}

function makeHandler(
  snapshots: Snapshot[],
  authzError?: UnauthorizedPlanAccessException,
): GetTaskTrendsHandler {
  return new GetTaskTrendsHandler(
    makeSnapshotRepo(snapshots),
    makeAuthz(authzError) as PlanAuthorizationService,
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GetTaskTrendsHandler — integration', () => {
  const rawDb = createTestDb() as Db

  let planId: string
  let memberActorId: string
  let nonMemberActorId: string

  // Pin "now" to a deterministic date:
  //   now = 2026-04-20T10:00:00Z
  //   endDate (yesterday)   = '2026-04-19'
  //   startDate-for-7d      = '2026-04-13'  (now - 7*86400000)
  //   startDate-for-30d     = '2026-03-21'
  //   startDate-for-90d     = '2026-01-20'

  beforeAll(async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-20T10:00:00Z'))

    await migrateForTest()
    await truncatePlannerSchema(rawDb)
    await truncateCoreSchema(rawDb)
    await seedTenant(rawDb, { id: TENANT_ID, slug: 'get-trends-int-tenant' })
    await setTenantContext(rawDb, TENANT_ID)

    memberActorId = uuidv7()
    nonMemberActorId = uuidv7()
    planId = await seedPlan(rawDb, TENANT_ID)
    await seedMember(rawDb, planId, TENANT_ID, memberActorId)
  })

  afterAll(async () => {
    vi.useRealTimers()
    await truncatePlannerSchema(rawDb)
    await truncateCoreSchema(rawDb)
  })

  describe('series and weeklyThroughput', () => {
    it('returns 3 snapshot rows in ASC order and correct weeklyThroughput sums', async () => {
      // 3 snapshots, each on a Monday so they each form their own ISO week
      // Seeds via real DB to verify the repo round-trip is consistent
      await seedSnapshot(rawDb, planId, TENANT_ID, '2026-03-23', 10, 3, 3)
      await seedSnapshot(rawDb, planId, TENANT_ID, '2026-03-30', 8, 5, 5)
      await seedSnapshot(rawDb, planId, TENANT_ID, '2026-04-06', 6, 7, 2)

      const fixtures: Snapshot[] = [
        {
          tenantId: TENANT_ID,
          planId,
          snapshotDate: '2026-03-23',
          totalCount: 13,
          openCount: 10,
          completedCount: 3,
          byPriority: { urgent: 0, important: 0, medium: 10, low: 0 },
          byBucket: {},
          byAssignee: [],
          completedInDay: 3,
        },
        {
          tenantId: TENANT_ID,
          planId,
          snapshotDate: '2026-03-30',
          totalCount: 13,
          openCount: 8,
          completedCount: 5,
          byPriority: { urgent: 0, important: 0, medium: 8, low: 0 },
          byBucket: {},
          byAssignee: [],
          completedInDay: 5,
        },
        {
          tenantId: TENANT_ID,
          planId,
          snapshotDate: '2026-04-06',
          totalCount: 13,
          openCount: 6,
          completedCount: 7,
          byPriority: { urgent: 0, important: 0, medium: 6, low: 0 },
          byBucket: {},
          byAssignee: [],
          completedInDay: 2,
        },
      ]

      const handler = makeHandler(fixtures)
      const result = await handler.execute(
        new GetTaskTrendsQuery(planId, memberActorId, TENANT_ID, '30d'),
      )

      expect(result.rangeEnd).toBe('2026-04-19')
      expect(result.rangeStart).toBe('2026-03-21')
      expect(result.series).toHaveLength(3)

      // ASC order preserved from repo
      expect(result.series[0]!.date).toBe('2026-03-23')
      expect(result.series[1]!.date).toBe('2026-03-30')
      expect(result.series[2]!.date).toBe('2026-04-06')

      // Field values
      expect(result.series[0]!.openCount).toBe(10)
      expect(result.series[0]!.completedCount).toBe(3)
      expect(result.series[0]!.completedInDay).toBe(3)

      // Each date is a Monday → its own ISO week
      expect(result.weeklyThroughput).toHaveLength(3)
      const wt = new Map(result.weeklyThroughput.map((w) => [w.weekStart, w.completedCount]))
      expect(wt.get('2026-03-23')).toBe(3)
      expect(wt.get('2026-03-30')).toBe(5)
      expect(wt.get('2026-04-06')).toBe(2)
    })

    it('returns empty series and weeklyThroughput for plan with no snapshots', async () => {
      const handler = makeHandler([])

      const result = await handler.execute(
        new GetTaskTrendsQuery(planId, memberActorId, TENANT_ID, '7d'),
      )

      expect(result.series).toEqual([])
      expect(result.weeklyThroughput).toEqual([])
      // now=2026-04-20: endDate='2026-04-19', startDate-7d='2026-04-13'
      expect(result.rangeEnd).toBe('2026-04-19')
      expect(result.rangeStart).toBe('2026-04-13')
    })
  })

  describe('date range computation', () => {
    it('computes rangeEnd = yesterday and rangeStart = now - 7 days for range 7d', async () => {
      const handler = makeHandler([])

      const result = await handler.execute(
        new GetTaskTrendsQuery(planId, memberActorId, TENANT_ID, '7d'),
      )

      // now = 2026-04-20T10:00:00Z
      expect(result.rangeEnd).toBe('2026-04-19')
      expect(result.rangeStart).toBe('2026-04-13')
    })
  })

  describe('authorization', () => {
    it('throws UnauthorizedPlanAccessException for non-member actor', async () => {
      const error = new UnauthorizedPlanAccessException(nonMemberActorId, planId)
      const handler = makeHandler([], error)

      await expect(
        handler.execute(new GetTaskTrendsQuery(planId, nonMemberActorId, TENANT_ID, '30d')),
      ).rejects.toBeInstanceOf(UnauthorizedPlanAccessException)
    })
  })

  describe('weeklyThroughput aggregation', () => {
    it('sums completedInDay for two snapshots in the same ISO week', async () => {
      // Wed 2026-04-15 and Thu 2026-04-16 → ISO week starting Mon 2026-04-13
      const fixtures: Snapshot[] = [
        {
          tenantId: TENANT_ID,
          planId,
          snapshotDate: '2026-04-15',
          totalCount: 10,
          openCount: 8,
          completedCount: 2,
          byPriority: { urgent: 0, important: 0, medium: 0, low: 0 },
          byBucket: {},
          byAssignee: [],
          completedInDay: 4,
        },
        {
          tenantId: TENANT_ID,
          planId,
          snapshotDate: '2026-04-16',
          totalCount: 10,
          openCount: 5,
          completedCount: 5,
          byPriority: { urgent: 0, important: 0, medium: 0, low: 0 },
          byBucket: {},
          byAssignee: [],
          completedInDay: 7,
        },
      ]

      const handler = makeHandler(fixtures)
      const result = await handler.execute(
        new GetTaskTrendsQuery(planId, memberActorId, TENANT_ID, '7d'),
      )

      expect(result.series).toHaveLength(2)
      // Both dates fall in the ISO week starting Mon 2026-04-13
      expect(result.weeklyThroughput).toHaveLength(1)
      expect(result.weeklyThroughput[0]!.weekStart).toBe('2026-04-13')
      expect(result.weeklyThroughput[0]!.completedCount).toBe(11) // 4 + 7
    })
  })
})
