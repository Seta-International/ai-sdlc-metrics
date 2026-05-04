# Planner Board Polish — Plan 01: API Handler Return Types

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update four command handlers to return `{ updatedAt: Date }` so the frontend can write the authoritative server timestamp into the board cache after each mutation, eliminating the stale-`expectedVersion` 409 bug.

**Architecture:** Four NestJS CQRS command handlers currently return `Promise<void>`. Changing their return type to `Promise<{ updatedAt: Date }>` flows automatically through the existing tRPC procedure layer (each procedure already `return`s `svc().command(...)`, so no router changes are needed). The test for each handler gets one new assertion.

**Tech Stack:** NestJS CQRS (`ICommandHandler`), Vitest (unit, `--project unit` in `apps/api`)

**Spec source:** `docs/superpowers/specs/2026-05-04-planner-board-polish-design.md` §3.1 and §5

---

**Exit criteria:**

- All four handlers have return type `Promise<{ updatedAt: Date }>` and return `{ updatedAt: task.updatedAt }`.
- Each handler's existing unit test is extended with a `result.updatedAt` assertion.
- `bun run --filter @future/api test:unit` passes with no new failures.
- No changes to `task.router.ts` or any other file outside the four handler files and their specs.

---

### Task 1: `SetTaskPriorityHandler` — return `{ updatedAt: Date }`

**Files:**

- Modify: `apps/api/src/modules/planner/application/commands/tasks/set-task-priority.handler.ts`
- Modify: `apps/api/src/modules/planner/application/commands/tasks/set-task-priority.handler.spec.ts`

- [ ] **Step 1: Write the failing test**

  Open `set-task-priority.handler.spec.ts`. In the existing `'sets priority and emits TaskUpdatedEvent'` test, add a return-value assertion:

  ```ts
  it('sets priority and emits TaskUpdatedEvent', async () => {
    const task = makeTask()
    taskRepo.findById.mockResolvedValue(task)
    const command = new SetTaskPriorityCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      task.updatedAt.toISOString(),
      1,
    )

    const result = await handler.execute(command) // <-- capture return value

    expect(authSvc.assertCanEditPlan).toHaveBeenCalledWith(ACTOR_ID, PLAN_ID, TENANT_ID)
    const [updatedTask] = taskRepo.update.mock.calls[0]
    expect(updatedTask.priority).toBe(1)
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(TaskUpdatedEvent))
    expect(result).toEqual({ updatedAt: expect.any(Date) }) // <-- new assertion
  })
  ```

- [ ] **Step 2: Run the test to verify it fails**

  ```bash
  bun run --filter @future/api test:unit -- --reporter=verbose set-task-priority.handler
  ```

  Expected: FAIL — `result` is `undefined`, `expect(undefined).toEqual({ updatedAt: ... })` throws.

- [ ] **Step 3: Update the handler**

  Replace the entire content of `set-task-priority.handler.ts`:

  ```ts
  import { Inject } from '@nestjs/common'
  import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
  import { TaskUpdatedEvent } from '@future/event-contracts'
  import { Priority } from '../../../domain/value-objects/priority.vo'
  import {
    TASK_REPOSITORY,
    type ITaskRepository,
  } from '../../../domain/repositories/task.repository'
  import { PlanAuthorizationService } from '../../services/plan-authorization.service'
  import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
  import { SetTaskPriorityCommand } from './set-task-priority.command'

  @CommandHandler(SetTaskPriorityCommand)
  export class SetTaskPriorityHandler implements ICommandHandler<
    SetTaskPriorityCommand,
    { updatedAt: Date }
  > {
    constructor(
      @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
      private readonly authSvc: PlanAuthorizationService,
      private readonly eventBus: EventBus,
    ) {}

    async execute(command: SetTaskPriorityCommand): Promise<{ updatedAt: Date }> {
      const task = await this.taskRepo.findById(command.taskId, command.tenantId)
      if (!task) throw new TaskNotFoundException(command.taskId)

      await this.authSvc.assertCanEditPlan(command.actorId, command.planId, command.tenantId)

      task.setPriority(Priority.of(command.priority))

      await this.taskRepo.update(task, command.expectedVersion)

      await this.eventBus.publish(
        new TaskUpdatedEvent(
          command.tenantId,
          command.actorId,
          command.taskId,
          command.planId,
          ['priority'],
          'user',
        ),
      )

      return { updatedAt: task.updatedAt }
    }
  }
  ```

- [ ] **Step 4: Run the test to verify it passes**

  ```bash
  bun run --filter @future/api test:unit -- --reporter=verbose set-task-priority.handler
  ```

  Expected: PASS — all three tests green.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/api/src/modules/planner/application/commands/tasks/set-task-priority.handler.ts \
          apps/api/src/modules/planner/application/commands/tasks/set-task-priority.handler.spec.ts
  git commit -m "feat(planner): setPriority handler returns updatedAt"
  ```

---

### Task 2: `SetTaskDatesHandler` — return `{ updatedAt: Date }`

**Files:**

- Modify: `apps/api/src/modules/planner/application/commands/tasks/set-task-dates.handler.ts`
- Create: `apps/api/src/modules/planner/application/commands/tasks/set-task-dates.handler.spec.ts`

- [ ] **Step 1: Write the failing test**

  Create `set-task-dates.handler.spec.ts` — there is no existing spec for this handler:

  ```ts
  import { beforeEach, describe, expect, it, vi } from 'vitest'
  import { EventBus } from '@nestjs/cqrs'
  import { SetTaskDatesHandler } from './set-task-dates.handler'
  import { SetTaskDatesCommand } from './set-task-dates.command'
  import { Task } from '../../../domain/entities/task.entity'
  import { TaskUpdatedEvent } from '@future/event-contracts'
  import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
  import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
  import type { ITaskRepository } from '../../../domain/repositories/task.repository'
  import { PlanAuthorizationService } from '../../services/plan-authorization.service'

  const TENANT_ID = 'tenant-1'
  const PLAN_ID = 'plan-1'
  const BUCKET_ID = 'bucket-1'
  const TASK_ID = 'task-1'
  const ACTOR_ID = 'actor-1'

  function makeTask() {
    return Task.create({
      id: TASK_ID,
      tenantId: TENANT_ID,
      planId: PLAN_ID,
      bucketId: BUCKET_ID,
      title: 'Task',
      orderHint: ' !',
      createdBy: ACTOR_ID,
    })
  }

  describe('SetTaskDatesHandler', () => {
    let handler: SetTaskDatesHandler
    let taskRepo: { findById: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
    let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
    let eventBus: { publish: ReturnType<typeof vi.fn> }

    beforeEach(() => {
      const task = makeTask()
      taskRepo = {
        findById: vi.fn().mockResolvedValue(task),
        update: vi.fn().mockResolvedValue(undefined),
      }
      authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
      eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
      handler = new SetTaskDatesHandler(
        taskRepo as unknown as ITaskRepository,
        authSvc as unknown as PlanAuthorizationService,
        eventBus as unknown as EventBus,
      )
    })

    it('sets dates and returns updatedAt', async () => {
      const task = makeTask()
      taskRepo.findById.mockResolvedValue(task)
      const dueDate = new Date('2026-12-31')
      const command = new SetTaskDatesCommand(
        TENANT_ID,
        PLAN_ID,
        TASK_ID,
        ACTOR_ID,
        task.updatedAt.toISOString(),
        null,
        dueDate,
      )

      const result = await handler.execute(command)

      expect(authSvc.assertCanEditPlan).toHaveBeenCalledWith(ACTOR_ID, PLAN_ID, TENANT_ID)
      expect(taskRepo.update).toHaveBeenCalled()
      expect(eventBus.publish).toHaveBeenCalledWith(expect.any(TaskUpdatedEvent))
      expect(result).toEqual({ updatedAt: expect.any(Date) })
    })

    it('throws TaskNotFoundException when task not found', async () => {
      taskRepo.findById.mockResolvedValue(null)
      const command = new SetTaskDatesCommand(
        TENANT_ID,
        PLAN_ID,
        TASK_ID,
        ACTOR_ID,
        new Date().toISOString(),
        null,
        null,
      )
      await expect(handler.execute(command)).rejects.toThrow(TaskNotFoundException)
    })

    it('throws when auth fails', async () => {
      const task = makeTask()
      taskRepo.findById.mockResolvedValue(task)
      authSvc.assertCanEditPlan.mockRejectedValue(
        new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
      )
      const command = new SetTaskDatesCommand(
        TENANT_ID,
        PLAN_ID,
        TASK_ID,
        ACTOR_ID,
        task.updatedAt.toISOString(),
        null,
        null,
      )
      await expect(handler.execute(command)).rejects.toThrow(UnauthorizedPlanAccessException)
      expect(taskRepo.update).not.toHaveBeenCalled()
    })
  })
  ```

- [ ] **Step 2: Run the test to verify it fails**

  ```bash
  bun run --filter @future/api test:unit -- --reporter=verbose set-task-dates.handler
  ```

  Expected: FAIL — `result` is `undefined`.

- [ ] **Step 3: Update the handler**

  Replace the entire content of `set-task-dates.handler.ts`:

  ```ts
  import { Inject } from '@nestjs/common'
  import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
  import { TaskUpdatedEvent } from '@future/event-contracts'
  import {
    TASK_REPOSITORY,
    type ITaskRepository,
  } from '../../../domain/repositories/task.repository'
  import { PlanAuthorizationService } from '../../services/plan-authorization.service'
  import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
  import { SetTaskDatesCommand } from './set-task-dates.command'

  @CommandHandler(SetTaskDatesCommand)
  export class SetTaskDatesHandler implements ICommandHandler<
    SetTaskDatesCommand,
    { updatedAt: Date }
  > {
    constructor(
      @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
      private readonly authSvc: PlanAuthorizationService,
      private readonly eventBus: EventBus,
    ) {}

    async execute(command: SetTaskDatesCommand): Promise<{ updatedAt: Date }> {
      const task = await this.taskRepo.findById(command.taskId, command.tenantId)
      if (!task) throw new TaskNotFoundException(command.taskId)

      await this.authSvc.assertCanEditPlan(command.actorId, command.planId, command.tenantId)

      task.setDates(command.startDate, command.dueDate)

      await this.taskRepo.update(task, command.expectedVersion)

      await this.eventBus.publish(
        new TaskUpdatedEvent(
          command.tenantId,
          command.actorId,
          command.taskId,
          command.planId,
          ['startDate', 'dueDate'],
          'user',
        ),
      )

      return { updatedAt: task.updatedAt }
    }
  }
  ```

- [ ] **Step 4: Run the test to verify it passes**

  ```bash
  bun run --filter @future/api test:unit -- --reporter=verbose set-task-dates.handler
  ```

  Expected: PASS — all three tests green.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/api/src/modules/planner/application/commands/tasks/set-task-dates.handler.ts \
          apps/api/src/modules/planner/application/commands/tasks/set-task-dates.handler.spec.ts
  git commit -m "feat(planner): setDates handler returns updatedAt"
  ```

---

### Task 3: `ApplyLabelHandler` — return `{ updatedAt: Date }`

**Files:**

- Modify: `apps/api/src/modules/planner/application/commands/tasks/apply-label.handler.ts`
- Create: `apps/api/src/modules/planner/application/commands/tasks/apply-label.handler.spec.ts`

- [ ] **Step 1: Write the failing test**

  Create `apply-label.handler.spec.ts`:

  ```ts
  import { beforeEach, describe, expect, it, vi } from 'vitest'
  import { EventBus } from '@nestjs/cqrs'
  import { ApplyLabelHandler } from './apply-label.handler'
  import { ApplyLabelCommand } from './apply-label.command'
  import { Task } from '../../../domain/entities/task.entity'
  import { Plan } from '../../../domain/entities/plan.entity'
  import { TaskLabelAppliedEvent } from '@future/event-contracts'
  import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
  import { PlanNotFoundException } from '../../../domain/exceptions/plan-not-found.exception'
  import type { ITaskRepository } from '../../../domain/repositories/task.repository'
  import type { IPlanRepository } from '../../../domain/repositories/plan.repository'
  import { PlanAuthorizationService } from '../../services/plan-authorization.service'

  const TENANT_ID = 'tenant-1'
  const PLAN_ID = 'plan-1'
  const BUCKET_ID = 'bucket-1'
  const TASK_ID = 'task-1'
  const ACTOR_ID = 'actor-1'
  const SLOT = 'category1'

  function makeTask() {
    return Task.create({
      id: TASK_ID,
      tenantId: TENANT_ID,
      planId: PLAN_ID,
      bucketId: BUCKET_ID,
      title: 'Task',
      orderHint: ' !',
      createdBy: ACTOR_ID,
    })
  }

  function makePlan() {
    return Plan.create({
      id: PLAN_ID,
      tenantId: TENANT_ID,
      name: 'Plan',
      kind: 'team',
      createdBy: ACTOR_ID,
    })
  }

  describe('ApplyLabelHandler', () => {
    let handler: ApplyLabelHandler
    let taskRepo: { findById: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
    let planRepo: { findById: ReturnType<typeof vi.fn> }
    let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
    let eventBus: { publish: ReturnType<typeof vi.fn> }

    beforeEach(() => {
      const task = makeTask()
      const plan = makePlan()
      plan.defineLabel(SLOT, 'Label 1', '#ff0000')
      taskRepo = {
        findById: vi.fn().mockResolvedValue(task),
        update: vi.fn().mockResolvedValue(undefined),
      }
      planRepo = { findById: vi.fn().mockResolvedValue(plan) }
      authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
      eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
      handler = new ApplyLabelHandler(
        taskRepo as unknown as ITaskRepository,
        planRepo as unknown as IPlanRepository,
        authSvc as unknown as PlanAuthorizationService,
        eventBus as unknown as EventBus,
      )
    })

    it('applies label and returns updatedAt', async () => {
      const task = makeTask()
      taskRepo.findById.mockResolvedValue(task)
      const command = new ApplyLabelCommand(
        TENANT_ID,
        PLAN_ID,
        TASK_ID,
        ACTOR_ID,
        task.updatedAt.toISOString(),
        SLOT,
      )

      const result = await handler.execute(command)

      expect(taskRepo.update).toHaveBeenCalled()
      expect(eventBus.publish).toHaveBeenCalledWith(expect.any(TaskLabelAppliedEvent))
      expect(result).toEqual({ updatedAt: expect.any(Date) })
    })

    it('throws TaskNotFoundException when task not found', async () => {
      taskRepo.findById.mockResolvedValue(null)
      const command = new ApplyLabelCommand(
        TENANT_ID,
        PLAN_ID,
        TASK_ID,
        ACTOR_ID,
        new Date().toISOString(),
        SLOT,
      )
      await expect(handler.execute(command)).rejects.toThrow(TaskNotFoundException)
    })

    it('throws PlanNotFoundException when plan not found', async () => {
      planRepo.findById.mockResolvedValue(null)
      const task = makeTask()
      taskRepo.findById.mockResolvedValue(task)
      const command = new ApplyLabelCommand(
        TENANT_ID,
        PLAN_ID,
        TASK_ID,
        ACTOR_ID,
        task.updatedAt.toISOString(),
        SLOT,
      )
      await expect(handler.execute(command)).rejects.toThrow(PlanNotFoundException)
    })
  })
  ```

  > **Note:** `plan.defineLabel(slot, name, color)` is the domain method to register a label slot. If the method name differs in your codebase, check `Plan` entity for the correct method — the intent is to ensure `plan.labels.some((l) => l.slot.value === SLOT)` is true.

- [ ] **Step 2: Run the test to verify it fails**

  ```bash
  bun run --filter @future/api test:unit -- --reporter=verbose apply-label.handler
  ```

  Expected: FAIL — `result` is `undefined`.

- [ ] **Step 3: Update the handler**

  Replace the entire content of `apply-label.handler.ts`:

  ```ts
  import { Inject } from '@nestjs/common'
  import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
  import { TaskLabelAppliedEvent } from '@future/event-contracts'
  import { LabelSlot } from '../../../domain/value-objects/label-slot.vo'
  import {
    TASK_REPOSITORY,
    type ITaskRepository,
  } from '../../../domain/repositories/task.repository'
  import {
    PLAN_REPOSITORY,
    type IPlanRepository,
  } from '../../../domain/repositories/plan.repository'
  import { PlanAuthorizationService } from '../../services/plan-authorization.service'
  import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
  import { PlanNotFoundException } from '../../../domain/exceptions/plan-not-found.exception'
  import { LabelSlotNotDefinedException } from '../../../domain/exceptions/label-slot-not-defined.exception'
  import { ApplyLabelCommand } from './apply-label.command'

  @CommandHandler(ApplyLabelCommand)
  export class ApplyLabelHandler implements ICommandHandler<
    ApplyLabelCommand,
    { updatedAt: Date }
  > {
    constructor(
      @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
      @Inject(PLAN_REPOSITORY) private readonly planRepo: IPlanRepository,
      private readonly authSvc: PlanAuthorizationService,
      private readonly eventBus: EventBus,
    ) {}

    async execute(command: ApplyLabelCommand): Promise<{ updatedAt: Date }> {
      const task = await this.taskRepo.findById(command.taskId, command.tenantId)
      if (!task) throw new TaskNotFoundException(command.taskId)

      const plan = await this.planRepo.findById(command.planId, command.tenantId)
      if (!plan) throw new PlanNotFoundException(command.planId)

      await this.authSvc.assertCanEditPlan(command.actorId, command.planId, command.tenantId)

      const slotDefined = plan.labels.some((l) => l.slot.value === command.slot)
      if (!slotDefined) {
        throw new LabelSlotNotDefinedException(command.slot, command.planId)
      }

      const labelSlot = LabelSlot.of(command.slot)
      task.applyLabel(labelSlot)

      await this.taskRepo.update(task, command.expectedVersion)

      await this.eventBus.publish(
        new TaskLabelAppliedEvent(
          command.tenantId,
          command.actorId,
          command.taskId,
          command.planId,
          command.slot,
          ['appliedCategories'],
          'user',
        ),
      )

      return { updatedAt: task.updatedAt }
    }
  }
  ```

- [ ] **Step 4: Run the test to verify it passes**

  ```bash
  bun run --filter @future/api test:unit -- --reporter=verbose apply-label.handler
  ```

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/api/src/modules/planner/application/commands/tasks/apply-label.handler.ts \
          apps/api/src/modules/planner/application/commands/tasks/apply-label.handler.spec.ts
  git commit -m "feat(planner): applyLabel handler returns updatedAt"
  ```

---

### Task 4: `RemoveLabelHandler` — return `{ updatedAt: Date }`

**Files:**

- Modify: `apps/api/src/modules/planner/application/commands/tasks/remove-label.handler.ts`
- Create: `apps/api/src/modules/planner/application/commands/tasks/remove-label.handler.spec.ts`

- [ ] **Step 1: Write the failing test**

  Create `remove-label.handler.spec.ts`:

  ```ts
  import { beforeEach, describe, expect, it, vi } from 'vitest'
  import { EventBus } from '@nestjs/cqrs'
  import { RemoveLabelHandler } from './remove-label.handler'
  import { RemoveLabelCommand } from './remove-label.command'
  import { Task } from '../../../domain/entities/task.entity'
  import { Plan } from '../../../domain/entities/plan.entity'
  import { LabelSlot } from '../../../domain/value-objects/label-slot.vo'
  import { TaskLabelRemovedEvent } from '@future/event-contracts'
  import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
  import type { ITaskRepository } from '../../../domain/repositories/task.repository'
  import type { IPlanRepository } from '../../../domain/repositories/plan.repository'
  import { PlanAuthorizationService } from '../../services/plan-authorization.service'

  const TENANT_ID = 'tenant-1'
  const PLAN_ID = 'plan-1'
  const BUCKET_ID = 'bucket-1'
  const TASK_ID = 'task-1'
  const ACTOR_ID = 'actor-1'
  const SLOT = 'category1'

  function makeTask() {
    const t = Task.create({
      id: TASK_ID,
      tenantId: TENANT_ID,
      planId: PLAN_ID,
      bucketId: BUCKET_ID,
      title: 'Task',
      orderHint: ' !',
      createdBy: ACTOR_ID,
    })
    t.applyLabel(LabelSlot.of(SLOT))
    return t
  }

  function makePlan() {
    return Plan.create({
      id: PLAN_ID,
      tenantId: TENANT_ID,
      name: 'Plan',
      kind: 'team',
      createdBy: ACTOR_ID,
    })
  }

  describe('RemoveLabelHandler', () => {
    let handler: RemoveLabelHandler
    let taskRepo: { findById: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
    let planRepo: { findById: ReturnType<typeof vi.fn> }
    let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
    let eventBus: { publish: ReturnType<typeof vi.fn> }

    beforeEach(() => {
      taskRepo = {
        findById: vi.fn().mockResolvedValue(makeTask()),
        update: vi.fn().mockResolvedValue(undefined),
      }
      planRepo = { findById: vi.fn().mockResolvedValue(makePlan()) }
      authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
      eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
      handler = new RemoveLabelHandler(
        taskRepo as unknown as ITaskRepository,
        planRepo as unknown as IPlanRepository,
        authSvc as unknown as PlanAuthorizationService,
        eventBus as unknown as EventBus,
      )
    })

    it('removes label and returns updatedAt', async () => {
      const task = makeTask()
      taskRepo.findById.mockResolvedValue(task)
      const command = new RemoveLabelCommand(
        TENANT_ID,
        PLAN_ID,
        TASK_ID,
        ACTOR_ID,
        task.updatedAt.toISOString(),
        SLOT,
      )

      const result = await handler.execute(command)

      expect(taskRepo.update).toHaveBeenCalled()
      expect(eventBus.publish).toHaveBeenCalledWith(expect.any(TaskLabelRemovedEvent))
      expect(result).toEqual({ updatedAt: expect.any(Date) })
    })

    it('throws TaskNotFoundException when task not found', async () => {
      taskRepo.findById.mockResolvedValue(null)
      const command = new RemoveLabelCommand(
        TENANT_ID,
        PLAN_ID,
        TASK_ID,
        ACTOR_ID,
        new Date().toISOString(),
        SLOT,
      )
      await expect(handler.execute(command)).rejects.toThrow(TaskNotFoundException)
    })
  })
  ```

- [ ] **Step 2: Run the test to verify it fails**

  ```bash
  bun run --filter @future/api test:unit -- --reporter=verbose remove-label.handler
  ```

  Expected: FAIL — `result` is `undefined`.

- [ ] **Step 3: Update the handler**

  Replace the entire content of `remove-label.handler.ts`:

  ```ts
  import { Inject } from '@nestjs/common'
  import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
  import { TaskLabelRemovedEvent } from '@future/event-contracts'
  import { LabelSlot } from '../../../domain/value-objects/label-slot.vo'
  import {
    TASK_REPOSITORY,
    type ITaskRepository,
  } from '../../../domain/repositories/task.repository'
  import {
    PLAN_REPOSITORY,
    type IPlanRepository,
  } from '../../../domain/repositories/plan.repository'
  import { PlanAuthorizationService } from '../../services/plan-authorization.service'
  import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
  import { PlanNotFoundException } from '../../../domain/exceptions/plan-not-found.exception'
  import { RemoveLabelCommand } from './remove-label.command'

  @CommandHandler(RemoveLabelCommand)
  export class RemoveLabelHandler implements ICommandHandler<
    RemoveLabelCommand,
    { updatedAt: Date }
  > {
    constructor(
      @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
      @Inject(PLAN_REPOSITORY) private readonly planRepo: IPlanRepository,
      private readonly authSvc: PlanAuthorizationService,
      private readonly eventBus: EventBus,
    ) {}

    async execute(command: RemoveLabelCommand): Promise<{ updatedAt: Date }> {
      const task = await this.taskRepo.findById(command.taskId, command.tenantId)
      if (!task) throw new TaskNotFoundException(command.taskId)

      const plan = await this.planRepo.findById(command.planId, command.tenantId)
      if (!plan) throw new PlanNotFoundException(command.planId)

      await this.authSvc.assertCanEditPlan(command.actorId, command.planId, command.tenantId)

      const labelSlot = LabelSlot.of(command.slot)
      task.removeLabel(labelSlot)

      await this.taskRepo.update(task, command.expectedVersion)

      await this.eventBus.publish(
        new TaskLabelRemovedEvent(
          command.tenantId,
          command.actorId,
          command.taskId,
          command.planId,
          command.slot,
          ['appliedCategories'],
          'user',
        ),
      )

      return { updatedAt: task.updatedAt }
    }
  }
  ```

- [ ] **Step 4: Run the test to verify it passes**

  ```bash
  bun run --filter @future/api test:unit -- --reporter=verbose remove-label.handler
  ```

  Expected: PASS.

- [ ] **Step 5: Run the full API unit suite**

  ```bash
  bun run --filter @future/api test:unit
  ```

  Expected: All tests pass. No regressions.

- [ ] **Step 6: Commit**

  ```bash
  git add apps/api/src/modules/planner/application/commands/tasks/remove-label.handler.ts \
          apps/api/src/modules/planner/application/commands/tasks/remove-label.handler.spec.ts
  git commit -m "feat(planner): removeLabel handler returns updatedAt"
  ```
