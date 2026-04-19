/**
 * Checklist command handlers — integration test
 *
 * Verifies add → toggle → reorder → remove lifecycle against a real DB.
 * Uses Testcontainers-based infrastructure identical to other planner integration specs.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
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
import { EventBus } from '@nestjs/cqrs'
import { DrizzlePlanRepository } from '../../../infrastructure/repositories/drizzle-plan.repository'
import { DrizzleBucketRepository } from '../../../infrastructure/repositories/drizzle-bucket.repository'
import { DrizzlePlanMemberRepository } from '../../../infrastructure/repositories/drizzle-plan-member.repository'
import { DrizzleTaskRepository } from '../../../infrastructure/repositories/drizzle-task.repository'
import { DrizzleChecklistItemRepository } from '../../../infrastructure/repositories/drizzle-checklist-item.repository'
import { PlanContainer } from '../../../domain/value-objects/plan-container.vo'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { CreatePlanHandler } from '../plans/create-plan.handler'
import { CreatePlanCommand } from '../plans/create-plan.command'
import { CreateTaskHandler } from '../tasks/create-task.handler'
import { CreateTaskCommand } from '../tasks/create-task.command'
import { AddChecklistItemHandler } from './add-checklist-item.handler'
import { AddChecklistItemCommand } from './add-checklist-item.command'
import { ToggleChecklistItemHandler } from './toggle-checklist-item.handler'
import { ToggleChecklistItemCommand } from './toggle-checklist-item.command'
import { ReorderChecklistItemHandler } from './reorder-checklist-item.handler'
import { ReorderChecklistItemCommand } from './reorder-checklist-item.command'
import { RemoveChecklistItemHandler } from './remove-checklist-item.handler'
import { RemoveChecklistItemCommand } from './remove-checklist-item.command'

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = '01900000-0000-7fff-8000-000000008000'
const ACTOR_ID = uuidv7()

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEventBus(): EventBus {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
  } as unknown as EventBus
}

function makePermissiveAuthSvc(): PlanAuthorizationService {
  return {
    assertCanCreatePlan: vi.fn().mockResolvedValue(undefined),
    assertCanReadPlan: vi.fn().mockResolvedValue(undefined),
    assertCanEditPlan: vi.fn().mockResolvedValue(undefined),
    assertCanAdminPlan: vi.fn().mockResolvedValue(undefined),
    assertCanManageMembers: vi.fn().mockResolvedValue(undefined),
    assertIsPlanMember: vi.fn().mockResolvedValue(undefined),
  } as unknown as PlanAuthorizationService
}

async function getTaskCounters(
  db: Db,
  taskId: string,
): Promise<{ itemCount: number; checkedCount: number }> {
  const { sql } = await import('drizzle-orm')
  const result = await db.execute<{
    checklist_item_count: number
    checklist_checked_count: number
  }>(
    sql`SELECT checklist_item_count, checklist_checked_count
        FROM planner.task WHERE id = ${taskId}`,
  )
  const row = result.rows[0]!
  return {
    itemCount: Number(row.checklist_item_count),
    checkedCount: Number(row.checklist_checked_count),
  }
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('checklist command handlers — integration', () => {
  const db = createTestDb() as Db
  let taskRepo: DrizzleTaskRepository
  let checklistRepo: DrizzleChecklistItemRepository
  let addHandler: AddChecklistItemHandler
  let toggleHandler: ToggleChecklistItemHandler
  let reorderHandler: ReorderChecklistItemHandler
  let removeHandler: RemoveChecklistItemHandler

  let planId: string
  let taskId: string

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_ID, slug: 'checklist-cmd-int-tenant' })
    await setTenantContext(db, TENANT_ID)

    const planRepo = new DrizzlePlanRepository(db as never)
    const bucketRepo = new DrizzleBucketRepository(db as never)
    const memberRepo = new DrizzlePlanMemberRepository(db as never)
    taskRepo = new DrizzleTaskRepository(db as never)
    checklistRepo = new DrizzleChecklistItemRepository(db as never)

    const authSvc = makePermissiveAuthSvc()
    const eventBus = makeEventBus()

    addHandler = new AddChecklistItemHandler(
      taskRepo as never,
      checklistRepo as never,
      authSvc,
      eventBus,
    )
    toggleHandler = new ToggleChecklistItemHandler(
      taskRepo as never,
      checklistRepo as never,
      authSvc,
      eventBus,
    )
    reorderHandler = new ReorderChecklistItemHandler(
      taskRepo as never,
      checklistRepo as never,
      authSvc,
      eventBus,
    )
    removeHandler = new RemoveChecklistItemHandler(
      taskRepo as never,
      checklistRepo as never,
      authSvc,
      eventBus,
    )

    // Seed plan + bucket + task
    planId = uuidv7()
    const bucketId = uuidv7()
    taskId = uuidv7()
    const container = PlanContainer.of({ type: 'none' })

    const createPlanHandler = new CreatePlanHandler(
      planRepo as never,
      bucketRepo as never,
      memberRepo as never,
      authSvc,
      eventBus,
    )
    await createPlanHandler.execute(
      new CreatePlanCommand(
        TENANT_ID,
        planId,
        'Checklist Test Plan',
        null,
        container,
        ACTOR_ID,
        bucketId,
      ),
    )

    const createTaskHandler = new CreateTaskHandler(taskRepo as never, authSvc, eventBus)
    await createTaskHandler.execute(
      new CreateTaskCommand(TENANT_ID, planId, bucketId, taskId, 'Checklist Task', ACTOR_ID),
    )
  })

  afterAll(async () => {
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
  })

  // ── 1. Add item — itemCount becomes 1 ─────────────────────────────────────

  let itemId: string
  let itemOrderHint: string

  it('1. add item — checklistItemCount becomes 1', async () => {
    itemId = uuidv7()
    const task = await taskRepo.findById(taskId, TENANT_ID)
    expect(task).not.toBeNull()

    await addHandler.execute(
      new AddChecklistItemCommand(
        TENANT_ID,
        planId,
        taskId,
        itemId,
        ACTOR_ID,
        task!.updatedAt.toISOString(),
        'First item',
      ),
    )

    const counters = await getTaskCounters(db, taskId)
    expect(counters.itemCount).toBe(1)
    expect(counters.checkedCount).toBe(0)

    // Capture orderHint for later reorder test
    const items = await checklistRepo.listByTask(taskId, TENANT_ID)
    expect(items).toHaveLength(1)
    itemOrderHint = items[0]!.orderHint
  })

  // ── 2. Toggle checked — checkedCount becomes 1 ────────────────────────────

  it('2. toggle checked — checklistCheckedCount becomes 1', async () => {
    const task = await taskRepo.findById(taskId, TENANT_ID)
    expect(task).not.toBeNull()

    await toggleHandler.execute(
      new ToggleChecklistItemCommand(
        TENANT_ID,
        planId,
        taskId,
        itemId,
        ACTOR_ID,
        task!.updatedAt.toISOString(),
        true,
      ),
    )

    const counters = await getTaskCounters(db, taskId)
    expect(counters.checkedCount).toBe(1)
  })

  // ── 3. Reorder — orderHint changes ────────────────────────────────────────

  it('3. reorder — item orderHint changes', async () => {
    await reorderHandler.execute(
      new ReorderChecklistItemCommand(
        TENANT_ID,
        planId,
        taskId,
        itemId,
        ACTOR_ID,
        itemOrderHint, // orderHintAfter = current hint → appends ' !'
      ),
    )

    const items = await checklistRepo.listByTask(taskId, TENANT_ID)
    expect(items).toHaveLength(1)
    expect(items[0]!.orderHint).not.toBe(itemOrderHint)
  })

  // ── 4. Remove — counts back to 0 ──────────────────────────────────────────

  it('4. remove — checklistItemCount and checkedCount become 0', async () => {
    const task = await taskRepo.findById(taskId, TENANT_ID)
    expect(task).not.toBeNull()

    await removeHandler.execute(
      new RemoveChecklistItemCommand(
        TENANT_ID,
        planId,
        taskId,
        itemId,
        ACTOR_ID,
        task!.updatedAt.toISOString(),
      ),
    )

    const counters = await getTaskCounters(db, taskId)
    expect(counters.itemCount).toBe(0)
    expect(counters.checkedCount).toBe(0)
  })
})
