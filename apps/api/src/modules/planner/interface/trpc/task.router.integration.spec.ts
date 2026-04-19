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
import { DrizzlePlanRepository } from '../../infrastructure/repositories/drizzle-plan.repository'
import { DrizzleBucketRepository } from '../../infrastructure/repositories/drizzle-bucket.repository'
import { DrizzlePlanMemberRepository } from '../../infrastructure/repositories/drizzle-plan-member.repository'
import { DrizzlePlanLabelRepository } from '../../infrastructure/repositories/drizzle-plan-label.repository'
import { DrizzleTaskRepository } from '../../infrastructure/repositories/drizzle-task.repository'
import { PlanAuthorizationService } from '../../application/services/plan-authorization.service'
import { CreatePlanHandler } from '../../application/commands/plans/create-plan.handler'
import { CreatePlanCommand } from '../../application/commands/plans/create-plan.command'
import { AddPlanMemberHandler } from '../../application/commands/plans/add-plan-member.handler'
import { AddPlanMemberCommand } from '../../application/commands/plans/add-plan-member.command'
import { CreateBucketHandler } from '../../application/commands/buckets/create-bucket.handler'
import { CreateBucketCommand } from '../../application/commands/buckets/create-bucket.command'
import { CreateTaskHandler } from '../../application/commands/tasks/create-task.handler'
import { CreateTaskCommand } from '../../application/commands/tasks/create-task.command'
import { MoveTaskHandler } from '../../application/commands/tasks/move-task.handler'
import { MoveTaskCommand } from '../../application/commands/tasks/move-task.command'
import { SetTaskProgressHandler } from '../../application/commands/tasks/set-task-progress.handler'
import { SetTaskProgressCommand } from '../../application/commands/tasks/set-task-progress.command'
import { DeleteTaskHandler } from '../../application/commands/tasks/delete-task.handler'
import { DeleteTaskCommand } from '../../application/commands/tasks/delete-task.command'
import { UpdateTaskHandler } from '../../application/commands/tasks/update-task.handler'
import { UpdateTaskCommand } from '../../application/commands/tasks/update-task.command'
import { SetTaskPriorityHandler } from '../../application/commands/tasks/set-task-priority.handler'
import { SetTaskPriorityCommand } from '../../application/commands/tasks/set-task-priority.command'
import { SetTaskDatesHandler } from '../../application/commands/tasks/set-task-dates.handler'
import { SetTaskDatesCommand } from '../../application/commands/tasks/set-task-dates.command'
import { AssignTaskHandler } from '../../application/commands/tasks/assign-task.handler'
import { AssignTaskCommand } from '../../application/commands/tasks/assign-task.command'
import { UnassignTaskHandler } from '../../application/commands/tasks/unassign-task.handler'
import { UnassignTaskCommand } from '../../application/commands/tasks/unassign-task.command'
import { ApplyLabelHandler } from '../../application/commands/tasks/apply-label.handler'
import { ApplyLabelCommand } from '../../application/commands/tasks/apply-label.command'
import { RemoveLabelHandler } from '../../application/commands/tasks/remove-label.handler'
import { RemoveLabelCommand } from '../../application/commands/tasks/remove-label.command'
import { GetFlatTasksHandler } from '../../application/queries/tasks/get-flat.handler'
import { GetFlatTasksQuery } from '../../application/queries/tasks/get-flat.query'
import { PlannerRouterService } from './planner-router.service'
import { plannerRouter } from './planner.router'
import type { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import type { AdminQueryFacade } from '../../../admin/application/facades/admin-query.facade'

const TENANT_ID = '01900000-0000-7fff-8000-000000003000'
const ACTOR_ID = uuidv7()

function makeEventBus(): EventBus {
  return { publish: vi.fn().mockResolvedValue(undefined) } as unknown as EventBus
}

/**
 * Stub authorization service that always permits all actions.
 * Keeps the focus on tRPC wiring and task command correctness, not auth logic
 * (which is covered by PlanAuthorizationService unit tests).
 */
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

function makeKernelFacade(): KernelQueryFacade {
  return {
    getActorsByIds: vi.fn().mockResolvedValue(new Map()),
  } as unknown as KernelQueryFacade
}

function buildBuses(
  planRepo: DrizzlePlanRepository,
  bucketRepo: DrizzleBucketRepository,
  memberRepo: DrizzlePlanMemberRepository,
  labelRepo: DrizzlePlanLabelRepository,
  taskRepo: DrizzleTaskRepository,
  db?: Db,
) {
  const eventBus = makeEventBus()
  const authSvc = makePermissiveAuthSvc()

  const commandHandlers = new Map<string, (cmd: unknown) => Promise<unknown>>()

  // Plan commands
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

  // Bucket commands
  const createBucketHandler = new CreateBucketHandler(bucketRepo as never, authSvc, eventBus)

  // Task commands
  const createTaskHandler = new CreateTaskHandler(taskRepo as never, authSvc, eventBus)
  const moveTaskHandler = new MoveTaskHandler(taskRepo as never, authSvc, eventBus)
  const setProgressHandler = new SetTaskProgressHandler(taskRepo as never, authSvc, eventBus)
  const deleteTaskHandler = new DeleteTaskHandler(taskRepo as never, authSvc, eventBus)
  const updateTaskHandler = new UpdateTaskHandler(taskRepo as never, authSvc, eventBus)
  const setPriorityHandler = new SetTaskPriorityHandler(taskRepo as never, authSvc, eventBus)
  const setDatesHandler = new SetTaskDatesHandler(taskRepo as never, authSvc, eventBus)
  const assignHandler = new AssignTaskHandler(taskRepo as never, authSvc, eventBus)
  const unassignHandler = new UnassignTaskHandler(taskRepo as never, authSvc, eventBus)
  const applyLabelHandler = new ApplyLabelHandler(
    taskRepo as never,
    planRepo as never,
    authSvc,
    eventBus,
  )
  const removeLabelHandler = new RemoveLabelHandler(
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
  commandHandlers.set('MoveTaskCommand', (cmd) => moveTaskHandler.execute(cmd as MoveTaskCommand))
  commandHandlers.set('SetTaskProgressCommand', (cmd) =>
    setProgressHandler.execute(cmd as SetTaskProgressCommand),
  )
  commandHandlers.set('DeleteTaskCommand', (cmd) =>
    deleteTaskHandler.execute(cmd as DeleteTaskCommand),
  )
  commandHandlers.set('UpdateTaskCommand', (cmd) =>
    updateTaskHandler.execute(cmd as UpdateTaskCommand),
  )
  commandHandlers.set('SetTaskPriorityCommand', (cmd) =>
    setPriorityHandler.execute(cmd as SetTaskPriorityCommand),
  )
  commandHandlers.set('SetTaskDatesCommand', (cmd) =>
    setDatesHandler.execute(cmd as SetTaskDatesCommand),
  )
  commandHandlers.set('AssignTaskCommand', (cmd) => assignHandler.execute(cmd as AssignTaskCommand))
  commandHandlers.set('UnassignTaskCommand', (cmd) =>
    unassignHandler.execute(cmd as UnassignTaskCommand),
  )
  commandHandlers.set('ApplyLabelCommand', (cmd) =>
    applyLabelHandler.execute(cmd as ApplyLabelCommand),
  )
  commandHandlers.set('RemoveLabelCommand', (cmd) =>
    removeLabelHandler.execute(cmd as RemoveLabelCommand),
  )

  const commandBus = {
    execute(cmd: unknown) {
      const name = (cmd as object).constructor.name
      const handler = commandHandlers.get(name)
      if (!handler) throw new Error(`No handler for command: ${name}`)
      return handler(cmd)
    },
  }

  const queryHandlers = new Map<string, (q: unknown) => Promise<unknown>>()

  if (db) {
    const getFlatHandler = new GetFlatTasksHandler(db as never, makeKernelFacade())
    queryHandlers.set('GetFlatTasksQuery', (q) => getFlatHandler.execute(q as GetFlatTasksQuery))
  }

  const queryBus = {
    execute(q: unknown) {
      const name = (q as object).constructor.name
      const handler = queryHandlers.get(name)
      if (!handler) throw new Error(`QueryBus: no handler for query: ${name}`)
      return handler(q)
    },
  }

  return { commandBus, queryBus }
}

describe('taskRouter — tRPC integration', () => {
  const db = createTestDb() as Db
  let planRepo: DrizzlePlanRepository
  let bucketRepo: DrizzleBucketRepository
  let memberRepo: DrizzlePlanMemberRepository
  let labelRepo: DrizzlePlanLabelRepository
  let taskRepo: DrizzleTaskRepository

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_ID, slug: 'task-router-int-tenant' })
    await setTenantContext(db, TENANT_ID)

    planRepo = new DrizzlePlanRepository(db as never)
    bucketRepo = new DrizzleBucketRepository(db as never)
    memberRepo = new DrizzlePlanMemberRepository(db as never)
    labelRepo = new DrizzlePlanLabelRepository(db as never)
    taskRepo = new DrizzleTaskRepository(db as never)

    const { commandBus, queryBus } = buildBuses(
      planRepo,
      bucketRepo,
      memberRepo,
      labelRepo,
      taskRepo,
      db,
    )

    const adminQueryFacade: Pick<AdminQueryFacade, 'isPlannerEnabled'> = {
      isPlannerEnabled: vi.fn().mockResolvedValue(true),
    }

    const svc = new PlannerRouterService(
      commandBus as never,
      queryBus as never,
      adminQueryFacade as AdminQueryFacade,
    )
    svc.onModuleInit()
  })

  afterAll(async () => {
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
  })

  function makeCtx() {
    return {
      req: { headers: {} },
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
    }
  }

  async function setupPlanWithBuckets(): Promise<{
    planId: string
    bucketIdA: string
    bucketIdB: string
  }> {
    const planId = uuidv7()
    const bucketIdA = uuidv7()
    const bucketIdB = uuidv7()
    const caller = plannerRouter.createCaller(makeCtx())

    await caller.plans.create({
      actorId: ACTOR_ID,
      tenantId: TENANT_ID,
      id: planId,
      bucketId: bucketIdA,
      name: 'Task Test Plan',
      description: null,
    })

    await caller.buckets.create({
      actorId: ACTOR_ID,
      tenantId: TENANT_ID,
      planId,
      bucketId: bucketIdB,
      name: 'Bucket B',
    })

    return { planId, bucketIdA, bucketIdB }
  }

  describe('tasks.create → move → setProgress(100) → delete', () => {
    it('full lifecycle completes without error and delete removes task', async () => {
      const { planId, bucketIdA, bucketIdB } = await setupPlanWithBuckets()
      const taskId = uuidv7()
      const caller = plannerRouter.createCaller(makeCtx())

      // Step 1: create
      await expect(
        caller.tasks.create({
          tenantId: TENANT_ID,
          planId,
          bucketId: bucketIdA,
          taskId,
          title: 'Lifecycle Task',
          actorId: ACTOR_ID,
        }),
      ).resolves.not.toThrow()

      // Fetch the task's current version for optimistic concurrency
      const taskAfterCreate = await taskRepo.findById(taskId, TENANT_ID)
      expect(taskAfterCreate).not.toBeNull()
      const versionAfterCreate = taskAfterCreate!.updatedAt.toISOString()

      // Step 2: move to bucketB
      await expect(
        caller.tasks.move({
          tenantId: TENANT_ID,
          planId,
          taskId,
          actorId: ACTOR_ID,
          expectedVersion: versionAfterCreate,
          toBucketId: bucketIdB,
        }),
      ).resolves.not.toThrow()

      const taskAfterMove = await taskRepo.findById(taskId, TENANT_ID)
      expect(taskAfterMove).not.toBeNull()
      expect(taskAfterMove!.bucketId).toBe(bucketIdB)
      const versionAfterMove = taskAfterMove!.updatedAt.toISOString()

      // Step 3: setProgress(100) — marks as completed
      await expect(
        caller.tasks.setProgress({
          tenantId: TENANT_ID,
          planId,
          taskId,
          actorId: ACTOR_ID,
          expectedVersion: versionAfterMove,
          progress: 100,
        }),
      ).resolves.not.toThrow()

      const taskAfterProgress = await taskRepo.findById(taskId, TENANT_ID)
      expect(taskAfterProgress).not.toBeNull()
      expect(taskAfterProgress!.progress).toBe(100)
      expect(taskAfterProgress!.completedAt).not.toBeNull()

      // Step 4: delete
      await expect(
        caller.tasks.delete({
          tenantId: TENANT_ID,
          planId,
          taskId,
          actorId: ACTOR_ID,
        }),
      ).resolves.not.toThrow()

      // Task should be soft-deleted (findById returns null)
      const taskAfterDelete = await taskRepo.findById(taskId, TENANT_ID)
      expect(taskAfterDelete).toBeNull()
    })
  })

  describe('tasks.delete on non-existent task throws NOT_FOUND', () => {
    it('throws NOT_FOUND TRPCError for unknown task', async () => {
      const { planId } = await setupPlanWithBuckets()
      const caller = plannerRouter.createCaller(makeCtx())

      await expect(
        caller.tasks.delete({
          tenantId: TENANT_ID,
          planId,
          taskId: uuidv7(),
          actorId: ACTOR_ID,
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })
  })

  describe('tasks.update', () => {
    it('updates title and description', async () => {
      const { planId, bucketIdA } = await setupPlanWithBuckets()
      const taskId = uuidv7()
      const caller = plannerRouter.createCaller(makeCtx())

      await caller.tasks.create({
        tenantId: TENANT_ID,
        planId,
        bucketId: bucketIdA,
        taskId,
        title: 'Original Title',
        actorId: ACTOR_ID,
      })

      const task = await taskRepo.findById(taskId, TENANT_ID)
      expect(task).not.toBeNull()

      await expect(
        caller.tasks.update({
          tenantId: TENANT_ID,
          planId,
          taskId,
          actorId: ACTOR_ID,
          expectedVersion: task!.updatedAt.toISOString(),
          title: 'Updated Title',
          description: 'A new description',
        }),
      ).resolves.not.toThrow()

      const updated = await taskRepo.findById(taskId, TENANT_ID)
      expect(updated!.title).toBe('Updated Title')
      expect(updated!.description).toBe('A new description')
    })
  })

  describe('tasks.setPriority', () => {
    it('changes the task priority', async () => {
      const { planId, bucketIdA } = await setupPlanWithBuckets()
      const taskId = uuidv7()
      const caller = plannerRouter.createCaller(makeCtx())

      await caller.tasks.create({
        tenantId: TENANT_ID,
        planId,
        bucketId: bucketIdA,
        taskId,
        title: 'Priority Task',
        actorId: ACTOR_ID,
      })

      const task = await taskRepo.findById(taskId, TENANT_ID)
      expect(task).not.toBeNull()

      await expect(
        caller.tasks.setPriority({
          tenantId: TENANT_ID,
          planId,
          taskId,
          actorId: ACTOR_ID,
          expectedVersion: task!.updatedAt.toISOString(),
          priority: 1,
        }),
      ).resolves.not.toThrow()

      const updated = await taskRepo.findById(taskId, TENANT_ID)
      expect(updated!.priority).toBe(1)
    })
  })

  describe('tasks.setDates', () => {
    it('sets start and due dates', async () => {
      const { planId, bucketIdA } = await setupPlanWithBuckets()
      const taskId = uuidv7()
      const caller = plannerRouter.createCaller(makeCtx())

      await caller.tasks.create({
        tenantId: TENANT_ID,
        planId,
        bucketId: bucketIdA,
        taskId,
        title: 'Dates Task',
        actorId: ACTOR_ID,
      })

      const task = await taskRepo.findById(taskId, TENANT_ID)
      expect(task).not.toBeNull()

      const startDate = new Date('2026-01-01')
      const dueDate = new Date('2026-06-30')

      await expect(
        caller.tasks.setDates({
          tenantId: TENANT_ID,
          planId,
          taskId,
          actorId: ACTOR_ID,
          expectedVersion: task!.updatedAt.toISOString(),
          startDate,
          dueDate,
        }),
      ).resolves.not.toThrow()
    })
  })

  describe('tasks.assign / unassign', () => {
    it('assigns then unassigns a user without error', async () => {
      const { planId, bucketIdA } = await setupPlanWithBuckets()
      const taskId = uuidv7()
      const assigneeId = uuidv7()
      const caller = plannerRouter.createCaller(makeCtx())

      await caller.tasks.create({
        tenantId: TENANT_ID,
        planId,
        bucketId: bucketIdA,
        taskId,
        title: 'Assign Task',
        actorId: ACTOR_ID,
      })

      const taskV1 = await taskRepo.findById(taskId, TENANT_ID)
      expect(taskV1).not.toBeNull()

      await expect(
        caller.tasks.assign({
          tenantId: TENANT_ID,
          planId,
          taskId,
          actorId: ACTOR_ID,
          expectedVersion: taskV1!.updatedAt.toISOString(),
          assigneeId,
        }),
      ).resolves.not.toThrow()

      const taskV2 = await taskRepo.findById(taskId, TENANT_ID)
      expect(taskV2!.assignees.some((a) => a.actorId === assigneeId)).toBe(true)

      await expect(
        caller.tasks.unassign({
          tenantId: TENANT_ID,
          planId,
          taskId,
          actorId: ACTOR_ID,
          expectedVersion: taskV2!.updatedAt.toISOString(),
          assigneeId,
        }),
      ).resolves.not.toThrow()

      const taskV3 = await taskRepo.findById(taskId, TENANT_ID)
      expect(taskV3!.assignees.some((a) => a.actorId === assigneeId)).toBe(false)
    })
  })

  describe('tasks.getFlat', () => {
    it('returns flat task list for plan member', async () => {
      const { planId, bucketIdA } = await setupPlanWithBuckets()
      const taskId = uuidv7()
      const caller = plannerRouter.createCaller(makeCtx())

      await caller.tasks.create({
        tenantId: TENANT_ID,
        planId,
        bucketId: bucketIdA,
        taskId,
        title: 'Flat Task',
        actorId: ACTOR_ID,
      })

      const result = await caller.tasks.getFlat({
        planId,
        actorId: ACTOR_ID,
        tenantId: TENANT_ID,
      })

      expect(Array.isArray(result)).toBe(true)
      const tasks = result as Array<{ id: string; planId: string; title: string }>
      expect(tasks.some((t) => t.id === taskId)).toBe(true)
      expect(tasks.every((t) => t.planId === planId)).toBe(true)
    })

    it('throws FORBIDDEN for non-member actor', async () => {
      const { planId } = await setupPlanWithBuckets()
      const nonMemberActorId = uuidv7()
      const caller = plannerRouter.createCaller(makeCtx())

      await expect(
        caller.tasks.getFlat({
          planId,
          actorId: nonMemberActorId,
          tenantId: TENANT_ID,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })

    it('rejects non-UUID planId with input validation error', async () => {
      const caller = plannerRouter.createCaller(makeCtx())

      await expect(
        caller.tasks.getFlat({
          planId: 'not-a-uuid',
          actorId: ACTOR_ID,
          tenantId: TENANT_ID,
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    })
  })
})
