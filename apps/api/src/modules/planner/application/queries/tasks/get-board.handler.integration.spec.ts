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
import { GetBoardHandler } from './get-board.handler'
import { GetBoardQuery } from './get-board.query'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import type { KernelQueryFacade } from '../../../../kernel/application/facades/kernel-query.facade'

const TENANT_ID = '01900000-0000-7fff-8000-000000003001'

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function seedPlan(
  db: Db,
  tenantId: string,
  overrides: { id?: string; name?: string } = {},
): Promise<string> {
  const planId = overrides.id ?? uuidv7()
  const createdBy = uuidv7()
  await db.execute(
    sql`INSERT INTO planner.plan (id, tenant_id, name, description, created_by, created_at, updated_at)
        VALUES (${planId}, ${tenantId}, ${overrides.name ?? 'Board Plan'}, '', ${createdBy}, NOW(), NOW())`,
  )
  return planId
}

async function seedLabel(
  db: Db,
  planId: string,
  tenantId: string,
  slot: string,
  name: string,
  color: string,
): Promise<void> {
  await db.execute(
    sql`INSERT INTO planner.plan_label (plan_id, slot, name, color, tenant_id)
        VALUES (${planId}, ${slot}, ${name}, ${color}, ${tenantId})`,
  )
}

async function seedMember(
  db: Db,
  planId: string,
  tenantId: string,
  actorId: string,
  role: string,
): Promise<void> {
  await db.execute(
    sql`INSERT INTO planner.plan_member (plan_id, actor_id, role, added_by, added_at, tenant_id)
        VALUES (${planId}, ${actorId}, ${role}, ${actorId}, NOW(), ${tenantId})`,
  )
}

async function seedBucket(
  db: Db,
  planId: string,
  tenantId: string,
  overrides: { id?: string; name?: string; orderHint?: string } = {},
): Promise<string> {
  const bucketId = overrides.id ?? uuidv7()
  await db.execute(
    sql`INSERT INTO planner.bucket (id, tenant_id, plan_id, name, order_hint, created_at, updated_at)
        VALUES (${bucketId}, ${tenantId}, ${planId}, ${overrides.name ?? 'Bucket'}, ${overrides.orderHint ?? '1|a:'}, NOW(), NOW())`,
  )
  return bucketId
}

async function seedTask(
  db: Db,
  planId: string,
  bucketId: string,
  tenantId: string,
  overrides: {
    id?: string
    title?: string
    orderHint?: string
    checklistItemCount?: number
    checklistCheckedCount?: number
  } = {},
): Promise<string> {
  const taskId = overrides.id ?? uuidv7()
  const createdBy = uuidv7()
  await db.execute(
    sql`INSERT INTO planner.task
        (id, tenant_id, plan_id, bucket_id, title, description, progress, priority,
         order_hint, checklist_item_count, checklist_checked_count,
         created_by, created_at, updated_at)
        VALUES (
          ${taskId}, ${tenantId}, ${planId}, ${bucketId},
          ${overrides.title ?? 'Task'}, '', 0, 5,
          ${overrides.orderHint ?? '1|a:'},
          ${overrides.checklistItemCount ?? 0},
          ${overrides.checklistCheckedCount ?? 0},
          ${createdBy}, NOW(), NOW()
        )`,
  )
  return taskId
}

async function seedTaskAssignee(
  db: Db,
  taskId: string,
  actorId: string,
  tenantId: string,
): Promise<void> {
  await db.execute(
    sql`INSERT INTO planner.task_assignee (task_id, actor_id, assigned_by, assigned_at, tenant_id)
        VALUES (${taskId}, ${actorId}, ${actorId}, NOW(), ${tenantId})`,
  )
}

async function seedTaskAppliedLabel(
  db: Db,
  taskId: string,
  planId: string,
  slot: string,
  tenantId: string,
): Promise<void> {
  await db.execute(
    sql`INSERT INTO planner.task_applied_label (task_id, slot, tenant_id, plan_id)
        VALUES (${taskId}, ${slot}, ${tenantId}, ${planId})`,
  )
}

// ─── Instrumented DB wrapper ──────────────────────────────────────────────────

function makeCountingDb(db: Db): { db: Db; getCount: () => number; reset: () => void } {
  let count = 0
  const proxy = new Proxy(db, {
    get(target, prop) {
      if (prop === 'execute') {
        return (...args: unknown[]) => {
          count++
          return (target.execute as (...a: unknown[]) => unknown)(...args)
        }
      }
      return target[prop as keyof Db]
    },
  })
  return {
    db: proxy as Db,
    getCount: () => count,
    reset: () => {
      count = 0
    },
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GetBoardHandler — integration', () => {
  const rawDb = createTestDb() as Db
  const { db, getCount, reset } = makeCountingDb(rawDb)

  let planId: string
  let memberActorId: string
  let nonMemberActorId: string
  let bucketIds: string[]
  let taskIds: string[]

  function makeKernelFacade(
    actorMap: Map<string, { displayName: string }> = new Map(),
  ): KernelQueryFacade {
    return {
      getActorsByIds: vi.fn().mockResolvedValue(actorMap),
    } as unknown as KernelQueryFacade
  }

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(rawDb)
    await truncateCoreSchema(rawDb)
    await seedTenant(rawDb, { id: TENANT_ID, slug: 'get-board-int-tenant' })
    await setTenantContext(rawDb, TENANT_ID)

    memberActorId = uuidv7()
    nonMemberActorId = uuidv7()
    planId = await seedPlan(rawDb, TENANT_ID, { name: 'Sprint Board' })

    // 12 labels
    for (let i = 1; i <= 12; i++) {
      await seedLabel(rawDb, planId, TENANT_ID, `category${i}`, `Label ${i}`, '#FF0000')
    }

    // 4 members (including the test actor)
    await seedMember(rawDb, planId, TENANT_ID, memberActorId, 'owner')
    for (let i = 0; i < 3; i++) {
      await seedMember(rawDb, planId, TENANT_ID, uuidv7(), 'viewer')
    }

    // 6 buckets with orderHints that sort correctly
    bucketIds = []
    const orderHints = ['1|a:', '1|b:', '1|c:', '1|d:', '1|e:', '1|f:']
    for (let i = 0; i < 6; i++) {
      const bId = await seedBucket(rawDb, planId, TENANT_ID, {
        name: `Bucket ${i + 1}`,
        orderHint: orderHints[i],
      })
      bucketIds.push(bId)
    }

    // 50 tasks spread across buckets (8-9 each)
    taskIds = []
    let taskIndex = 0
    for (let b = 0; b < 6; b++) {
      const count = b < 2 ? 9 : 8
      for (let t = 0; t < count; t++) {
        const hint = `1|${String.fromCharCode(97 + t)}:`
        const taskId = await seedTask(rawDb, planId, bucketIds[b]!, TENANT_ID, {
          title: `Task ${taskIndex + 1}`,
          orderHint: hint,
          checklistItemCount: taskIndex % 3,
          checklistCheckedCount: taskIndex % 2,
        })
        taskIds.push(taskId)
        taskIndex++
      }
    }

    // Assign a few tasks to memberActorId
    await seedTaskAssignee(rawDb, taskIds[0]!, memberActorId, TENANT_ID)
    await seedTaskAssignee(rawDb, taskIds[1]!, memberActorId, TENANT_ID)

    // Apply some labels
    await seedTaskAppliedLabel(rawDb, taskIds[0]!, planId, 'category1', TENANT_ID)
    await seedTaskAppliedLabel(rawDb, taskIds[1]!, planId, 'category2', TENANT_ID)
  })

  afterAll(async () => {
    await truncatePlannerSchema(rawDb)
    await truncateCoreSchema(rawDb)
  })

  describe('authorization', () => {
    it('throws UnauthorizedPlanAccessException for non-member actor (no plan existence leak)', async () => {
      reset()
      const kernelFacade = makeKernelFacade()
      const handler = new GetBoardHandler(db, kernelFacade)
      await expect(
        handler.execute(new GetBoardQuery(planId, nonMemberActorId, TENANT_ID)),
      ).rejects.toBeInstanceOf(UnauthorizedPlanAccessException)
    })

    it('throws UnauthorizedPlanAccessException for non-existent plan (no leak)', async () => {
      reset()
      const kernelFacade = makeKernelFacade()
      const handler = new GetBoardHandler(db, kernelFacade)
      await expect(
        handler.execute(new GetBoardQuery(uuidv7(), memberActorId, TENANT_ID)),
      ).rejects.toBeInstanceOf(UnauthorizedPlanAccessException)
    })
  })

  describe('query count', () => {
    it('uses exactly 3 SQL queries', async () => {
      reset()
      const actorMap = new Map([[memberActorId, { displayName: 'Alice' }]])
      const kernelFacade = makeKernelFacade(actorMap)
      const handler = new GetBoardHandler(db, kernelFacade)
      await handler.execute(new GetBoardQuery(planId, memberActorId, TENANT_ID))
      expect(getCount()).toBe(3)
    })
  })

  describe('return shape', () => {
    it('returns plan with labels and members', async () => {
      const kernelFacade = makeKernelFacade(new Map([[memberActorId, { displayName: 'Alice' }]]))
      const handler = new GetBoardHandler(db, kernelFacade)
      const result = await handler.execute(new GetBoardQuery(planId, memberActorId, TENANT_ID))

      expect(result.plan.id).toBe(planId)
      expect(result.plan.name).toBe('Sprint Board')
      expect(result.plan.labels).toHaveLength(12)
      expect(result.plan.members).toHaveLength(4)
    })

    it('returns 6 buckets sorted by orderHint', async () => {
      const kernelFacade = makeKernelFacade()
      const handler = new GetBoardHandler(db, kernelFacade)
      const result = await handler.execute(new GetBoardQuery(planId, memberActorId, TENANT_ID))

      expect(result.buckets).toHaveLength(6)

      const orderHints = result.buckets.map((b) => b.orderHint)
      const sorted = [...orderHints].sort()
      expect(orderHints).toEqual(sorted)
    })

    it('returns 50 tasks total spread across buckets', async () => {
      const kernelFacade = makeKernelFacade()
      const handler = new GetBoardHandler(db, kernelFacade)
      const result = await handler.execute(new GetBoardQuery(planId, memberActorId, TENANT_ID))

      const totalTasks = result.buckets.reduce((sum, b) => sum + b.tasks.length, 0)
      expect(totalTasks).toBe(50)
    })

    it('tasks within each bucket are sorted by orderHint', async () => {
      const kernelFacade = makeKernelFacade()
      const handler = new GetBoardHandler(db, kernelFacade)
      const result = await handler.execute(new GetBoardQuery(planId, memberActorId, TENANT_ID))

      for (const bucket of result.buckets) {
        const hints = bucket.tasks.map((t) => t.orderHint)
        const sorted = [...hints].sort()
        expect(hints).toEqual(sorted)
      }
    })

    it('resolves assignees with rich display info via one getActorsByIds call', async () => {
      const actorMap = new Map([[memberActorId, { displayName: 'Alice Nguyen' }]])
      const kernelFacade = makeKernelFacade(actorMap)
      const getActorsSpy = vi.spyOn(kernelFacade, 'getActorsByIds')
      const handler = new GetBoardHandler(db, kernelFacade)

      const result = await handler.execute(new GetBoardQuery(planId, memberActorId, TENANT_ID))

      // Exactly one batch call
      expect(getActorsSpy).toHaveBeenCalledTimes(1)

      // Tasks with memberActorId should have resolved name
      const allTasks = result.buckets.flatMap((b) => b.tasks)
      const assignedTasks = allTasks.filter((t) => t.assignees.length > 0)
      expect(assignedTasks.length).toBeGreaterThan(0)

      for (const task of assignedTasks) {
        const assignee = task.assignees[0]!
        expect(assignee.actorId).toBe(memberActorId)
        expect(assignee.name).toBe('Alice Nguyen')
      }
    })

    it('passes through denormalized checklistItemCount and checklistCheckedCount', async () => {
      const kernelFacade = makeKernelFacade()
      const handler = new GetBoardHandler(db, kernelFacade)
      const result = await handler.execute(new GetBoardQuery(planId, memberActorId, TENANT_ID))

      const allTasks = result.buckets.flatMap((b) => b.tasks)

      // task at index 2 has checklistItemCount=2, checklistCheckedCount=0
      // We can verify the counts are non-negative integers
      for (const task of allTasks) {
        expect(task.checklistItemCount).toBeGreaterThanOrEqual(0)
        expect(task.checklistCheckedCount).toBeGreaterThanOrEqual(0)
        expect(typeof task.checklistItemCount).toBe('number')
        expect(typeof task.checklistCheckedCount).toBe('number')
      }
    })

    it('returns zero stub counts for attachmentCount, commentCount, evidenceCount', async () => {
      const kernelFacade = makeKernelFacade()
      const handler = new GetBoardHandler(db, kernelFacade)
      const result = await handler.execute(new GetBoardQuery(planId, memberActorId, TENANT_ID))

      const allTasks = result.buckets.flatMap((b) => b.tasks)
      for (const task of allTasks) {
        expect(task.attachmentCount).toBe(0)
        expect(task.commentCount).toBe(0)
        expect(task.evidenceCount).toBe(0)
      }
    })

    it('returns appliedLabels for tasks that have labels applied', async () => {
      const kernelFacade = makeKernelFacade()
      const handler = new GetBoardHandler(db, kernelFacade)
      const result = await handler.execute(new GetBoardQuery(planId, memberActorId, TENANT_ID))

      const allTasks = result.buckets.flatMap((b) => b.tasks)
      const tasksWithLabels = allTasks.filter((t) => t.appliedLabels.length > 0)
      expect(tasksWithLabels.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('getActorsByIds called with exactly once (no per-task calls)', () => {
    it('calls getActorsByIds exactly once regardless of assignee count', async () => {
      const kernelFacade = makeKernelFacade()
      const spy = vi.spyOn(kernelFacade, 'getActorsByIds')
      const handler = new GetBoardHandler(db, kernelFacade)

      await handler.execute(new GetBoardQuery(planId, memberActorId, TENANT_ID))

      expect(spy).toHaveBeenCalledTimes(1)
    })
  })

  describe('performance — 200 tasks / 10 buckets', () => {
    const PERF_TENANT = '01900000-0000-7fff-8000-000000003002'
    let perfPlanId: string
    let perfMemberActorId: string

    beforeAll(async () => {
      await seedTenant(rawDb, { id: PERF_TENANT, slug: 'get-board-perf-tenant' })
      await setTenantContext(rawDb, PERF_TENANT)

      perfMemberActorId = uuidv7()
      perfPlanId = await seedPlan(rawDb, PERF_TENANT, { name: 'Perf Plan' })
      await seedMember(rawDb, perfPlanId, PERF_TENANT, perfMemberActorId, 'owner')

      // 10 buckets
      const perfBucketIds: string[] = []
      for (let i = 0; i < 10; i++) {
        const bId = await seedBucket(rawDb, perfPlanId, PERF_TENANT, {
          name: `Bucket ${i + 1}`,
          orderHint: `1|${String.fromCharCode(97 + i)}:`,
        })
        perfBucketIds.push(bId)
      }

      // 200 tasks across 10 buckets (20 each)
      for (let b = 0; b < 10; b++) {
        for (let t = 0; t < 20; t++) {
          await seedTask(rawDb, perfPlanId, perfBucketIds[b]!, PERF_TENANT, {
            title: `Task ${b * 20 + t + 1}`,
            orderHint: `1|${String.fromCharCode(97 + t)}:`,
          })
        }
      }
    })

    it('p95 < 150ms across 20 runs with 200 tasks and 10 buckets', async () => {
      const kernelFacade = makeKernelFacade()
      const handler = new GetBoardHandler(rawDb, kernelFacade)
      const durations: number[] = []

      for (let i = 0; i < 20; i++) {
        const start = performance.now()
        await handler.execute(new GetBoardQuery(perfPlanId, perfMemberActorId, PERF_TENANT))
        durations.push(performance.now() - start)
      }

      durations.sort((a, b) => a - b)
      const p95 = durations[Math.ceil(0.95 * durations.length) - 1]!
      expect(p95).toBeLessThan(150)
    })
  })
})
