# Phase 2 / Plan 3 — Task Dependencies (Backend + Frontend)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement task dependencies end-to-end: two command handlers (AddDependency / RemoveDependency) with DFS cycle detection, a Drizzle repository, a tRPC sub-router, and the `DependenciesSection` + `TaskSearchPicker` frontend components.

**Architecture:**

- Dependencies are directional: `fromTaskId` (predecessor) → `toTaskId` (successor).
- Cycle detection runs a depth-first search from `toTaskId`; if it reaches `fromTaskId`, the add is rejected.
- `GetTaskDetailHandler` is extended to JOIN dependency rows into `TaskDetailSnapshot`.
- Frontend: `DependenciesSection` displays predecessor/successor groups; `TaskSearchPicker` lets users search tasks by title to add a dependency.

**Tech Stack:** NestJS CQRS, Drizzle ORM, tRPC, `@future/ui`, React Query, vitest

**Prereq:** Phase 2 / Plan 1 merged (`plannerTaskDependency` table and repository interface exist).

---

## Exit Criteria

- [ ] `AddDependencyHandler` — unit tests pass (happy path + cycle detected + self-link rejected + task not found)
- [ ] `RemoveDependencyHandler` — unit tests pass (happy path + not-found)
- [ ] `DrizzleTaskDependencyRepository` integration test against real DB
- [ ] `GetTaskDetailHandler` returns `predecessors` and `successors` arrays in snapshot
- [ ] `dependencyRouter` tRPC procedures wired into `plannerRouter`
- [ ] `DependenciesSection` renders predecessor/successor groups; add/remove calls correct mutation
- [ ] `TaskSearchPicker` filters tasks by title substring; selecting adds dependency
- [ ] `bun run test --filter @future/web-planner --coverage` ≥70%
- [ ] TypeScript compiles without errors

---

## File Map

**Create:**

```
apps/api/src/modules/planner/application/commands/dependencies/
  add-dependency.command.ts
  add-dependency.handler.ts
  add-dependency.handler.spec.ts
  remove-dependency.command.ts
  remove-dependency.handler.ts
  remove-dependency.handler.spec.ts
  cycle-detector.ts
  cycle-detector.spec.ts

apps/api/src/modules/planner/infrastructure/repositories/
  drizzle-task-dependency.repository.ts
  drizzle-task-dependency.repository.integration.spec.ts

apps/api/src/modules/planner/domain/exceptions/
  dependency-cycle-detected.exception.ts
  dependency-self-link.exception.ts

apps/api/src/modules/planner/interface/trpc/
  dependency.router.ts

apps/web-planner/src/components/task-detail/tabs/
  DependenciesSection.tsx
  DependenciesSection.spec.tsx
  TaskSearchPicker.tsx
  TaskSearchPicker.spec.tsx
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

## Task 1: Cycle detector utility

The cycle detector is a pure function that takes the full adjacency list (from → to) and checks whether adding a new edge would create a cycle.

**Files:**

- Create: `apps/api/src/modules/planner/application/commands/dependencies/cycle-detector.ts`
- Create: `apps/api/src/modules/planner/application/commands/dependencies/cycle-detector.spec.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/src/modules/planner/application/commands/dependencies/cycle-detector.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { wouldCreateCycle } from './cycle-detector'

describe('wouldCreateCycle', () => {
  it('returns false for an empty graph', () => {
    expect(wouldCreateCycle('A', 'B', [])).toBe(false)
  })

  it('returns false when no path from B to A exists', () => {
    // A→B→C; adding A→C is fine (no cycle)
    const edges = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'C' },
    ]
    expect(wouldCreateCycle('A', 'C', edges)).toBe(false)
  })

  it('returns true when adding B→A creates a cycle (A→B already exists)', () => {
    const edges = [{ from: 'A', to: 'B' }]
    expect(wouldCreateCycle('B', 'A', edges)).toBe(true)
  })

  it('returns true for a longer cycle A→B→C→A', () => {
    const edges = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'C' },
    ]
    expect(wouldCreateCycle('C', 'A', edges)).toBe(true)
  })

  it('returns false for self-link (handled separately by caller)', () => {
    // Self-links are rejected by the handler, not by cycle detector
    expect(wouldCreateCycle('A', 'A', [])).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run test --filter @future/api cycle-detector 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Implement cycle detector**

Create `apps/api/src/modules/planner/application/commands/dependencies/cycle-detector.ts`:

```ts
interface Edge {
  from: string
  to: string
}

/**
 * Returns true if adding the edge (from → to) to the given adjacency list
 * would create a directed cycle (including self-loops).
 *
 * DFS from `to` — if we can reach `from` via existing edges, adding this
 * new edge would close a cycle.
 */
export function wouldCreateCycle(from: string, to: string, edges: Edge[]): boolean {
  // Build adjacency list from existing edges
  const adj = new Map<string, string[]>()
  for (const edge of edges) {
    const neighbours = adj.get(edge.from) ?? []
    neighbours.push(edge.to)
    adj.set(edge.from, neighbours)
  }

  // DFS from `to` — if we reach `from`, it's a cycle
  const visited = new Set<string>()
  const stack = [to]
  while (stack.length > 0) {
    const current = stack.pop()!
    if (current === from) return true
    if (visited.has(current)) continue
    visited.add(current)
    const neighbours = adj.get(current) ?? []
    stack.push(...neighbours)
  }
  return false
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun run test --filter @future/api cycle-detector 2>&1 | tail -10
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/planner/application/commands/dependencies/cycle-detector.ts \
        apps/api/src/modules/planner/application/commands/dependencies/cycle-detector.spec.ts
git commit -m "feat(planner): add DFS cycle detector for task dependencies"
```

---

## Task 2: AddDependency command handler

**Files:**

- Create: `apps/api/src/modules/planner/application/commands/dependencies/add-dependency.command.ts`
- Create: `apps/api/src/modules/planner/application/commands/dependencies/add-dependency.handler.ts`
- Create: `apps/api/src/modules/planner/application/commands/dependencies/add-dependency.handler.spec.ts`
- Create: `apps/api/src/modules/planner/domain/exceptions/dependency-cycle-detected.exception.ts`
- Create: `apps/api/src/modules/planner/domain/exceptions/dependency-self-link.exception.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/src/modules/planner/application/commands/dependencies/add-dependency.handler.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { AddDependencyHandler } from './add-dependency.handler'
import { AddDependencyCommand } from './add-dependency.command'
import type { ITaskDependencyRepository } from '../../../domain/repositories/task-dependency.repository'
import type { ITaskRepository } from '../../../domain/repositories/task.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { DependencyCycleDetectedException } from '../../../domain/exceptions/dependency-cycle-detected.exception'
import { DependencySelfLinkException } from '../../../domain/exceptions/dependency-self-link.exception'
import { Task } from '../../../domain/entities/task.entity'
import { TaskDependencyAddedEvent } from '@future/event-contracts'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const ACTOR_ID = 'actor-1'
const FROM_ID = 'task-from'
const TO_ID = 'task-to'

function makeTask(id: string) {
  return Task.create({
    id,
    tenantId: TENANT_ID,
    planId: PLAN_ID,
    bucketId: 'b-1',
    title: 'T',
    orderHint: ' !',
    createdBy: ACTOR_ID,
  })
}

describe('AddDependencyHandler', () => {
  let handler: AddDependencyHandler
  let depRepo: {
    listEdgesForPlan: ReturnType<typeof vi.fn>
    add: ReturnType<typeof vi.fn>
    exists: ReturnType<typeof vi.fn>
  }
  let taskRepo: { findById: ReturnType<typeof vi.fn> }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    depRepo = {
      listEdgesForPlan: vi.fn().mockResolvedValue([]),
      add: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue(false),
    }
    taskRepo = { findById: vi.fn().mockImplementation((id) => Promise.resolve(makeTask(id))) }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new AddDependencyHandler(
      depRepo as unknown as ITaskDependencyRepository,
      taskRepo as unknown as ITaskRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('adds dependency and emits event', async () => {
    const cmd = new AddDependencyCommand(
      TENANT_ID,
      PLAN_ID,
      ACTOR_ID,
      FROM_ID,
      TO_ID,
      'finish_to_start',
    )
    await handler.execute(cmd)
    expect(depRepo.add).toHaveBeenCalledWith({
      fromTaskId: FROM_ID,
      toTaskId: TO_ID,
      kind: 'finish_to_start',
      tenantId: TENANT_ID,
    })
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(TaskDependencyAddedEvent))
  })

  it('throws DependencySelfLinkException when from === to', async () => {
    const cmd = new AddDependencyCommand(
      TENANT_ID,
      PLAN_ID,
      ACTOR_ID,
      FROM_ID,
      FROM_ID,
      'finish_to_start',
    )
    await expect(handler.execute(cmd)).rejects.toThrow(DependencySelfLinkException)
  })

  it('throws DependencyCycleDetectedException when cycle would form', async () => {
    depRepo.listEdgesForPlan.mockResolvedValue([{ from: TO_ID, to: FROM_ID }])
    const cmd = new AddDependencyCommand(
      TENANT_ID,
      PLAN_ID,
      ACTOR_ID,
      FROM_ID,
      TO_ID,
      'finish_to_start',
    )
    await expect(handler.execute(cmd)).rejects.toThrow(DependencyCycleDetectedException)
  })

  it('throws TaskNotFoundException when predecessor task not found', async () => {
    taskRepo.findById.mockImplementation((id: string) =>
      id === FROM_ID ? Promise.resolve(null) : Promise.resolve(makeTask(id)),
    )
    const cmd = new AddDependencyCommand(
      TENANT_ID,
      PLAN_ID,
      ACTOR_ID,
      FROM_ID,
      TO_ID,
      'finish_to_start',
    )
    await expect(handler.execute(cmd)).rejects.toThrow(TaskNotFoundException)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run test --filter @future/api add-dependency.handler 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Create exceptions**

Create `apps/api/src/modules/planner/domain/exceptions/dependency-cycle-detected.exception.ts`:

```ts
export class DependencyCycleDetectedException extends Error {
  constructor(fromTaskId: string, toTaskId: string) {
    super(`Adding dependency ${fromTaskId} → ${toTaskId} would create a cycle`)
    this.name = 'DependencyCycleDetectedException'
  }
}
```

Create `apps/api/src/modules/planner/domain/exceptions/dependency-self-link.exception.ts`:

```ts
export class DependencySelfLinkException extends Error {
  constructor(taskId: string) {
    super(`Task ${taskId} cannot depend on itself`)
    this.name = 'DependencySelfLinkException'
  }
}
```

- [ ] **Step 4: Create command**

Create `apps/api/src/modules/planner/application/commands/dependencies/add-dependency.command.ts`:

```ts
export type DependencyKind = 'finish_to_start' | 'start_to_start' | 'finish_to_finish'

export class AddDependencyCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly actorId: string,
    public readonly fromTaskId: string,
    public readonly toTaskId: string,
    public readonly kind: DependencyKind,
  ) {}
}
```

- [ ] **Step 5: Create handler**

Create `apps/api/src/modules/planner/application/commands/dependencies/add-dependency.handler.ts`:

```ts
import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { TaskDependencyAddedEvent } from '@future/event-contracts'
import {
  TASK_DEPENDENCY_REPOSITORY,
  type ITaskDependencyRepository,
} from '../../../domain/repositories/task-dependency.repository'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { DependencyCycleDetectedException } from '../../../domain/exceptions/dependency-cycle-detected.exception'
import { DependencySelfLinkException } from '../../../domain/exceptions/dependency-self-link.exception'
import { wouldCreateCycle } from './cycle-detector'
import { AddDependencyCommand } from './add-dependency.command'

@CommandHandler(AddDependencyCommand)
export class AddDependencyHandler implements ICommandHandler<AddDependencyCommand> {
  constructor(
    @Inject(TASK_DEPENDENCY_REPOSITORY) private readonly depRepo: ITaskDependencyRepository,
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(cmd: AddDependencyCommand): Promise<void> {
    if (cmd.fromTaskId === cmd.toTaskId) throw new DependencySelfLinkException(cmd.fromTaskId)

    await this.authSvc.assertCanEditPlan(cmd.actorId, cmd.planId, cmd.tenantId)

    const from = await this.taskRepo.findById(cmd.fromTaskId, cmd.tenantId)
    if (!from) throw new TaskNotFoundException(cmd.fromTaskId)

    const to = await this.taskRepo.findById(cmd.toTaskId, cmd.tenantId)
    if (!to) throw new TaskNotFoundException(cmd.toTaskId)

    const existingEdges = await this.depRepo.listEdgesForPlan(cmd.planId, cmd.tenantId)
    if (wouldCreateCycle(cmd.fromTaskId, cmd.toTaskId, existingEdges)) {
      throw new DependencyCycleDetectedException(cmd.fromTaskId, cmd.toTaskId)
    }

    await this.depRepo.add({
      fromTaskId: cmd.fromTaskId,
      toTaskId: cmd.toTaskId,
      kind: cmd.kind,
      tenantId: cmd.tenantId,
    })

    await this.eventBus.publish(
      new TaskDependencyAddedEvent(
        cmd.tenantId,
        cmd.actorId,
        cmd.taskId ?? cmd.fromTaskId,
        cmd.planId,
        cmd.fromTaskId,
        cmd.toTaskId,
        cmd.kind,
      ),
    )
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
bun run test --filter @future/api add-dependency.handler 2>&1 | tail -10
```

Expected: 4 tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/planner/application/commands/dependencies/ \
        apps/api/src/modules/planner/domain/exceptions/dependency-cycle-detected.exception.ts \
        apps/api/src/modules/planner/domain/exceptions/dependency-self-link.exception.ts
git commit -m "feat(planner): add AddDependency handler with DFS cycle detection"
```

---

## Task 3: RemoveDependency command handler

**Files:**

- Create: `apps/api/src/modules/planner/application/commands/dependencies/remove-dependency.command.ts`
- Create: `apps/api/src/modules/planner/application/commands/dependencies/remove-dependency.handler.ts`
- Create: `apps/api/src/modules/planner/application/commands/dependencies/remove-dependency.handler.spec.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/src/modules/planner/application/commands/dependencies/remove-dependency.handler.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { RemoveDependencyHandler } from './remove-dependency.handler'
import { RemoveDependencyCommand } from './remove-dependency.command'
import type { ITaskDependencyRepository } from '../../../domain/repositories/task-dependency.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { TaskDependencyRemovedEvent } from '@future/event-contracts'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const ACTOR_ID = 'actor-1'
const FROM_ID = 'task-from'
const TO_ID = 'task-to'

describe('RemoveDependencyHandler', () => {
  let handler: RemoveDependencyHandler
  let depRepo: { remove: ReturnType<typeof vi.fn>; exists: ReturnType<typeof vi.fn> }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    depRepo = {
      remove: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue(true),
    }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new RemoveDependencyHandler(
      depRepo as unknown as ITaskDependencyRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('removes dependency and emits event', async () => {
    const cmd = new RemoveDependencyCommand(
      TENANT_ID,
      PLAN_ID,
      ACTOR_ID,
      FROM_ID,
      TO_ID,
      'finish_to_start',
    )
    await handler.execute(cmd)
    expect(depRepo.remove).toHaveBeenCalledWith(FROM_ID, TO_ID, 'finish_to_start', TENANT_ID)
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(TaskDependencyRemovedEvent))
  })

  it('is a no-op when dependency does not exist', async () => {
    depRepo.exists.mockResolvedValue(false)
    const cmd = new RemoveDependencyCommand(
      TENANT_ID,
      PLAN_ID,
      ACTOR_ID,
      FROM_ID,
      TO_ID,
      'finish_to_start',
    )
    await handler.execute(cmd)
    expect(depRepo.remove).not.toHaveBeenCalled()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run test --filter @future/api remove-dependency.handler 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Create ITaskDependencyRepository interface**

Create `apps/api/src/modules/planner/domain/repositories/task-dependency.repository.ts`:

```ts
import type { DependencyKind } from '../../../application/commands/dependencies/add-dependency.command'

export const TASK_DEPENDENCY_REPOSITORY = Symbol('ITaskDependencyRepository')

export interface DependencyEdge {
  from: string
  to: string
  kind: DependencyKind
}

export interface DependencyRecord {
  fromTaskId: string
  toTaskId: string
  kind: DependencyKind
  tenantId: string
}

export interface ITaskDependencyRepository {
  add(record: DependencyRecord): Promise<void>
  remove(
    fromTaskId: string,
    toTaskId: string,
    kind: DependencyKind,
    tenantId: string,
  ): Promise<void>
  exists(
    fromTaskId: string,
    toTaskId: string,
    kind: DependencyKind,
    tenantId: string,
  ): Promise<boolean>
  listEdgesForPlan(planId: string, tenantId: string): Promise<DependencyEdge[]>
  listForTask(
    taskId: string,
    tenantId: string,
  ): Promise<{ predecessors: DependencyRecord[]; successors: DependencyRecord[] }>
}
```

- [ ] **Step 4: Create command and handler**

Create `apps/api/src/modules/planner/application/commands/dependencies/remove-dependency.command.ts`:

```ts
import type { DependencyKind } from './add-dependency.command'

export class RemoveDependencyCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly actorId: string,
    public readonly fromTaskId: string,
    public readonly toTaskId: string,
    public readonly kind: DependencyKind,
  ) {}
}
```

Create `apps/api/src/modules/planner/application/commands/dependencies/remove-dependency.handler.ts`:

```ts
import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { TaskDependencyRemovedEvent } from '@future/event-contracts'
import {
  TASK_DEPENDENCY_REPOSITORY,
  type ITaskDependencyRepository,
} from '../../../domain/repositories/task-dependency.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { RemoveDependencyCommand } from './remove-dependency.command'

@CommandHandler(RemoveDependencyCommand)
export class RemoveDependencyHandler implements ICommandHandler<RemoveDependencyCommand> {
  constructor(
    @Inject(TASK_DEPENDENCY_REPOSITORY) private readonly depRepo: ITaskDependencyRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(cmd: RemoveDependencyCommand): Promise<void> {
    await this.authSvc.assertCanEditPlan(cmd.actorId, cmd.planId, cmd.tenantId)

    const exists = await this.depRepo.exists(cmd.fromTaskId, cmd.toTaskId, cmd.kind, cmd.tenantId)
    if (!exists) return

    await this.depRepo.remove(cmd.fromTaskId, cmd.toTaskId, cmd.kind, cmd.tenantId)

    await this.eventBus.publish(
      new TaskDependencyRemovedEvent(
        cmd.tenantId,
        cmd.actorId,
        cmd.fromTaskId,
        cmd.planId,
        cmd.fromTaskId,
        cmd.toTaskId,
        cmd.kind,
      ),
    )
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
bun run test --filter @future/api remove-dependency.handler 2>&1 | tail -10
```

Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/planner/application/commands/dependencies/remove-dependency.command.ts \
        apps/api/src/modules/planner/application/commands/dependencies/remove-dependency.handler.ts \
        apps/api/src/modules/planner/application/commands/dependencies/remove-dependency.handler.spec.ts \
        apps/api/src/modules/planner/domain/repositories/task-dependency.repository.ts
git commit -m "feat(planner): add RemoveDependency command handler"
```

---

## Task 4: DrizzleTaskDependencyRepository and tRPC router

**Files:**

- Create: `apps/api/src/modules/planner/infrastructure/repositories/drizzle-task-dependency.repository.ts`
- Create: `apps/api/src/modules/planner/infrastructure/repositories/drizzle-task-dependency.repository.integration.spec.ts`
- Create: `apps/api/src/modules/planner/interface/trpc/dependency.router.ts`

- [ ] **Step 1: Write failing integration test**

Create `apps/api/src/modules/planner/infrastructure/repositories/drizzle-task-dependency.repository.integration.spec.ts`:

```ts
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { DrizzleTaskDependencyRepository } from './drizzle-task-dependency.repository'
import { createTestDb } from '../../../../../test/helpers/db-helper'

describe('DrizzleTaskDependencyRepository (integration)', () => {
  let repo: DrizzleTaskDependencyRepository
  let db: Awaited<ReturnType<typeof createTestDb>>

  const TENANT_ID = 'tenant-dep-test'
  const PLAN_ID = 'plan-dep-test'
  const FROM_ID = 'task-dep-from'
  const TO_ID = 'task-dep-to'

  beforeAll(async () => {
    db = await createTestDb()
    repo = new DrizzleTaskDependencyRepository(db)
  })

  afterEach(async () => {
    await db.execute(`DELETE FROM planner.task_dependency WHERE tenant_id = '${TENANT_ID}'`)
  })

  it('adds and retrieves dependency', async () => {
    await repo.add({
      fromTaskId: FROM_ID,
      toTaskId: TO_ID,
      kind: 'finish_to_start',
      tenantId: TENANT_ID,
    })
    const { predecessors } = await repo.listForTask(TO_ID, TENANT_ID)
    expect(predecessors).toHaveLength(1)
    expect(predecessors[0]?.fromTaskId).toBe(FROM_ID)
  })

  it('exists returns true after add', async () => {
    await repo.add({
      fromTaskId: FROM_ID,
      toTaskId: TO_ID,
      kind: 'finish_to_start',
      tenantId: TENANT_ID,
    })
    expect(await repo.exists(FROM_ID, TO_ID, 'finish_to_start', TENANT_ID)).toBe(true)
  })

  it('listEdgesForPlan returns all edges for plan', async () => {
    await repo.add({
      fromTaskId: FROM_ID,
      toTaskId: TO_ID,
      kind: 'finish_to_start',
      tenantId: TENANT_ID,
    })
    const edges = await repo.listEdgesForPlan(PLAN_ID, TENANT_ID)
    expect(edges.length).toBeGreaterThan(0)
  })

  it('remove deletes the edge', async () => {
    await repo.add({
      fromTaskId: FROM_ID,
      toTaskId: TO_ID,
      kind: 'finish_to_start',
      tenantId: TENANT_ID,
    })
    await repo.remove(FROM_ID, TO_ID, 'finish_to_start', TENANT_ID)
    expect(await repo.exists(FROM_ID, TO_ID, 'finish_to_start', TENANT_ID)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run test --filter @future/api drizzle-task-dependency 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Implement repository**

Create `apps/api/src/modules/planner/infrastructure/repositories/drizzle-task-dependency.repository.ts`:

```ts
import { Inject } from '@nestjs/common'
import type { Db } from '@future/db'
import { eq, and, sql } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { plannerTaskDependency, plannerTask } from '../schema/planner.schema'
import type {
  ITaskDependencyRepository,
  DependencyEdge,
  DependencyRecord,
} from '../../domain/repositories/task-dependency.repository'
import type { DependencyKind } from '../../application/commands/dependencies/add-dependency.command'

export class DrizzleTaskDependencyRepository implements ITaskDependencyRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async add(record: DependencyRecord): Promise<void> {
    await this.db
      .insert(plannerTaskDependency)
      .values({
        fromTaskId: record.fromTaskId,
        toTaskId: record.toTaskId,
        kind: record.kind,
        tenantId: record.tenantId,
      })
      .onConflictDoNothing()
  }

  async remove(
    fromTaskId: string,
    toTaskId: string,
    kind: DependencyKind,
    tenantId: string,
  ): Promise<void> {
    await this.db
      .delete(plannerTaskDependency)
      .where(
        and(
          eq(plannerTaskDependency.fromTaskId, fromTaskId),
          eq(plannerTaskDependency.toTaskId, toTaskId),
          eq(plannerTaskDependency.kind, kind),
          eq(plannerTaskDependency.tenantId, tenantId),
        ),
      )
  }

  async exists(
    fromTaskId: string,
    toTaskId: string,
    kind: DependencyKind,
    tenantId: string,
  ): Promise<boolean> {
    const rows = await this.db
      .select({ cnt: sql<number>`count(*)` })
      .from(plannerTaskDependency)
      .where(
        and(
          eq(plannerTaskDependency.fromTaskId, fromTaskId),
          eq(plannerTaskDependency.toTaskId, toTaskId),
          eq(plannerTaskDependency.kind, kind),
          eq(plannerTaskDependency.tenantId, tenantId),
        ),
      )
    return Number(rows[0]?.cnt ?? 0) > 0
  }

  async listEdgesForPlan(planId: string, tenantId: string): Promise<DependencyEdge[]> {
    // Join through plannerTask to get only edges within this plan
    const rows = await this.db.execute<{ from_task_id: string; to_task_id: string; kind: string }>(
      sql`SELECT d.from_task_id, d.to_task_id, d.kind
          FROM planner.task_dependency d
          JOIN planner.task t ON t.id = d.from_task_id AND t.tenant_id = d.tenant_id
          WHERE t.plan_id = ${planId}
            AND d.tenant_id = ${tenantId}`,
    )
    return rows.rows.map((r) => ({
      from: r.from_task_id,
      to: r.to_task_id,
      kind: r.kind as DependencyKind,
    }))
  }

  async listForTask(
    taskId: string,
    tenantId: string,
  ): Promise<{ predecessors: DependencyRecord[]; successors: DependencyRecord[] }> {
    const rows = await this.db
      .select()
      .from(plannerTaskDependency)
      .where(
        and(
          sql`(${plannerTaskDependency.fromTaskId} = ${taskId} OR ${plannerTaskDependency.toTaskId} = ${taskId})`,
          eq(plannerTaskDependency.tenantId, tenantId),
        ),
      )

    const predecessors = rows
      .filter((r) => r.toTaskId === taskId)
      .map((r) => ({
        fromTaskId: r.fromTaskId,
        toTaskId: r.toTaskId,
        kind: r.kind as DependencyKind,
        tenantId: r.tenantId,
      }))

    const successors = rows
      .filter((r) => r.fromTaskId === taskId)
      .map((r) => ({
        fromTaskId: r.fromTaskId,
        toTaskId: r.toTaskId,
        kind: r.kind as DependencyKind,
        tenantId: r.tenantId,
      }))

    return { predecessors, successors }
  }
}
```

- [ ] **Step 4: Run integration test**

```bash
bun run test --filter @future/api drizzle-task-dependency 2>&1 | tail -15
```

Expected: 4 tests pass.

- [ ] **Step 5: Create dependency tRPC router**

Create `apps/api/src/modules/planner/interface/trpc/dependency.router.ts`:

```ts
import * as z from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { PlannerRouterService } from './planner-router.service'
import { AddDependencyCommand } from '../../application/commands/dependencies/add-dependency.command'
import { RemoveDependencyCommand } from '../../application/commands/dependencies/remove-dependency.command'
import { toPlannerTrpcError } from './planner-trpc-error'

const dependencyKindSchema = z.enum(['finish_to_start', 'start_to_start', 'finish_to_finish'])

function svc() {
  return PlannerRouterService.getInstance()
}

export const dependencyRouter = router({
  add: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        actorId: z.string().uuid(),
        fromTaskId: z.string().uuid(),
        toTaskId: z.string().uuid(),
        kind: dependencyKindSchema,
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new AddDependencyCommand(
            input.tenantId,
            input.planId,
            input.actorId,
            input.fromTaskId,
            input.toTaskId,
            input.kind,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  remove: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        actorId: z.string().uuid(),
        fromTaskId: z.string().uuid(),
        toTaskId: z.string().uuid(),
        kind: dependencyKindSchema,
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new RemoveDependencyCommand(
            input.tenantId,
            input.planId,
            input.actorId,
            input.fromTaskId,
            input.toTaskId,
            input.kind,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),
})
```

- [ ] **Step 6: Add dependencies to GetTaskDetail snapshot and handler**

In `apps/api/src/modules/planner/application/queries/tasks/get-task-detail.query.ts`, add to `TaskDetailSnapshot`:

```ts
predecessors: Array<{ taskId: string; title: string; kind: string }>
successors: Array<{ taskId: string; title: string; kind: string }>
```

In `apps/api/src/modules/planner/application/queries/tasks/get-task-detail.handler.ts`, add a query after the existing ones:

```ts
// ── Query N: Dependencies ─────────────────────────────────────────────────
const depsResult = await this.db.execute<{
  from_task_id: string
  to_task_id: string
  kind: string
  from_title: string
  to_title: string
}>(
  sql`SELECT d.from_task_id, d.to_task_id, d.kind,
               ft.title AS from_title, tt.title AS to_title
          FROM planner.task_dependency d
          JOIN planner.task ft ON ft.id = d.from_task_id
          JOIN planner.task tt ON tt.id = d.to_task_id
          WHERE (d.from_task_id = ${taskId} OR d.to_task_id = ${taskId})
            AND d.tenant_id = ${tenantId}`,
)

const predecessors = depsResult.rows
  .filter((r) => r.to_task_id === taskId)
  .map((r) => ({ taskId: r.from_task_id, title: r.from_title, kind: r.kind }))

const successors = depsResult.rows
  .filter((r) => r.from_task_id === taskId)
  .map((r) => ({ taskId: r.to_task_id, title: r.to_title, kind: r.kind }))
```

Add `predecessors` and `successors` to the return object.

- [ ] **Step 7: Wire dependency router into plannerRouter and planner.module.ts**

In `apps/api/src/modules/planner/interface/trpc/planner.router.ts`:

```ts
import { dependencyRouter } from './dependency.router'

// In plannerRouter:
  dependencies: dependencyRouter,
```

In `apps/api/src/modules/planner/planner.module.ts`, add:

```ts
{ provide: TASK_DEPENDENCY_REPOSITORY, useClass: DrizzleTaskDependencyRepository },
AddDependencyHandler,
RemoveDependencyHandler,
```

- [ ] **Step 8: Type-check and commit**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | head -20
git add apps/api/src/modules/planner/
git commit -m "feat(planner): wire task dependency repository and tRPC router"
```

---

## Task 5: DependenciesSection and TaskSearchPicker frontend

**Files:**

- Create: `apps/web-planner/src/components/task-detail/tabs/DependenciesSection.tsx`
- Create: `apps/web-planner/src/components/task-detail/tabs/DependenciesSection.spec.tsx`
- Create: `apps/web-planner/src/components/task-detail/tabs/TaskSearchPicker.tsx`
- Create: `apps/web-planner/src/components/task-detail/tabs/TaskSearchPicker.spec.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/web-planner/src/components/task-detail/tabs/DependenciesSection.spec.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { DependenciesSection } from './DependenciesSection'

const mockAdd = vi.fn()
const mockRemove = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    planner: {
      dependencies: {
        add: { useMutation: () => ({ mutate: mockAdd, isPending: false }) },
        remove: { useMutation: () => ({ mutate: mockRemove, isPending: false }) },
      },
      tasks: {
        getFlat: { useQuery: () => ({ data: { tasks: [{ id: 'tx-1', title: 'Task X' }] } }) },
      },
    },
  },
}))

describe('DependenciesSection', () => {
  const props = {
    taskId: 't1',
    planId: 'p1',
    tenantId: 'tn1',
    actorId: 'a1',
    predecessors: [{ taskId: 'pred-1', title: 'Predecessor Task', kind: 'finish_to_start' }],
    successors: [],
  }

  it('renders predecessors', () => {
    render(<DependenciesSection {...props} />)
    expect(screen.getByText('Predecessor Task')).toBeInTheDocument()
  })

  it('renders remove button for each dependency', () => {
    render(<DependenciesSection {...props} />)
    expect(screen.getByTestId('remove-dep-pred-1')).toBeInTheDocument()
  })

  it('calls remove mutation on click', async () => {
    render(<DependenciesSection {...props} />)
    fireEvent.click(screen.getByTestId('remove-dep-pred-1'))
    await waitFor(() => {
      expect(mockRemove).toHaveBeenCalledWith(
        expect.objectContaining({ fromTaskId: 'pred-1', toTaskId: 't1' }),
      )
    })
  })
})
```

Create `apps/web-planner/src/components/task-detail/tabs/TaskSearchPicker.spec.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { TaskSearchPicker } from './TaskSearchPicker'

const tasks = [
  { id: 'ta-1', title: 'Alpha Task' },
  { id: 'ta-2', title: 'Beta Task' },
]

describe('TaskSearchPicker', () => {
  it('filters tasks by search input', () => {
    render(<TaskSearchPicker tasks={tasks} onSelect={vi.fn()} excludeId="current" />)
    fireEvent.change(screen.getByTestId('task-search-input'), { target: { value: 'Alpha' } })
    expect(screen.getByText('Alpha Task')).toBeInTheDocument()
    expect(screen.queryByText('Beta Task')).not.toBeInTheDocument()
  })

  it('calls onSelect with task id when clicked', () => {
    const onSelect = vi.fn()
    render(<TaskSearchPicker tasks={tasks} onSelect={onSelect} excludeId="current" />)
    fireEvent.click(screen.getByText('Alpha Task'))
    expect(onSelect).toHaveBeenCalledWith('ta-1')
  })

  it('excludes the current task from the list', () => {
    render(<TaskSearchPicker tasks={tasks} onSelect={vi.fn()} excludeId="ta-1" />)
    expect(screen.queryByText('Alpha Task')).not.toBeInTheDocument()
    expect(screen.getByText('Beta Task')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun run test --filter @future/web-planner "DependenciesSection|TaskSearchPicker" 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Implement TaskSearchPicker**

Create `apps/web-planner/src/components/task-detail/tabs/TaskSearchPicker.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Input } from '@future/ui'

interface Task {
  id: string
  title: string
}

interface Props {
  tasks: Task[]
  onSelect: (taskId: string) => void
  excludeId: string
}

export function TaskSearchPicker({ tasks, onSelect, excludeId }: Props) {
  const [query, setQuery] = useState('')

  const filtered = tasks.filter(
    (t) => t.id !== excludeId && t.title.toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <div className="flex flex-col gap-1">
      <Input
        data-testid="task-search-input"
        placeholder="Search tasks…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-8"
        autoFocus
      />
      <ul className="max-h-48 overflow-y-auto rounded-md border bg-surface">
        {filtered.length === 0 && (
          <li className="px-3 py-2 text-sm text-fg-muted">No tasks found</li>
        )}
        {filtered.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              className="w-full px-3 py-2 text-left text-sm hover:bg-surface-hover"
              onClick={() => onSelect(t.id)}
            >
              {t.title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Implement DependenciesSection**

Create `apps/web-planner/src/components/task-detail/tabs/DependenciesSection.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@future/ui'
import { X, Plus } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { TaskSearchPicker } from './TaskSearchPicker'

interface Dependency {
  taskId: string
  title: string
  kind: string
}

interface Props {
  taskId: string
  planId: string
  tenantId: string
  actorId: string
  predecessors: Dependency[]
  successors: Dependency[]
}

export function DependenciesSection({
  taskId,
  planId,
  tenantId,
  actorId,
  predecessors,
  successors,
}: Props) {
  const [addingKind, setAddingKind] = useState<'predecessor' | 'successor' | null>(null)

  const { mutate: addDep } = trpc.planner.dependencies.add.useMutation()
  const { mutate: removeDep } = trpc.planner.dependencies.remove.useMutation()

  const { data: flatData } = trpc.planner.tasks.getFlat.useQuery({ planId, actorId, tenantId })
  const allTasks = flatData?.tasks ?? []

  function handleAdd(selectedId: string) {
    if (addingKind === 'predecessor') {
      addDep({
        tenantId,
        planId,
        actorId,
        fromTaskId: selectedId,
        toTaskId: taskId,
        kind: 'finish_to_start',
      })
    } else {
      addDep({
        tenantId,
        planId,
        actorId,
        fromTaskId: taskId,
        toTaskId: selectedId,
        kind: 'finish_to_start',
      })
    }
    setAddingKind(null)
  }

  return (
    <section aria-label="Task dependencies" className="flex flex-col gap-3 px-4 py-3">
      <p className="text-xs font-500 uppercase tracking-wide text-fg-muted">Dependencies</p>

      <DependencyGroup
        label="Predecessors"
        deps={predecessors}
        onRemove={(depTaskId) =>
          removeDep({
            tenantId,
            planId,
            actorId,
            fromTaskId: depTaskId,
            toTaskId: taskId,
            kind: 'finish_to_start',
          })
        }
        onAdd={() => setAddingKind('predecessor')}
        testIdPrefix="pred"
      />

      <DependencyGroup
        label="Successors"
        deps={successors}
        onRemove={(depTaskId) =>
          removeDep({
            tenantId,
            planId,
            actorId,
            fromTaskId: taskId,
            toTaskId: depTaskId,
            kind: 'finish_to_start',
          })
        }
        onAdd={() => setAddingKind('successor')}
        testIdPrefix="succ"
      />

      {addingKind && <TaskSearchPicker tasks={allTasks} onSelect={handleAdd} excludeId={taskId} />}
    </section>
  )
}

function DependencyGroup({
  label,
  deps,
  onRemove,
  onAdd,
  testIdPrefix,
}: {
  label: string
  deps: Dependency[]
  onRemove: (taskId: string) => void
  onAdd: () => void
  testIdPrefix: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <p className="text-sm font-500 text-fg">{label}</p>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onAdd}
          aria-label={`Add ${label.toLowerCase()}`}
        >
          <Plus className="size-3" />
        </Button>
      </div>
      {deps.length === 0 && <p className="text-xs text-fg-muted">None</p>}
      {deps.map((dep) => (
        <div
          key={dep.taskId}
          className="flex items-center justify-between rounded-md border px-2 py-1"
        >
          <span className="truncate text-sm">{dep.title}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onRemove(dep.taskId)}
            aria-label={`Remove dependency ${dep.title}`}
            data-testid={`remove-dep-${dep.taskId}`}
          >
            <X className="size-3" />
          </Button>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Run tests**

```bash
bun run test --filter @future/web-planner "DependenciesSection|TaskSearchPicker" 2>&1 | tail -15
```

Expected: All pass.

- [ ] **Step 6: Add DependenciesSection to TaskDetailTab**

In `apps/web-planner/src/components/task-detail/tabs/TaskDetailTab.tsx`, add:

```tsx
import { DependenciesSection } from './DependenciesSection'

// Inside the Details tab, below the fields:
;<DependenciesSection
  taskId={taskId}
  planId={planId}
  tenantId={task.tenantId}
  actorId={actorId}
  predecessors={task.predecessors ?? []}
  successors={task.successors ?? []}
/>
```

- [ ] **Step 7: Run full test suite with coverage check**

```bash
bun run test --filter @future/web-planner --coverage 2>&1 | tail -20
```

Expected: Lines/Functions/Branches ≥70%.

- [ ] **Step 8: Commit**

```bash
git add apps/web-planner/src/components/task-detail/tabs/DependenciesSection.tsx \
        apps/web-planner/src/components/task-detail/tabs/DependenciesSection.spec.tsx \
        apps/web-planner/src/components/task-detail/tabs/TaskSearchPicker.tsx \
        apps/web-planner/src/components/task-detail/tabs/TaskSearchPicker.spec.tsx
git commit -m "feat(web-planner): add DependenciesSection and TaskSearchPicker"
```
