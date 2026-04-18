/**
 * Task 12 — Group-by-drag integration test
 *
 * Verifies that all 5 group-by field commands are reachable via tRPC and
 * produce the correct side-effects (DB persistence, event emission).
 *
 * Uses the same Testcontainers-based real-DB infrastructure as the other
 * planner integration specs.
 */
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
import { EventBus } from '@nestjs/cqrs'
import {
  TaskCompletedEvent,
  TaskAssignedEvent,
  TaskLabelAppliedEvent,
} from '@future/event-contracts'
import { DrizzlePlanRepository } from '../../../infrastructure/repositories/drizzle-plan.repository'
import { DrizzleBucketRepository } from '../../../infrastructure/repositories/drizzle-bucket.repository'
import { DrizzlePlanMemberRepository } from '../../../infrastructure/repositories/drizzle-plan-member.repository'
import { DrizzleTaskRepository } from '../../../infrastructure/repositories/drizzle-task.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { CreatePlanHandler } from '../plans/create-plan.handler'
import { CreatePlanCommand } from '../plans/create-plan.command'
import { AddPlanMemberHandler } from '../plans/add-plan-member.handler'
import { AddPlanMemberCommand } from '../plans/add-plan-member.command'
import { CreateBucketHandler } from '../buckets/create-bucket.handler'
import { CreateBucketCommand } from '../buckets/create-bucket.command'
import { CreateTaskHandler } from './create-task.handler'
import { CreateTaskCommand } from './create-task.command'
import { SetTaskProgressHandler } from './set-task-progress.handler'
import { SetTaskProgressCommand } from './set-task-progress.command'
import { SetTaskPriorityHandler } from './set-task-priority.handler'
import { SetTaskPriorityCommand } from './set-task-priority.command'
import { SetTaskDatesHandler } from './set-task-dates.handler'
import { SetTaskDatesCommand } from './set-task-dates.command'
import { AssignTaskHandler } from './assign-task.handler'
import { AssignTaskCommand } from './assign-task.command'
import { ApplyLabelHandler } from './apply-label.handler'
import { ApplyLabelCommand } from './apply-label.command'
import { PlannerRouterService } from '../../../interface/trpc/planner-router.service'
import { plannerRouter } from '../../../interface/trpc/planner.router'
import type { AdminQueryFacade } from '../../../../admin/application/facades/admin-query.facade'

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = '01900000-0000-7fff-8000-000000007000'
const ACTOR_ID = uuidv7()

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEventBus(): { bus: EventBus; published: unknown[] } {
  const published: unknown[] = []
  const bus = {
    publish: vi.fn().mockImplementation((evt: unknown) => {
      published.push(evt)
      return Promise.resolve(undefined)
    }),
  } as unknown as EventBus
  return { bus, published }
}

function makePermissiveAuthSvc(): PlanAuthorizationService {
  return {
    assertCanCreatePlan: vi.fn().mockResolvedValue(undefined),
    assertCanReadPlan: vi.fn().mockResolvedValue(undefined),
    assertCanEditPlan: vi.fn().mockResolvedValue(undefined),
    assertCanAdminPlan: vi.fn().mockResolvedValue(undefined),
    assertCanManageMembers: vi.fn().mockResolvedValue(undefined),
    assertCanUpdateOwnTaskProgress: vi.fn().mockResolvedValue(undefined),
    assertCanDeleteTask: vi.fn().mockResolvedValue(undefined),
  } as unknown as PlanAuthorizationService
}

function buildBuses(
  planRepo: DrizzlePlanRepository,
  bucketRepo: DrizzleBucketRepository,
  memberRepo: DrizzlePlanMemberRepository,
  taskRepo: DrizzleTaskRepository,
  eventBus: EventBus,
) {
  const authSvc = makePermissiveAuthSvc()
  const commandHandlers = new Map<string, (cmd: unknown) => Promise<unknown>>()

  const createPlanHandler = new CreatePlanHandler(
    planRepo as never,
    bucketRepo as never,
    memberRepo as never,
    authSvc,
    eventBus,
  )
  const addMemberHandler = new AddPlanMemberHandler(
    planRepo as never,
    memberRepo as never,
    authSvc,
    eventBus,
  )
  const createBucketHandler = new CreateBucketHandler(bucketRepo as never, authSvc, eventBus)
  const createTaskHandler = new CreateTaskHandler(taskRepo as never, authSvc, eventBus)
  const setProgressHandler = new SetTaskProgressHandler(taskRepo as never, authSvc, eventBus)
  const setPriorityHandler = new SetTaskPriorityHandler(taskRepo as never, authSvc, eventBus)
  const setDatesHandler = new SetTaskDatesHandler(taskRepo as never, authSvc, eventBus)
  const assignHandler = new AssignTaskHandler(taskRepo as never, authSvc, eventBus)
  const applyLabelHandler = new ApplyLabelHandler(
    taskRepo as never,
    planRepo as never,
    authSvc,
    eventBus,
  )

  commandHandlers.set('CreatePlanCommand', (cmd) =>
    createPlanHandler.execute(cmd as CreatePlanCommand),
  )
  commandHandlers.set('AddPlanMemberCommand', (cmd) =>
    addMemberHandler.execute(cmd as AddPlanMemberCommand),
  )
  commandHandlers.set('CreateBucketCommand', (cmd) =>
    createBucketHandler.execute(cmd as CreateBucketCommand),
  )
  commandHandlers.set('CreateTaskCommand', (cmd) =>
    createTaskHandler.execute(cmd as CreateTaskCommand),
  )
  commandHandlers.set('SetTaskProgressCommand', (cmd) =>
    setProgressHandler.execute(cmd as SetTaskProgressCommand),
  )
  commandHandlers.set('SetTaskPriorityCommand', (cmd) =>
    setPriorityHandler.execute(cmd as SetTaskPriorityCommand),
  )
  commandHandlers.set('SetTaskDatesCommand', (cmd) =>
    setDatesHandler.execute(cmd as SetTaskDatesCommand),
  )
  commandHandlers.set('AssignTaskCommand', (cmd) => assignHandler.execute(cmd as AssignTaskCommand))
  commandHandlers.set('ApplyLabelCommand', (cmd) =>
    applyLabelHandler.execute(cmd as ApplyLabelCommand),
  )

  const commandBus = {
    execute(cmd: unknown) {
      const name = (cmd as object).constructor.name
      const handler = commandHandlers.get(name)
      if (!handler) throw new Error(`No handler for command: ${name}`)
      return handler(cmd)
    },
  }

  const queryBus = {
    execute(_q: unknown) {
      throw new Error('QueryBus not wired in group-by integration test')
    },
  }

  return { commandBus, queryBus }
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('task group-by commands — tRPC integration', () => {
  const db = createTestDb() as Db
  let planRepo: DrizzlePlanRepository
  let bucketRepo: DrizzleBucketRepository
  let memberRepo: DrizzlePlanMemberRepository
  let taskRepo: DrizzleTaskRepository
  let publishedEvents: unknown[]

  // Shared plan + bucket set up once for performance
  let planId: string
  let bucketIdA: string

  function makeCtx() {
    return {
      req: { headers: {} },
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
    }
  }

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_ID, slug: 'task-group-by-int-tenant' })
    await setTenantContext(db, TENANT_ID)

    planRepo = new DrizzlePlanRepository(db as never)
    bucketRepo = new DrizzleBucketRepository(db as never)
    memberRepo = new DrizzlePlanMemberRepository(db as never)
    taskRepo = new DrizzleTaskRepository(db as never)

    const { bus, published } = makeEventBus()
    publishedEvents = published

    const { commandBus, queryBus } = buildBuses(planRepo, bucketRepo, memberRepo, taskRepo, bus)

    const adminQueryFacade: Pick<AdminQueryFacade, 'isPlannerEnabled'> = {
      isPlannerEnabled: vi.fn().mockResolvedValue(true),
    }

    const svc = new PlannerRouterService(
      commandBus as never,
      queryBus as never,
      adminQueryFacade as AdminQueryFacade,
    )
    svc.onModuleInit()

    // Seed plan + bucket
    planId = uuidv7()
    bucketIdA = uuidv7()
    const caller = plannerRouter.createCaller(makeCtx())

    await caller.plans.create({
      actorId: ACTOR_ID,
      tenantId: TENANT_ID,
      id: planId,
      bucketId: bucketIdA,
      name: 'Group-by Test Plan',
      description: null,
    })

    // Seed label category1 directly — ApplyLabelHandler checks plan.labels for this slot.
    // CreatePlan seeds no labels, so we insert one via raw SQL (same pattern as get-board spec).
    await db.execute(
      sql`INSERT INTO planner.plan_label (plan_id, slot, name, color, tenant_id)
          VALUES (${planId}, 'category1', 'Bug', '#EF4444', ${TENANT_ID})
          ON CONFLICT (plan_id, slot) DO NOTHING`,
    )
  })

  afterAll(async () => {
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
  })

  // ── Helper: create a fresh task and return its ID + version ────────────────

  async function createTask(titleSuffix: string): Promise<{ taskId: string; version: string }> {
    const taskId = uuidv7()
    const caller = plannerRouter.createCaller(makeCtx())

    await caller.tasks.create({
      tenantId: TENANT_ID,
      planId,
      bucketId: bucketIdA,
      taskId,
      title: `Group-by Task — ${titleSuffix}`,
      actorId: ACTOR_ID,
    })

    const task = await taskRepo.findById(taskId, TENANT_ID)
    expect(task).not.toBeNull()
    return { taskId, version: task!.updatedAt.toISOString() }
  }

  // ── 1. setProgress(100) — marks complete, emits TaskCompletedEvent ─────────

  describe('tasks.setProgress(100)', () => {
    it('sets progress to 100, marks task completed, and emits TaskCompletedEvent', async () => {
      const { taskId, version } = await createTask('setProgress')
      const caller = plannerRouter.createCaller(makeCtx())
      const eventsBefore = publishedEvents.length

      await expect(
        caller.tasks.setProgress({
          tenantId: TENANT_ID,
          planId,
          taskId,
          actorId: ACTOR_ID,
          expectedVersion: version,
          progress: 100,
        }),
      ).resolves.not.toThrow()

      const updated = await taskRepo.findById(taskId, TENANT_ID)
      expect(updated!.progress).toBe(100)
      expect(updated!.completedAt).not.toBeNull()

      const newEvents = publishedEvents.slice(eventsBefore)
      const completedEvt = newEvents.find((e) => e instanceof TaskCompletedEvent)
      expect(completedEvt).toBeDefined()
    })
  })

  // ── 2. setPriority(9) — sets priority to Urgent ────────────────────────────

  describe('tasks.setPriority(9)', () => {
    it('sets priority to 9 (Urgent) and returns without error', async () => {
      const { taskId, version } = await createTask('setPriority')
      const caller = plannerRouter.createCaller(makeCtx())

      await expect(
        caller.tasks.setPriority({
          tenantId: TENANT_ID,
          planId,
          taskId,
          actorId: ACTOR_ID,
          expectedVersion: version,
          priority: 9,
        }),
      ).resolves.not.toThrow()

      const updated = await taskRepo.findById(taskId, TENANT_ID)
      expect(updated!.priority).toBe(9)
    })
  })

  // ── 3. setDates(dueDate) — persists due date ───────────────────────────────

  describe('tasks.setDates(dueDate)', () => {
    it('sets a due date and returns without error', async () => {
      const { taskId, version } = await createTask('setDates')
      const caller = plannerRouter.createCaller(makeCtx())
      const dueDate = new Date('2026-12-31')

      await expect(
        caller.tasks.setDates({
          tenantId: TENANT_ID,
          planId,
          taskId,
          actorId: ACTOR_ID,
          expectedVersion: version,
          startDate: null,
          dueDate,
        }),
      ).resolves.not.toThrow()

      const updated = await taskRepo.findById(taskId, TENANT_ID)
      expect(updated!.dueDate).not.toBeNull()
      expect(updated!.dueDate!.toISOString().slice(0, 10)).toBe('2026-12-31')
    })
  })

  // ── 4. assign(actorId) — assigns and emits TaskAssignedEvent ──────────────

  describe('tasks.assign(actorId)', () => {
    it('assigns an actor and emits TaskAssignedEvent', async () => {
      const { taskId, version } = await createTask('assign')
      const caller = plannerRouter.createCaller(makeCtx())
      const assigneeId = uuidv7()
      const eventsBefore = publishedEvents.length

      await expect(
        caller.tasks.assign({
          tenantId: TENANT_ID,
          planId,
          taskId,
          actorId: ACTOR_ID,
          expectedVersion: version,
          assigneeId,
        }),
      ).resolves.not.toThrow()

      const updated = await taskRepo.findById(taskId, TENANT_ID)
      expect(updated!.assignees.some((a) => a.actorId === assigneeId)).toBe(true)

      const newEvents = publishedEvents.slice(eventsBefore)
      const assignedEvt = newEvents.find((e) => e instanceof TaskAssignedEvent)
      expect(assignedEvt).toBeDefined()
    })
  })

  // ── 5. applyLabel(slot) — applies label and emits TaskLabelAppliedEvent ────

  describe('tasks.applyLabel(category1)', () => {
    it('applies label slot and emits TaskLabelAppliedEvent', async () => {
      const { taskId, version } = await createTask('applyLabel')
      const caller = plannerRouter.createCaller(makeCtx())
      const eventsBefore = publishedEvents.length

      await expect(
        caller.tasks.applyLabel({
          tenantId: TENANT_ID,
          planId,
          taskId,
          actorId: ACTOR_ID,
          expectedVersion: version,
          slot: 'category1',
        }),
      ).resolves.not.toThrow()

      const updated = await taskRepo.findById(taskId, TENANT_ID)
      // appliedLabels is LabelSlot[] — each LabelSlot has a .value property directly
      expect(updated!.appliedLabels.some((l) => l.value === 'category1')).toBe(true)

      const newEvents = publishedEvents.slice(eventsBefore)
      const labelEvt = newEvents.find((e) => e instanceof TaskLabelAppliedEvent)
      expect(labelEvt).toBeDefined()
    })
  })
})
