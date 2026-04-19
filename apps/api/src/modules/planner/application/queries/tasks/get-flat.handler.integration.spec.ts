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
import { GetFlatTasksHandler } from './get-flat.handler'
import { GetFlatTasksQuery } from './get-flat.query'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import type { KernelQueryFacade } from '../../../../kernel/application/facades/kernel-query.facade'

const TENANT_ID = '01900000-0000-7fff-8000-000000003021'

// ─── Seed helpers ──────────────────────────────────────────────────────────────

async function seedPlan(
  db: Db,
  tenantId: string,
  overrides: { id?: string; name?: string } = {},
): Promise<string> {
  const planId = overrides.id ?? uuidv7()
  const createdBy = uuidv7()
  await db.execute(
    sql`INSERT INTO planner.plan (id, tenant_id, name, description, created_by, created_at, updated_at)
        VALUES (${planId}, ${tenantId}, ${overrides.name ?? 'Flat Plan'}, '', ${createdBy}, NOW(), NOW())`,
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
    progress?: number
    priority?: number
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
          ${overrides.title ?? 'Task'}, '', ${overrides.progress ?? 0}, ${overrides.priority ?? 5},
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GetFlatTasksHandler — integration', () => {
  const rawDb = createTestDb() as Db

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
    await seedTenant(rawDb, { id: TENANT_ID, slug: 'get-flat-int-tenant' })
    await setTenantContext(rawDb, TENANT_ID)

    memberActorId = uuidv7()
    nonMemberActorId = uuidv7()
    planId = await seedPlan(rawDb, TENANT_ID, { name: 'Flat Plan' })

    // Seed 3 labels
    await seedLabel(rawDb, planId, TENANT_ID, 'category1', 'Bug', '#FF0000')
    await seedLabel(rawDb, planId, TENANT_ID, 'category2', 'Feature', '#00FF00')
    await seedLabel(rawDb, planId, TENANT_ID, 'category3', 'Chore', '#0000FF')

    // 1 member
    await seedMember(rawDb, planId, TENANT_ID, memberActorId, 'owner')

    // 3 buckets
    bucketIds = []
    const orderHints = ['1|a:', '1|b:', '1|c:']
    for (let i = 0; i < 3; i++) {
      const bId = await seedBucket(rawDb, planId, TENANT_ID, {
        name: `Bucket ${i + 1}`,
        orderHint: orderHints[i],
      })
      bucketIds.push(bId)
    }

    // 15 tasks spread across buckets (5 each)
    taskIds = []
    for (let b = 0; b < 3; b++) {
      for (let t = 0; t < 5; t++) {
        const hint = `1|${String.fromCharCode(97 + t)}:`
        const taskId = await seedTask(rawDb, planId, bucketIds[b]!, TENANT_ID, {
          title: `Task ${b * 5 + t + 1}`,
          orderHint: hint,
          checklistItemCount: t % 3,
          checklistCheckedCount: t % 2,
        })
        taskIds.push(taskId)
      }
    }

    // Assign first 3 tasks to memberActorId
    await seedTaskAssignee(rawDb, taskIds[0]!, memberActorId, TENANT_ID)
    await seedTaskAssignee(rawDb, taskIds[1]!, memberActorId, TENANT_ID)
    await seedTaskAssignee(rawDb, taskIds[2]!, memberActorId, TENANT_ID)

    // Apply labels to first 2 tasks
    await seedTaskAppliedLabel(rawDb, taskIds[0]!, planId, 'category1', TENANT_ID)
    await seedTaskAppliedLabel(rawDb, taskIds[1]!, planId, 'category2', TENANT_ID)
  })

  afterAll(async () => {
    await truncatePlannerSchema(rawDb)
    await truncateCoreSchema(rawDb)
  })

  describe('return shape', () => {
    it('returns 15 flat TaskFlat rows matching the plan snapshot', async () => {
      const kernelFacade = makeKernelFacade()
      const handler = new GetFlatTasksHandler(rawDb, kernelFacade)
      const result = await handler.execute(new GetFlatTasksQuery(planId, memberActorId, TENANT_ID))

      expect(result).toHaveLength(15)

      // Check shape of first row
      const first = result[0]!
      expect(typeof first.id).toBe('string')
      expect(first.planId).toBe(planId)
      expect(bucketIds).toContain(first.bucketId)
      expect(typeof first.bucketName).toBe('string')
      expect(typeof first.bucketOrderHint).toBe('string')
      expect(typeof first.title).toBe('string')
      expect(['not-started', 'in-progress', 'completed']).toContain(first.progress)
      expect(['urgent', 'important', 'medium', 'low']).toContain(first.priority)
      expect(typeof first.orderHint).toBe('string')
      expect(Array.isArray(first.assignees)).toBe(true)
      expect(Array.isArray(first.labels)).toBe(true)
      expect(typeof first.commentCount).toBe('number')
      expect(typeof first.attachmentCount).toBe('number')
      expect(typeof first.checklistCount).toBe('object')
      expect(typeof first.checklistCount.total).toBe('number')
      expect(typeof first.checklistCount.completed).toBe('number')
      expect(typeof first.createdAt).toBe('string')
      expect(typeof first.updatedAt).toBe('string')
    })

    it('returns tasks across all buckets with correct bucket info populated', async () => {
      const kernelFacade = makeKernelFacade()
      const handler = new GetFlatTasksHandler(rawDb, kernelFacade)
      const result = await handler.execute(new GetFlatTasksQuery(planId, memberActorId, TENANT_ID))

      // All buckets should appear
      const returnedBucketIds = new Set(result.map((t) => t.bucketId))
      for (const bId of bucketIds) {
        expect(returnedBucketIds.has(bId)).toBe(true)
      }

      // bucketName and bucketOrderHint should be non-empty for all rows
      for (const task of result) {
        expect(task.bucketName).toBeTruthy()
        expect(task.bucketOrderHint).toBeTruthy()
      }
    })

    it('resolves assignees via ONE getActorsByIds call (batch, not per-task)', async () => {
      const actorMap = new Map([[memberActorId, { displayName: 'Alice Nguyen' }]])
      const kernelFacade = makeKernelFacade(actorMap)
      const spy = vi.spyOn(kernelFacade, 'getActorsByIds')
      const handler = new GetFlatTasksHandler(rawDb, kernelFacade)

      const result = await handler.execute(new GetFlatTasksQuery(planId, memberActorId, TENANT_ID))

      // Exactly one batch call regardless of how many assignees
      expect(spy).toHaveBeenCalledTimes(1)

      // Tasks with assignments should have resolved names
      const assignedTasks = result.filter((t) => t.assignees.length > 0)
      expect(assignedTasks.length).toBeGreaterThan(0)

      for (const task of assignedTasks) {
        const assignee = task.assignees[0]!
        expect(assignee.actorId).toBe(memberActorId)
        expect(assignee.displayName).toBe('Alice Nguyen')
      }
    })

    it('returns labels with id (slot), name, and color', async () => {
      const kernelFacade = makeKernelFacade()
      const handler = new GetFlatTasksHandler(rawDb, kernelFacade)
      const result = await handler.execute(new GetFlatTasksQuery(planId, memberActorId, TENANT_ID))

      const tasksWithLabels = result.filter((t) => t.labels.length > 0)
      expect(tasksWithLabels.length).toBeGreaterThanOrEqual(2)

      for (const task of tasksWithLabels) {
        for (const label of task.labels) {
          expect(typeof label.id).toBe('string')
          expect(typeof label.name).toBe('string')
          expect(typeof label.color).toBe('string')
        }
      }
    })

    it('returns zero counts for comments and attachments (no data seeded)', async () => {
      const kernelFacade = makeKernelFacade()
      const handler = new GetFlatTasksHandler(rawDb, kernelFacade)
      const result = await handler.execute(new GetFlatTasksQuery(planId, memberActorId, TENANT_ID))

      for (const task of result) {
        expect(task.commentCount).toBe(0)
        expect(task.attachmentCount).toBe(0)
      }
    })

    it('maps all progress and priority enum variants correctly', async () => {
      // Seed a dedicated plan + bucket for this test to keep it isolated
      const mappingPlanId = await seedPlan(rawDb, TENANT_ID, { name: 'Mapping Test Plan' })
      await seedMember(rawDb, mappingPlanId, TENANT_ID, memberActorId, 'owner')
      const mappingBucketId = await seedBucket(rawDb, mappingPlanId, TENANT_ID, {
        name: 'Mapping Bucket',
        orderHint: '1|a:',
      })

      // Progress variants
      const completedId = await seedTask(rawDb, mappingPlanId, mappingBucketId, TENANT_ID, {
        title: 'Completed Task',
        progress: 100,
        orderHint: '1|a:',
      })
      const inProgressId = await seedTask(rawDb, mappingPlanId, mappingBucketId, TENANT_ID, {
        title: 'In-Progress Task',
        progress: 50,
        orderHint: '1|b:',
      })
      const notStartedId = await seedTask(rawDb, mappingPlanId, mappingBucketId, TENANT_ID, {
        title: 'Not-Started Task',
        progress: 0,
        orderHint: '1|c:',
      })

      // Priority variants
      const urgentId = await seedTask(rawDb, mappingPlanId, mappingBucketId, TENANT_ID, {
        title: 'Urgent Task',
        priority: 1,
        orderHint: '1|d:',
      })
      const importantId = await seedTask(rawDb, mappingPlanId, mappingBucketId, TENANT_ID, {
        title: 'Important Task',
        priority: 3,
        orderHint: '1|e:',
      })
      const lowId = await seedTask(rawDb, mappingPlanId, mappingBucketId, TENANT_ID, {
        title: 'Low Task',
        priority: 9,
        orderHint: '1|f:',
      })

      const kernelFacade = makeKernelFacade()
      const handler = new GetFlatTasksHandler(rawDb, kernelFacade)
      const result = await handler.execute(
        new GetFlatTasksQuery(mappingPlanId, memberActorId, TENANT_ID),
      )

      const byId = new Map(result.map((t) => [t.id, t]))

      // Progress assertions
      expect(byId.get(completedId)?.progress).toBe('completed')
      expect(byId.get(inProgressId)?.progress).toBe('in-progress')
      expect(byId.get(notStartedId)?.progress).toBe('not-started')

      // Priority assertions
      expect(byId.get(urgentId)?.priority).toBe('urgent')
      expect(byId.get(importantId)?.priority).toBe('important')
      expect(byId.get(lowId)?.priority).toBe('low')
    })
  })

  describe('soft-delete exclusion', () => {
    it('excludes soft-deleted tasks', async () => {
      const kernelFacade = makeKernelFacade()
      const handler = new GetFlatTasksHandler(rawDb, kernelFacade)

      // Soft-delete one task directly in DB
      const targetTaskId = taskIds[14]! // last task
      await rawDb.execute(
        sql`UPDATE planner.task SET deleted_at = NOW() WHERE id = ${targetTaskId} AND tenant_id = ${TENANT_ID}`,
      )

      const result = await handler.execute(new GetFlatTasksQuery(planId, memberActorId, TENANT_ID))

      // Should exclude the soft-deleted task
      expect(result).toHaveLength(14)
      const ids = result.map((t) => t.id)
      expect(ids).not.toContain(targetTaskId)

      // Restore for other tests
      await rawDb.execute(
        sql`UPDATE planner.task SET deleted_at = NULL WHERE id = ${targetTaskId} AND tenant_id = ${TENANT_ID}`,
      )
    })
  })

  describe('authorization', () => {
    it('throws UnauthorizedPlanAccessException for non-member actor', async () => {
      const kernelFacade = makeKernelFacade()
      const handler = new GetFlatTasksHandler(rawDb, kernelFacade)
      await expect(
        handler.execute(new GetFlatTasksQuery(planId, nonMemberActorId, TENANT_ID)),
      ).rejects.toBeInstanceOf(UnauthorizedPlanAccessException)
    })

    it('throws UnauthorizedPlanAccessException for non-existent plan', async () => {
      const kernelFacade = makeKernelFacade()
      const handler = new GetFlatTasksHandler(rawDb, kernelFacade)
      await expect(
        handler.execute(new GetFlatTasksQuery(uuidv7(), memberActorId, TENANT_ID)),
      ).rejects.toBeInstanceOf(UnauthorizedPlanAccessException)
    })
  })
})
