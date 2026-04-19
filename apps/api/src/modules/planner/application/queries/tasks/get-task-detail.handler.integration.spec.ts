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
import { GetTaskDetailHandler } from './get-task-detail.handler'
import { GetTaskDetailQuery } from './get-task-detail.query'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import type { KernelQueryFacade } from '../../../../kernel/application/facades/kernel-query.facade'

const TENANT_ID = '01900000-0000-7fff-8000-000000003011'

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function seedPlan(
  db: Db,
  tenantId: string,
  overrides: { id?: string } = {},
): Promise<string> {
  const planId = overrides.id ?? uuidv7()
  const createdBy = uuidv7()
  await db.execute(
    sql`INSERT INTO planner.plan (id, tenant_id, name, description, created_by, created_at, updated_at)
        VALUES (${planId}, ${tenantId}, 'Detail Plan', '', ${createdBy}, NOW(), NOW())`,
  )
  return planId
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

async function seedBucket(db: Db, planId: string, tenantId: string): Promise<string> {
  const bucketId = uuidv7()
  await db.execute(
    sql`INSERT INTO planner.bucket (id, tenant_id, plan_id, name, order_hint, created_at, updated_at)
        VALUES (${bucketId}, ${tenantId}, ${planId}, 'Bucket', '1|a:', NOW(), NOW())`,
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
    description?: string
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
          ${overrides.title ?? 'Task Title'},
          ${overrides.description ?? 'Task description body'},
          0, 5, '1|a:',
          ${overrides.checklistItemCount ?? 0},
          ${overrides.checklistCheckedCount ?? 0},
          ${createdBy}, NOW(), NOW()
        )`,
  )
  return taskId
}

async function seedChecklistItem(
  db: Db,
  taskId: string,
  tenantId: string,
  overrides: { id?: string; title?: string; isChecked?: boolean; orderHint?: string },
): Promise<string> {
  const itemId = overrides.id ?? uuidv7()
  const createdBy = uuidv7()
  await db.execute(
    sql`INSERT INTO planner.task_checklist_item
        (id, task_id, tenant_id, title, is_checked, order_hint, created_by, created_at, updated_at)
        VALUES (
          ${itemId}, ${taskId}, ${tenantId},
          ${overrides.title ?? 'Checklist item'},
          ${overrides.isChecked ?? false},
          ${overrides.orderHint ?? '1|a:'},
          ${createdBy}, NOW(), NOW()
        )`,
  )
  return itemId
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

describe('GetTaskDetailHandler — integration', () => {
  const rawDb = createTestDb() as Db

  let planId: string
  let bucketId: string
  let taskId: string
  let memberActorId: string
  let nonMemberActorId: string
  const assigneeIds: string[] = []

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
    await seedTenant(rawDb, { id: TENANT_ID, slug: 'get-task-detail-int-tenant' })
    await setTenantContext(rawDb, TENANT_ID)

    memberActorId = uuidv7()
    nonMemberActorId = uuidv7()

    planId = await seedPlan(rawDb, TENANT_ID)
    bucketId = await seedBucket(rawDb, planId, TENANT_ID)

    taskId = await seedTask(rawDb, planId, bucketId, TENANT_ID, {
      title: 'Detail Task',
      description: 'Full description text',
      checklistItemCount: 10,
      checklistCheckedCount: 5,
    })

    // Add member
    await seedMember(rawDb, planId, TENANT_ID, memberActorId, 'owner')

    // Seed 10 checklist items — 5 checked, 5 unchecked, sorted by orderHint
    const orderHints = [
      '1|a:',
      '1|b:',
      '1|c:',
      '1|d:',
      '1|e:',
      '1|f:',
      '1|g:',
      '1|h:',
      '1|i:',
      '1|j:',
    ]
    for (let i = 0; i < 10; i++) {
      await seedChecklistItem(rawDb, taskId, TENANT_ID, {
        title: `Item ${i + 1}`,
        isChecked: i < 5,
        orderHint: orderHints[i],
      })
    }

    // Seed 3 assignees
    for (let i = 0; i < 3; i++) {
      const assigneeId = uuidv7()
      assigneeIds.push(assigneeId)
      await seedTaskAssignee(rawDb, taskId, assigneeId, TENANT_ID)
    }

    // Apply a label
    await seedTaskAppliedLabel(rawDb, taskId, planId, 'category1', TENANT_ID)
  })

  afterAll(async () => {
    await truncatePlannerSchema(rawDb)
    await truncateCoreSchema(rawDb)
  })

  describe('authorization', () => {
    it('throws UnauthorizedPlanAccessException for non-member actor', async () => {
      const kernelFacade = makeKernelFacade()
      const handler = new GetTaskDetailHandler(rawDb, kernelFacade)
      await expect(
        handler.execute(new GetTaskDetailQuery(planId, taskId, nonMemberActorId, TENANT_ID)),
      ).rejects.toBeInstanceOf(UnauthorizedPlanAccessException)
    })

    it('throws TaskNotFoundException for non-existent task', async () => {
      const kernelFacade = makeKernelFacade()
      const handler = new GetTaskDetailHandler(rawDb, kernelFacade)
      await expect(
        handler.execute(new GetTaskDetailQuery(planId, uuidv7(), memberActorId, TENANT_ID)),
      ).rejects.toBeInstanceOf(TaskNotFoundException)
    })
  })

  describe('return shape', () => {
    it('returns task with full description', async () => {
      const kernelFacade = makeKernelFacade()
      const handler = new GetTaskDetailHandler(rawDb, kernelFacade)
      const result = await handler.execute(
        new GetTaskDetailQuery(planId, taskId, memberActorId, TENANT_ID),
      )

      expect(result.id).toBe(taskId)
      expect(result.planId).toBe(planId)
      expect(result.bucketId).toBe(bucketId)
      expect(result.title).toBe('Detail Task')
      expect(result.description).toBe('Full description text')
    })

    it('returns checklist items sorted by orderHint ascending', async () => {
      const kernelFacade = makeKernelFacade()
      const handler = new GetTaskDetailHandler(rawDb, kernelFacade)
      const result = await handler.execute(
        new GetTaskDetailQuery(planId, taskId, memberActorId, TENANT_ID),
      )

      expect(result.checklist).toHaveLength(10)

      const hints = result.checklist.map((c) => c.orderHint)
      const sorted = [...hints].sort()
      expect(hints).toEqual(sorted)
    })

    it('returns correct checked/unchecked split', async () => {
      const kernelFacade = makeKernelFacade()
      const handler = new GetTaskDetailHandler(rawDb, kernelFacade)
      const result = await handler.execute(
        new GetTaskDetailQuery(planId, taskId, memberActorId, TENANT_ID),
      )

      const checked = result.checklist.filter((c) => c.isChecked)
      const unchecked = result.checklist.filter((c) => !c.isChecked)
      expect(checked).toHaveLength(5)
      expect(unchecked).toHaveLength(5)
    })

    it('returns 3 assignees resolved with display names', async () => {
      const actorMap = new Map(
        assigneeIds.map((id, i) => [id, { displayName: `Assignee ${i + 1}` }]),
      )
      const kernelFacade = makeKernelFacade(actorMap)
      const handler = new GetTaskDetailHandler(rawDb, kernelFacade)
      const result = await handler.execute(
        new GetTaskDetailQuery(planId, taskId, memberActorId, TENANT_ID),
      )

      expect(result.assignees).toHaveLength(3)

      const returnedIds = result.assignees.map((a) => a.actorId).sort()
      expect(returnedIds).toEqual([...assigneeIds].sort())

      for (const assignee of result.assignees) {
        expect(assignee.name).toBeDefined()
        expect(assignee.assignedBy).toBeDefined()
        expect(assignee.assignedAt).toBeInstanceOf(Date)
      }
    })

    it('getActorsByIds is called exactly once (batch, not per-assignee)', async () => {
      const kernelFacade = makeKernelFacade()
      const spy = vi.spyOn(kernelFacade, 'getActorsByIds')
      const handler = new GetTaskDetailHandler(rawDb, kernelFacade)
      await handler.execute(new GetTaskDetailQuery(planId, taskId, memberActorId, TENANT_ID))
      expect(spy).toHaveBeenCalledTimes(1)
    })

    it('returns appliedLabels', async () => {
      const kernelFacade = makeKernelFacade()
      const handler = new GetTaskDetailHandler(rawDb, kernelFacade)
      const result = await handler.execute(
        new GetTaskDetailQuery(planId, taskId, memberActorId, TENANT_ID),
      )

      expect(result.appliedLabels).toContain('category1')
    })

    it('returns empty array for attachments and zero counts for comments/evidence', async () => {
      const kernelFacade = makeKernelFacade()
      const handler = new GetTaskDetailHandler(rawDb, kernelFacade)
      const result = await handler.execute(
        new GetTaskDetailQuery(planId, taskId, memberActorId, TENANT_ID),
      )

      expect(result.attachments).toEqual([])
      expect(result.attachmentCount).toBe(0)
      expect(result.commentCount).toBe(0)
      expect(result.evidenceCount).toBe(0)
    })
  })
})
