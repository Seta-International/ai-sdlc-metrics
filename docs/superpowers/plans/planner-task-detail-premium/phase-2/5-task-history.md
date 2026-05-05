# Phase 2 / Plan 5 — Task History, PR Prep, and Phase 2 Close

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the task history feature end-to-end — a `TaskHistoryRecorder` event handler that appends to `plannerTaskHistory`, a paginated `GetTaskHistory` query, a `tasks.getHistory` tRPC procedure, and the `TaskHistoryPane` slide-in panel on the frontend. Then wire the Phase 1 Clock icon to open it, run the full test suite, and open the Phase 2 PR.

**Architecture:**

- `TaskHistoryRecorder` listens to existing `TaskUpdatedEvent`, `TaskProgressSetEvent`, `TaskAssignedEvent`, `TaskUnassignedEvent`, `TaskMovedEvent`, `TaskLabelAppliedEvent`, `TaskLabelRemovedEvent`, `TaskChecklistItemCheckedEvent`, `TaskCustomFieldUpdatedEvent`, `TaskSprintAssignedEvent`, `TaskDependencyAddedEvent`, and `TaskDependencyRemovedEvent` and inserts one row per relevant event into `plannerTaskHistory`.
- `GetTaskHistoryQuery` is paginated — it accepts `cursor` (a `changedAt` ISO timestamp + `id` for tie-breaking) and returns the next page of history rows.
- Frontend: `TaskHistoryPane` is a slide-in panel (right side, `translate-x` animation). The `TaskDetailPanel` passes `onHistoryOpen` to `TaskPanelHeader`, which activates the disabled Clock icon introduced in Phase 1.

**Tech Stack:** NestJS CQRS EventsHandler, Drizzle ORM, tRPC, `@future/ui`, React Query cursor pagination, vitest

**Prereq:** Phase 2 / Plans 1–4 merged. `plannerTaskHistory` table and `ITaskHistoryRepository` interface exist (Plan 1).

---

## Exit Criteria

- [ ] `TaskHistoryRecorder` listens to all 11 events; unit test covers each handled event
- [ ] `GetTaskHistoryHandler` returns paginated history rows; unit test verifies SQL cursor
- [ ] `DrizzleTaskHistoryRepository` integration test against real DB
- [ ] `tasks.getHistory` tRPC procedure wired
- [ ] `TaskHistoryPane` renders history rows; infinite scroll loads next page
- [ ] Clock icon in `TaskPanelHeader` opens/closes `TaskHistoryPane` when `onHistoryOpen` is wired
- [ ] `bun run test --filter @future/api --coverage` ≥70%
- [ ] `bun run test --filter @future/web-planner --coverage` ≥70%
- [ ] `npx tsc --noEmit -p apps/web-planner/tsconfig.json` — no errors
- [ ] `bun run --filter @future/web-planner lint` — no errors
- [ ] PR opened on `feat/planner-task-detail-ui-ux`

---

## File Map

**Create:**

```
apps/api/src/modules/planner/application/event-handlers/
  task-history-recorder.handler.ts
  task-history-recorder.handler.spec.ts

apps/api/src/modules/planner/application/queries/tasks/
  get-task-history.query.ts
  get-task-history.handler.ts
  get-task-history.handler.spec.ts

apps/api/src/modules/planner/domain/repositories/
  task-history.repository.ts

apps/api/src/modules/planner/infrastructure/repositories/
  drizzle-task-history.repository.ts
  drizzle-task-history.repository.integration.spec.ts

apps/web-planner/src/components/task-detail/
  TaskHistoryPane.tsx
  TaskHistoryPane.spec.tsx
```

**Modify:**

```
apps/api/src/modules/planner/interface/trpc/task.router.ts
apps/api/src/modules/planner/planner.module.ts
apps/web-planner/src/components/task-detail/TaskDetailPanel.tsx
```

---

## Task 1: ITaskHistoryRepository and DrizzleTaskHistoryRepository

**Files:**

- Create: `apps/api/src/modules/planner/domain/repositories/task-history.repository.ts`
- Create: `apps/api/src/modules/planner/infrastructure/repositories/drizzle-task-history.repository.ts`
- Create: `apps/api/src/modules/planner/infrastructure/repositories/drizzle-task-history.repository.integration.spec.ts`

- [ ] **Step 1: Create ITaskHistoryRepository interface**

Create `apps/api/src/modules/planner/domain/repositories/task-history.repository.ts`:

```ts
export const TASK_HISTORY_REPOSITORY = Symbol('ITaskHistoryRepository')

export interface HistoryRecord {
  id: string
  taskId: string
  tenantId: string
  actorId: string
  field: string
  oldValue: unknown
  newValue: unknown
  changedAt: Date
}

export interface HistoryPage {
  items: HistoryRecord[]
  nextCursor: string | null
}

export interface ITaskHistoryRepository {
  append(record: HistoryRecord): Promise<void>
  listByTask(
    taskId: string,
    tenantId: string,
    opts: { cursor?: string; limit: number },
  ): Promise<HistoryPage>
}
```

- [ ] **Step 2: Write failing integration test**

Create `apps/api/src/modules/planner/infrastructure/repositories/drizzle-task-history.repository.integration.spec.ts`:

```ts
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { DrizzleTaskHistoryRepository } from './drizzle-task-history.repository'
import { createTestDb } from '../../../../../test/helpers/db-helper'

describe('DrizzleTaskHistoryRepository (integration)', () => {
  let repo: DrizzleTaskHistoryRepository
  let db: Awaited<ReturnType<typeof createTestDb>>

  const TENANT_ID = 'tenant-history-test'
  const TASK_ID = 'task-history-test'

  beforeAll(async () => {
    db = await createTestDb()
    repo = new DrizzleTaskHistoryRepository(db)
  })

  afterEach(async () => {
    await db.execute(`DELETE FROM planner.task_history WHERE tenant_id = '${TENANT_ID}'`)
  })

  it('appends and retrieves a history record', async () => {
    const now = new Date()
    await repo.append({
      id: 'h-1',
      taskId: TASK_ID,
      tenantId: TENANT_ID,
      actorId: 'a-1',
      field: 'priority',
      oldValue: 3,
      newValue: 1,
      changedAt: now,
    })
    const page = await repo.listByTask(TASK_ID, TENANT_ID, { limit: 10 })
    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.field).toBe('priority')
    expect(page.nextCursor).toBeNull()
  })

  it('paginates with cursor', async () => {
    const base = new Date('2026-01-01T00:00:00Z')
    await repo.append({
      id: 'h-a',
      taskId: TASK_ID,
      tenantId: TENANT_ID,
      actorId: 'a-1',
      field: 'title',
      oldValue: 'A',
      newValue: 'B',
      changedAt: new Date(base.getTime()),
    })
    await repo.append({
      id: 'h-b',
      taskId: TASK_ID,
      tenantId: TENANT_ID,
      actorId: 'a-1',
      field: 'priority',
      oldValue: 1,
      newValue: 3,
      changedAt: new Date(base.getTime() + 1000),
    })
    await repo.append({
      id: 'h-c',
      taskId: TASK_ID,
      tenantId: TENANT_ID,
      actorId: 'a-1',
      field: 'progress',
      oldValue: 0,
      newValue: 50,
      changedAt: new Date(base.getTime() + 2000),
    })

    const page1 = await repo.listByTask(TASK_ID, TENANT_ID, { limit: 2 })
    expect(page1.items).toHaveLength(2)
    expect(page1.nextCursor).not.toBeNull()

    const page2 = await repo.listByTask(TASK_ID, TENANT_ID, { cursor: page1.nextCursor!, limit: 2 })
    expect(page2.items).toHaveLength(1)
    expect(page2.nextCursor).toBeNull()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
bun run test --filter @future/api drizzle-task-history 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 4: Implement DrizzleTaskHistoryRepository**

Create `apps/api/src/modules/planner/infrastructure/repositories/drizzle-task-history.repository.ts`:

```ts
import { Inject } from '@nestjs/common'
import type { Db } from '@future/db'
import { eq, and, lt, or, sql } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { plannerTaskHistory } from '../schema/planner.schema'
import type {
  ITaskHistoryRepository,
  HistoryRecord,
  HistoryPage,
} from '../../domain/repositories/task-history.repository'

const DEFAULT_LIMIT = 20

export class DrizzleTaskHistoryRepository implements ITaskHistoryRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async append(record: HistoryRecord): Promise<void> {
    await this.db.insert(plannerTaskHistory).values({
      id: record.id,
      taskId: record.taskId,
      tenantId: record.tenantId,
      actorId: record.actorId,
      field: record.field,
      oldValue: record.oldValue as any,
      newValue: record.newValue as any,
      changedAt: record.changedAt,
    })
  }

  async listByTask(
    taskId: string,
    tenantId: string,
    opts: { cursor?: string; limit?: number },
  ): Promise<HistoryPage> {
    const limit = opts.limit ?? DEFAULT_LIMIT

    // Cursor format: ISO timestamp + ':' + id for stable tie-breaking
    let cursorDate: Date | null = null
    let cursorId: string | null = null
    if (opts.cursor) {
      const [isoStr, id] = opts.cursor.split(':')
      cursorDate = isoStr ? new Date(isoStr) : null
      cursorId = id ?? null
    }

    const whereClause = and(
      eq(plannerTaskHistory.taskId, taskId),
      eq(plannerTaskHistory.tenantId, tenantId),
      cursorDate && cursorId
        ? or(
            lt(plannerTaskHistory.changedAt, cursorDate),
            and(
              sql`${plannerTaskHistory.changedAt} = ${cursorDate}`,
              lt(plannerTaskHistory.id, cursorId),
            ),
          )
        : undefined,
    )

    const rows = await this.db
      .select()
      .from(plannerTaskHistory)
      .where(whereClause)
      .orderBy(sql`${plannerTaskHistory.changedAt} DESC, ${plannerTaskHistory.id} DESC`)
      .limit(limit + 1)

    const hasMore = rows.length > limit
    const items = hasMore ? rows.slice(0, limit) : rows

    const nextCursor =
      hasMore && items.length > 0
        ? `${items[items.length - 1]!.changedAt.toISOString()}:${items[items.length - 1]!.id}`
        : null

    return {
      items: items.map((r) => ({
        id: r.id,
        taskId: r.taskId,
        tenantId: r.tenantId,
        actorId: r.actorId,
        field: r.field,
        oldValue: r.oldValue,
        newValue: r.newValue,
        changedAt: r.changedAt,
      })),
      nextCursor,
    }
  }
}
```

- [ ] **Step 5: Run integration test**

```bash
bun run test --filter @future/api drizzle-task-history 2>&1 | tail -15
```

Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/planner/domain/repositories/task-history.repository.ts \
        apps/api/src/modules/planner/infrastructure/repositories/drizzle-task-history.repository.ts \
        apps/api/src/modules/planner/infrastructure/repositories/drizzle-task-history.repository.integration.spec.ts
git commit -m "feat(planner): implement DrizzleTaskHistoryRepository with cursor pagination"
```

---

## Task 2: TaskHistoryRecorder event handler

**Files:**

- Create: `apps/api/src/modules/planner/application/event-handlers/task-history-recorder.handler.ts`
- Create: `apps/api/src/modules/planner/application/event-handlers/task-history-recorder.handler.spec.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/src/modules/planner/application/event-handlers/task-history-recorder.handler.spec.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TaskHistoryRecorderHandler } from './task-history-recorder.handler'
import {
  TaskUpdatedEvent,
  TaskProgressSetEvent,
  TaskAssignedEvent,
  TaskUnassignedEvent,
  TaskMovedEvent,
} from '@future/event-contracts'
import type { ITaskHistoryRepository } from '../../domain/repositories/task-history.repository'

const TENANT_ID = 'tenant-1'
const ACTOR_ID = 'actor-1'
const TASK_ID = 'task-1'
const PLAN_ID = 'plan-1'

describe('TaskHistoryRecorderHandler', () => {
  let handler: TaskHistoryRecorderHandler
  let repo: { append: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    repo = { append: vi.fn().mockResolvedValue(undefined) }
    handler = new TaskHistoryRecorderHandler(repo as unknown as ITaskHistoryRepository)
  })

  it('records a history row for TaskUpdatedEvent with changed fields', async () => {
    const event = new TaskUpdatedEvent(
      TENANT_ID,
      ACTOR_ID,
      TASK_ID,
      PLAN_ID,
      ['priority', 'title'],
      'user',
    )
    await handler.handleTaskUpdated(event)
    expect(repo.append).toHaveBeenCalledOnce()
    const record = repo.append.mock.calls[0][0]
    expect(record.field).toBe('priority,title')
    expect(record.taskId).toBe(TASK_ID)
    expect(record.actorId).toBe(ACTOR_ID)
  })

  it('records a history row for TaskProgressSetEvent', async () => {
    const event = new TaskProgressSetEvent(TENANT_ID, ACTOR_ID, TASK_ID, PLAN_ID, 0, 100)
    await handler.handleProgressSet(event)
    expect(repo.append).toHaveBeenCalledOnce()
    const record = repo.append.mock.calls[0][0]
    expect(record.field).toBe('progress')
    expect(record.oldValue).toBe(0)
    expect(record.newValue).toBe(100)
  })

  it('records a history row for TaskAssignedEvent', async () => {
    const event = new TaskAssignedEvent(TENANT_ID, ACTOR_ID, TASK_ID, PLAN_ID, 'assignee-1')
    await handler.handleAssigned(event)
    expect(repo.append).toHaveBeenCalledOnce()
    expect(repo.append.mock.calls[0][0].field).toBe('assignee.added')
  })

  it('records a history row for TaskMovedEvent', async () => {
    const event = new TaskMovedEvent(
      TENANT_ID,
      ACTOR_ID,
      TASK_ID,
      PLAN_ID,
      'bucket-old',
      'bucket-new',
    )
    await handler.handleMoved(event)
    expect(repo.append).toHaveBeenCalledOnce()
    expect(repo.append.mock.calls[0][0].field).toBe('bucket')
  })

  it('does not throw when append fails (best-effort)', async () => {
    repo.append.mockRejectedValue(new Error('DB error'))
    const event = new TaskProgressSetEvent(TENANT_ID, ACTOR_ID, TASK_ID, PLAN_ID, 0, 50)
    await expect(handler.handleProgressSet(event)).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run test --filter @future/api task-history-recorder 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Check TaskProgressSetEvent constructor signature**

```bash
grep -n "TaskProgressSetEvent\|TaskAssignedEvent\|TaskMovedEvent" packages/event-contracts/src/index.ts | head -20
```

Note the exact constructor parameters for each event class before writing the handler.

- [ ] **Step 4: Implement TaskHistoryRecorderHandler**

Create `apps/api/src/modules/planner/application/event-handlers/task-history-recorder.handler.ts`:

```ts
import { Injectable, Logger, Inject } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { uuidv7 } from 'uuidv7'
import {
  TaskUpdatedEvent,
  TaskProgressSetEvent,
  TaskAssignedEvent,
  TaskUnassignedEvent,
  TaskMovedEvent,
  TaskLabelAppliedEvent,
  TaskLabelRemovedEvent,
} from '@future/event-contracts'
import {
  TASK_HISTORY_REPOSITORY,
  type ITaskHistoryRepository,
} from '../../domain/repositories/task-history.repository'

@Injectable()
export class TaskHistoryRecorderHandler {
  private readonly logger = new Logger(TaskHistoryRecorderHandler.name)

  constructor(@Inject(TASK_HISTORY_REPOSITORY) private readonly repo: ITaskHistoryRepository) {}

  @OnEvent(TaskUpdatedEvent.eventName)
  async handleTaskUpdated(event: TaskUpdatedEvent): Promise<void> {
    await this.record(
      event.tenantId,
      event.actorId,
      event.taskId,
      event.changedFields.join(','),
      null,
      null,
    )
  }

  @OnEvent(TaskProgressSetEvent.eventName)
  async handleProgressSet(event: TaskProgressSetEvent): Promise<void> {
    await this.record(
      event.tenantId,
      event.actorId,
      event.taskId,
      'progress',
      event.oldProgress,
      event.newProgress,
    )
  }

  @OnEvent(TaskAssignedEvent.eventName)
  async handleAssigned(event: TaskAssignedEvent): Promise<void> {
    await this.record(
      event.tenantId,
      event.actorId,
      event.taskId,
      'assignee.added',
      null,
      event.assigneeActorId,
    )
  }

  @OnEvent(TaskUnassignedEvent.eventName)
  async handleUnassigned(event: TaskUnassignedEvent): Promise<void> {
    await this.record(
      event.tenantId,
      event.actorId,
      event.taskId,
      'assignee.removed',
      event.assigneeActorId,
      null,
    )
  }

  @OnEvent(TaskMovedEvent.eventName)
  async handleMoved(event: TaskMovedEvent): Promise<void> {
    await this.record(
      event.tenantId,
      event.actorId,
      event.taskId,
      'bucket',
      event.fromBucketId,
      event.toBucketId,
    )
  }

  @OnEvent(TaskLabelAppliedEvent.eventName)
  async handleLabelApplied(event: TaskLabelAppliedEvent): Promise<void> {
    await this.record(
      event.tenantId,
      event.actorId,
      event.taskId,
      'label.added',
      null,
      event.labelId,
    )
  }

  @OnEvent(TaskLabelRemovedEvent.eventName)
  async handleLabelRemoved(event: TaskLabelRemovedEvent): Promise<void> {
    await this.record(
      event.tenantId,
      event.actorId,
      event.taskId,
      'label.removed',
      event.labelId,
      null,
    )
  }

  private async record(
    tenantId: string,
    actorId: string,
    taskId: string,
    field: string,
    oldValue: unknown,
    newValue: unknown,
  ): Promise<void> {
    try {
      await this.repo.append({
        id: uuidv7(),
        taskId,
        tenantId,
        actorId,
        field,
        oldValue,
        newValue,
        changedAt: new Date(),
      })
    } catch (err) {
      this.logger.error(`Failed to record task history for task ${taskId}: ${err}`)
    }
  }
}
```

**Note:** History recording is best-effort — errors are logged but do not propagate to callers. The `try/catch` in `record()` ensures mutations succeed even if the audit trail write fails temporarily.

- [ ] **Step 5: Check event property names against event-contracts**

```bash
grep -n "this\." packages/event-contracts/src/planner/task-progress-set.event.ts 2>/dev/null || \
cat packages/event-contracts/src/planner/task-progress-set.event.ts 2>/dev/null || \
grep -rn "class TaskProgressSetEvent" packages/event-contracts/src/ | head -5
```

If `TaskProgressSetEvent` uses different property names (e.g., `from` / `to` instead of `oldProgress` / `newProgress`), update the handler's `handleProgressSet` method to match the actual property names before running tests.

- [ ] **Step 6: Run test to verify it passes**

```bash
bun run test --filter @future/api task-history-recorder 2>&1 | tail -10
```

Expected: 5 tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/planner/application/event-handlers/task-history-recorder.handler.ts \
        apps/api/src/modules/planner/application/event-handlers/task-history-recorder.handler.spec.ts
git commit -m "feat(planner): add TaskHistoryRecorder event handler"
```

---

## Task 3: GetTaskHistory query handler and tRPC procedure

**Files:**

- Create: `apps/api/src/modules/planner/application/queries/tasks/get-task-history.query.ts`
- Create: `apps/api/src/modules/planner/application/queries/tasks/get-task-history.handler.ts`
- Create: `apps/api/src/modules/planner/application/queries/tasks/get-task-history.handler.spec.ts`
- Modify: `apps/api/src/modules/planner/interface/trpc/task.router.ts`
- Modify: `apps/api/src/modules/planner/planner.module.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/src/modules/planner/application/queries/tasks/get-task-history.handler.spec.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { GetTaskHistoryHandler } from './get-task-history.handler'
import { GetTaskHistoryQuery } from './get-task-history.query'
import type { ITaskHistoryRepository } from '../../../domain/repositories/task-history.repository'

const TENANT_ID = 'tenant-1'
const TASK_ID = 'task-1'

describe('GetTaskHistoryHandler', () => {
  it('delegates to ITaskHistoryRepository.listByTask', async () => {
    const mockPage = {
      items: [
        {
          id: 'h-1',
          taskId: TASK_ID,
          tenantId: TENANT_ID,
          actorId: 'a-1',
          field: 'priority',
          oldValue: 1,
          newValue: 3,
          changedAt: new Date(),
        },
      ],
      nextCursor: null,
    }
    const repo = {
      listByTask: vi.fn().mockResolvedValue(mockPage),
    } as unknown as ITaskHistoryRepository
    const handler = new GetTaskHistoryHandler(repo)

    const result = await handler.execute(new GetTaskHistoryQuery(TASK_ID, TENANT_ID, undefined, 20))

    expect(repo.listByTask).toHaveBeenCalledWith(TASK_ID, TENANT_ID, {
      cursor: undefined,
      limit: 20,
    })
    expect(result.items).toHaveLength(1)
    expect(result.nextCursor).toBeNull()
  })

  it('passes cursor to repository', async () => {
    const repo = {
      listByTask: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    } as unknown as ITaskHistoryRepository
    const handler = new GetTaskHistoryHandler(repo)

    await handler.execute(
      new GetTaskHistoryQuery(TASK_ID, TENANT_ID, '2026-01-01T00:00:00.000Z:h-99', 10),
    )

    expect(repo.listByTask).toHaveBeenCalledWith(TASK_ID, TENANT_ID, {
      cursor: '2026-01-01T00:00:00.000Z:h-99',
      limit: 10,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run test --filter @future/api get-task-history.handler 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Create query and handler**

Create `apps/api/src/modules/planner/application/queries/tasks/get-task-history.query.ts`:

```ts
export class GetTaskHistoryQuery {
  constructor(
    public readonly taskId: string,
    public readonly tenantId: string,
    public readonly cursor: string | undefined,
    public readonly limit: number,
  ) {}
}
```

Create `apps/api/src/modules/planner/application/queries/tasks/get-task-history.handler.ts`:

```ts
import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  TASK_HISTORY_REPOSITORY,
  type ITaskHistoryRepository,
  type HistoryPage,
} from '../../../domain/repositories/task-history.repository'
import { GetTaskHistoryQuery } from './get-task-history.query'

@QueryHandler(GetTaskHistoryQuery)
export class GetTaskHistoryHandler implements IQueryHandler<GetTaskHistoryQuery, HistoryPage> {
  constructor(@Inject(TASK_HISTORY_REPOSITORY) private readonly repo: ITaskHistoryRepository) {}

  async execute(query: GetTaskHistoryQuery): Promise<HistoryPage> {
    return this.repo.listByTask(query.taskId, query.tenantId, {
      cursor: query.cursor,
      limit: query.limit,
    })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun run test --filter @future/api get-task-history.handler 2>&1 | tail -10
```

Expected: 2 tests pass.

- [ ] **Step 5: Add getHistory tRPC procedure to task.router.ts**

In `apps/api/src/modules/planner/interface/trpc/task.router.ts`, add:

```ts
import { GetTaskHistoryQuery } from '../../application/queries/tasks/get-task-history.query'

// Add to taskRouter:
  getHistory: publicProcedure
    .input(
      z.object({
        planId: z.string().uuid(),
        taskId: z.string().uuid(),
        actorId: z.string().uuid(),
        tenantId: z.string().uuid(),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .query(new GetTaskHistoryQuery(input.taskId, input.tenantId, input.cursor, input.limit))
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),
```

- [ ] **Step 6: Register in planner.module.ts**

In `apps/api/src/modules/planner/planner.module.ts`, add:

```ts
{ provide: TASK_HISTORY_REPOSITORY, useClass: DrizzleTaskHistoryRepository },
GetTaskHistoryHandler,
TaskHistoryRecorderHandler,
```

- [ ] **Step 7: Type-check**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/planner/
git commit -m "feat(planner): add GetTaskHistory query + getHistory tRPC procedure"
```

---

## Task 4: TaskHistoryPane frontend component

**Files:**

- Create: `apps/web-planner/src/components/task-detail/TaskHistoryPane.tsx`
- Create: `apps/web-planner/src/components/task-detail/TaskHistoryPane.spec.tsx`
- Modify: `apps/web-planner/src/components/task-detail/TaskDetailPanel.tsx`

- [ ] **Step 1: Write failing test**

Create `apps/web-planner/src/components/task-detail/TaskHistoryPane.spec.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { TaskHistoryPane } from './TaskHistoryPane'

const mockFetchNextPage = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    planner: {
      tasks: {
        getHistory: {
          useInfiniteQuery: () => ({
            data: {
              pages: [
                {
                  items: [
                    {
                      id: 'h-1',
                      field: 'priority',
                      oldValue: 1,
                      newValue: 3,
                      actorId: 'a-1',
                      changedAt: new Date('2026-05-01T10:00:00Z'),
                    },
                    {
                      id: 'h-2',
                      field: 'progress',
                      oldValue: 0,
                      newValue: 50,
                      actorId: 'a-2',
                      changedAt: new Date('2026-05-02T09:00:00Z'),
                    },
                  ],
                  nextCursor: null,
                },
              ],
            },
            fetchNextPage: mockFetchNextPage,
            hasNextPage: false,
            isFetchingNextPage: false,
            isLoading: false,
          }),
        },
      },
    },
  },
}))

describe('TaskHistoryPane', () => {
  it('renders history items', () => {
    render(
      <TaskHistoryPane
        taskId="t1"
        planId="p1"
        tenantId="tn1"
        actorId="a1"
        isOpen={true}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText(/priority/i)).toBeInTheDocument()
    expect(screen.getByText(/progress/i)).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <TaskHistoryPane
        taskId="t1"
        planId="p1"
        tenantId="tn1"
        actorId="a1"
        isOpen={true}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByTestId('history-close-btn'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not render content when isOpen=false', () => {
    render(
      <TaskHistoryPane
        taskId="t1"
        planId="p1"
        tenantId="tn1"
        actorId="a1"
        isOpen={false}
        onClose={vi.fn()}
      />,
    )
    expect(screen.queryByText(/priority/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run test --filter @future/web-planner TaskHistoryPane 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Implement TaskHistoryPane**

Create `apps/web-planner/src/components/task-detail/TaskHistoryPane.tsx`:

```tsx
'use client'

import { useEffect, useRef } from 'react'
import { Button, Spinner } from '@future/ui'
import { X } from 'lucide-react'
import { trpc } from '@/lib/trpc'

interface Props {
  taskId: string
  planId: string
  tenantId: string
  actorId: string
  isOpen: boolean
  onClose: () => void
}

function fieldLabel(field: string): string {
  const map: Record<string, string> = {
    priority: 'Priority changed',
    progress: 'Progress changed',
    'assignee.added': 'Assignee added',
    'assignee.removed': 'Assignee removed',
    bucket: 'Moved to bucket',
    'label.added': 'Label applied',
    'label.removed': 'Label removed',
    sprint: 'Sprint assigned',
    dependency: 'Dependency changed',
  }
  return map[field] ?? field
}

export function TaskHistoryPane({ taskId, planId, tenantId, actorId, isOpen, onClose }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    trpc.planner.tasks.getHistory.useInfiniteQuery(
      { taskId, planId, tenantId, actorId, limit: 20 },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
        enabled: isOpen,
      },
    )

  // Infinite scroll: trigger load when bottom sentinel enters view
  useEffect(() => {
    if (!bottomRef.current || !hasNextPage) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) fetchNextPage()
      },
      { threshold: 0.1 },
    )
    observer.observe(bottomRef.current)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  if (!isOpen) return null

  const allItems = data?.pages.flatMap((p) => p.items) ?? []

  return (
    <div
      className="fixed inset-y-0 right-0 z-50 flex w-80 flex-col border-l bg-surface shadow-lg"
      role="dialog"
      aria-label="Task history"
      data-testid="task-history-pane"
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <p className="font-500">Task History</p>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close history"
          data-testid="history-close-btn"
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {isLoading && (
          <div className="flex justify-center py-8">
            <Spinner className="size-5" />
          </div>
        )}

        {!isLoading && allItems.length === 0 && (
          <p className="text-sm text-fg-muted">No history yet.</p>
        )}

        <ol className="flex flex-col gap-3">
          {allItems.map((item) => (
            <li key={item.id} className="flex flex-col gap-0.5 text-sm">
              <p className="font-500 text-fg">{fieldLabel(item.field)}</p>
              {item.oldValue !== null && item.newValue !== null && (
                <p className="text-xs text-fg-muted">
                  {String(item.oldValue)} → {String(item.newValue)}
                </p>
              )}
              <time
                className="text-xs text-fg-muted"
                dateTime={new Date(item.changedAt).toISOString()}
              >
                {new Date(item.changedAt).toLocaleString()}
              </time>
            </li>
          ))}
        </ol>

        {isFetchingNextPage && (
          <div className="flex justify-center py-4">
            <Spinner className="size-4" />
          </div>
        )}

        <div ref={bottomRef} className="h-1" aria-hidden="true" />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun run test --filter @future/web-planner TaskHistoryPane 2>&1 | tail -10
```

Expected: 3 tests pass.

- [ ] **Step 5: Wire TaskHistoryPane into TaskDetailPanel**

In `apps/web-planner/src/components/task-detail/TaskDetailPanel.tsx`, add the state and wire the Clock button:

```tsx
// Add import at top:
import { useState } from 'react'  // already present — keep
import { TaskHistoryPane } from './TaskHistoryPane'

// Inside TaskDetailPanel component, add state:
const [historyOpen, setHistoryOpen] = useState(false)

// Update TaskPanelHeader call:
<TaskPanelHeader
  title={task?.title ?? ''}
  isSaving={saving}
  onClose={() => router.back()}
  onHistoryOpen={() => setHistoryOpen(true)}
/>

// Add TaskHistoryPane just before the closing </div>:
{task && (
  <TaskHistoryPane
    taskId={taskId}
    planId={planId}
    tenantId={task.tenantId}
    actorId={actorId}
    isOpen={historyOpen}
    onClose={() => setHistoryOpen(false)}
  />
)}
```

**Note:** `task.tenantId` must be available in `TaskDetailSnapshot`. If it is not yet included, add `tenantId: string` to the `TaskDetailSnapshot` interface in `get-task-detail.query.ts` and populate it in `GetTaskDetailHandler`.

- [ ] **Step 6: Run all frontend tests**

```bash
bun run test --filter @future/web-planner 2>&1 | tail -20
```

Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web-planner/src/components/task-detail/TaskHistoryPane.tsx \
        apps/web-planner/src/components/task-detail/TaskHistoryPane.spec.tsx \
        apps/web-planner/src/components/task-detail/TaskDetailPanel.tsx
git commit -m "feat(web-planner): add TaskHistoryPane with infinite scroll + wire Clock icon"
```

---

## Task 5: Final checks and Phase 2 PR

- [ ] **Step 1: Run full API test suite with coverage**

```bash
bun run test --filter @future/api --coverage 2>&1 | tail -20
```

Expected: Lines/Functions/Branches ≥70%. Fix any uncovered command paths before proceeding.

- [ ] **Step 2: Run full frontend test suite with coverage**

```bash
bun run test --filter @future/web-planner --coverage 2>&1 | tail -20
```

Expected: Lines/Functions/Branches ≥70%.

- [ ] **Step 3: Type-check both apps**

```bash
npx tsc --noEmit -p apps/web-planner/tsconfig.json 2>&1 | head -20
cd apps/api && npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 4: Lint frontend**

```bash
bun run --filter @future/web-planner lint 2>&1 | head -20
```

- [ ] **Step 5: Migration procedure**

Follow the procedure from Phase 2 / Plan 1 to apply any incremental schema additions from Plans 2–4:

```bash
cd apps/api
# Delete existing migration artefacts and regenerate
find src/modules/planner/infrastructure/schema -name "*.sql" -delete
find src/modules/planner/infrastructure/schema/meta -name "*.json" -delete
bun run db:generate --name initial
bun run db:down -v && bun run db:up && bun run db:migrate
```

Verify: `bun run db:migrate` exits 0 with no errors.

- [ ] **Step 6: Manual exit criteria checklist**

- [ ] Custom fields section renders in Details tab for tasks in plans with defined fields
- [ ] Defining a new field (via API call or future admin UI) shows up after panel refresh
- [ ] Setting a number/text/date/yes-no/choice value calls `trpc.planner.customFields.setValue`
- [ ] Adding a predecessor creates a dependency; cycle detection rejects circular additions (test with API call)
- [ ] DependenciesSection shows predecessors/successors; X button removes each
- [ ] TaskSearchPicker filters tasks by title; selecting one calls add mutation
- [ ] Subtasks section shows subtasks; typing a title and pressing Enter creates one
- [ ] Sprint picker lists plan sprints; selecting one assigns the task; Clear removes it
- [ ] Clock icon in panel header is enabled (not grayed out)
- [ ] Clicking Clock opens TaskHistoryPane slide-in panel
- [ ] History entries display field label, old→new values, and timestamp
- [ ] Scrolling to bottom of history pane loads next page (infinite scroll)
- [ ] Closing history pane with X or Escape hides it

- [ ] **Step 7: Push branch and open PR**

```bash
git push origin feat/planner-task-detail-ui-ux
```

PR title: `feat(planner): task detail panel — custom fields, dependencies, subtasks, sprint, history (Phase 2)`

PR body:

```markdown
## Summary

- **Custom fields**: Plan-level field definitions (text/number/date/yes_no/choice); per-task values set via inline inputs in Details tab
- **Dependencies**: Predecessor/successor linking with DFS cycle detection; `DependenciesSection` + `TaskSearchPicker` in Details tab
- **Subtasks**: Parent–child task relationships; `SubtasksSection` renders inline subtask list with Enter-to-create
- **Sprint**: Sprint create/complete/assign commands; `SprintField` + `SprintPicker` in Details tab
- **Task history**: Event-sourced audit trail via `TaskHistoryRecorder`; paginated `GetTaskHistory` query; `TaskHistoryPane` slide-in panel with infinite scroll; Clock icon in panel header now functional

## New commands

| Command                | Description                               |
| ---------------------- | ----------------------------------------- |
| DefineCustomField      | Add a custom field def to a plan (max 10) |
| UpdateCustomFieldDef   | Rename / reorder a field def              |
| DeleteCustomFieldDef   | Remove a field def and all its values     |
| SetCustomFieldValue    | Set a custom field value on a task        |
| AddDependency          | Link two tasks (DFS cycle guard)          |
| RemoveDependency       | Unlink two tasks                          |
| CreateSubtask          | Create a child task under a parent        |
| CreateSprint           | Define a new sprint for a plan            |
| CompleteSprint         | Mark a sprint as completed                |
| AssignTaskToSprint     | Set task.sprintId                         |
| UnassignTaskFromSprint | Clear task.sprintId                       |

## Testing

- All command handlers have unit tests covering happy path + all error paths
- `DrizzleCustomFieldDefRepository`, `DrizzleTaskDependencyRepository`, `DrizzleSprintRepository`, and `DrizzleTaskHistoryRepository` have integration tests against a real DB
- Frontend components tested with `@testing-library/react`
- Coverage ≥70% on both `@future/api` and `@future/web-planner`

## Note

Phase 1 delivered the tabbed panel UI. This PR adds the full backend + frontend for the 5 Phase 2 features. The single migration file `0000_initial.sql` has been regenerated to include all new tables.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
