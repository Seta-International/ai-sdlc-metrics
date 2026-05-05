# Phase 2 / Plan 4 — Subtasks and Sprint (Backend + Frontend)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement subtasks (parent–child task relationships) and sprint management end-to-end: backend commands, repositories, tRPC sub-routers, and the `SubtasksSection` + `SprintField` frontend components.

**Architecture:**

- Subtasks reuse the existing `plannerTask` table — a subtask is a task with `parentTaskId` set. The `CreateSubtask` command delegates to the existing task-creation flow and sets `parentTaskId`.
- `GetSubtasks` query returns all non-deleted tasks where `parentTaskId = taskId`, ordered by `orderHint`.
- Sprint: `plannerSprint` table (Plan 1). `CreateSprint`, `CompleteSprint`, `AssignTaskToSprint`, `UnassignTaskFromSprint` commands. Sprint field shown in the Details tab.
- Frontend: `SubtasksSection` in Details tab renders subtask list + inline-create form. `SprintField` + `SprintPicker` in Details tab.

**Tech Stack:** NestJS CQRS, Drizzle ORM, tRPC, `@future/ui`, React Query, vitest

**Prereq:** Phase 2 / Plan 1 merged (`plannerTask.parentTaskId` column and `plannerSprint` table exist).

---

## Exit Criteria

- [ ] `CreateSubtaskHandler` — unit tests pass (happy path + parent not found + max depth guard)
- [ ] `GetSubtasksHandler` — unit test verifies SQL filtering by `parentTaskId`
- [ ] Sprint command handlers (Create / Complete / AssignTask / UnassignTask) — unit tests pass
- [ ] `DrizzleSprintRepository` integration test against real DB
- [ ] `subtaskRouter` and `sprintRouter` tRPC procedures wired into `plannerRouter`
- [ ] `SubtasksSection` renders subtask list; inline-create form adds subtask on Enter
- [ ] `SprintField` + `SprintPicker` renders current sprint; picker lists sprints; mutation fires on select
- [ ] `bun run test --filter @future/web-planner --coverage` ≥70%
- [ ] TypeScript compiles without errors

---

## File Map

**Create:**

```
apps/api/src/modules/planner/application/commands/subtasks/
  create-subtask.command.ts
  create-subtask.handler.ts
  create-subtask.handler.spec.ts

apps/api/src/modules/planner/application/queries/subtasks/
  get-subtasks.query.ts
  get-subtasks.handler.ts
  get-subtasks.handler.spec.ts

apps/api/src/modules/planner/application/commands/sprints/
  create-sprint.command.ts
  create-sprint.handler.ts
  create-sprint.handler.spec.ts
  complete-sprint.command.ts
  complete-sprint.handler.ts
  complete-sprint.handler.spec.ts
  assign-task-to-sprint.command.ts
  assign-task-to-sprint.handler.ts
  assign-task-to-sprint.handler.spec.ts
  unassign-task-from-sprint.command.ts
  unassign-task-from-sprint.handler.ts
  unassign-task-from-sprint.handler.spec.ts

apps/api/src/modules/planner/domain/repositories/
  sprint.repository.ts

apps/api/src/modules/planner/infrastructure/repositories/
  drizzle-sprint.repository.ts
  drizzle-sprint.repository.integration.spec.ts

apps/api/src/modules/planner/interface/trpc/
  subtask.router.ts
  sprint.router.ts

apps/web-planner/src/components/task-detail/tabs/
  SubtasksSection.tsx
  SubtasksSection.spec.tsx
  SprintField.tsx
  SprintField.spec.tsx
  SprintPicker.tsx
  SprintPicker.spec.tsx
```

**Modify:**

```
apps/api/src/modules/planner/application/queries/tasks/get-task-detail.query.ts
apps/api/src/modules/planner/application/queries/tasks/get-task-detail.handler.ts
apps/api/src/modules/planner/interface/trpc/planner.router.ts
apps/api/src/modules/planner/planner.module.ts
apps/web-planner/src/components/task-detail/tabs/TaskDetailTab.tsx
```

---

## Task 1: CreateSubtask command handler

**Files:**

- Create: `apps/api/src/modules/planner/application/commands/subtasks/create-subtask.command.ts`
- Create: `apps/api/src/modules/planner/application/commands/subtasks/create-subtask.handler.ts`
- Create: `apps/api/src/modules/planner/application/commands/subtasks/create-subtask.handler.spec.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/src/modules/planner/application/commands/subtasks/create-subtask.handler.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { CreateSubtaskHandler } from './create-subtask.handler'
import { CreateSubtaskCommand } from './create-subtask.command'
import type { ITaskRepository } from '../../../domain/repositories/task.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { Task } from '../../../domain/entities/task.entity'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const ACTOR_ID = 'actor-1'
const PARENT_ID = 'parent-task'
const BUCKET_ID = 'bucket-1'

function makeTask(id: string, parentId?: string) {
  const t = Task.create({
    id,
    tenantId: TENANT_ID,
    planId: PLAN_ID,
    bucketId: BUCKET_ID,
    title: 'T',
    orderHint: ' !',
    createdBy: ACTOR_ID,
  })
  return t
}

describe('CreateSubtaskHandler', () => {
  let handler: CreateSubtaskHandler
  let taskRepo: { findById: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    taskRepo = {
      findById: vi.fn().mockResolvedValue(makeTask(PARENT_ID)),
      save: vi.fn().mockResolvedValue(undefined),
    }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new CreateSubtaskHandler(
      taskRepo as unknown as ITaskRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('creates subtask with parentTaskId set', async () => {
    const cmd = new CreateSubtaskCommand(
      TENANT_ID,
      PLAN_ID,
      BUCKET_ID,
      PARENT_ID,
      ACTOR_ID,
      'Sub-task title',
    )
    const result = await handler.execute(cmd)
    expect(result).toHaveProperty('id')
    const saved = taskRepo.save.mock.calls[0][0] as Task
    expect(saved.parentTaskId).toBe(PARENT_ID)
  })

  it('throws TaskNotFoundException when parent task not found', async () => {
    taskRepo.findById.mockResolvedValue(null)
    const cmd = new CreateSubtaskCommand(TENANT_ID, PLAN_ID, BUCKET_ID, PARENT_ID, ACTOR_ID, 'Sub')
    await expect(handler.execute(cmd)).rejects.toThrow(TaskNotFoundException)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run test --filter @future/api create-subtask.handler 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Extend Task entity to support parentTaskId**

In `apps/api/src/modules/planner/domain/entities/task.entity.ts`, add `parentTaskId: string | null = null` as a public property alongside existing properties. Ensure `Task.create` accepts `parentTaskId?: string` in its props and assigns it.

- [ ] **Step 4: Create command**

Create `apps/api/src/modules/planner/application/commands/subtasks/create-subtask.command.ts`:

```ts
export class CreateSubtaskCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly bucketId: string,
    public readonly parentTaskId: string,
    public readonly actorId: string,
    public readonly title: string,
  ) {}
}
```

- [ ] **Step 5: Create handler**

Create `apps/api/src/modules/planner/application/commands/subtasks/create-subtask.handler.ts`:

```ts
import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { uuidv7 } from 'uuidv7'
import { TaskCreatedEvent } from '@future/event-contracts'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { Task } from '../../../domain/entities/task.entity'
import { CreateSubtaskCommand } from './create-subtask.command'

@CommandHandler(CreateSubtaskCommand)
export class CreateSubtaskHandler implements ICommandHandler<CreateSubtaskCommand, { id: string }> {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(cmd: CreateSubtaskCommand): Promise<{ id: string }> {
    await this.authSvc.assertCanEditPlan(cmd.actorId, cmd.planId, cmd.tenantId)

    const parent = await this.taskRepo.findById(cmd.parentTaskId, cmd.tenantId)
    if (!parent) throw new TaskNotFoundException(cmd.parentTaskId)

    const id = uuidv7()
    const subtask = Task.create({
      id,
      tenantId: cmd.tenantId,
      planId: cmd.planId,
      bucketId: cmd.bucketId,
      title: cmd.title,
      orderHint: ' !',
      createdBy: cmd.actorId,
      parentTaskId: cmd.parentTaskId,
    })

    await this.taskRepo.save(subtask)

    await this.eventBus.publish(
      new TaskCreatedEvent(cmd.tenantId, cmd.actorId, id, cmd.planId, cmd.bucketId, cmd.title),
    )

    return { id }
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
bun run test --filter @future/api create-subtask.handler 2>&1 | tail -10
```

Expected: 2 tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/planner/application/commands/subtasks/ \
        apps/api/src/modules/planner/domain/entities/task.entity.ts
git commit -m "feat(planner): add CreateSubtask handler"
```

---

## Task 2: GetSubtasks query handler

**Files:**

- Create: `apps/api/src/modules/planner/application/queries/subtasks/get-subtasks.query.ts`
- Create: `apps/api/src/modules/planner/application/queries/subtasks/get-subtasks.handler.ts`
- Create: `apps/api/src/modules/planner/application/queries/subtasks/get-subtasks.handler.spec.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/src/modules/planner/application/queries/subtasks/get-subtasks.handler.spec.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { GetSubtasksHandler } from './get-subtasks.handler'
import { GetSubtasksQuery } from './get-subtasks.query'
import type { Db } from '@future/db'

describe('GetSubtasksHandler', () => {
  it('queries tasks by parentTaskId', async () => {
    const mockRows = [{ id: 'sub-1', title: 'Sub A', progress: 0, order_hint: ' !' }]
    const db = { execute: vi.fn().mockResolvedValue({ rows: mockRows }) } as unknown as Db
    const handler = new GetSubtasksHandler(db)

    const result = await handler.execute(new GetSubtasksQuery('parent-1', 'plan-1', 'tenant-1'))

    expect(db.execute).toHaveBeenCalledOnce()
    expect(result.subtasks).toHaveLength(1)
    expect(result.subtasks[0]?.id).toBe('sub-1')
  })

  it('returns empty array when no subtasks exist', async () => {
    const db = { execute: vi.fn().mockResolvedValue({ rows: [] }) } as unknown as Db
    const handler = new GetSubtasksHandler(db)
    const result = await handler.execute(new GetSubtasksQuery('parent-1', 'plan-1', 'tenant-1'))
    expect(result.subtasks).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run test --filter @future/api get-subtasks.handler 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Create query and handler**

Create `apps/api/src/modules/planner/application/queries/subtasks/get-subtasks.query.ts`:

```ts
export class GetSubtasksQuery {
  constructor(
    public readonly parentTaskId: string,
    public readonly planId: string,
    public readonly tenantId: string,
  ) {}
}

export interface SubtaskItem {
  id: string
  title: string
  progress: number
  orderHint: string
}

export interface GetSubtasksResult {
  subtasks: SubtaskItem[]
}
```

Create `apps/api/src/modules/planner/application/queries/subtasks/get-subtasks.handler.ts`:

```ts
import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { Db } from '@future/db'
import { sql } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../../common/db/db.module'
import { GetSubtasksQuery, type GetSubtasksResult } from './get-subtasks.query'

@QueryHandler(GetSubtasksQuery)
export class GetSubtasksHandler implements IQueryHandler<GetSubtasksQuery, GetSubtasksResult> {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async execute(query: GetSubtasksQuery): Promise<GetSubtasksResult> {
    const result = await this.db.execute<{
      id: string
      title: string
      progress: number
      order_hint: string
    }>(
      sql`SELECT id, title, progress, order_hint
          FROM planner.task
          WHERE parent_task_id = ${query.parentTaskId}
            AND plan_id = ${query.planId}
            AND tenant_id = ${query.tenantId}
            AND deleted_at IS NULL
          ORDER BY order_hint`,
    )

    return {
      subtasks: result.rows.map((r) => ({
        id: r.id,
        title: r.title,
        progress: r.progress,
        orderHint: r.order_hint,
      })),
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun run test --filter @future/api get-subtasks.handler 2>&1 | tail -10
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/planner/application/queries/subtasks/
git commit -m "feat(planner): add GetSubtasks query handler"
```

---

## Task 3: Sprint command handlers

**Files:**

- Create: `apps/api/src/modules/planner/domain/repositories/sprint.repository.ts`
- Create all sprint command files (create/complete/assign/unassign)

- [ ] **Step 1: Create ISprintRepository interface**

Create `apps/api/src/modules/planner/domain/repositories/sprint.repository.ts`:

```ts
export const SPRINT_REPOSITORY = Symbol('ISprintRepository')

export interface SprintRecord {
  id: string
  tenantId: string
  planId: string
  name: string
  startDate: Date
  endDate: Date
  completedAt: Date | null
}

export interface ISprintRepository {
  save(record: SprintRecord): Promise<void>
  findById(id: string, tenantId: string): Promise<SprintRecord | null>
  listByPlan(planId: string, tenantId: string): Promise<SprintRecord[]>
  complete(id: string, tenantId: string, completedAt: Date): Promise<void>
}
```

- [ ] **Step 2: Write failing tests for all sprint handlers**

Create `apps/api/src/modules/planner/application/commands/sprints/create-sprint.handler.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { CreateSprintHandler } from './create-sprint.handler'
import { CreateSprintCommand } from './create-sprint.command'
import type { ISprintRepository } from '../../../domain/repositories/sprint.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const ACTOR_ID = 'actor-1'

describe('CreateSprintHandler', () => {
  let handler: CreateSprintHandler
  let repo: { save: ReturnType<typeof vi.fn> }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    repo = { save: vi.fn().mockResolvedValue(undefined) }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new CreateSprintHandler(
      repo as unknown as ISprintRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('creates sprint and returns id', async () => {
    const start = new Date('2026-06-01')
    const end = new Date('2026-06-14')
    const cmd = new CreateSprintCommand(TENANT_ID, PLAN_ID, ACTOR_ID, 'Sprint 1', start, end)
    const result = await handler.execute(cmd)
    expect(repo.save).toHaveBeenCalledOnce()
    expect(result).toHaveProperty('id')
  })

  it('throws when auth fails', async () => {
    authSvc.assertCanEditPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )
    const cmd = new CreateSprintCommand(
      TENANT_ID,
      PLAN_ID,
      ACTOR_ID,
      'Sprint',
      new Date(),
      new Date(),
    )
    await expect(handler.execute(cmd)).rejects.toThrow(UnauthorizedPlanAccessException)
  })
})
```

Create `apps/api/src/modules/planner/application/commands/sprints/assign-task-to-sprint.handler.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { AssignTaskToSprintHandler } from './assign-task-to-sprint.handler'
import { AssignTaskToSprintCommand } from './assign-task-to-sprint.command'
import type { ISprintRepository } from '../../../domain/repositories/sprint.repository'
import type { ITaskRepository } from '../../../domain/repositories/task.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { Task } from '../../../domain/entities/task.entity'
import { TaskSprintAssignedEvent } from '@future/event-contracts'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const ACTOR_ID = 'actor-1'
const TASK_ID = 'task-1'
const SPRINT_ID = 'sprint-1'

function makeSprint() {
  return {
    id: SPRINT_ID,
    tenantId: TENANT_ID,
    planId: PLAN_ID,
    name: 'S1',
    startDate: new Date(),
    endDate: new Date(),
    completedAt: null,
  }
}
function makeTask() {
  return Task.create({
    id: TASK_ID,
    tenantId: TENANT_ID,
    planId: PLAN_ID,
    bucketId: 'b-1',
    title: 'T',
    orderHint: ' !',
    createdBy: ACTOR_ID,
  })
}

describe('AssignTaskToSprintHandler', () => {
  let handler: AssignTaskToSprintHandler
  let sprintRepo: { findById: ReturnType<typeof vi.fn> }
  let taskRepo: { findById: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    sprintRepo = { findById: vi.fn().mockResolvedValue(makeSprint()) }
    taskRepo = {
      findById: vi.fn().mockResolvedValue(makeTask()),
      update: vi.fn().mockResolvedValue(undefined),
    }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new AssignTaskToSprintHandler(
      sprintRepo as unknown as ISprintRepository,
      taskRepo as unknown as ITaskRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('assigns task to sprint and emits event', async () => {
    const cmd = new AssignTaskToSprintCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      SPRINT_ID,
      ACTOR_ID,
      new Date().toISOString(),
    )
    await handler.execute(cmd)
    const updated = taskRepo.update.mock.calls[0][0] as Task
    expect(updated.sprintId).toBe(SPRINT_ID)
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(TaskSprintAssignedEvent))
  })

  it('throws when task not found', async () => {
    taskRepo.findById.mockResolvedValue(null)
    const cmd = new AssignTaskToSprintCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      SPRINT_ID,
      ACTOR_ID,
      new Date().toISOString(),
    )
    await expect(handler.execute(cmd)).rejects.toThrow(TaskNotFoundException)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
bun run test --filter @future/api "create-sprint.handler|assign-task-to-sprint.handler" 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 4: Extend Task entity with sprintId**

In `apps/api/src/modules/planner/domain/entities/task.entity.ts`, add `sprintId: string | null = null` as a public property. Ensure `task.setSprintId(id: string | null)` mutates it.

- [ ] **Step 5: Create all sprint commands**

Create `apps/api/src/modules/planner/application/commands/sprints/create-sprint.command.ts`:

```ts
export class CreateSprintCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly actorId: string,
    public readonly name: string,
    public readonly startDate: Date,
    public readonly endDate: Date,
  ) {}
}
```

Create `apps/api/src/modules/planner/application/commands/sprints/complete-sprint.command.ts`:

```ts
export class CompleteSprintCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly sprintId: string,
    public readonly actorId: string,
  ) {}
}
```

Create `apps/api/src/modules/planner/application/commands/sprints/assign-task-to-sprint.command.ts`:

```ts
export class AssignTaskToSprintCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly taskId: string,
    public readonly sprintId: string,
    public readonly actorId: string,
    public readonly expectedVersion: string,
  ) {}
}
```

Create `apps/api/src/modules/planner/application/commands/sprints/unassign-task-from-sprint.command.ts`:

```ts
export class UnassignTaskFromSprintCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly taskId: string,
    public readonly actorId: string,
    public readonly expectedVersion: string,
  ) {}
}
```

- [ ] **Step 6: Create sprint handlers**

Create `apps/api/src/modules/planner/application/commands/sprints/create-sprint.handler.ts`:

```ts
import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { uuidv7 } from 'uuidv7'
import {
  SPRINT_REPOSITORY,
  type ISprintRepository,
} from '../../../domain/repositories/sprint.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { CreateSprintCommand } from './create-sprint.command'

@CommandHandler(CreateSprintCommand)
export class CreateSprintHandler implements ICommandHandler<CreateSprintCommand, { id: string }> {
  constructor(
    @Inject(SPRINT_REPOSITORY) private readonly repo: ISprintRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(cmd: CreateSprintCommand): Promise<{ id: string }> {
    await this.authSvc.assertCanEditPlan(cmd.actorId, cmd.planId, cmd.tenantId)
    const id = uuidv7()
    await this.repo.save({
      id,
      tenantId: cmd.tenantId,
      planId: cmd.planId,
      name: cmd.name,
      startDate: cmd.startDate,
      endDate: cmd.endDate,
      completedAt: null,
    })
    return { id }
  }
}
```

Create `apps/api/src/modules/planner/application/commands/sprints/complete-sprint.handler.ts`:

```ts
import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import {
  SPRINT_REPOSITORY,
  type ISprintRepository,
} from '../../../domain/repositories/sprint.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { CompleteSprintCommand } from './complete-sprint.command'

@CommandHandler(CompleteSprintCommand)
export class CompleteSprintHandler implements ICommandHandler<CompleteSprintCommand> {
  constructor(
    @Inject(SPRINT_REPOSITORY) private readonly repo: ISprintRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(cmd: CompleteSprintCommand): Promise<void> {
    await this.authSvc.assertCanEditPlan(cmd.actorId, cmd.planId, cmd.tenantId)
    await this.repo.complete(cmd.sprintId, cmd.tenantId, new Date())
  }
}
```

Create `apps/api/src/modules/planner/application/commands/sprints/assign-task-to-sprint.handler.ts`:

```ts
import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { TaskSprintAssignedEvent } from '@future/event-contracts'
import {
  SPRINT_REPOSITORY,
  type ISprintRepository,
} from '../../../domain/repositories/sprint.repository'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { AssignTaskToSprintCommand } from './assign-task-to-sprint.command'

@CommandHandler(AssignTaskToSprintCommand)
export class AssignTaskToSprintHandler implements ICommandHandler<AssignTaskToSprintCommand> {
  constructor(
    @Inject(SPRINT_REPOSITORY) private readonly sprintRepo: ISprintRepository,
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(cmd: AssignTaskToSprintCommand): Promise<void> {
    await this.authSvc.assertCanEditPlan(cmd.actorId, cmd.planId, cmd.tenantId)

    const task = await this.taskRepo.findById(cmd.taskId, cmd.tenantId)
    if (!task) throw new TaskNotFoundException(cmd.taskId)

    task.setSprintId(cmd.sprintId)
    await this.taskRepo.update(task, cmd.expectedVersion)

    await this.eventBus.publish(
      new TaskSprintAssignedEvent(cmd.tenantId, cmd.actorId, cmd.taskId, cmd.planId, cmd.sprintId),
    )
  }
}
```

Create `apps/api/src/modules/planner/application/commands/sprints/unassign-task-from-sprint.handler.ts`:

```ts
import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { UnassignTaskFromSprintCommand } from './unassign-task-from-sprint.command'

@CommandHandler(UnassignTaskFromSprintCommand)
export class UnassignTaskFromSprintHandler implements ICommandHandler<UnassignTaskFromSprintCommand> {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(cmd: UnassignTaskFromSprintCommand): Promise<void> {
    await this.authSvc.assertCanEditPlan(cmd.actorId, cmd.planId, cmd.tenantId)

    const task = await this.taskRepo.findById(cmd.taskId, cmd.tenantId)
    if (!task) throw new TaskNotFoundException(cmd.taskId)

    task.setSprintId(null)
    await this.taskRepo.update(task, cmd.expectedVersion)
  }
}
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
bun run test --filter @future/api "create-sprint.handler|assign-task-to-sprint.handler" 2>&1 | tail -10
```

Expected: 4 tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/planner/application/commands/sprints/ \
        apps/api/src/modules/planner/application/queries/subtasks/ \
        apps/api/src/modules/planner/domain/repositories/sprint.repository.ts
git commit -m "feat(planner): add sprint commands and GetSubtasks query"
```

---

## Task 4: DrizzleSprintRepository and tRPC routers

**Files:**

- Create: `apps/api/src/modules/planner/infrastructure/repositories/drizzle-sprint.repository.ts`
- Create: `apps/api/src/modules/planner/infrastructure/repositories/drizzle-sprint.repository.integration.spec.ts`
- Create: `apps/api/src/modules/planner/interface/trpc/subtask.router.ts`
- Create: `apps/api/src/modules/planner/interface/trpc/sprint.router.ts`

- [ ] **Step 1: Write failing integration test**

Create `apps/api/src/modules/planner/infrastructure/repositories/drizzle-sprint.repository.integration.spec.ts`:

```ts
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { DrizzleSprintRepository } from './drizzle-sprint.repository'
import { createTestDb } from '../../../../../test/helpers/db-helper'

describe('DrizzleSprintRepository (integration)', () => {
  let repo: DrizzleSprintRepository
  let db: Awaited<ReturnType<typeof createTestDb>>

  const TENANT_ID = 'tenant-sprint-test'
  const PLAN_ID = 'plan-sprint-test'

  beforeAll(async () => {
    db = await createTestDb()
    repo = new DrizzleSprintRepository(db)
  })

  afterEach(async () => {
    await db.execute(`DELETE FROM planner.sprint WHERE tenant_id = '${TENANT_ID}'`)
  })

  it('saves and retrieves sprint', async () => {
    const start = new Date('2026-06-01')
    const end = new Date('2026-06-14')
    await repo.save({
      id: 'sprint-1',
      tenantId: TENANT_ID,
      planId: PLAN_ID,
      name: 'Sprint 1',
      startDate: start,
      endDate: end,
      completedAt: null,
    })
    const found = await repo.findById('sprint-1', TENANT_ID)
    expect(found?.name).toBe('Sprint 1')
    expect(found?.completedAt).toBeNull()
  })

  it('listByPlan returns all sprints for plan', async () => {
    await repo.save({
      id: 'sprint-a',
      tenantId: TENANT_ID,
      planId: PLAN_ID,
      name: 'A',
      startDate: new Date('2026-06-01'),
      endDate: new Date('2026-06-07'),
      completedAt: null,
    })
    await repo.save({
      id: 'sprint-b',
      tenantId: TENANT_ID,
      planId: PLAN_ID,
      name: 'B',
      startDate: new Date('2026-06-08'),
      endDate: new Date('2026-06-14'),
      completedAt: null,
    })
    const sprints = await repo.listByPlan(PLAN_ID, TENANT_ID)
    expect(sprints).toHaveLength(2)
  })

  it('complete sets completedAt', async () => {
    await repo.save({
      id: 'sprint-done',
      tenantId: TENANT_ID,
      planId: PLAN_ID,
      name: 'Done',
      startDate: new Date(),
      endDate: new Date(),
      completedAt: null,
    })
    const completedAt = new Date()
    await repo.complete('sprint-done', TENANT_ID, completedAt)
    const found = await repo.findById('sprint-done', TENANT_ID)
    expect(found?.completedAt).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run test --filter @future/api drizzle-sprint 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Implement DrizzleSprintRepository**

Create `apps/api/src/modules/planner/infrastructure/repositories/drizzle-sprint.repository.ts`:

```ts
import { Inject } from '@nestjs/common'
import type { Db } from '@future/db'
import { eq, and } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { plannerSprint } from '../schema/planner.schema'
import type { ISprintRepository, SprintRecord } from '../../domain/repositories/sprint.repository'

export class DrizzleSprintRepository implements ISprintRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async save(record: SprintRecord): Promise<void> {
    await this.db.insert(plannerSprint).values({
      id: record.id,
      tenantId: record.tenantId,
      planId: record.planId,
      name: record.name,
      startDate: record.startDate,
      endDate: record.endDate,
      completedAt: record.completedAt,
    })
  }

  async findById(id: string, tenantId: string): Promise<SprintRecord | null> {
    const rows = await this.db
      .select()
      .from(plannerSprint)
      .where(and(eq(plannerSprint.id, id), eq(plannerSprint.tenantId, tenantId)))
    if (!rows[0]) return null
    return {
      id: rows[0].id,
      tenantId: rows[0].tenantId,
      planId: rows[0].planId,
      name: rows[0].name,
      startDate: rows[0].startDate,
      endDate: rows[0].endDate,
      completedAt: rows[0].completedAt,
    }
  }

  async listByPlan(planId: string, tenantId: string): Promise<SprintRecord[]> {
    const rows = await this.db
      .select()
      .from(plannerSprint)
      .where(and(eq(plannerSprint.planId, planId), eq(plannerSprint.tenantId, tenantId)))
      .orderBy(plannerSprint.startDate)
    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      planId: r.planId,
      name: r.name,
      startDate: r.startDate,
      endDate: r.endDate,
      completedAt: r.completedAt,
    }))
  }

  async complete(id: string, tenantId: string, completedAt: Date): Promise<void> {
    await this.db
      .update(plannerSprint)
      .set({ completedAt })
      .where(and(eq(plannerSprint.id, id), eq(plannerSprint.tenantId, tenantId)))
  }
}
```

- [ ] **Step 4: Run integration test**

```bash
bun run test --filter @future/api drizzle-sprint 2>&1 | tail -15
```

Expected: 3 tests pass.

- [ ] **Step 5: Create subtask tRPC router**

Create `apps/api/src/modules/planner/interface/trpc/subtask.router.ts`:

```ts
import * as z from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { PlannerRouterService } from './planner-router.service'
import { CreateSubtaskCommand } from '../../application/commands/subtasks/create-subtask.command'
import { GetSubtasksQuery } from '../../application/queries/subtasks/get-subtasks.query'
import { toPlannerTrpcError } from './planner-trpc-error'

function svc() {
  return PlannerRouterService.getInstance()
}

export const subtaskRouter = router({
  list: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        parentTaskId: z.string().uuid(),
      }),
    )
    .query(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .query(new GetSubtasksQuery(input.parentTaskId, input.planId, input.tenantId))
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  create: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        bucketId: z.string().uuid(),
        parentTaskId: z.string().uuid(),
        actorId: z.string().uuid(),
        title: z.string().min(1).max(255),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new CreateSubtaskCommand(
            input.tenantId,
            input.planId,
            input.bucketId,
            input.parentTaskId,
            input.actorId,
            input.title,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),
})
```

- [ ] **Step 6: Create sprint tRPC router**

Create `apps/api/src/modules/planner/interface/trpc/sprint.router.ts`:

```ts
import * as z from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { PlannerRouterService } from './planner-router.service'
import { CreateSprintCommand } from '../../application/commands/sprints/create-sprint.command'
import { CompleteSprintCommand } from '../../application/commands/sprints/complete-sprint.command'
import { AssignTaskToSprintCommand } from '../../application/commands/sprints/assign-task-to-sprint.command'
import { UnassignTaskFromSprintCommand } from '../../application/commands/sprints/unassign-task-from-sprint.command'
import { toPlannerTrpcError } from './planner-trpc-error'

function svc() {
  return PlannerRouterService.getInstance()
}

export const sprintRouter = router({
  create: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        actorId: z.string().uuid(),
        name: z.string().min(1).max(100),
        startDate: z.string().datetime(),
        endDate: z.string().datetime(),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new CreateSprintCommand(
            input.tenantId,
            input.planId,
            input.actorId,
            input.name,
            new Date(input.startDate),
            new Date(input.endDate),
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  complete: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        sprintId: z.string().uuid(),
        actorId: z.string().uuid(),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new CompleteSprintCommand(input.tenantId, input.planId, input.sprintId, input.actorId),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  assignTask: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        taskId: z.string().uuid(),
        sprintId: z.string().uuid(),
        actorId: z.string().uuid(),
        expectedVersion: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new AssignTaskToSprintCommand(
            input.tenantId,
            input.planId,
            input.taskId,
            input.sprintId,
            input.actorId,
            input.expectedVersion,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  unassignTask: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        taskId: z.string().uuid(),
        actorId: z.string().uuid(),
        expectedVersion: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new UnassignTaskFromSprintCommand(
            input.tenantId,
            input.planId,
            input.taskId,
            input.actorId,
            input.expectedVersion,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),
})
```

- [ ] **Step 7: Wire routers and register module providers**

In `apps/api/src/modules/planner/interface/trpc/planner.router.ts`:

```ts
import { subtaskRouter } from './subtask.router'
import { sprintRouter } from './sprint.router'

// In plannerRouter:
  subtasks: subtaskRouter,
  sprints: sprintRouter,
```

In `apps/api/src/modules/planner/planner.module.ts`, add:

```ts
{ provide: SPRINT_REPOSITORY, useClass: DrizzleSprintRepository },
CreateSprintHandler,
CompleteSprintHandler,
AssignTaskToSprintHandler,
UnassignTaskFromSprintHandler,
CreateSubtaskHandler,
GetSubtasksHandler,
```

- [ ] **Step 8: Type-check and commit**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | head -20
git add apps/api/src/modules/planner/
git commit -m "feat(planner): wire sprint and subtask routers into plannerRouter"
```

---

## Task 5: SubtasksSection and SprintField frontend components

**Files:**

- Create: `apps/web-planner/src/components/task-detail/tabs/SubtasksSection.tsx`
- Create: `apps/web-planner/src/components/task-detail/tabs/SubtasksSection.spec.tsx`
- Create: `apps/web-planner/src/components/task-detail/tabs/SprintField.tsx`
- Create: `apps/web-planner/src/components/task-detail/tabs/SprintPicker.tsx`
- Create: `apps/web-planner/src/components/task-detail/tabs/SprintPicker.spec.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/web-planner/src/components/task-detail/tabs/SubtasksSection.spec.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SubtasksSection } from './SubtasksSection'

const mockCreate = vi.fn()
vi.mock('@/lib/trpc', () => ({
  trpc: {
    planner: {
      subtasks: {
        list: {
          useQuery: () => ({
            data: { subtasks: [{ id: 'sub-1', title: 'Child Task', progress: 0 }] },
            isLoading: false,
          }),
        },
        create: { useMutation: () => ({ mutate: mockCreate, isPending: false }) },
      },
    },
  },
}))

describe('SubtasksSection', () => {
  const props = { taskId: 't1', planId: 'p1', tenantId: 'tn1', actorId: 'a1', bucketId: 'b1' }

  it('renders existing subtasks', () => {
    render(<SubtasksSection {...props} />)
    expect(screen.getByText('Child Task')).toBeInTheDocument()
  })

  it('creates subtask on Enter in the input', async () => {
    render(<SubtasksSection {...props} />)
    const input = screen.getByTestId('subtask-create-input')
    fireEvent.change(input, { target: { value: 'New sub' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'New sub', parentTaskId: 't1' }),
      )
    })
  })
})
```

Create `apps/web-planner/src/components/task-detail/tabs/SprintPicker.spec.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SprintPicker } from './SprintPicker'

const sprints = [
  { id: 'sp-1', name: 'Sprint 1', startDate: '2026-06-01', endDate: '2026-06-14' },
  { id: 'sp-2', name: 'Sprint 2', startDate: '2026-06-15', endDate: '2026-06-28' },
]

describe('SprintPicker', () => {
  it('renders all sprints as options', () => {
    render(
      <SprintPicker
        sprints={sprints}
        currentSprintId={null}
        onSelect={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    expect(screen.getByText('Sprint 1')).toBeInTheDocument()
    expect(screen.getByText('Sprint 2')).toBeInTheDocument()
  })

  it('calls onSelect with sprint id on click', () => {
    const onSelect = vi.fn()
    render(
      <SprintPicker
        sprints={sprints}
        currentSprintId={null}
        onSelect={onSelect}
        onClear={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('Sprint 1'))
    expect(onSelect).toHaveBeenCalledWith('sp-1')
  })

  it('shows Clear button when sprint is assigned', () => {
    render(
      <SprintPicker
        sprints={sprints}
        currentSprintId="sp-1"
        onSelect={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    expect(screen.getByTestId('sprint-clear-btn')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun run test --filter @future/web-planner "SubtasksSection|SprintPicker" 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Implement SubtasksSection**

Create `apps/web-planner/src/components/task-detail/tabs/SubtasksSection.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Input, Spinner } from '@future/ui'
import { trpc } from '@/lib/trpc'

interface Props {
  taskId: string
  planId: string
  tenantId: string
  actorId: string
  bucketId: string
}

export function SubtasksSection({ taskId, planId, tenantId, actorId, bucketId }: Props) {
  const [newTitle, setNewTitle] = useState('')

  const { data, isLoading } = trpc.planner.subtasks.list.useQuery({
    tenantId,
    planId,
    parentTaskId: taskId,
  })
  const { mutate: createSubtask, isPending } = trpc.planner.subtasks.create.useMutation()

  const subtasks = data?.subtasks ?? []

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && newTitle.trim()) {
      createSubtask({
        tenantId,
        planId,
        bucketId,
        parentTaskId: taskId,
        actorId,
        title: newTitle.trim(),
      })
      setNewTitle('')
    }
  }

  return (
    <section aria-label="Subtasks" className="flex flex-col gap-2 px-4 py-3">
      <p className="text-xs font-500 uppercase tracking-wide text-fg-muted">Subtasks</p>

      {isLoading && <Spinner className="size-4" />}

      {subtasks.map((sub) => (
        <div key={sub.id} className="flex items-center gap-2 text-sm">
          <span
            className={`h-3 w-3 rounded-full border ${sub.progress === 100 ? 'border-green-500 bg-green-500' : 'border-fg-muted'}`}
            aria-label={sub.progress === 100 ? 'Complete' : 'Incomplete'}
          />
          <span className={sub.progress === 100 ? 'line-through text-fg-muted' : ''}>
            {sub.title}
          </span>
        </div>
      ))}

      <Input
        data-testid="subtask-create-input"
        placeholder="Add a subtask… (Enter to create)"
        value={newTitle}
        onChange={(e) => setNewTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        className="h-8"
        disabled={isPending}
      />
    </section>
  )
}
```

- [ ] **Step 4: Implement SprintPicker**

Create `apps/web-planner/src/components/task-detail/tabs/SprintPicker.tsx`:

```tsx
'use client'

import { Button } from '@future/ui'
import { X } from 'lucide-react'

interface Sprint {
  id: string
  name: string
  startDate: string
  endDate: string
}

interface Props {
  sprints: Sprint[]
  currentSprintId: string | null
  onSelect: (sprintId: string) => void
  onClear: () => void
}

export function SprintPicker({ sprints, currentSprintId, onSelect, onClear }: Props) {
  return (
    <div className="flex flex-col gap-1">
      {currentSprintId && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          data-testid="sprint-clear-btn"
          className="self-end text-xs text-fg-muted"
        >
          <X className="mr-1 size-3" /> Clear
        </Button>
      )}
      {sprints.length === 0 && (
        <p className="text-sm text-fg-muted">No sprints defined for this plan.</p>
      )}
      {sprints.map((sp) => (
        <button
          key={sp.id}
          type="button"
          className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-surface-hover ${
            currentSprintId === sp.id ? 'bg-primary/10 font-500' : ''
          }`}
          data-testid={`sprint-option-${sp.id}`}
          onClick={() => onSelect(sp.id)}
        >
          <span>{sp.name}</span>
          <span className="text-xs text-fg-muted">
            {new Date(sp.startDate).toLocaleDateString()} –{' '}
            {new Date(sp.endDate).toLocaleDateString()}
          </span>
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Implement SprintField**

Create `apps/web-planner/src/components/task-detail/tabs/SprintField.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Button, Popover, PopoverTrigger, PopoverContent } from '@future/ui'
import { ChevronDown } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { SprintPicker } from './SprintPicker'

interface Props {
  taskId: string
  planId: string
  tenantId: string
  actorId: string
  currentSprintId: string | null
  currentSprintName: string | null
  expectedVersion: string
}

export function SprintField({
  taskId,
  planId,
  tenantId,
  actorId,
  currentSprintId,
  currentSprintName,
  expectedVersion,
}: Props) {
  const [open, setOpen] = useState(false)

  const { data: sprintsData } = trpc.planner.sprints.list
    ? trpc.planner.sprints.list.useQuery({ tenantId, planId })
    : { data: undefined }
  const { mutate: assignSprint } = trpc.planner.sprints.assignTask.useMutation({
    onSuccess: () => setOpen(false),
  })
  const { mutate: unassignSprint } = trpc.planner.sprints.unassignTask.useMutation({
    onSuccess: () => setOpen(false),
  })

  const sprints = (sprintsData as any)?.sprints ?? []

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-between"
          data-testid="sprint-field"
          aria-label="Sprint"
        >
          <span>{currentSprintName ?? 'No sprint'}</span>
          <ChevronDown className="ml-1 size-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2">
        <SprintPicker
          sprints={sprints}
          currentSprintId={currentSprintId}
          onSelect={(sprintId) =>
            assignSprint({ tenantId, planId, taskId, sprintId, actorId, expectedVersion })
          }
          onClear={() => unassignSprint({ tenantId, planId, taskId, actorId, expectedVersion })}
        />
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 6: Run tests**

```bash
bun run test --filter @future/web-planner "SubtasksSection|SprintPicker" 2>&1 | tail -15
```

Expected: All pass.

- [ ] **Step 7: Add to TaskDetailTab**

In `apps/web-planner/src/components/task-detail/tabs/TaskDetailTab.tsx`, add:

```tsx
import { SubtasksSection } from './SubtasksSection'
import { SprintField } from './SprintField'

// Inside the Details tab body, below the Assignees field:
<SprintField
  taskId={taskId}
  planId={planId}
  tenantId={task.tenantId}
  actorId={actorId}
  currentSprintId={task.sprintId ?? null}
  currentSprintName={task.sprintName ?? null}
  expectedVersion={task.updatedAt.toISOString()}
/>

// Below the Description section:
<SubtasksSection
  taskId={taskId}
  planId={planId}
  tenantId={task.tenantId}
  actorId={actorId}
  bucketId={task.bucketId}
/>
```

- [ ] **Step 8: Run full test suite with coverage check**

```bash
bun run test --filter @future/web-planner --coverage 2>&1 | tail -20
```

Expected: Lines/Functions/Branches ≥70%.

- [ ] **Step 9: Commit**

```bash
git add apps/web-planner/src/components/task-detail/tabs/SubtasksSection.tsx \
        apps/web-planner/src/components/task-detail/tabs/SubtasksSection.spec.tsx \
        apps/web-planner/src/components/task-detail/tabs/SprintField.tsx \
        apps/web-planner/src/components/task-detail/tabs/SprintPicker.tsx \
        apps/web-planner/src/components/task-detail/tabs/SprintPicker.spec.tsx
git commit -m "feat(web-planner): add SubtasksSection and SprintField components"
```
