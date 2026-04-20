import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
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
import { DrizzlePlanRepository } from '../repositories/drizzle-plan.repository'
import { DrizzleTaskRepository } from '../repositories/drizzle-task.repository'
import { DrizzleTaskDailySnapshotRepository } from '../repositories/drizzle-task-daily-snapshot.repository'
import { TaskDailySnapshotWorker } from './task-daily-snapshot.worker'
import {
  TaskDailySnapshotScheduler,
  FANOUT_JOB,
  PER_PLAN_JOB,
} from './task-daily-snapshot.scheduler'
import type { PgBossService } from '../../../../common/jobs/pg-boss.service'
import type { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import type { TaskDailySnapshotJobData } from './task-daily-snapshot.worker'

// ─── Helpers ───────────────────────────────────────────────────────────────

async function seedPlan(db: Db, tenantId: string): Promise<string> {
  const planId = uuidv7()
  const createdBy = uuidv7()
  await db.execute(
    sql`INSERT INTO planner.plan (id, tenant_id, name, description, created_by, created_at, updated_at)
        VALUES (${planId}, ${tenantId}, 'Scheduler Test Plan', '', ${createdBy}, NOW(), NOW())`,
  )
  return planId
}

// ─── Mocks ─────────────────────────────────────────────────────────────────

function makeMockBoss(): {
  schedule: ReturnType<typeof vi.fn>
  registerScheduledWorker: ReturnType<typeof vi.fn>
  enqueue: ReturnType<typeof vi.fn>
} {
  return {
    schedule: vi.fn().mockResolvedValue(undefined),
    registerScheduledWorker: vi.fn(),
    enqueue: vi.fn().mockResolvedValue('job-id'),
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('TaskDailySnapshotScheduler (integration)', () => {
  const db = createTestDb() as Db

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
  })

  afterAll(async () => {
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
  })

  beforeEach(async () => {
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
  })

  // ── Test 1: onModuleInit wires jobs correctly ───────────────────────────

  it('registers fanout schedule at 15 0 * * * UTC and two workers', async () => {
    const mockBoss = makeMockBoss()

    const planRepo = new DrizzlePlanRepository(db as never)
    const taskRepo = new DrizzleTaskRepository(db as never)
    const snapshotRepo = new DrizzleTaskDailySnapshotRepository(db as never)
    const worker = new TaskDailySnapshotWorker(snapshotRepo, taskRepo)

    const kernelFacade = {
      listAllTenantIds: vi.fn().mockResolvedValue([]),
    } as unknown as KernelQueryFacade

    const scheduler = new TaskDailySnapshotScheduler(
      mockBoss as unknown as PgBossService,
      db as never,
      kernelFacade,
      planRepo,
      worker,
    )

    await scheduler.onModuleInit()

    // schedule() called for the fanout job with correct cron
    expect(mockBoss.schedule).toHaveBeenCalledTimes(1)
    expect(mockBoss.schedule).toHaveBeenCalledWith(FANOUT_JOB, '15 0 * * *')

    // Two workers registered: fanout + per-plan
    expect(mockBoss.registerScheduledWorker).toHaveBeenCalledTimes(2)
    expect(mockBoss.registerScheduledWorker).toHaveBeenCalledWith(FANOUT_JOB, expect.any(Function))
    expect(mockBoss.registerScheduledWorker).toHaveBeenCalledWith(
      PER_PLAN_JOB,
      expect.any(Function),
      { localConcurrency: 3 },
    )
  })

  // ── Test 2: fanout enqueues zero jobs when tenant has no plans ──────────

  it('fanout enqueues zero jobs when tenant has no plans', async () => {
    const tenantId = uuidv7()
    await seedTenant(db, { id: tenantId, slug: `scheduler-no-plans-${tenantId.slice(0, 8)}` })

    const mockBoss = makeMockBoss()

    const planRepo = new DrizzlePlanRepository(db as never)
    const taskRepo = new DrizzleTaskRepository(db as never)
    const snapshotRepo = new DrizzleTaskDailySnapshotRepository(db as never)
    const worker = new TaskDailySnapshotWorker(snapshotRepo, taskRepo)

    const kernelFacade = {
      listAllTenantIds: vi.fn().mockResolvedValue([tenantId]),
    } as unknown as KernelQueryFacade

    const scheduler = new TaskDailySnapshotScheduler(
      mockBoss as unknown as PgBossService,
      db as never,
      kernelFacade,
      planRepo,
      worker,
    )

    await scheduler.onModuleInit()

    // Capture the fanout handler (first call, second arg)
    const fanoutHandler = mockBoss.registerScheduledWorker.mock.calls[0][1] as () => Promise<void>
    await fanoutHandler()

    // No plans → no jobs enqueued
    expect(mockBoss.enqueue).not.toHaveBeenCalled()
  })

  // ── Test 3: fanout enqueues one job per plan per tenant ─────────────────

  it('fanout enqueues one per-plan job per plan for each tenant', async () => {
    const tenantA = uuidv7()
    const tenantB = uuidv7()

    await seedTenant(db, { id: tenantA, slug: `scheduler-tenant-a-${tenantA.slice(0, 8)}` })
    await seedTenant(db, { id: tenantB, slug: `scheduler-tenant-b-${tenantB.slice(0, 8)}` })

    await setTenantContext(db, tenantA)
    const planA1 = await seedPlan(db, tenantA)
    const planA2 = await seedPlan(db, tenantA)

    await setTenantContext(db, tenantB)
    const planB1 = await seedPlan(db, tenantB)
    const planB2 = await seedPlan(db, tenantB)

    const mockBoss = makeMockBoss()

    const planRepo = new DrizzlePlanRepository(db as never)
    const taskRepo = new DrizzleTaskRepository(db as never)
    const snapshotRepo = new DrizzleTaskDailySnapshotRepository(db as never)
    const worker = new TaskDailySnapshotWorker(snapshotRepo, taskRepo)

    const kernelFacade = {
      listAllTenantIds: vi.fn().mockResolvedValue([tenantA, tenantB]),
    } as unknown as KernelQueryFacade

    const scheduler = new TaskDailySnapshotScheduler(
      mockBoss as unknown as PgBossService,
      db as never,
      kernelFacade,
      planRepo,
      worker,
    )

    await scheduler.onModuleInit()

    // Capture and invoke the fanout handler
    const fanoutHandler = mockBoss.registerScheduledWorker.mock.calls[0][1] as () => Promise<void>
    await fanoutHandler()

    // 2 tenants × 2 plans each = 4 enqueue calls
    expect(mockBoss.enqueue).toHaveBeenCalledTimes(4)

    // Verify the enqueued data shapes — planId must be one of the known plan IDs
    const enqueuedData = mockBoss.enqueue.mock.calls.map(
      (c: [string, TaskDailySnapshotJobData]) => c[1],
    )
    const expectedPlanIds = new Set([planA1, planA2, planB1, planB2])
    for (const data of enqueuedData) {
      expect(data.planId).toBeDefined()
      expect(expectedPlanIds.has(data.planId)).toBe(true)
      expect(data.tenantId).toMatch(/^[0-9a-f-]{36}$/)
      expect(data.snapshotDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }

    // Every call must target PER_PLAN_JOB queue
    for (const call of mockBoss.enqueue.mock.calls as [string, TaskDailySnapshotJobData][]) {
      expect(call[0]).toBe(PER_PLAN_JOB)
    }
  })
})
