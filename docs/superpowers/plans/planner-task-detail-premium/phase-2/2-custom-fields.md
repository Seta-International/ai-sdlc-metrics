# Phase 2 / Plan 2 — Custom Fields (Backend + Frontend)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full custom-fields feature end-to-end: four command handlers (define/update/delete field def, set field value), a Drizzle repository, a tRPC sub-router, and the `CustomFieldsSection` frontend component that renders in the Details tab.

**Architecture:**

- Four commands operate on `plannerCustomFieldDef` and `plannerTaskCustomFieldValue` tables (defined in Plan 1).
- `GetTaskDetailHandler` is extended to JOIN custom field values into `TaskDetailSnapshot`.
- The frontend `CustomFieldsSection` receives the enriched snapshot and renders per-kind inputs.
- Maximum 10 custom field definitions per plan (enforced in the define command handler).

**Tech Stack:** NestJS CQRS, Drizzle ORM, tRPC, `@future/ui`, React Query, vitest

**Prereq:** Phase 2 / Plan 1 merged (tables and repository interfaces exist).

---

## Exit Criteria

- [ ] `DefineCustomFieldHandler` — unit tests pass (happy path + duplicate name + max-10 limit)
- [ ] `UpdateCustomFieldDefHandler` — unit tests pass (happy path + not-found + name conflict)
- [ ] `DeleteCustomFieldDefHandler` — unit tests pass (happy path + not-found)
- [ ] `SetCustomFieldValueHandler` — unit tests pass (happy path + task not found + type-mismatch guard)
- [ ] `DrizzleCustomFieldDefRepository` integration test against real DB
- [ ] `GetTaskDetailHandler` returns `customFields` array in snapshot
- [ ] `customFieldRouter` tRPC procedures wired into `plannerRouter`
- [ ] `CustomFieldsSection` renders correct input per field kind; changes call correct tRPC mutation
- [ ] `bun run test --filter @future/web-planner --coverage` ≥70%
- [ ] TypeScript compiles without errors

---

## File Map

**Create:**

```
apps/api/src/modules/planner/application/commands/custom-fields/
  define-custom-field.command.ts
  define-custom-field.handler.ts
  define-custom-field.handler.spec.ts
  update-custom-field-def.command.ts
  update-custom-field-def.handler.ts
  update-custom-field-def.handler.spec.ts
  delete-custom-field-def.command.ts
  delete-custom-field-def.handler.ts
  delete-custom-field-def.handler.spec.ts
  set-custom-field-value.command.ts
  set-custom-field-value.handler.ts
  set-custom-field-value.handler.spec.ts

apps/api/src/modules/planner/infrastructure/repositories/
  drizzle-custom-field-def.repository.ts
  drizzle-custom-field-def.repository.integration.spec.ts

apps/api/src/modules/planner/interface/trpc/
  custom-field.router.ts

apps/web-planner/src/components/task-detail/tabs/custom-fields/
  CustomFieldsSection.tsx
  CustomFieldsSection.spec.tsx
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

## Task 1: DefineCustomField command

**Files:**

- Create: `apps/api/src/modules/planner/application/commands/custom-fields/define-custom-field.command.ts`
- Create: `apps/api/src/modules/planner/application/commands/custom-fields/define-custom-field.handler.ts`
- Create: `apps/api/src/modules/planner/application/commands/custom-fields/define-custom-field.handler.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/planner/application/commands/custom-fields/define-custom-field.handler.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { DefineCustomFieldHandler } from './define-custom-field.handler'
import { DefineCustomFieldCommand } from './define-custom-field.command'
import type { ICustomFieldDefRepository } from '../../../domain/repositories/custom-field-def.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import { CustomFieldLimitExceededException } from '../../../domain/exceptions/custom-field-limit-exceeded.exception'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const ACTOR_ID = 'actor-1'

describe('DefineCustomFieldHandler', () => {
  let handler: DefineCustomFieldHandler
  let repo: { countByPlan: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    repo = {
      countByPlan: vi.fn().mockResolvedValue(0),
      save: vi.fn().mockResolvedValue(undefined),
    }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new DefineCustomFieldHandler(
      repo as unknown as ICustomFieldDefRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('creates field def and returns id', async () => {
    const cmd = new DefineCustomFieldCommand(
      TENANT_ID,
      PLAN_ID,
      ACTOR_ID,
      'Status',
      'text',
      null,
      0,
    )
    const result = await handler.execute(cmd)
    expect(repo.save).toHaveBeenCalledOnce()
    expect(result).toEqual({ id: expect.any(String) })
  })

  it('throws when plan already has 10 field defs', async () => {
    repo.countByPlan.mockResolvedValue(10)
    const cmd = new DefineCustomFieldCommand(TENANT_ID, PLAN_ID, ACTOR_ID, 'Extra', 'text', null, 0)
    await expect(handler.execute(cmd)).rejects.toThrow(CustomFieldLimitExceededException)
    expect(repo.save).not.toHaveBeenCalled()
  })

  it('throws when auth fails', async () => {
    authSvc.assertCanEditPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )
    const cmd = new DefineCustomFieldCommand(
      TENANT_ID,
      PLAN_ID,
      ACTOR_ID,
      'Status',
      'text',
      null,
      0,
    )
    await expect(handler.execute(cmd)).rejects.toThrow(UnauthorizedPlanAccessException)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run test --filter @future/api define-custom-field 2>&1 | tail -15
```

Expected: FAIL — `DefineCustomFieldHandler` not found.

- [ ] **Step 3: Create command class**

Create `apps/api/src/modules/planner/application/commands/custom-fields/define-custom-field.command.ts`:

```ts
export type CustomFieldKind = 'text' | 'number' | 'date' | 'yes_no' | 'choice'

export class DefineCustomFieldCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly actorId: string,
    public readonly name: string,
    public readonly kind: CustomFieldKind,
    public readonly choiceOptions: string[] | null,
    public readonly position: number,
  ) {}
}
```

- [ ] **Step 4: Create the domain exception**

Create `apps/api/src/modules/planner/domain/exceptions/custom-field-limit-exceeded.exception.ts`:

```ts
export class CustomFieldLimitExceededException extends Error {
  constructor(planId: string) {
    super(`Plan ${planId} already has the maximum 10 custom field definitions`)
    this.name = 'CustomFieldLimitExceededException'
  }
}
```

- [ ] **Step 5: Create handler**

Create `apps/api/src/modules/planner/application/commands/custom-fields/define-custom-field.handler.ts`:

```ts
import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { uuidv7 } from 'uuidv7'
import {
  CUSTOM_FIELD_DEF_REPOSITORY,
  type ICustomFieldDefRepository,
} from '../../../domain/repositories/custom-field-def.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { CustomFieldLimitExceededException } from '../../../domain/exceptions/custom-field-limit-exceeded.exception'
import { DefineCustomFieldCommand } from './define-custom-field.command'

const MAX_FIELDS_PER_PLAN = 10

@CommandHandler(DefineCustomFieldCommand)
export class DefineCustomFieldHandler implements ICommandHandler<
  DefineCustomFieldCommand,
  { id: string }
> {
  constructor(
    @Inject(CUSTOM_FIELD_DEF_REPOSITORY) private readonly repo: ICustomFieldDefRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(cmd: DefineCustomFieldCommand): Promise<{ id: string }> {
    await this.authSvc.assertCanEditPlan(cmd.actorId, cmd.planId, cmd.tenantId)

    const count = await this.repo.countByPlan(cmd.planId, cmd.tenantId)
    if (count >= MAX_FIELDS_PER_PLAN) throw new CustomFieldLimitExceededException(cmd.planId)

    const id = uuidv7()
    await this.repo.save({
      id,
      tenantId: cmd.tenantId,
      planId: cmd.planId,
      name: cmd.name,
      kind: cmd.kind,
      choiceOptions: cmd.choiceOptions,
      position: cmd.position,
    })

    return { id }
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
bun run test --filter @future/api define-custom-field 2>&1 | tail -15
```

Expected: 3 tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/planner/application/commands/custom-fields/ \
        apps/api/src/modules/planner/domain/exceptions/custom-field-limit-exceeded.exception.ts
git commit -m "feat(planner): add DefineCustomField command handler"
```

---

## Task 2: UpdateCustomFieldDef and DeleteCustomFieldDef commands

**Files:**

- Create: `apps/api/src/modules/planner/application/commands/custom-fields/update-custom-field-def.command.ts`
- Create: `apps/api/src/modules/planner/application/commands/custom-fields/update-custom-field-def.handler.ts`
- Create: `apps/api/src/modules/planner/application/commands/custom-fields/update-custom-field-def.handler.spec.ts`
- Create: `apps/api/src/modules/planner/application/commands/custom-fields/delete-custom-field-def.command.ts`
- Create: `apps/api/src/modules/planner/application/commands/custom-fields/delete-custom-field-def.handler.ts`
- Create: `apps/api/src/modules/planner/application/commands/custom-fields/delete-custom-field-def.handler.spec.ts`

- [ ] **Step 1: Write failing tests for both handlers**

Create `apps/api/src/modules/planner/application/commands/custom-fields/update-custom-field-def.handler.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { UpdateCustomFieldDefHandler } from './update-custom-field-def.handler'
import { UpdateCustomFieldDefCommand } from './update-custom-field-def.command'
import type {
  ICustomFieldDefRepository,
  CustomFieldDefRecord,
} from '../../../domain/repositories/custom-field-def.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { CustomFieldDefNotFoundException } from '../../../domain/exceptions/custom-field-def-not-found.exception'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const ACTOR_ID = 'actor-1'
const DEF_ID = 'def-1'

function makeRecord(): CustomFieldDefRecord {
  return {
    id: DEF_ID,
    tenantId: TENANT_ID,
    planId: PLAN_ID,
    name: 'Old',
    kind: 'text',
    choiceOptions: null,
    position: 0,
  }
}

describe('UpdateCustomFieldDefHandler', () => {
  let handler: UpdateCustomFieldDefHandler
  let repo: { findById: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    repo = {
      findById: vi.fn().mockResolvedValue(makeRecord()),
      update: vi.fn().mockResolvedValue(undefined),
    }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new UpdateCustomFieldDefHandler(
      repo as unknown as ICustomFieldDefRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('updates name and persists', async () => {
    const cmd = new UpdateCustomFieldDefCommand(
      TENANT_ID,
      PLAN_ID,
      ACTOR_ID,
      DEF_ID,
      'New Name',
      null,
      0,
    )
    await handler.execute(cmd)
    expect(repo.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: DEF_ID, name: 'New Name' }),
    )
  })

  it('throws when field def not found', async () => {
    repo.findById.mockResolvedValue(null)
    const cmd = new UpdateCustomFieldDefCommand(TENANT_ID, PLAN_ID, ACTOR_ID, DEF_ID, 'X', null, 0)
    await expect(handler.execute(cmd)).rejects.toThrow(CustomFieldDefNotFoundException)
  })
})
```

Create `apps/api/src/modules/planner/application/commands/custom-fields/delete-custom-field-def.handler.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { DeleteCustomFieldDefHandler } from './delete-custom-field-def.handler'
import { DeleteCustomFieldDefCommand } from './delete-custom-field-def.command'
import type {
  ICustomFieldDefRepository,
  CustomFieldDefRecord,
} from '../../../domain/repositories/custom-field-def.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { CustomFieldDefNotFoundException } from '../../../domain/exceptions/custom-field-def-not-found.exception'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const ACTOR_ID = 'actor-1'
const DEF_ID = 'def-1'

function makeRecord(): CustomFieldDefRecord {
  return {
    id: DEF_ID,
    tenantId: TENANT_ID,
    planId: PLAN_ID,
    name: 'Old',
    kind: 'text',
    choiceOptions: null,
    position: 0,
  }
}

describe('DeleteCustomFieldDefHandler', () => {
  let handler: DeleteCustomFieldDefHandler
  let repo: { findById: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    repo = {
      findById: vi.fn().mockResolvedValue(makeRecord()),
      delete: vi.fn().mockResolvedValue(undefined),
    }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new DeleteCustomFieldDefHandler(
      repo as unknown as ICustomFieldDefRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('deletes field def and all its values', async () => {
    const cmd = new DeleteCustomFieldDefCommand(TENANT_ID, PLAN_ID, ACTOR_ID, DEF_ID)
    await handler.execute(cmd)
    expect(repo.delete).toHaveBeenCalledWith(DEF_ID, TENANT_ID)
  })

  it('throws when field def not found', async () => {
    repo.findById.mockResolvedValue(null)
    const cmd = new DeleteCustomFieldDefCommand(TENANT_ID, PLAN_ID, ACTOR_ID, DEF_ID)
    await expect(handler.execute(cmd)).rejects.toThrow(CustomFieldDefNotFoundException)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun run test --filter @future/api "update-custom-field-def|delete-custom-field-def" 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Create domain exception for missing field def**

Create `apps/api/src/modules/planner/domain/exceptions/custom-field-def-not-found.exception.ts`:

```ts
export class CustomFieldDefNotFoundException extends Error {
  constructor(id: string) {
    super(`Custom field definition ${id} not found`)
    this.name = 'CustomFieldDefNotFoundException'
  }
}
```

- [ ] **Step 4: Extend ICustomFieldDefRepository with update and delete methods**

In `apps/api/src/modules/planner/domain/repositories/custom-field-def.repository.ts`, update the interface to include:

```ts
import type { CustomFieldKind } from '../../../application/commands/custom-fields/define-custom-field.command'

export const CUSTOM_FIELD_DEF_REPOSITORY = Symbol('ICustomFieldDefRepository')

export interface CustomFieldDefRecord {
  id: string
  tenantId: string
  planId: string
  name: string
  kind: CustomFieldKind
  choiceOptions: string[] | null
  position: number
}

export interface ICustomFieldDefRepository {
  countByPlan(planId: string, tenantId: string): Promise<number>
  save(record: CustomFieldDefRecord): Promise<void>
  findById(id: string, tenantId: string): Promise<CustomFieldDefRecord | null>
  listByPlan(planId: string, tenantId: string): Promise<CustomFieldDefRecord[]>
  update(record: CustomFieldDefRecord): Promise<void>
  delete(id: string, tenantId: string): Promise<void>
}
```

- [ ] **Step 5: Create UpdateCustomFieldDef command and handler**

Create `apps/api/src/modules/planner/application/commands/custom-fields/update-custom-field-def.command.ts`:

```ts
export class UpdateCustomFieldDefCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly actorId: string,
    public readonly defId: string,
    public readonly name: string,
    public readonly choiceOptions: string[] | null,
    public readonly position: number,
  ) {}
}
```

Create `apps/api/src/modules/planner/application/commands/custom-fields/update-custom-field-def.handler.ts`:

```ts
import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import {
  CUSTOM_FIELD_DEF_REPOSITORY,
  type ICustomFieldDefRepository,
} from '../../../domain/repositories/custom-field-def.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { CustomFieldDefNotFoundException } from '../../../domain/exceptions/custom-field-def-not-found.exception'
import { UpdateCustomFieldDefCommand } from './update-custom-field-def.command'

@CommandHandler(UpdateCustomFieldDefCommand)
export class UpdateCustomFieldDefHandler implements ICommandHandler<UpdateCustomFieldDefCommand> {
  constructor(
    @Inject(CUSTOM_FIELD_DEF_REPOSITORY) private readonly repo: ICustomFieldDefRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(cmd: UpdateCustomFieldDefCommand): Promise<void> {
    await this.authSvc.assertCanEditPlan(cmd.actorId, cmd.planId, cmd.tenantId)

    const existing = await this.repo.findById(cmd.defId, cmd.tenantId)
    if (!existing) throw new CustomFieldDefNotFoundException(cmd.defId)

    await this.repo.update({
      ...existing,
      name: cmd.name,
      choiceOptions: cmd.choiceOptions,
      position: cmd.position,
    })
  }
}
```

- [ ] **Step 6: Create DeleteCustomFieldDef command and handler**

Create `apps/api/src/modules/planner/application/commands/custom-fields/delete-custom-field-def.command.ts`:

```ts
export class DeleteCustomFieldDefCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly actorId: string,
    public readonly defId: string,
  ) {}
}
```

Create `apps/api/src/modules/planner/application/commands/custom-fields/delete-custom-field-def.handler.ts`:

```ts
import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import {
  CUSTOM_FIELD_DEF_REPOSITORY,
  type ICustomFieldDefRepository,
} from '../../../domain/repositories/custom-field-def.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { CustomFieldDefNotFoundException } from '../../../domain/exceptions/custom-field-def-not-found.exception'
import { DeleteCustomFieldDefCommand } from './delete-custom-field-def.command'

@CommandHandler(DeleteCustomFieldDefCommand)
export class DeleteCustomFieldDefHandler implements ICommandHandler<DeleteCustomFieldDefCommand> {
  constructor(
    @Inject(CUSTOM_FIELD_DEF_REPOSITORY) private readonly repo: ICustomFieldDefRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(cmd: DeleteCustomFieldDefCommand): Promise<void> {
    await this.authSvc.assertCanEditPlan(cmd.actorId, cmd.planId, cmd.tenantId)

    const existing = await this.repo.findById(cmd.defId, cmd.tenantId)
    if (!existing) throw new CustomFieldDefNotFoundException(cmd.defId)

    await this.repo.delete(cmd.defId, cmd.tenantId)
  }
}
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
bun run test --filter @future/api "update-custom-field-def|delete-custom-field-def" 2>&1 | tail -10
```

Expected: 4 tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/planner/application/commands/custom-fields/ \
        apps/api/src/modules/planner/domain/exceptions/custom-field-def-not-found.exception.ts \
        apps/api/src/modules/planner/domain/repositories/custom-field-def.repository.ts
git commit -m "feat(planner): add UpdateCustomFieldDef and DeleteCustomFieldDef handlers"
```

---

## Task 3: SetCustomFieldValue command

**Files:**

- Create: `apps/api/src/modules/planner/application/commands/custom-fields/set-custom-field-value.command.ts`
- Create: `apps/api/src/modules/planner/application/commands/custom-fields/set-custom-field-value.handler.ts`
- Create: `apps/api/src/modules/planner/application/commands/custom-fields/set-custom-field-value.handler.spec.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/src/modules/planner/application/commands/custom-fields/set-custom-field-value.handler.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { SetCustomFieldValueHandler } from './set-custom-field-value.handler'
import { SetCustomFieldValueCommand } from './set-custom-field-value.command'
import type {
  ICustomFieldDefRepository,
  CustomFieldDefRecord,
} from '../../../domain/repositories/custom-field-def.repository'
import type { ITaskRepository } from '../../../domain/repositories/task.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { CustomFieldDefNotFoundException } from '../../../domain/exceptions/custom-field-def-not-found.exception'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { TaskCustomFieldUpdatedEvent } from '@future/event-contracts'
import { Task } from '../../../domain/entities/task.entity'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const TASK_ID = 'task-1'
const ACTOR_ID = 'actor-1'
const DEF_ID = 'def-1'

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

function makeRecord(): CustomFieldDefRecord {
  return {
    id: DEF_ID,
    tenantId: TENANT_ID,
    planId: PLAN_ID,
    name: 'Score',
    kind: 'number',
    choiceOptions: null,
    position: 0,
  }
}

describe('SetCustomFieldValueHandler', () => {
  let handler: SetCustomFieldValueHandler
  let defRepo: { findById: ReturnType<typeof vi.fn> }
  let taskRepo: { findById: ReturnType<typeof vi.fn> }
  let valueRepo: { upsert: ReturnType<typeof vi.fn> }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    defRepo = { findById: vi.fn().mockResolvedValue(makeRecord()) }
    taskRepo = { findById: vi.fn().mockResolvedValue(makeTask()) }
    valueRepo = { upsert: vi.fn().mockResolvedValue(undefined) }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new SetCustomFieldValueHandler(
      defRepo as unknown as ICustomFieldDefRepository,
      taskRepo as unknown as ITaskRepository,
      valueRepo as any,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('upserts value and emits event', async () => {
    const cmd = new SetCustomFieldValueCommand(TENANT_ID, PLAN_ID, TASK_ID, ACTOR_ID, DEF_ID, {
      number: 42,
    })
    await handler.execute(cmd)
    expect(valueRepo.upsert).toHaveBeenCalledWith({
      taskId: TASK_ID,
      fieldDefId: DEF_ID,
      tenantId: TENANT_ID,
      value: { number: 42 },
    })
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(TaskCustomFieldUpdatedEvent))
  })

  it('throws when field def not found', async () => {
    defRepo.findById.mockResolvedValue(null)
    const cmd = new SetCustomFieldValueCommand(TENANT_ID, PLAN_ID, TASK_ID, ACTOR_ID, DEF_ID, {
      number: 1,
    })
    await expect(handler.execute(cmd)).rejects.toThrow(CustomFieldDefNotFoundException)
  })

  it('throws when task not found', async () => {
    taskRepo.findById.mockResolvedValue(null)
    const cmd = new SetCustomFieldValueCommand(TENANT_ID, PLAN_ID, TASK_ID, ACTOR_ID, DEF_ID, {
      number: 1,
    })
    await expect(handler.execute(cmd)).rejects.toThrow(TaskNotFoundException)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run test --filter @future/api set-custom-field-value 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Create command and handler**

Create `apps/api/src/modules/planner/application/commands/custom-fields/set-custom-field-value.command.ts`:

```ts
export type CustomFieldValuePayload =
  | { text: string }
  | { number: number }
  | { date: string }
  | { yesNo: boolean }
  | { choice: string }

export class SetCustomFieldValueCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly taskId: string,
    public readonly actorId: string,
    public readonly fieldDefId: string,
    public readonly value: CustomFieldValuePayload,
  ) {}
}
```

Create `apps/api/src/modules/planner/application/commands/custom-fields/set-custom-field-value.handler.ts`:

```ts
import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { TaskCustomFieldUpdatedEvent } from '@future/event-contracts'
import {
  CUSTOM_FIELD_DEF_REPOSITORY,
  type ICustomFieldDefRepository,
} from '../../../domain/repositories/custom-field-def.repository'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import {
  TASK_CUSTOM_FIELD_VALUE_REPOSITORY,
  type ITaskCustomFieldValueRepository,
} from '../../../domain/repositories/task-custom-field-value.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { CustomFieldDefNotFoundException } from '../../../domain/exceptions/custom-field-def-not-found.exception'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { SetCustomFieldValueCommand } from './set-custom-field-value.command'

@CommandHandler(SetCustomFieldValueCommand)
export class SetCustomFieldValueHandler implements ICommandHandler<SetCustomFieldValueCommand> {
  constructor(
    @Inject(CUSTOM_FIELD_DEF_REPOSITORY) private readonly defRepo: ICustomFieldDefRepository,
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    @Inject(TASK_CUSTOM_FIELD_VALUE_REPOSITORY)
    private readonly valueRepo: ITaskCustomFieldValueRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(cmd: SetCustomFieldValueCommand): Promise<void> {
    await this.authSvc.assertCanEditPlan(cmd.actorId, cmd.planId, cmd.tenantId)

    const def = await this.defRepo.findById(cmd.fieldDefId, cmd.tenantId)
    if (!def) throw new CustomFieldDefNotFoundException(cmd.fieldDefId)

    const task = await this.taskRepo.findById(cmd.taskId, cmd.tenantId)
    if (!task) throw new TaskNotFoundException(cmd.taskId)

    await this.valueRepo.upsert({
      taskId: cmd.taskId,
      fieldDefId: cmd.fieldDefId,
      tenantId: cmd.tenantId,
      value: cmd.value,
    })

    await this.eventBus.publish(
      new TaskCustomFieldUpdatedEvent(
        cmd.tenantId,
        cmd.actorId,
        cmd.taskId,
        cmd.planId,
        cmd.fieldDefId,
      ),
    )
  }
}
```

Create `apps/api/src/modules/planner/domain/repositories/task-custom-field-value.repository.ts`:

```ts
import type { CustomFieldValuePayload } from '../../../application/commands/custom-fields/set-custom-field-value.command'

export const TASK_CUSTOM_FIELD_VALUE_REPOSITORY = Symbol('ITaskCustomFieldValueRepository')

export interface TaskCustomFieldValueRecord {
  taskId: string
  fieldDefId: string
  tenantId: string
  value: CustomFieldValuePayload
}

export interface ITaskCustomFieldValueRepository {
  upsert(record: TaskCustomFieldValueRecord): Promise<void>
  listByTask(taskId: string, tenantId: string): Promise<TaskCustomFieldValueRecord[]>
  deleteByDef(fieldDefId: string, tenantId: string): Promise<void>
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun run test --filter @future/api set-custom-field-value 2>&1 | tail -10
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/planner/application/commands/custom-fields/ \
        apps/api/src/modules/planner/domain/repositories/task-custom-field-value.repository.ts
git commit -m "feat(planner): add SetCustomFieldValue command handler"
```

---

## Task 4: DrizzleCustomFieldDefRepository

**Files:**

- Create: `apps/api/src/modules/planner/infrastructure/repositories/drizzle-custom-field-def.repository.ts`
- Create: `apps/api/src/modules/planner/infrastructure/repositories/drizzle-custom-field-def.repository.integration.spec.ts`

- [ ] **Step 1: Write failing integration test**

Create `apps/api/src/modules/planner/infrastructure/repositories/drizzle-custom-field-def.repository.integration.spec.ts`:

```ts
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { DrizzleCustomFieldDefRepository } from './drizzle-custom-field-def.repository'
import { createTestDb } from '../../../../../test/helpers/db-helper'

describe('DrizzleCustomFieldDefRepository (integration)', () => {
  let repo: DrizzleCustomFieldDefRepository
  let db: Awaited<ReturnType<typeof createTestDb>>

  const TENANT_ID = 'tenant-integration'
  const PLAN_ID = 'plan-integration'

  beforeAll(async () => {
    db = await createTestDb()
    repo = new DrizzleCustomFieldDefRepository(db)
  })

  afterEach(async () => {
    await db.execute(`DELETE FROM planner.custom_field_def WHERE tenant_id = '${TENANT_ID}'`)
  })

  it('saves and retrieves a field def', async () => {
    await repo.save({
      id: 'def-1',
      tenantId: TENANT_ID,
      planId: PLAN_ID,
      name: 'Score',
      kind: 'number',
      choiceOptions: null,
      position: 0,
    })
    const found = await repo.findById('def-1', TENANT_ID)
    expect(found?.name).toBe('Score')
    expect(found?.kind).toBe('number')
  })

  it('countByPlan returns correct count', async () => {
    await repo.save({
      id: 'def-a',
      tenantId: TENANT_ID,
      planId: PLAN_ID,
      name: 'A',
      kind: 'text',
      choiceOptions: null,
      position: 0,
    })
    await repo.save({
      id: 'def-b',
      tenantId: TENANT_ID,
      planId: PLAN_ID,
      name: 'B',
      kind: 'text',
      choiceOptions: null,
      position: 1,
    })
    expect(await repo.countByPlan(PLAN_ID, TENANT_ID)).toBe(2)
  })

  it('delete removes field def', async () => {
    await repo.save({
      id: 'def-del',
      tenantId: TENANT_ID,
      planId: PLAN_ID,
      name: 'Del',
      kind: 'text',
      choiceOptions: null,
      position: 0,
    })
    await repo.delete('def-del', TENANT_ID)
    expect(await repo.findById('def-del', TENANT_ID)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run test --filter @future/api drizzle-custom-field-def 2>&1 | tail -10
```

Expected: FAIL — class not found.

- [ ] **Step 3: Implement repository**

Create `apps/api/src/modules/planner/infrastructure/repositories/drizzle-custom-field-def.repository.ts`:

```ts
import { Inject } from '@nestjs/common'
import type { Db } from '@future/db'
import { eq, and, count } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { plannerCustomFieldDef } from '../schema/planner.schema'
import type {
  ICustomFieldDefRepository,
  CustomFieldDefRecord,
} from '../../domain/repositories/custom-field-def.repository'

export class DrizzleCustomFieldDefRepository implements ICustomFieldDefRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async countByPlan(planId: string, tenantId: string): Promise<number> {
    const rows = await this.db
      .select({ cnt: count() })
      .from(plannerCustomFieldDef)
      .where(
        and(eq(plannerCustomFieldDef.planId, planId), eq(plannerCustomFieldDef.tenantId, tenantId)),
      )
    return rows[0]?.cnt ?? 0
  }

  async save(record: CustomFieldDefRecord): Promise<void> {
    await this.db.insert(plannerCustomFieldDef).values({
      id: record.id,
      tenantId: record.tenantId,
      planId: record.planId,
      name: record.name,
      kind: record.kind,
      choiceOptions: record.choiceOptions,
      position: record.position,
    })
  }

  async findById(id: string, tenantId: string): Promise<CustomFieldDefRecord | null> {
    const rows = await this.db
      .select()
      .from(plannerCustomFieldDef)
      .where(and(eq(plannerCustomFieldDef.id, id), eq(plannerCustomFieldDef.tenantId, tenantId)))
    if (!rows[0]) return null
    return {
      id: rows[0].id,
      tenantId: rows[0].tenantId,
      planId: rows[0].planId,
      name: rows[0].name,
      kind: rows[0].kind as CustomFieldDefRecord['kind'],
      choiceOptions: rows[0].choiceOptions as string[] | null,
      position: rows[0].position,
    }
  }

  async listByPlan(planId: string, tenantId: string): Promise<CustomFieldDefRecord[]> {
    const rows = await this.db
      .select()
      .from(plannerCustomFieldDef)
      .where(
        and(eq(plannerCustomFieldDef.planId, planId), eq(plannerCustomFieldDef.tenantId, tenantId)),
      )
      .orderBy(plannerCustomFieldDef.position)
    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      planId: r.planId,
      name: r.name,
      kind: r.kind as CustomFieldDefRecord['kind'],
      choiceOptions: r.choiceOptions as string[] | null,
      position: r.position,
    }))
  }

  async update(record: CustomFieldDefRecord): Promise<void> {
    await this.db
      .update(plannerCustomFieldDef)
      .set({ name: record.name, choiceOptions: record.choiceOptions, position: record.position })
      .where(
        and(
          eq(plannerCustomFieldDef.id, record.id),
          eq(plannerCustomFieldDef.tenantId, record.tenantId),
        ),
      )
  }

  async delete(id: string, tenantId: string): Promise<void> {
    await this.db
      .delete(plannerCustomFieldDef)
      .where(and(eq(plannerCustomFieldDef.id, id), eq(plannerCustomFieldDef.tenantId, tenantId)))
  }
}
```

- [ ] **Step 4: Run integration test**

```bash
bun run test --filter @future/api drizzle-custom-field-def 2>&1 | tail -15
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/planner/infrastructure/repositories/drizzle-custom-field-def.repository.ts \
        apps/api/src/modules/planner/infrastructure/repositories/drizzle-custom-field-def.repository.integration.spec.ts
git commit -m "feat(planner): implement DrizzleCustomFieldDefRepository"
```

---

## Task 5: Extend GetTaskDetail to include custom fields, wire tRPC router, register in module

**Files:**

- Modify: `apps/api/src/modules/planner/application/queries/tasks/get-task-detail.query.ts`
- Modify: `apps/api/src/modules/planner/application/queries/tasks/get-task-detail.handler.ts`
- Create: `apps/api/src/modules/planner/interface/trpc/custom-field.router.ts`
- Modify: `apps/api/src/modules/planner/interface/trpc/planner.router.ts`
- Modify: `apps/api/src/modules/planner/planner.module.ts`

- [ ] **Step 1: Extend TaskDetailSnapshot**

In `apps/api/src/modules/planner/application/queries/tasks/get-task-detail.query.ts`, add to `TaskDetailSnapshot`:

```ts
// Add at the bottom of the TaskDetailSnapshot interface:
customFields: Array<{
  defId: string
  name: string
  kind: 'text' | 'number' | 'date' | 'yes_no' | 'choice'
  choiceOptions: string[] | null
  position: number
  value: { text?: string; number?: number; date?: string; yesNo?: boolean; choice?: string } | null
}>
```

- [ ] **Step 2: Add custom fields JOIN to GetTaskDetailHandler**

In `apps/api/src/modules/planner/application/queries/tasks/get-task-detail.handler.ts`, after the existing queries, add a final query (before the return statement):

```ts
// ── Query N: Custom field defs + values for this task ────────────────────
const customFieldResult = await this.db.execute<{
  def_id: string
  name: string
  kind: string
  choice_options: string[] | null
  position: number
  text_value: string | null
  number_value: number | null
  date_value: string | null
  yes_no_value: boolean | null
  choice_value: string | null
}>(
  sql`SELECT
            cfd.id AS def_id,
            cfd.name,
            cfd.kind,
            cfd.choice_options,
            cfd.position,
            cfv.text_value,
            cfv.number_value,
            cfv.date_value,
            cfv.yes_no_value,
            cfv.choice_value
          FROM planner.custom_field_def cfd
          LEFT JOIN planner.task_custom_field_value cfv
            ON cfv.field_def_id = cfd.id AND cfv.task_id = ${taskId} AND cfv.tenant_id = ${tenantId}
          WHERE cfd.plan_id = ${planId}
            AND cfd.tenant_id = ${tenantId}
          ORDER BY cfd.position`,
)

const customFields = customFieldResult.rows.map((r) => ({
  defId: r.def_id,
  name: r.name,
  kind: r.kind as 'text' | 'number' | 'date' | 'yes_no' | 'choice',
  choiceOptions: r.choice_options,
  position: r.position,
  value:
    r.text_value !== null ||
    r.number_value !== null ||
    r.date_value !== null ||
    r.yes_no_value !== null ||
    r.choice_value !== null
      ? {
          text: r.text_value ?? undefined,
          number: r.number_value ?? undefined,
          date: r.date_value ?? undefined,
          yesNo: r.yes_no_value ?? undefined,
          choice: r.choice_value ?? undefined,
        }
      : null,
}))
```

Then add `customFields` to the final return object.

- [ ] **Step 3: Create custom-field tRPC router**

Create `apps/api/src/modules/planner/interface/trpc/custom-field.router.ts`:

```ts
import * as z from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { PlannerRouterService } from './planner-router.service'
import { DefineCustomFieldCommand } from '../../application/commands/custom-fields/define-custom-field.command'
import { UpdateCustomFieldDefCommand } from '../../application/commands/custom-fields/update-custom-field-def.command'
import { DeleteCustomFieldDefCommand } from '../../application/commands/custom-fields/delete-custom-field-def.command'
import { SetCustomFieldValueCommand } from '../../application/commands/custom-fields/set-custom-field-value.command'
import { toPlannerTrpcError } from './planner-trpc-error'

const customFieldKindSchema = z.enum(['text', 'number', 'date', 'yes_no', 'choice'])

function svc() {
  return PlannerRouterService.getInstance()
}

export const customFieldRouter = router({
  defineField: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        actorId: z.string().uuid(),
        name: z.string().min(1).max(50),
        kind: customFieldKindSchema,
        choiceOptions: z.array(z.string()).nullable(),
        position: z.number().int().min(0),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new DefineCustomFieldCommand(
            input.tenantId,
            input.planId,
            input.actorId,
            input.name,
            input.kind,
            input.choiceOptions,
            input.position,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  updateFieldDef: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        actorId: z.string().uuid(),
        defId: z.string().uuid(),
        name: z.string().min(1).max(50),
        choiceOptions: z.array(z.string()).nullable(),
        position: z.number().int().min(0),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new UpdateCustomFieldDefCommand(
            input.tenantId,
            input.planId,
            input.actorId,
            input.defId,
            input.name,
            input.choiceOptions,
            input.position,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  deleteFieldDef: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        actorId: z.string().uuid(),
        defId: z.string().uuid(),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new DeleteCustomFieldDefCommand(input.tenantId, input.planId, input.actorId, input.defId),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  setValue: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        taskId: z.string().uuid(),
        actorId: z.string().uuid(),
        fieldDefId: z.string().uuid(),
        value: z.union([
          z.object({ text: z.string() }),
          z.object({ number: z.number() }),
          z.object({ date: z.string() }),
          z.object({ yesNo: z.boolean() }),
          z.object({ choice: z.string() }),
        ]),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new SetCustomFieldValueCommand(
            input.tenantId,
            input.planId,
            input.taskId,
            input.actorId,
            input.fieldDefId,
            input.value,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),
})
```

- [ ] **Step 4: Add customField to plannerRouter**

In `apps/api/src/modules/planner/interface/trpc/planner.router.ts`:

```ts
// Add import:
import { customFieldRouter } from './custom-field.router'

// Add to plannerRouter:
export const plannerRouter = router({
  // ... existing entries ...
  customFields: customFieldRouter,
})
```

- [ ] **Step 5: Register providers in planner.module.ts**

In `apps/api/src/modules/planner/planner.module.ts`, add to the `providers` array:

```ts
// Repository provider
{ provide: CUSTOM_FIELD_DEF_REPOSITORY, useClass: DrizzleCustomFieldDefRepository },
{ provide: TASK_CUSTOM_FIELD_VALUE_REPOSITORY, useClass: DrizzleTaskCustomFieldValueRepository },

// Command handlers
DefineCustomFieldHandler,
UpdateCustomFieldDefHandler,
DeleteCustomFieldDefHandler,
SetCustomFieldValueHandler,
```

Import the new symbols and classes at the top of the file.

- [ ] **Step 6: Type-check**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/planner/
git commit -m "feat(planner): wire custom-field commands into tRPC router and module"
```

---

## Task 6: CustomFieldsSection frontend component

**Files:**

- Create: `apps/web-planner/src/components/task-detail/tabs/custom-fields/CustomFieldsSection.tsx`
- Create: `apps/web-planner/src/components/task-detail/tabs/custom-fields/CustomFieldsSection.spec.tsx`

- [ ] **Step 1: Write failing test**

Create `apps/web-planner/src/components/task-detail/tabs/custom-fields/CustomFieldsSection.spec.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CustomFieldsSection } from './CustomFieldsSection'

const mockMutate = vi.fn()
vi.mock('@/lib/trpc', () => ({
  trpc: {
    planner: {
      customFields: {
        setValue: { useMutation: () => ({ mutate: mockMutate }) },
      },
    },
  },
}))

const fields = [
  {
    defId: 'f1',
    name: 'Score',
    kind: 'number' as const,
    choiceOptions: null,
    position: 0,
    value: null,
  },
  {
    defId: 'f2',
    name: 'Done?',
    kind: 'yes_no' as const,
    choiceOptions: null,
    position: 1,
    value: { yesNo: true },
  },
  {
    defId: 'f3',
    name: 'Status',
    kind: 'choice' as const,
    choiceOptions: ['Open', 'Closed'],
    position: 2,
    value: null,
  },
]

describe('CustomFieldsSection', () => {
  it('renders each field by name', () => {
    render(
      <CustomFieldsSection fields={fields} taskId="t1" planId="p1" tenantId="tn1" actorId="a1" />,
    )
    expect(screen.getByText('Score')).toBeInTheDocument()
    expect(screen.getByText('Done?')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
  })

  it('calls setValue mutation on number input change', async () => {
    render(
      <CustomFieldsSection fields={fields} taskId="t1" planId="p1" tenantId="tn1" actorId="a1" />,
    )
    const input = screen.getByTestId('cf-input-f1')
    fireEvent.change(input, { target: { value: '99' } })
    fireEvent.blur(input)
    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({ fieldDefId: 'f1', value: { number: 99 } }),
      )
    })
  })

  it('renders yes_no field with initial checked state', () => {
    render(
      <CustomFieldsSection fields={fields} taskId="t1" planId="p1" tenantId="tn1" actorId="a1" />,
    )
    const checkbox = screen.getByTestId('cf-input-f2')
    expect(checkbox).toBeChecked()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run test --filter @future/web-planner CustomFieldsSection 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Implement CustomFieldsSection**

Create `apps/web-planner/src/components/task-detail/tabs/custom-fields/CustomFieldsSection.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Input, Button } from '@future/ui'
import { trpc } from '@/lib/trpc'

interface CustomField {
  defId: string
  name: string
  kind: 'text' | 'number' | 'date' | 'yes_no' | 'choice'
  choiceOptions: string[] | null
  position: number
  value: { text?: string; number?: number; date?: string; yesNo?: boolean; choice?: string } | null
}

interface Props {
  fields: CustomField[]
  taskId: string
  planId: string
  tenantId: string
  actorId: string
}

export function CustomFieldsSection({ fields, taskId, planId, tenantId, actorId }: Props) {
  const { mutate: setValue } = trpc.planner.customFields.setValue.useMutation()

  if (fields.length === 0) return null

  return (
    <section aria-label="Custom fields" className="flex flex-col gap-3 px-4 py-3">
      <p className="text-xs font-500 uppercase tracking-wide text-fg-muted">Custom Fields</p>
      {fields.map((field) => (
        <CustomFieldRow
          key={field.defId}
          field={field}
          onSave={(value) =>
            setValue({ tenantId, planId, taskId, actorId, fieldDefId: field.defId, value })
          }
        />
      ))}
    </section>
  )
}

function CustomFieldRow({ field, onSave }: { field: CustomField; onSave: (v: any) => void }) {
  const [localValue, setLocalValue] = useState(field.value)

  if (field.kind === 'yes_no') {
    const checked = localValue?.yesNo ?? false
    return (
      <div className="flex items-center gap-3">
        <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            data-testid={`cf-input-${field.defId}`}
            checked={checked}
            onChange={(e) => {
              setLocalValue({ yesNo: e.target.checked })
              onSave({ yesNo: e.target.checked })
            }}
            className="h-4 w-4 rounded border"
          />
          {field.name}
        </label>
      </div>
    )
  }

  if (field.kind === 'choice' && field.choiceOptions) {
    const current = localValue?.choice ?? ''
    return (
      <div className="flex flex-col gap-1">
        <p className="text-sm text-fg-muted">{field.name}</p>
        <div className="flex flex-wrap gap-1" role="group" aria-label={field.name}>
          {field.choiceOptions.map((opt) => (
            <Button
              key={opt}
              variant={current === opt ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setLocalValue({ choice: opt })
                onSave({ choice: opt })
              }}
              data-testid={`cf-choice-${field.defId}-${opt}`}
            >
              {opt}
            </Button>
          ))}
        </div>
      </div>
    )
  }

  const inputType = field.kind === 'number' ? 'number' : field.kind === 'date' ? 'date' : 'text'
  const rawValue =
    localValue?.text ??
    (localValue?.number !== undefined ? String(localValue.number) : '') ??
    localValue?.date ??
    ''

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`cf-${field.defId}`} className="text-sm text-fg-muted">
        {field.name}
      </label>
      <Input
        id={`cf-${field.defId}`}
        data-testid={`cf-input-${field.defId}`}
        type={inputType}
        defaultValue={rawValue}
        onBlur={(e) => {
          const raw = e.target.value
          if (field.kind === 'number') {
            const n = parseFloat(raw)
            if (!isNaN(n)) onSave({ number: n })
          } else if (field.kind === 'date') {
            onSave({ date: raw })
          } else {
            onSave({ text: raw })
          }
        }}
        className="h-8"
      />
    </div>
  )
}
```

- [ ] **Step 4: Add CustomFieldsSection to TaskDetailTab**

In `apps/web-planner/src/components/task-detail/tabs/TaskDetailTab.tsx`, import `CustomFieldsSection` and render it below the existing fields:

```tsx
import { CustomFieldsSection } from './custom-fields/CustomFieldsSection'

// Inside the component, after the description section:
;<CustomFieldsSection
  fields={task.customFields ?? []}
  taskId={taskId}
  planId={planId}
  tenantId={task.tenantId}
  actorId={actorId}
/>
```

- [ ] **Step 5: Run all tests**

```bash
bun run test --filter @future/web-planner 2>&1 | tail -20
```

Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web-planner/src/components/task-detail/tabs/custom-fields/
git commit -m "feat(web-planner): add CustomFieldsSection for custom field values"
```
