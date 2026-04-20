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
import { ListTasksForActorHandler } from './list-tasks-for-actor.handler'
import { ListTasksForActorQuery } from './list-tasks-for-actor.query'
import type { KernelQueryFacade } from '../../../../kernel/application/facades/kernel-query.facade'

const TENANT_A = '01900000-0000-7fff-8000-000000004001'
const TENANT_B = '01900000-0000-7fff-8000-000000004002'

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
        VALUES (${planId}, ${tenantId}, ${overrides.name ?? 'Team Plan'}, '', ${createdBy}, NOW(), NOW())`,
  )
  return planId
}

async function seedPersonalPlan(
  db: Db,
  tenantId: string,
  ownerActorId: string,
  overrides: { id?: string; name?: string } = {},
): Promise<string> {
  const planId = overrides.id ?? uuidv7()
  const createdBy = ownerActorId
  await db.execute(
    sql`INSERT INTO planner.plan (id, tenant_id, name, description, owner_actor_id, sync_enabled, created_by, created_at, updated_at)
        VALUES (${planId}, ${tenantId}, ${overrides.name ?? 'Personal Plan'}, '', ${ownerActorId}, false, ${createdBy}, NOW(), NOW())`,
  )
  return planId
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
    progress?: number
    priority?: number
  } = {},
): Promise<string> {
  const taskId = overrides.id ?? uuidv7()
  const createdBy = uuidv7()
  const progress = overrides.progress ?? 0
  // chk_task_completion_consistency: progress=100 requires completed_at IS NOT NULL
  const completedAt = progress === 100 ? sql`NOW()` : sql`NULL`
  const completedBy = progress === 100 ? sql`${createdBy}::uuid` : sql`NULL::uuid`
  await db.execute(
    sql`INSERT INTO planner.task
        (id, tenant_id, plan_id, bucket_id, title, description, progress, priority,
         order_hint, checklist_item_count, checklist_checked_count,
         created_by, created_at, updated_at, completed_at, completed_by)
        VALUES (
          ${taskId}, ${tenantId}, ${planId}, ${bucketId},
          ${overrides.title ?? 'Task'}, '', ${progress}, ${overrides.priority ?? 5},
          ${overrides.orderHint ?? '1|a:'},
          0, 0,
          ${createdBy}, NOW(), NOW(), ${completedAt}, ${completedBy}
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

async function softDeleteTask(db: Db, taskId: string, tenantId: string): Promise<void> {
  await db.execute(
    sql`UPDATE planner.task SET deleted_at = NOW() WHERE id = ${taskId} AND tenant_id = ${tenantId}`,
  )
}

async function softDeletePlan(db: Db, planId: string, tenantId: string): Promise<void> {
  await db.execute(
    sql`UPDATE planner.plan SET deleted_at = NOW() WHERE id = ${planId} AND tenant_id = ${tenantId}`,
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ListTasksForActorHandler — integration', () => {
  const rawDb = createTestDb() as Db

  function makeKernelFacade(): KernelQueryFacade {
    return {
      getActorsByIds: vi.fn().mockResolvedValue(new Map()),
    } as unknown as KernelQueryFacade
  }

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(rawDb)
    await truncateCoreSchema(rawDb)
    await seedTenant(rawDb, { id: TENANT_A, slug: 'list-tasks-actor-tenant-a' })
    await seedTenant(rawDb, { id: TENANT_B, slug: 'list-tasks-actor-tenant-b' })
    await setTenantContext(rawDb, TENANT_A)
  })

  afterAll(async () => {
    await truncatePlannerSchema(rawDb)
    await truncateCoreSchema(rawDb)
  })

  describe('TC1 — returns tasks from every team plan the actor is assigned to', () => {
    it('returns tasks from both team plans with planKind === team', async () => {
      const actorId = uuidv7()

      const planAId = await seedPlan(rawDb, TENANT_A, { name: 'Team Plan A' })
      const planBId = await seedPlan(rawDb, TENANT_A, { name: 'Team Plan B' })

      const bucketA = await seedBucket(rawDb, planAId, TENANT_A)
      const bucketB = await seedBucket(rawDb, planBId, TENANT_A)

      const taskA = await seedTask(rawDb, planAId, bucketA, TENANT_A, { title: 'Task from Plan A' })
      const taskB = await seedTask(rawDb, planBId, bucketB, TENANT_A, { title: 'Task from Plan B' })

      await seedTaskAssignee(rawDb, taskA, actorId, TENANT_A)
      await seedTaskAssignee(rawDb, taskB, actorId, TENANT_A)

      const handler = new ListTasksForActorHandler(rawDb, makeKernelFacade())
      const result = await handler.execute(
        new ListTasksForActorQuery(actorId, TENANT_A, { includeCompleted: false }),
      )

      const titles = result.map((r) => r.title)
      expect(titles).toContain('Task from Plan A')
      expect(titles).toContain('Task from Plan B')

      for (const row of result) {
        expect(row.planKind).toBe('team')
      }
    })
  })

  describe("TC2 — includes the actor's own personal plan", () => {
    it("returns tasks from the actor's personal plan with planKind === personal", async () => {
      const actorId = uuidv7()

      const personalPlanId = await seedPersonalPlan(rawDb, TENANT_A, actorId, {
        name: 'My Personal Plan',
      })

      const bucket = await seedBucket(rawDb, personalPlanId, TENANT_A)
      const task = await seedTask(rawDb, personalPlanId, bucket, TENANT_A, {
        title: 'Personal Task',
      })
      await seedTaskAssignee(rawDb, task, actorId, TENANT_A)

      const handler = new ListTasksForActorHandler(rawDb, makeKernelFacade())
      const result = await handler.execute(
        new ListTasksForActorQuery(actorId, TENANT_A, { includeCompleted: false }),
      )

      const personalTask = result.find((r) => r.title === 'Personal Task')
      expect(personalTask).toBeDefined()
      expect(personalTask!.planKind).toBe('personal')
      expect(personalTask!.planName).toBe('My Personal Plan')
    })
  })

  describe("TC3 — R5 leak guard: never leaks another actor's personal plan", () => {
    it("does not return a task from another actor's personal plan even when our actor is assigned to it", async () => {
      const actorId = uuidv7()
      const otherActorId = uuidv7()

      // Other actor's personal plan
      const leakPlanId = await seedPersonalPlan(rawDb, TENANT_A, otherActorId, {
        name: 'Other Actor Personal Plan',
      })

      const bucket = await seedBucket(rawDb, leakPlanId, TENANT_A)
      const leakTask = await seedTask(rawDb, leakPlanId, bucket, TENANT_A, {
        title: 'Leak Task Should Be Invisible',
      })

      // Unusually assign our actor to a task inside another actor's personal plan
      await seedTaskAssignee(rawDb, leakTask, actorId, TENANT_A)

      const handler = new ListTasksForActorHandler(rawDb, makeKernelFacade())
      const result = await handler.execute(
        new ListTasksForActorQuery(actorId, TENANT_A, { includeCompleted: false }),
      )

      const leaked = result.find((r) => r.title === 'Leak Task Should Be Invisible')
      expect(leaked).toBeUndefined()
    })
  })

  describe('TC4 — excludes soft-deleted tasks and soft-deleted plans', () => {
    it('excludes soft-deleted tasks', async () => {
      const actorId = uuidv7()

      const planId = await seedPlan(rawDb, TENANT_A, { name: 'Soft Delete Task Plan' })
      const bucket = await seedBucket(rawDb, planId, TENANT_A)

      const activeTask = await seedTask(rawDb, planId, bucket, TENANT_A, {
        title: 'Active Task',
      })
      const deletedTask = await seedTask(rawDb, planId, bucket, TENANT_A, {
        title: 'Deleted Task',
      })

      await seedTaskAssignee(rawDb, activeTask, actorId, TENANT_A)
      await seedTaskAssignee(rawDb, deletedTask, actorId, TENANT_A)

      await softDeleteTask(rawDb, deletedTask, TENANT_A)

      const handler = new ListTasksForActorHandler(rawDb, makeKernelFacade())
      const result = await handler.execute(
        new ListTasksForActorQuery(actorId, TENANT_A, { includeCompleted: false }),
      )

      const ids = result.map((r) => r.id)
      expect(ids).toContain(activeTask)
      expect(ids).not.toContain(deletedTask)
    })

    it('excludes tasks from a soft-deleted plan', async () => {
      const actorId = uuidv7()

      const planId = await seedPlan(rawDb, TENANT_A, { name: 'Plan To Delete' })
      const bucket = await seedBucket(rawDb, planId, TENANT_A)
      const task = await seedTask(rawDb, planId, bucket, TENANT_A, {
        title: 'Task In Deleted Plan',
      })
      await seedTaskAssignee(rawDb, task, actorId, TENANT_A)

      // Confirm task appears before deletion
      const handlerBefore = new ListTasksForActorHandler(rawDb, makeKernelFacade())
      const before = await handlerBefore.execute(
        new ListTasksForActorQuery(actorId, TENANT_A, { includeCompleted: false }),
      )
      expect(before.find((r) => r.id === task)).toBeDefined()

      // Soft-delete the plan
      await softDeletePlan(rawDb, planId, TENANT_A)

      const handlerAfter = new ListTasksForActorHandler(rawDb, makeKernelFacade())
      const after = await handlerAfter.execute(
        new ListTasksForActorQuery(actorId, TENANT_A, { includeCompleted: false }),
      )
      const ids = after.map((r) => r.id)
      expect(ids).not.toContain(task)
    })
  })

  describe('TC5 — includeCompleted toggle', () => {
    it('hides completed tasks when includeCompleted is false', async () => {
      const actorId = uuidv7()

      const planId = await seedPlan(rawDb, TENANT_A, { name: 'Completed Toggle Plan' })
      const bucket = await seedBucket(rawDb, planId, TENANT_A)

      const activeTask = await seedTask(rawDb, planId, bucket, TENANT_A, {
        title: 'Active Task Toggle',
        progress: 0,
      })
      const completedTask = await seedTask(rawDb, planId, bucket, TENANT_A, {
        title: 'Completed Task Toggle',
        progress: 100,
      })

      await seedTaskAssignee(rawDb, activeTask, actorId, TENANT_A)
      await seedTaskAssignee(rawDb, completedTask, actorId, TENANT_A)

      const handler = new ListTasksForActorHandler(rawDb, makeKernelFacade())

      const withoutCompleted = await handler.execute(
        new ListTasksForActorQuery(actorId, TENANT_A, { includeCompleted: false }),
      )
      const withoutIds = withoutCompleted.map((r) => r.id)
      expect(withoutIds).toContain(activeTask)
      expect(withoutIds).not.toContain(completedTask)
    })

    it('shows completed tasks when includeCompleted is true', async () => {
      const actorId = uuidv7()

      const planId = await seedPlan(rawDb, TENANT_A, { name: 'Include Completed Plan' })
      const bucket = await seedBucket(rawDb, planId, TENANT_A)

      const activeTask = await seedTask(rawDb, planId, bucket, TENANT_A, {
        title: 'Active Task Include',
        progress: 0,
      })
      const completedTask = await seedTask(rawDb, planId, bucket, TENANT_A, {
        title: 'Completed Task Include',
        progress: 100,
      })

      await seedTaskAssignee(rawDb, activeTask, actorId, TENANT_A)
      await seedTaskAssignee(rawDb, completedTask, actorId, TENANT_A)

      const handler = new ListTasksForActorHandler(rawDb, makeKernelFacade())

      const withCompleted = await handler.execute(
        new ListTasksForActorQuery(actorId, TENANT_A, { includeCompleted: true }),
      )
      const withIds = withCompleted.map((r) => r.id)
      expect(withIds).toContain(activeTask)
      expect(withIds).toContain(completedTask)
    })

    it('correctly maps progress=100 as completed in the result', async () => {
      const actorId = uuidv7()

      const planId = await seedPlan(rawDb, TENANT_A, { name: 'Progress Map Plan' })
      const bucket = await seedBucket(rawDb, planId, TENANT_A)

      const completedTask = await seedTask(rawDb, planId, bucket, TENANT_A, {
        title: 'Progress Mapped Task',
        progress: 100,
      })
      await seedTaskAssignee(rawDb, completedTask, actorId, TENANT_A)

      const handler = new ListTasksForActorHandler(rawDb, makeKernelFacade())
      const result = await handler.execute(
        new ListTasksForActorQuery(actorId, TENANT_A, { includeCompleted: true }),
      )

      const found = result.find((r) => r.id === completedTask)
      expect(found).toBeDefined()
      expect(found!.progress).toBe('completed')
    })
  })

  describe('TC6 — tenant isolation', () => {
    it('actor in tenant B sees nothing from tenant A', async () => {
      const actorA = uuidv7()
      const actorB = uuidv7()

      // Seed in tenant A
      const planA = await seedPlan(rawDb, TENANT_A, { name: 'Tenant A Plan' })
      const bucketA = await seedBucket(rawDb, planA, TENANT_A)
      const taskA = await seedTask(rawDb, planA, bucketA, TENANT_A, {
        title: 'Tenant A Task',
      })
      await seedTaskAssignee(rawDb, taskA, actorA, TENANT_A)

      // Set tenant context to B for seeding tenant B data
      await setTenantContext(rawDb, TENANT_B)

      // Seed in tenant B
      const planB = await seedPlan(rawDb, TENANT_B, { name: 'Tenant B Plan' })
      const bucketB = await seedBucket(rawDb, planB, TENANT_B)
      const taskB = await seedTask(rawDb, planB, bucketB, TENANT_B, {
        title: 'Tenant B Task',
      })
      await seedTaskAssignee(rawDb, taskB, actorB, TENANT_B)

      // Restore tenant A context
      await setTenantContext(rawDb, TENANT_A)

      const handler = new ListTasksForActorHandler(rawDb, makeKernelFacade())

      // Actor B querying tenant B should only see tenant B tasks
      const resultB = await handler.execute(
        new ListTasksForActorQuery(actorB, TENANT_B, { includeCompleted: false }),
      )
      const idsB = resultB.map((r) => r.id)
      expect(idsB).toContain(taskB)
      expect(idsB).not.toContain(taskA)

      // Actor A querying tenant A should only see tenant A tasks
      const resultA = await handler.execute(
        new ListTasksForActorQuery(actorA, TENANT_A, { includeCompleted: false }),
      )
      const idsA = resultA.map((r) => r.id)
      expect(idsA).toContain(taskA)
      expect(idsA).not.toContain(taskB)
    })
  })
})
