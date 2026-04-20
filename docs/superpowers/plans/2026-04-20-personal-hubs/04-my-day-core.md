# Plan 3.4 — My Day core

> Covers spec **Plan 3.4** — see [design spec](../../specs/2026-04-20-personal-hubs-design.md) sections 3 (Architecture — timezone handling, carry-over mechanics preview), 6.3 (`my_day_entry` schema — already landed in 3.1), 7.1 (`personal.myDay.{get,add,remove}`), 8.4 (routes under `/personal/today/*`), 8.5 (`add-to-my-day-button.tsx`), 8.7 (My Day empty state).
> Depends on Plan 3.3 merged. Reuses `TaskFlatWithPlan` and the four view primitives shipped in 3.3; consumes the `useTenantTimezone()` hook from 3.2.

**Goal:** Ship the core "My Day" surface — backend (`MyDayRepository`, `GetMyDay` query, `AddToMyDay` + `RemoveFromMyDay` commands, `TaskProgressSetEvent` listener that sets `completed_at`), four view routes at `/personal/today/{board,grid,schedule,charts}`, and an `AddToMyDayButton` component wired for task card kebab + task detail panel. After this plan ships, an employee can open My Day, see tasks they've added to today's focus list, and add/remove tasks; automatic `completed_at` marking keeps historical entries faithful. Carry-over UX is explicitly **out of scope** — shipped by Plan 3.5.

**Architecture:** One new domain entity `MyDayEntry`, one repository (`IMyDayRepository` + Drizzle impl), one query handler, two command handlers, one event listener. tRPC `personal.myDay` sub-router. Frontend: `useMyDay` query hook + `useAddToMyDay` / `useRemoveFromMyDay` optimistic mutation hooks, one new layout, four view pages, one button component. Empty state per spec 8.7. Default Board grouped by Progress — reuses `useViewState` store from Sub-project #2 with a fresh localStorage key.

**Tech stack:** NestJS CQRS, Drizzle, tRPC, Vitest, React 19 / Next.js App Router, React Query v5, shadcn + `@future/ui`, `lucide-react`.

**Locked spec decisions this plan implements:**

- Decision 2 — per-day persistence (row per `(actor_id, task_id, added_date)`). Carry-over itself is 3.5; we only land the storage shape + today's slice here.
- Decision 9 — **no outbox events.** `AddToMyDay` / `RemoveFromMyDay` do not call `OutboxEventRepository`. Frontend invalidation is sufficient.
- Architecture → Timezone handling — server uses `tenantLocalDate(new Date(), tz)` to validate the client's `date` input against "is this today or earlier" for `add`. Future/far-past dates rejected.

**Not in this plan (handed to 3.5):**

- `getCarryOverCandidates` + `carryOver` procedures.
- `CarryOverBanner` component + localStorage dismissal.
- Orphan-sweep pg-boss nightly job for `my_day_entry` rows referencing deleted tasks.
- E2E Playwright coverage — acceptance tests ship in 3.5.
- No bulk `addMany` / `removeMany` server procedure (client loops single-item calls — spec "What's NOT in Scope").

---

## File Map

### Backend — domain + repository

| File                                                                                         | Action | Purpose                                                                                 |
| -------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| `apps/api/src/modules/planner/domain/entities/my-day-entry.entity.ts`                        | Create | Thin entity wrapping the row shape. `markCompleted(now: Date)` method.                  |
| `apps/api/src/modules/planner/domain/entities/my-day-entry.entity.spec.ts`                   | Create | Unit tests — `markCompleted` sets `completedAt`, idempotent on already-completed.       |
| `apps/api/src/modules/planner/domain/repositories/my-day.repository.ts`                      | Create | `IMyDayRepository` interface + `MY_DAY_REPOSITORY` DI token.                            |
| `apps/api/src/modules/planner/infrastructure/repositories/drizzle-my-day.repository.ts`      | Create | Drizzle implementation — `findForDate`, `add`, `remove`, `markTaskCompleted`.           |
| `apps/api/src/modules/planner/infrastructure/repositories/drizzle-my-day.repository.spec.ts` | Create | Unit tests with mocked Drizzle db. Integration coverage in the router integration spec. |

### Backend — query + commands + listener

| File                                                                                          | Action | Purpose                                                                             |
| --------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| `apps/api/src/modules/planner/application/queries/personal/get-my-day.query.ts`               | Create | `GetMyDayQuery(actorId, tenantId, date)` class.                                     |
| `apps/api/src/modules/planner/application/queries/personal/get-my-day.handler.ts`             | Create | Handler — joins `my_day_entry × task × plan` scoped to actor + tenant + date.       |
| `apps/api/src/modules/planner/application/queries/personal/get-my-day.handler.spec.ts`        | Create | Unit tests.                                                                         |
| `apps/api/src/modules/planner/application/queries/personal/my-day-task.types.ts`              | Create | `MyDayTask` type (extends `TaskFlatWithPlan`).                                      |
| `apps/api/src/modules/planner/application/commands/my-day/add-to-my-day.command.ts`           | Create | Command class.                                                                      |
| `apps/api/src/modules/planner/application/commands/my-day/add-to-my-day.handler.ts`           | Create | Handler — validates `date`, upserts entry.                                          |
| `apps/api/src/modules/planner/application/commands/my-day/add-to-my-day.handler.spec.ts`      | Create | Unit tests — happy path, past-date guard, unauthorized actor guard, idempotency.    |
| `apps/api/src/modules/planner/application/commands/my-day/remove-from-my-day.command.ts`      | Create | Command class.                                                                      |
| `apps/api/src/modules/planner/application/commands/my-day/remove-from-my-day.handler.ts`      | Create | Handler — deletes matching row.                                                     |
| `apps/api/src/modules/planner/application/commands/my-day/remove-from-my-day.handler.spec.ts` | Create | Unit tests — happy path + no-op on missing row.                                     |
| `apps/api/src/modules/planner/application/listeners/task-progress-completed.listener.ts`      | Create | `@EventsHandler(TaskProgressSetEvent)` — if `progress === 100`, set `completed_at`. |
| `apps/api/src/modules/planner/application/listeners/task-progress-completed.listener.spec.ts` | Create | Unit tests — listener no-ops on progress 0/50; marks completed on 100.              |
| `apps/api/src/modules/planner/planner.module.ts`                                              | Modify | Wire new repository binding, handlers, and listener.                                |

### Backend — tRPC

| File                                                                              | Action | Purpose                                                        |
| --------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------- |
| `apps/api/src/modules/planner/interface/trpc/personal.router.ts`                  | Modify | Add `myDay` sub-router with `get`, `add`, `remove` procedures. |
| `apps/api/src/modules/planner/interface/trpc/personal.router.integration.spec.ts` | Modify | Add real-DB integration coverage for `myDay.*`.                |

### Frontend — routes

| File                                                        | Action | Purpose                                                                   |
| ----------------------------------------------------------- | ------ | ------------------------------------------------------------------------- |
| `apps/web-planner/src/app/personal/today/page.tsx`          | Delete | Placeholder redirect from 3.2 is removed — layout handles default branch. |
| `apps/web-planner/src/app/personal/today/layout.tsx`        | Create | View picker + filter bar + date header + empty-state scaffolding.         |
| `apps/web-planner/src/app/personal/today/board/page.tsx`    | Create | Board view, default grouped by Progress.                                  |
| `apps/web-planner/src/app/personal/today/grid/page.tsx`     | Create | Grid view.                                                                |
| `apps/web-planner/src/app/personal/today/schedule/page.tsx` | Create | Schedule view.                                                            |
| `apps/web-planner/src/app/personal/today/charts/page.tsx`   | Create | Charts view (reuses `personal.getCharts` filtered to today's task IDs).   |

### Frontend — hooks + components

| File                                                                   | Action | Purpose                                                                             |
| ---------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| `apps/web-planner/src/lib/hooks/use-my-day.ts`                         | Create | `useMyDay(date)` — React Query wrapper over `personal.myDay.get`.                   |
| `apps/web-planner/src/lib/hooks/use-my-day.spec.ts`                    | Create | Unit tests — fetch + cache key.                                                     |
| `apps/web-planner/src/lib/hooks/use-add-to-my-day.ts`                  | Create | Optimistic mutation.                                                                |
| `apps/web-planner/src/lib/hooks/use-add-to-my-day.spec.ts`             | Create | Unit tests — optimistic add + rollback on error.                                    |
| `apps/web-planner/src/lib/hooks/use-remove-from-my-day.ts`             | Create | Optimistic mutation.                                                                |
| `apps/web-planner/src/lib/hooks/use-remove-from-my-day.spec.ts`        | Create | Unit tests — optimistic remove + rollback on error.                                 |
| `apps/web-planner/src/components/my-day/add-to-my-day-button.tsx`      | Create | Menu-item component (also usable as a `<Button>` in detail panel).                  |
| `apps/web-planner/src/components/my-day/add-to-my-day-button.spec.tsx` | Create | Unit tests — renders correct label, fires correct mutation, disables while pending. |
| `apps/web-planner/src/components/my-day/my-day-empty-state.tsx`        | Create | Empty-state component per spec 8.7.                                                 |
| `apps/web-planner/src/components/my-day/my-day-empty-state.spec.tsx`   | Create | Unit test.                                                                          |
| `apps/web-planner/src/components/task-card/task-card-kebab.tsx`        | Modify | Add `<AddToMyDayButton>` / `<RemoveFromMyDayButton>` menu item.                     |
| `apps/web-planner/src/components/task-detail/task-detail-panel.tsx`    | Modify | Add "Focus today" toggle action in the panel header.                                |

### Consumer of existing 3.2 hook

`apps/web-planner/src/lib/hooks/use-tenant-timezone.ts` (shipped in Plan 3.2) is consumed by `useMyDay` and by the layout to compute "today" in tenant-local time. No change to the hook itself — this plan is its first real consumer. A comment in `use-my-day.ts` notes this.

### Dependencies

None. Everything needed (`date-fns-tz`, `@future/ui`, `lucide-react`, React Query v5) is already installed from Plans 3.1–3.3.

---

## Task 1 — `MyDayEntry` domain entity

**Files:**

- Create: `apps/api/src/modules/planner/domain/entities/my-day-entry.entity.ts`
- Create: `apps/api/src/modules/planner/domain/entities/my-day-entry.entity.spec.ts`

- [ ] **Step 1: Write the failing spec.**

```ts
// my-day-entry.entity.spec.ts
import { MyDayEntry } from './my-day-entry.entity'

describe('MyDayEntry', () => {
  const base = {
    actorId: 'actor-1',
    taskId: 'task-1',
    addedDate: '2026-04-20',
    addedAt: new Date('2026-04-20T01:00:00Z'),
    tenantId: 'tenant-1',
    completedAt: null as Date | null,
  }

  it('constructs from a row-shaped object', () => {
    const entry = new MyDayEntry(base)
    expect(entry.actorId).toBe('actor-1')
    expect(entry.taskId).toBe('task-1')
    expect(entry.addedDate).toBe('2026-04-20')
    expect(entry.completedAt).toBeNull()
  })

  it('markCompleted stamps completedAt', () => {
    const entry = new MyDayEntry(base)
    const now = new Date('2026-04-20T10:00:00Z')
    entry.markCompleted(now)
    expect(entry.completedAt).toEqual(now)
  })

  it('markCompleted is idempotent — keeps the original completedAt', () => {
    const originalCompletion = new Date('2026-04-20T09:00:00Z')
    const entry = new MyDayEntry({ ...base, completedAt: originalCompletion })
    entry.markCompleted(new Date('2026-04-20T10:00:00Z'))
    expect(entry.completedAt).toEqual(originalCompletion)
  })
})
```

- [ ] **Step 2: Run — expect failure.**

Run: `bun test apps/api/src/modules/planner/domain/entities/my-day-entry.entity.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the entity.**

```ts
// my-day-entry.entity.ts
export interface MyDayEntryProps {
  actorId: string
  taskId: string
  addedDate: string // YYYY-MM-DD
  addedAt: Date
  completedAt: Date | null
  tenantId: string
}

export class MyDayEntry {
  public readonly actorId: string
  public readonly taskId: string
  public readonly addedDate: string
  public readonly addedAt: Date
  public readonly tenantId: string
  public completedAt: Date | null

  constructor(props: MyDayEntryProps) {
    this.actorId = props.actorId
    this.taskId = props.taskId
    this.addedDate = props.addedDate
    this.addedAt = props.addedAt
    this.completedAt = props.completedAt
    this.tenantId = props.tenantId
  }

  markCompleted(now: Date): void {
    if (this.completedAt !== null) return
    this.completedAt = now
  }
}
```

- [ ] **Step 4: Run — expect pass.**

Run: `bun test apps/api/src/modules/planner/domain/entities/my-day-entry.entity.spec.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Commit.**

```bash
git add apps/api/src/modules/planner/domain/entities/my-day-entry.entity.ts apps/api/src/modules/planner/domain/entities/my-day-entry.entity.spec.ts
git commit -m "feat(planner): MyDayEntry domain entity"
```

---

## Task 2 — `IMyDayRepository` port

**Files:**

- Create: `apps/api/src/modules/planner/domain/repositories/my-day.repository.ts`

- [ ] **Step 1: Write the interface + DI token.**

```ts
// my-day.repository.ts
import type { MyDayEntry } from '../entities/my-day-entry.entity'

export const MY_DAY_REPOSITORY = Symbol('MY_DAY_REPOSITORY')

export interface IMyDayRepository {
  findForDate(actorId: string, tenantId: string, date: string): Promise<MyDayEntry[]>
  add(entry: MyDayEntry): Promise<void>
  remove(actorId: string, taskId: string, date: string, tenantId: string): Promise<void>
  /**
   * Set completed_at = now() on every my_day_entry row referencing this task within the tenant,
   * skipping rows that already have completedAt set. Called by TaskProgressCompletedListener.
   */
  markTaskCompleted(taskId: string, tenantId: string): Promise<void>
}
```

No spec file — this is a pure interface. Coverage comes from its implementation's spec.

- [ ] **Step 2: Commit.**

```bash
git add apps/api/src/modules/planner/domain/repositories/my-day.repository.ts
git commit -m "feat(planner): IMyDayRepository port"
```

---

## Task 3 — `DrizzleMyDayRepository` implementation

**Files:**

- Create: `apps/api/src/modules/planner/infrastructure/repositories/drizzle-my-day.repository.ts`
- Create: `apps/api/src/modules/planner/infrastructure/repositories/drizzle-my-day.repository.spec.ts`

- [ ] **Step 1: Write failing tests.**

```ts
// drizzle-my-day.repository.spec.ts
import { Test } from '@nestjs/testing'
import { DrizzleMyDayRepository } from './drizzle-my-day.repository'
import { DB_TOKEN } from '../../../../common/database/db.token'
import { MyDayEntry } from '../../domain/entities/my-day-entry.entity'

describe('DrizzleMyDayRepository', () => {
  let repo: DrizzleMyDayRepository
  const actorId = 'actor-1'
  const taskId = 'task-1'
  const date = '2026-04-20'
  const tenantId = 'tenant-1'

  // Helper: fluent builder chain that resolves to a given value.
  const chain = (resolveTo: unknown) => {
    const obj: Record<string, unknown> = {}
    const self = new Proxy(obj, {
      get(_t, prop) {
        if (prop === 'then') return (res: (v: unknown) => void) => res(resolveTo)
        return () => self
      },
    })
    return self
  }

  let db: {
    select: jest.Mock
    insert: jest.Mock
    delete: jest.Mock
    update: jest.Mock
  }

  beforeEach(async () => {
    db = {
      select: jest.fn().mockReturnValue(chain([])),
      insert: jest.fn().mockReturnValue(chain(undefined)),
      delete: jest.fn().mockReturnValue(chain(undefined)),
      update: jest.fn().mockReturnValue(chain(undefined)),
    }
    const mod = await Test.createTestingModule({
      providers: [DrizzleMyDayRepository, { provide: DB_TOKEN, useValue: db }],
    }).compile()
    repo = mod.get(DrizzleMyDayRepository)
  })

  it('findForDate issues a select scoped by actor+tenant+date', async () => {
    const rows = await repo.findForDate(actorId, tenantId, date)
    expect(db.select).toHaveBeenCalled()
    expect(rows).toEqual([])
  })

  it('add issues an insert with onConflictDoNothing (idempotent)', async () => {
    const entry = new MyDayEntry({
      actorId,
      taskId,
      addedDate: date,
      tenantId,
      addedAt: new Date('2026-04-20T01:00:00Z'),
      completedAt: null,
    })
    await repo.add(entry)
    expect(db.insert).toHaveBeenCalled()
  })

  it('remove issues a delete scoped by all four keys', async () => {
    await repo.remove(actorId, taskId, date, tenantId)
    expect(db.delete).toHaveBeenCalled()
  })

  it('markTaskCompleted updates rows where task_id=? and completed_at is null', async () => {
    await repo.markTaskCompleted(taskId, tenantId)
    expect(db.update).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run — expect failure.**

Run: `bun test apps/api/src/modules/planner/infrastructure/repositories/drizzle-my-day.repository.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement.**

```ts
// drizzle-my-day.repository.ts
import { Inject, Injectable } from '@nestjs/common'
import { and, eq, isNull } from 'drizzle-orm'
import { DB_TOKEN, type DrizzleDb } from '../../../../common/database/db.token'
import { myDayEntry } from '../schema/planner.schema'
import { MyDayEntry } from '../../domain/entities/my-day-entry.entity'
import type { IMyDayRepository } from '../../domain/repositories/my-day.repository'

@Injectable()
export class DrizzleMyDayRepository implements IMyDayRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: DrizzleDb) {}

  async findForDate(actorId: string, tenantId: string, date: string): Promise<MyDayEntry[]> {
    const rows = await this.db
      .select()
      .from(myDayEntry)
      .where(
        and(
          eq(myDayEntry.tenantId, tenantId),
          eq(myDayEntry.actorId, actorId),
          eq(myDayEntry.addedDate, date),
        ),
      )
    return rows.map(
      (r) =>
        new MyDayEntry({
          actorId: r.actorId,
          taskId: r.taskId,
          addedDate: r.addedDate,
          addedAt: r.addedAt,
          completedAt: r.completedAt ?? null,
          tenantId: r.tenantId,
        }),
    )
  }

  async add(entry: MyDayEntry): Promise<void> {
    await this.db
      .insert(myDayEntry)
      .values({
        actorId: entry.actorId,
        taskId: entry.taskId,
        addedDate: entry.addedDate,
        addedAt: entry.addedAt,
        completedAt: entry.completedAt,
        tenantId: entry.tenantId,
      })
      .onConflictDoNothing({
        target: [myDayEntry.actorId, myDayEntry.taskId, myDayEntry.addedDate],
      })
  }

  async remove(actorId: string, taskId: string, date: string, tenantId: string): Promise<void> {
    await this.db
      .delete(myDayEntry)
      .where(
        and(
          eq(myDayEntry.tenantId, tenantId),
          eq(myDayEntry.actorId, actorId),
          eq(myDayEntry.taskId, taskId),
          eq(myDayEntry.addedDate, date),
        ),
      )
  }

  async markTaskCompleted(taskId: string, tenantId: string): Promise<void> {
    await this.db
      .update(myDayEntry)
      .set({ completedAt: new Date() })
      .where(
        and(
          eq(myDayEntry.tenantId, tenantId),
          eq(myDayEntry.taskId, taskId),
          isNull(myDayEntry.completedAt),
        ),
      )
  }
}
```

- [ ] **Step 4: Run — expect pass.**

Run: `bun test apps/api/src/modules/planner/infrastructure/repositories/drizzle-my-day.repository.spec.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit.**

```bash
git add apps/api/src/modules/planner/infrastructure/repositories/drizzle-my-day.repository.ts apps/api/src/modules/planner/infrastructure/repositories/drizzle-my-day.repository.spec.ts
git commit -m "feat(planner): DrizzleMyDayRepository"
```

---

## Task 4 — `MyDayTask` type

**Files:**

- Create: `apps/api/src/modules/planner/application/queries/personal/my-day-task.types.ts`

- [ ] **Step 1: Write the type.**

```ts
// my-day-task.types.ts
import type { TaskFlatWithPlan } from './task-flat-with-plan.types'

export type MyDayTask = TaskFlatWithPlan & {
  myDay: {
    addedAt: string // ISO timestamp
    completedAt: string | null
  }
}
```

If `task-flat-with-plan.types.ts` lives elsewhere (e.g. `list-tasks-for-actor.types.ts` from Plan 3.3), adjust the import path. Confirm by running `grep -r "TaskFlatWithPlan"` under `apps/api/src/modules/planner/` and reusing the canonical path.

- [ ] **Step 2: Commit.**

```bash
git add apps/api/src/modules/planner/application/queries/personal/my-day-task.types.ts
git commit -m "feat(planner): MyDayTask type"
```

---

## Task 5 — `GetMyDayQuery` + handler

**Files:**

- Create: `apps/api/src/modules/planner/application/queries/personal/get-my-day.query.ts`
- Create: `apps/api/src/modules/planner/application/queries/personal/get-my-day.handler.ts`
- Create: `apps/api/src/modules/planner/application/queries/personal/get-my-day.handler.spec.ts`

- [ ] **Step 1: Write the failing handler spec.**

```ts
// get-my-day.handler.spec.ts
import { Test } from '@nestjs/testing'
import { GetMyDayHandler } from './get-my-day.handler'
import { GetMyDayQuery } from './get-my-day.query'
import { DB_TOKEN } from '../../../../../common/database/db.token'

describe('GetMyDayHandler', () => {
  const actorId = 'actor-1'
  const tenantId = 'tenant-1'
  const date = '2026-04-20'
  let handler: GetMyDayHandler
  let db: { execute: jest.Mock }

  beforeEach(async () => {
    db = { execute: jest.fn().mockResolvedValue({ rows: [] }) }
    const mod = await Test.createTestingModule({
      providers: [GetMyDayHandler, { provide: DB_TOKEN, useValue: db }],
    }).compile()
    handler = mod.get(GetMyDayHandler)
  })

  it('returns an empty array when no entries exist for the date', async () => {
    const result = await handler.execute(new GetMyDayQuery(actorId, tenantId, date))
    expect(result).toEqual([])
    expect(db.execute).toHaveBeenCalled()
  })

  it('maps rows into MyDayTask shape with myDay.addedAt + myDay.completedAt', async () => {
    db.execute.mockResolvedValue({
      rows: [
        {
          task_id: 'task-1',
          task_title: 'Ship plan 3.4',
          plan_id: 'plan-1',
          plan_name: 'Personal',
          plan_owner_actor_id: actorId,
          progress: 50,
          priority: 'medium',
          bucket_id: null,
          start_date: null,
          due_date: null,
          labels: [],
          assignees: [actorId],
          added_at: '2026-04-20T01:00:00.000Z',
          completed_at: null,
        },
      ],
    })
    const [row] = await handler.execute(new GetMyDayQuery(actorId, tenantId, date))
    expect(row.taskId).toBe('task-1')
    expect(row.planKind).toBe('personal')
    expect(row.myDay.addedAt).toBe('2026-04-20T01:00:00.000Z')
    expect(row.myDay.completedAt).toBeNull()
  })
})
```

- [ ] **Step 2: Run — expect failure.**

Run: `bun test apps/api/src/modules/planner/application/queries/personal/get-my-day.handler.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the query class.**

```ts
// get-my-day.query.ts
export class GetMyDayQuery {
  constructor(
    public readonly actorId: string,
    public readonly tenantId: string,
    public readonly date: string, // YYYY-MM-DD, tenant-local
  ) {}
}
```

- [ ] **Step 4: Write the handler.**

```ts
// get-my-day.handler.ts
import { Inject } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { sql } from 'drizzle-orm'
import { DB_TOKEN, type DrizzleDb } from '../../../../../common/database/db.token'
import { GetMyDayQuery } from './get-my-day.query'
import type { MyDayTask } from './my-day-task.types'

type Row = {
  task_id: string
  task_title: string
  plan_id: string
  plan_name: string
  plan_owner_actor_id: string | null
  progress: number
  priority: 'low' | 'medium' | 'high' | 'urgent' | null
  bucket_id: string | null
  start_date: string | null
  due_date: string | null
  labels: Array<{ id: string; name: string; color: string }>
  assignees: string[]
  added_at: string
  completed_at: string | null
}

@QueryHandler(GetMyDayQuery)
export class GetMyDayHandler implements IQueryHandler<GetMyDayQuery, MyDayTask[]> {
  constructor(@Inject(DB_TOKEN) private readonly db: DrizzleDb) {}

  async execute(query: GetMyDayQuery): Promise<MyDayTask[]> {
    const result = await this.db.execute<Row>(sql`
      SELECT
        t.id                AS task_id,
        t.title             AS task_title,
        p.id                AS plan_id,
        p.name              AS plan_name,
        p.owner_actor_id    AS plan_owner_actor_id,
        t.progress          AS progress,
        t.priority          AS priority,
        t.bucket_id         AS bucket_id,
        t.start_date        AS start_date,
        t.due_date          AS due_date,
        COALESCE(
          (SELECT json_agg(json_build_object('id', l.id, 'name', l.name, 'color', l.color))
             FROM planner.task_label tl
             JOIN planner.plan_label l ON l.id = tl.label_id
            WHERE tl.task_id = t.id),
          '[]'::json
        ) AS labels,
        COALESCE(
          (SELECT json_agg(ta.actor_id)
             FROM planner.task_assignee ta
            WHERE ta.task_id = t.id),
          '[]'::json
        ) AS assignees,
        m.added_at          AS added_at,
        m.completed_at      AS completed_at
      FROM planner.my_day_entry m
      JOIN planner.task t ON t.id = m.task_id AND t.tenant_id = m.tenant_id
      JOIN planner.plan p ON p.id = t.plan_id AND p.tenant_id = m.tenant_id
      WHERE m.tenant_id = ${query.tenantId}
        AND m.actor_id = ${query.actorId}
        AND m.added_date = ${query.date}
        AND t.deleted_at IS NULL
        AND p.deleted_at IS NULL
      ORDER BY m.added_at ASC
    `)

    return result.rows.map((r) => ({
      taskId: r.task_id,
      title: r.task_title,
      planId: r.plan_id,
      planName: r.plan_name,
      planKind: r.plan_owner_actor_id ? 'personal' : 'team',
      progress: r.progress,
      priority: r.priority,
      bucketId: r.bucket_id,
      startDate: r.start_date,
      dueDate: r.due_date,
      labels: r.labels,
      assignees: r.assignees,
      myDay: {
        addedAt: r.added_at,
        completedAt: r.completed_at,
      },
    }))
  }
}
```

> **DB concurrency rule reminder:** only one `await this.db.execute(...)` per request. Never wrap in `Promise.all` — the RLS-bound `PoolClient` is single-statement at a time.

- [ ] **Step 5: Register the handler.**

Open `apps/api/src/modules/planner/planner.module.ts` and add `GetMyDayHandler` to the `providers` array.

- [ ] **Step 6: Run — expect pass.**

Run: `bun test apps/api/src/modules/planner/application/queries/personal/get-my-day.handler.spec.ts`
Expected: PASS (2/2).

- [ ] **Step 7: Commit.**

```bash
git add apps/api/src/modules/planner/application/queries/personal/ apps/api/src/modules/planner/planner.module.ts
git commit -m "feat(planner): GetMyDay query handler"
```

---

## Task 6 — `AddToMyDayCommand` + handler

**Files:**

- Create: `apps/api/src/modules/planner/application/commands/my-day/add-to-my-day.command.ts`
- Create: `apps/api/src/modules/planner/application/commands/my-day/add-to-my-day.handler.ts`
- Create: `apps/api/src/modules/planner/application/commands/my-day/add-to-my-day.handler.spec.ts`

Guards the handler enforces:

1. The task exists in the actor's tenant (load via existing `PlannerQueryFacade.findTaskById` or direct repo — whichever already exists).
2. The actor is either an assignee on the task OR a member of the plan. (Reuse the same "can see this task" rule enforced in `personal.listTasks` from Plan 3.3 — cross-reference the helper; if it's not already extracted, extract it into `application/lib/task-visibility.ts` in Step 3 below.)
3. `date` is not in the future. Past dates are permitted (back-dating a "focus today" record is legitimate historical accounting, though in practice only today's is used). Future dates rejected with `BAD_REQUEST`.

- [ ] **Step 1: Write the failing spec.**

```ts
// add-to-my-day.handler.spec.ts
import { Test } from '@nestjs/testing'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { AddToMyDayHandler } from './add-to-my-day.handler'
import { AddToMyDayCommand } from './add-to-my-day.command'
import { MY_DAY_REPOSITORY } from '../../../domain/repositories/my-day.repository'
import { AdminQueryFacade } from '../../../../admin/application/facades/admin-query.facade'
import { TASK_VISIBILITY_SERVICE } from '../../lib/task-visibility'

describe('AddToMyDayHandler', () => {
  const actorId = 'actor-1'
  const tenantId = 'tenant-1'
  const taskId = 'task-1'

  let handler: AddToMyDayHandler
  let repo: { add: jest.Mock; findForDate: jest.Mock }
  let adminFacade: { getTenantTimezone: jest.Mock }
  let visibility: { canActorSeeTask: jest.Mock }

  beforeEach(async () => {
    repo = { add: jest.fn().mockResolvedValue(undefined), findForDate: jest.fn() }
    adminFacade = { getTenantTimezone: jest.fn().mockResolvedValue('Asia/Ho_Chi_Minh') }
    visibility = { canActorSeeTask: jest.fn().mockResolvedValue(true) }
    const mod = await Test.createTestingModule({
      providers: [
        AddToMyDayHandler,
        { provide: MY_DAY_REPOSITORY, useValue: repo },
        { provide: AdminQueryFacade, useValue: adminFacade },
        { provide: TASK_VISIBILITY_SERVICE, useValue: visibility },
      ],
    }).compile()
    handler = mod.get(AddToMyDayHandler)
  })

  it('adds an entry for a valid task + today', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-20T10:00:00Z'))
    await handler.execute(new AddToMyDayCommand(actorId, tenantId, taskId, '2026-04-20'))
    expect(repo.add).toHaveBeenCalled()
    jest.useRealTimers()
  })

  it('rejects future dates', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-20T10:00:00Z'))
    await expect(
      handler.execute(new AddToMyDayCommand(actorId, tenantId, taskId, '2026-04-21')),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(repo.add).not.toHaveBeenCalled()
    jest.useRealTimers()
  })

  it('rejects when the actor cannot see the task', async () => {
    visibility.canActorSeeTask.mockResolvedValue(false)
    await expect(
      handler.execute(new AddToMyDayCommand(actorId, tenantId, taskId, '2026-04-20')),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(repo.add).not.toHaveBeenCalled()
  })

  it('rejects with NotFound when the task does not exist (visibility returns null)', async () => {
    visibility.canActorSeeTask.mockResolvedValue('task-not-found')
    await expect(
      handler.execute(new AddToMyDayCommand(actorId, tenantId, taskId, '2026-04-20')),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('is idempotent — a second add on the same (actor, task, date) is a no-op per repo contract', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-20T10:00:00Z'))
    await handler.execute(new AddToMyDayCommand(actorId, tenantId, taskId, '2026-04-20'))
    await handler.execute(new AddToMyDayCommand(actorId, tenantId, taskId, '2026-04-20'))
    expect(repo.add).toHaveBeenCalledTimes(2) // handler calls twice; repo's onConflictDoNothing absorbs
    jest.useRealTimers()
  })
})
```

- [ ] **Step 2: Run — expect failure.**

Run: `bun test apps/api/src/modules/planner/application/commands/my-day/add-to-my-day.handler.spec.ts`
Expected: FAIL — handler + visibility service don't exist.

- [ ] **Step 3: Extract `task-visibility` service (if not already extracted in Plan 3.3).**

Check whether `apps/api/src/modules/planner/application/lib/task-visibility.ts` exists from Plan 3.3. If it does, skip to Step 4. Otherwise create it:

```ts
// application/lib/task-visibility.ts
import { Inject, Injectable } from '@nestjs/common'
import { and, eq, or, sql } from 'drizzle-orm'
import { DB_TOKEN, type DrizzleDb } from '../../../../common/database/db.token'
import { task, taskAssignee, planMember, plan } from '../../infrastructure/schema/planner.schema'

export const TASK_VISIBILITY_SERVICE = Symbol('TASK_VISIBILITY_SERVICE')

export type VisibilityResult = true | false | 'task-not-found'

export interface ITaskVisibilityService {
  canActorSeeTask(actorId: string, tenantId: string, taskId: string): Promise<VisibilityResult>
}

@Injectable()
export class DrizzleTaskVisibilityService implements ITaskVisibilityService {
  constructor(@Inject(DB_TOKEN) private readonly db: DrizzleDb) {}

  async canActorSeeTask(
    actorId: string,
    tenantId: string,
    taskId: string,
  ): Promise<VisibilityResult> {
    const [row] = await this.db
      .select({
        taskTenantId: task.tenantId,
        planOwnerActorId: plan.ownerActorId,
      })
      .from(task)
      .innerJoin(plan, eq(plan.id, task.planId))
      .where(and(eq(task.id, taskId), eq(task.tenantId, tenantId)))
      .limit(1)

    if (!row) return 'task-not-found'

    // Personal plan: only the owner.
    if (row.planOwnerActorId !== null) {
      return row.planOwnerActorId === actorId
    }

    // Team plan: assignee or plan member.
    const [hit] = await this.db.execute(sql`
      SELECT 1
      FROM (
        SELECT 1 FROM planner.task_assignee
         WHERE task_id = ${taskId} AND actor_id = ${actorId} AND tenant_id = ${tenantId}
        UNION ALL
        SELECT 1 FROM planner.plan_member pm
         JOIN planner.task t ON t.plan_id = pm.plan_id
         WHERE t.id = ${taskId} AND pm.actor_id = ${actorId} AND pm.tenant_id = ${tenantId}
      ) AS v LIMIT 1
    `)
    return Boolean(hit)
  }
}
```

Wire into `planner.module.ts`:

```ts
providers: [
  // ... existing ...
  { provide: TASK_VISIBILITY_SERVICE, useClass: DrizzleTaskVisibilityService },
],
```

- [ ] **Step 4: Write the command class.**

```ts
// add-to-my-day.command.ts
export class AddToMyDayCommand {
  constructor(
    public readonly actorId: string,
    public readonly tenantId: string,
    public readonly taskId: string,
    public readonly date: string, // YYYY-MM-DD tenant-local
  ) {}
}
```

- [ ] **Step 5: Write the handler.**

```ts
// add-to-my-day.handler.ts
import { BadRequestException, ForbiddenException, Inject, NotFoundException } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { MyDayEntry } from '../../../domain/entities/my-day-entry.entity'
import {
  MY_DAY_REPOSITORY,
  type IMyDayRepository,
} from '../../../domain/repositories/my-day.repository'
import { AdminQueryFacade } from '../../../../admin/application/facades/admin-query.facade'
import { TASK_VISIBILITY_SERVICE, type ITaskVisibilityService } from '../../lib/task-visibility'
import { tenantLocalDate } from '../../lib/tz'
import { AddToMyDayCommand } from './add-to-my-day.command'

@CommandHandler(AddToMyDayCommand)
export class AddToMyDayHandler implements ICommandHandler<AddToMyDayCommand> {
  constructor(
    @Inject(MY_DAY_REPOSITORY) private readonly repo: IMyDayRepository,
    private readonly adminFacade: AdminQueryFacade,
    @Inject(TASK_VISIBILITY_SERVICE) private readonly visibility: ITaskVisibilityService,
  ) {}

  async execute(command: AddToMyDayCommand): Promise<void> {
    // 1. Reject future dates (tenant-local).
    const tz = await this.adminFacade.getTenantTimezone(command.tenantId)
    const today = tenantLocalDate(new Date(), tz)
    if (command.date > today) {
      throw new BadRequestException('Cannot add to My Day for a future date')
    }

    // 2. Visibility check.
    const visibility = await this.visibility.canActorSeeTask(
      command.actorId,
      command.tenantId,
      command.taskId,
    )
    if (visibility === 'task-not-found') {
      throw new NotFoundException('Task not found')
    }
    if (visibility === false) {
      throw new ForbiddenException('You cannot add this task to My Day')
    }

    // 3. Upsert entry (repo is idempotent via onConflictDoNothing).
    const entry = new MyDayEntry({
      actorId: command.actorId,
      taskId: command.taskId,
      addedDate: command.date,
      addedAt: new Date(),
      completedAt: null,
      tenantId: command.tenantId,
    })
    await this.repo.add(entry)
  }
}
```

> Three sequential `await`s (`getTenantTimezone` → `canActorSeeTask` → `repo.add`). **No `Promise.all` for DB work**, per the project rule.

- [ ] **Step 6: Register the handler.**

Add `AddToMyDayHandler` to `providers` in `planner.module.ts`.

- [ ] **Step 7: Run — expect pass.**

Run: `bun test apps/api/src/modules/planner/application/commands/my-day/add-to-my-day.handler.spec.ts`
Expected: PASS (5/5).

- [ ] **Step 8: Commit.**

```bash
git add apps/api/src/modules/planner/application/commands/my-day/ apps/api/src/modules/planner/application/lib/task-visibility.ts apps/api/src/modules/planner/planner.module.ts
git commit -m "feat(planner): AddToMyDay command handler"
```

---

## Task 7 — `RemoveFromMyDayCommand` + handler

**Files:**

- Create: `apps/api/src/modules/planner/application/commands/my-day/remove-from-my-day.command.ts`
- Create: `apps/api/src/modules/planner/application/commands/my-day/remove-from-my-day.handler.ts`
- Create: `apps/api/src/modules/planner/application/commands/my-day/remove-from-my-day.handler.spec.ts`

Remove is intentionally simple: we only ever allow the actor to remove **their own** entries, so no visibility check is needed beyond "the (actor, task, date, tenant) tuple is already scoped to the caller". If the row doesn't exist, it's a no-op.

- [ ] **Step 1: Write the failing spec.**

```ts
// remove-from-my-day.handler.spec.ts
import { Test } from '@nestjs/testing'
import { RemoveFromMyDayHandler } from './remove-from-my-day.handler'
import { RemoveFromMyDayCommand } from './remove-from-my-day.command'
import { MY_DAY_REPOSITORY } from '../../../domain/repositories/my-day.repository'

describe('RemoveFromMyDayHandler', () => {
  const actorId = 'actor-1'
  const tenantId = 'tenant-1'
  const taskId = 'task-1'
  const date = '2026-04-20'
  let handler: RemoveFromMyDayHandler
  let repo: { remove: jest.Mock }

  beforeEach(async () => {
    repo = { remove: jest.fn().mockResolvedValue(undefined) }
    const mod = await Test.createTestingModule({
      providers: [RemoveFromMyDayHandler, { provide: MY_DAY_REPOSITORY, useValue: repo }],
    }).compile()
    handler = mod.get(RemoveFromMyDayHandler)
  })

  it('calls repo.remove with the full composite key', async () => {
    await handler.execute(new RemoveFromMyDayCommand(actorId, tenantId, taskId, date))
    expect(repo.remove).toHaveBeenCalledWith(actorId, taskId, date, tenantId)
  })

  it('is a no-op when the row does not exist (repo swallows)', async () => {
    await expect(
      handler.execute(new RemoveFromMyDayCommand(actorId, tenantId, 'task-missing', date)),
    ).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run — expect failure.**

Run: `bun test apps/api/src/modules/planner/application/commands/my-day/remove-from-my-day.handler.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Command class.**

```ts
// remove-from-my-day.command.ts
export class RemoveFromMyDayCommand {
  constructor(
    public readonly actorId: string,
    public readonly tenantId: string,
    public readonly taskId: string,
    public readonly date: string,
  ) {}
}
```

- [ ] **Step 4: Handler.**

```ts
// remove-from-my-day.handler.ts
import { Inject } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import {
  MY_DAY_REPOSITORY,
  type IMyDayRepository,
} from '../../../domain/repositories/my-day.repository'
import { RemoveFromMyDayCommand } from './remove-from-my-day.command'

@CommandHandler(RemoveFromMyDayCommand)
export class RemoveFromMyDayHandler implements ICommandHandler<RemoveFromMyDayCommand> {
  constructor(@Inject(MY_DAY_REPOSITORY) private readonly repo: IMyDayRepository) {}

  async execute(command: RemoveFromMyDayCommand): Promise<void> {
    await this.repo.remove(command.actorId, command.taskId, command.date, command.tenantId)
  }
}
```

- [ ] **Step 5: Register + run.**

Add `RemoveFromMyDayHandler` to `planner.module.ts` providers.

Run: `bun test apps/api/src/modules/planner/application/commands/my-day/remove-from-my-day.handler.spec.ts`
Expected: PASS (2/2).

- [ ] **Step 6: Commit.**

```bash
git add apps/api/src/modules/planner/application/commands/my-day/ apps/api/src/modules/planner/planner.module.ts
git commit -m "feat(planner): RemoveFromMyDay command handler"
```

---

## Task 8 — `TaskProgressCompletedListener`

**Files:**

- Create: `apps/api/src/modules/planner/application/listeners/task-progress-completed.listener.ts`
- Create: `apps/api/src/modules/planner/application/listeners/task-progress-completed.listener.spec.ts`

The listener subscribes to `TaskProgressSetEvent` (shipped in `@future/event-contracts`). When `progress === 100`, it sets `completed_at = now()` on **every** `my_day_entry` row referencing this task in this tenant, skipping already-completed rows (matches the entity's idempotent `markCompleted`).

We intentionally use `TaskProgressSetEvent` rather than `TaskCompletedEvent`. `TaskCompletedEvent` also exists in the contract set but fires only when progress transitions 0/50 → 100; `TaskProgressSetEvent` fires on **every** progress write, which lets us cover the edge case where a task gets re-completed after being reopened (rare, but cheap to handle correctly). The listener's `if (progress !== 100) return` early-exit keeps the non-completion path a no-op.

- [ ] **Step 1: Write the failing spec.**

```ts
// task-progress-completed.listener.spec.ts
import { Test } from '@nestjs/testing'
import { TaskProgressSetEvent } from '@future/event-contracts/planner/task-progress-set.event'
import { TaskProgressCompletedListener } from './task-progress-completed.listener'
import { MY_DAY_REPOSITORY } from '../../domain/repositories/my-day.repository'

describe('TaskProgressCompletedListener', () => {
  let listener: TaskProgressCompletedListener
  let repo: { markTaskCompleted: jest.Mock }

  beforeEach(async () => {
    repo = { markTaskCompleted: jest.fn().mockResolvedValue(undefined) }
    const mod = await Test.createTestingModule({
      providers: [TaskProgressCompletedListener, { provide: MY_DAY_REPOSITORY, useValue: repo }],
    }).compile()
    listener = mod.get(TaskProgressCompletedListener)
  })

  it('calls repo.markTaskCompleted when progress = 100', async () => {
    await listener.handle(new TaskProgressSetEvent('tenant-1', 'actor-1', 'task-1', 'plan-1', 100))
    expect(repo.markTaskCompleted).toHaveBeenCalledWith('task-1', 'tenant-1')
  })

  it('is a no-op for progress = 50', async () => {
    await listener.handle(new TaskProgressSetEvent('tenant-1', 'actor-1', 'task-1', 'plan-1', 50))
    expect(repo.markTaskCompleted).not.toHaveBeenCalled()
  })

  it('is a no-op for progress = 0', async () => {
    await listener.handle(new TaskProgressSetEvent('tenant-1', 'actor-1', 'task-1', 'plan-1', 0))
    expect(repo.markTaskCompleted).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run — expect failure.**

Run: `bun test apps/api/src/modules/planner/application/listeners/task-progress-completed.listener.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement.**

```ts
// task-progress-completed.listener.ts
import { Inject, Injectable } from '@nestjs/common'
import { EventsHandler, IEventHandler } from '@nestjs/cqrs'
import { TaskProgressSetEvent } from '@future/event-contracts/planner/task-progress-set.event'
import {
  MY_DAY_REPOSITORY,
  type IMyDayRepository,
} from '../../domain/repositories/my-day.repository'

@Injectable()
@EventsHandler(TaskProgressSetEvent)
export class TaskProgressCompletedListener implements IEventHandler<TaskProgressSetEvent> {
  constructor(@Inject(MY_DAY_REPOSITORY) private readonly repo: IMyDayRepository) {}

  async handle(event: TaskProgressSetEvent): Promise<void> {
    if (event.progress !== 100) return
    await this.repo.markTaskCompleted(event.taskId, event.tenantId)
  }
}
```

> Check how the existing planner module dispatches domain events. If it uses the in-process `EventBus` from `@nestjs/cqrs` (typical CQRS module setup), `@EventsHandler` is correct. If the module instead uses `@OnEvent` from `@nestjs/event-emitter`, swap the decorator. Grep `@EventsHandler\|@OnEvent` under `apps/api/src/modules/planner/` to confirm convention; use whatever is already established.

- [ ] **Step 4: Register in the module.**

Add `TaskProgressCompletedListener` to the `providers` array in `planner.module.ts`. Do **not** export it.

- [ ] **Step 5: Run — expect pass.**

Run: `bun test apps/api/src/modules/planner/application/listeners/task-progress-completed.listener.spec.ts`
Expected: PASS (3/3).

- [ ] **Step 6: Commit.**

```bash
git add apps/api/src/modules/planner/application/listeners/ apps/api/src/modules/planner/planner.module.ts
git commit -m "feat(planner): TaskProgressCompleted listener marks my_day_entry.completed_at"
```

---

## Task 9 — `personal.myDay` tRPC sub-router

**Files:**

- Modify: `apps/api/src/modules/planner/interface/trpc/personal.router.ts`
- Modify: `apps/api/src/modules/planner/interface/trpc/personal.router.integration.spec.ts`

- [ ] **Step 1: Write failing integration tests.**

Add to the existing integration spec (created in Plans 3.2/3.3):

```ts
describe('personal.myDay', () => {
  it('get → add → get → remove → get roundtrip for today', async () => {
    const today = tenantLocalDate(new Date(), tenantTimezone)
    const before = await caller.personal.myDay.get({ date: today })
    expect(before).toHaveLength(0)

    await caller.personal.myDay.add({ taskId: seededAssignedTaskId, date: today })
    const after = await caller.personal.myDay.get({ date: today })
    expect(after).toHaveLength(1)
    expect(after[0].taskId).toBe(seededAssignedTaskId)
    expect(after[0].myDay.completedAt).toBeNull()

    await caller.personal.myDay.remove({ taskId: seededAssignedTaskId, date: today })
    const final = await caller.personal.myDay.get({ date: today })
    expect(final).toHaveLength(0)
  })

  it('rejects add for a task the actor cannot see', async () => {
    const today = tenantLocalDate(new Date(), tenantTimezone)
    await expect(
      caller.personal.myDay.add({ taskId: seededOtherTenantTaskId, date: today }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('rejects invalid date format', async () => {
    await expect(caller.personal.myDay.get({ date: 'not-a-date' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })

  it('rejects future dates on add', async () => {
    await expect(
      caller.personal.myDay.add({ taskId: seededAssignedTaskId, date: '2099-01-01' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })
})
```

- [ ] **Step 2: Run integration tests — expect failure.**

Run: `bun run --filter api test:integration -- personal.router.integration.spec.ts`
Expected: FAIL — procedures not yet defined.

- [ ] **Step 3: Extend the router.**

```ts
// personal.router.ts — add import block at the top
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { GetMyDayQuery } from '../../application/queries/personal/get-my-day.query'
import { AddToMyDayCommand } from '../../application/commands/my-day/add-to-my-day.command'
import { RemoveFromMyDayCommand } from '../../application/commands/my-day/remove-from-my-day.command'
import { PERMISSIONS } from '../../../../common/auth/permissions'

// YYYY-MM-DD Zod schema. Keeps validation at the transport boundary.
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: 'date must be YYYY-MM-DD',
})

// inside the existing `personal` router object:
myDay: router({
  get: protectedProcedure
    .input(z.object({ date: dateOnly }))
    .query(async ({ ctx, input }) => {
      ctx.auth.requirePermission(PERMISSIONS.PLANNER_PERSONAL_READ)
      return ctx.queryBus.execute(
        new GetMyDayQuery(ctx.actorId, ctx.tenantId, input.date),
      )
    }),

  add: protectedProcedure
    .input(z.object({ taskId: z.string().uuid(), date: dateOnly }))
    .mutation(async ({ ctx, input }) => {
      ctx.auth.requirePermission(PERMISSIONS.PLANNER_PERSONAL_WRITE)
      await ctx.commandBus.execute(
        new AddToMyDayCommand(ctx.actorId, ctx.tenantId, input.taskId, input.date),
      )
    }),

  remove: protectedProcedure
    .input(z.object({ taskId: z.string().uuid(), date: dateOnly }))
    .mutation(async ({ ctx, input }) => {
      ctx.auth.requirePermission(PERMISSIONS.PLANNER_PERSONAL_WRITE)
      await ctx.commandBus.execute(
        new RemoveFromMyDayCommand(ctx.actorId, ctx.tenantId, input.taskId, input.date),
      )
    }),
}),
```

> The `router()` factory comes from the existing `trpc-init` module. Check imports at the top of `personal.router.ts` and add `router` alongside `protectedProcedure` if not already imported.

- [ ] **Step 4: Run integration — expect pass.**

Run: `bun run --filter api test:integration -- personal.router.integration.spec.ts`
Expected: PASS.

- [ ] **Step 5: Run all planner unit tests (sanity).**

Run: `bun run --filter api test:unit`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add apps/api/src/modules/planner/interface/trpc/
git commit -m "feat(planner): personal.myDay.{get,add,remove} tRPC procedures"
```

---

## Task 10 — `useMyDay` React Query hook

**Files:**

- Create: `apps/web-planner/src/lib/hooks/use-my-day.ts`
- Create: `apps/web-planner/src/lib/hooks/use-my-day.spec.ts`

- [ ] **Step 1: Write the failing spec.**

```tsx
// use-my-day.spec.ts
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useMyDay } from './use-my-day'
import { trpcClient } from '../trpc-client'

jest.mock('../trpc-client', () => ({
  trpcClient: { personal: { myDay: { get: { query: jest.fn() } } } },
}))

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useMyDay', () => {
  it('fetches entries for the given date', async () => {
    ;(trpcClient.personal.myDay.get.query as jest.Mock).mockResolvedValue([])
    const { result } = renderHook(() => useMyDay('2026-04-20'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(trpcClient.personal.myDay.get.query).toHaveBeenCalledWith({ date: '2026-04-20' })
  })

  it('uses a date-keyed cache entry', async () => {
    ;(trpcClient.personal.myDay.get.query as jest.Mock).mockResolvedValue([])
    const { result, rerender } = renderHook(({ date }) => useMyDay(date), {
      wrapper,
      initialProps: { date: '2026-04-20' },
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    rerender({ date: '2026-04-21' })
    await waitFor(() => expect(trpcClient.personal.myDay.get.query).toHaveBeenCalledTimes(2))
  })
})
```

- [ ] **Step 2: Run — expect failure.**

Run: `bun test apps/web-planner/src/lib/hooks/use-my-day.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement.**

```ts
// use-my-day.ts
// Consumer of useTenantTimezone (shipped in Plan 3.2) — callers are expected to
// pass the tenant-local "today" string they get from that hook. We do NOT
// compute today here, to keep the cache key stable and predictable.
import { useQuery } from '@tanstack/react-query'
import { trpcClient } from '../trpc-client'
import type { MyDayTask } from '@future/planner-contracts'

export const myDayQueryKey = (date: string) => ['personal', 'myDay', date] as const

export function useMyDay(date: string) {
  return useQuery<MyDayTask[]>({
    queryKey: myDayQueryKey(date),
    queryFn: () => trpcClient.personal.myDay.get.query({ date }),
    staleTime: 30_000,
  })
}
```

If `@future/planner-contracts` doesn't re-export `MyDayTask` yet, add a re-export in `packages/planner-contracts/src/index.ts`: `export type { MyDayTask } from './my-day-task'` and create a matching `my-day-task.ts` mirroring the API type. Keep server + client contract shapes in one file.

- [ ] **Step 4: Run — expect pass.**

Run: `bun test apps/web-planner/src/lib/hooks/use-my-day.spec.ts`
Expected: PASS (2/2).

- [ ] **Step 5: Commit.**

```bash
git add apps/web-planner/src/lib/hooks/use-my-day.ts apps/web-planner/src/lib/hooks/use-my-day.spec.ts packages/planner-contracts/src/
git commit -m "feat(web-planner): useMyDay hook + MyDayTask contract"
```

---

## Task 11 — `useAddToMyDay` optimistic mutation

**Files:**

- Create: `apps/web-planner/src/lib/hooks/use-add-to-my-day.ts`
- Create: `apps/web-planner/src/lib/hooks/use-add-to-my-day.spec.ts`

- [ ] **Step 1: Write the failing spec.**

```tsx
// use-add-to-my-day.spec.ts
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAddToMyDay } from './use-add-to-my-day'
import { myDayQueryKey } from './use-my-day'
import { trpcClient } from '../trpc-client'

jest.mock('../trpc-client', () => ({
  trpcClient: { personal: { myDay: { add: { mutate: jest.fn() } } } },
}))

function setup() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  return { qc, wrapper }
}

describe('useAddToMyDay', () => {
  it('optimistically prepends to the cache then resolves', async () => {
    ;(trpcClient.personal.myDay.add.mutate as jest.Mock).mockResolvedValue(undefined)
    const { qc, wrapper } = setup()
    qc.setQueryData(myDayQueryKey('2026-04-20'), [])

    const { result } = renderHook(() => useAddToMyDay('2026-04-20'), { wrapper })
    await act(async () => {
      result.current.mutate({ taskId: 'task-1', taskStub: { taskId: 'task-1', title: 'x' } as any })
    })
    await waitFor(() =>
      expect((qc.getQueryData(myDayQueryKey('2026-04-20')) as any[])?.length).toBe(1),
    )
  })

  it('rolls back the optimistic update on error', async () => {
    ;(trpcClient.personal.myDay.add.mutate as jest.Mock).mockRejectedValue(new Error('nope'))
    const { qc, wrapper } = setup()
    qc.setQueryData(myDayQueryKey('2026-04-20'), [])

    const { result } = renderHook(() => useAddToMyDay('2026-04-20'), { wrapper })
    await act(async () => {
      try {
        await result.current.mutateAsync({
          taskId: 'task-1',
          taskStub: { taskId: 'task-1', title: 'x' } as any,
        })
      } catch {
        /* expected */
      }
    })
    expect(qc.getQueryData(myDayQueryKey('2026-04-20'))).toEqual([])
  })
})
```

- [ ] **Step 2: Run — expect failure.**

Run: `bun test apps/web-planner/src/lib/hooks/use-add-to-my-day.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement.**

```ts
// use-add-to-my-day.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { trpcClient } from '../trpc-client'
import { myDayQueryKey } from './use-my-day'
import type { MyDayTask } from '@future/planner-contracts'

interface AddVariables {
  taskId: string
  /** Pre-fetched task shape to render optimistically. Supplied from the caller's task row. */
  taskStub: Omit<MyDayTask, 'myDay'>
}

export function useAddToMyDay(date: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ taskId }: AddVariables) => {
      await trpcClient.personal.myDay.add.mutate({ taskId, date })
    },
    onMutate: async ({ taskStub }) => {
      await qc.cancelQueries({ queryKey: myDayQueryKey(date) })
      const previous = qc.getQueryData<MyDayTask[]>(myDayQueryKey(date)) ?? []
      const optimistic: MyDayTask = {
        ...taskStub,
        myDay: { addedAt: new Date().toISOString(), completedAt: null },
      }
      qc.setQueryData<MyDayTask[]>(myDayQueryKey(date), [optimistic, ...previous])
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(myDayQueryKey(date), ctx.previous)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: myDayQueryKey(date) })
    },
  })
}
```

- [ ] **Step 4: Run — expect pass.**

Run: `bun test apps/web-planner/src/lib/hooks/use-add-to-my-day.spec.ts`
Expected: PASS (2/2).

- [ ] **Step 5: Commit.**

```bash
git add apps/web-planner/src/lib/hooks/use-add-to-my-day.ts apps/web-planner/src/lib/hooks/use-add-to-my-day.spec.ts
git commit -m "feat(web-planner): useAddToMyDay optimistic mutation hook"
```

---

## Task 12 — `useRemoveFromMyDay` optimistic mutation

**Files:**

- Create: `apps/web-planner/src/lib/hooks/use-remove-from-my-day.ts`
- Create: `apps/web-planner/src/lib/hooks/use-remove-from-my-day.spec.ts`

Symmetric to Task 11 but filters out the row instead of prepending. Code + spec follow the exact same structure.

- [ ] **Step 1: Write the failing spec.** (shape mirrors Task 11)

```tsx
// use-remove-from-my-day.spec.ts
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useRemoveFromMyDay } from './use-remove-from-my-day'
import { myDayQueryKey } from './use-my-day'
import { trpcClient } from '../trpc-client'

jest.mock('../trpc-client', () => ({
  trpcClient: { personal: { myDay: { remove: { mutate: jest.fn() } } } },
}))

describe('useRemoveFromMyDay', () => {
  it('optimistically drops the row then resolves', async () => {
    ;(trpcClient.personal.myDay.remove.mutate as jest.Mock).mockResolvedValue(undefined)
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    qc.setQueryData(myDayQueryKey('2026-04-20'), [{ taskId: 't1' }, { taskId: 't2' }])
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useRemoveFromMyDay('2026-04-20'), { wrapper })
    await act(async () => result.current.mutate({ taskId: 't1' }))
    await waitFor(() => {
      const cache = qc.getQueryData(myDayQueryKey('2026-04-20')) as Array<{ taskId: string }>
      expect(cache.map((r) => r.taskId)).toEqual(['t2'])
    })
  })

  it('rolls back on error', async () => {
    ;(trpcClient.personal.myDay.remove.mutate as jest.Mock).mockRejectedValue(new Error('nope'))
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    qc.setQueryData(myDayQueryKey('2026-04-20'), [{ taskId: 't1' }])
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useRemoveFromMyDay('2026-04-20'), { wrapper })
    await act(async () => {
      try {
        await result.current.mutateAsync({ taskId: 't1' })
      } catch {}
    })
    expect(qc.getQueryData(myDayQueryKey('2026-04-20'))).toEqual([{ taskId: 't1' }])
  })
})
```

- [ ] **Step 2: Run — expect failure.**

Run: `bun test apps/web-planner/src/lib/hooks/use-remove-from-my-day.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.**

```ts
// use-remove-from-my-day.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { trpcClient } from '../trpc-client'
import { myDayQueryKey } from './use-my-day'
import type { MyDayTask } from '@future/planner-contracts'

interface RemoveVariables {
  taskId: string
}

export function useRemoveFromMyDay(date: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ taskId }: RemoveVariables) => {
      await trpcClient.personal.myDay.remove.mutate({ taskId, date })
    },
    onMutate: async ({ taskId }) => {
      await qc.cancelQueries({ queryKey: myDayQueryKey(date) })
      const previous = qc.getQueryData<MyDayTask[]>(myDayQueryKey(date)) ?? []
      qc.setQueryData<MyDayTask[]>(
        myDayQueryKey(date),
        previous.filter((r) => r.taskId !== taskId),
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(myDayQueryKey(date), ctx.previous)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: myDayQueryKey(date) })
    },
  })
}
```

- [ ] **Step 4: Run — expect pass.**

Run: `bun test apps/web-planner/src/lib/hooks/use-remove-from-my-day.spec.ts`
Expected: PASS (2/2).

- [ ] **Step 5: Commit.**

```bash
git add apps/web-planner/src/lib/hooks/use-remove-from-my-day.ts apps/web-planner/src/lib/hooks/use-remove-from-my-day.spec.ts
git commit -m "feat(web-planner): useRemoveFromMyDay optimistic mutation hook"
```

---

## Task 13 — `AddToMyDayButton` component

**Files:**

- Create: `apps/web-planner/src/components/my-day/add-to-my-day-button.tsx`
- Create: `apps/web-planner/src/components/my-day/add-to-my-day-button.spec.tsx`

Responsibilities:

1. Accept a `task: TaskFlatWithPlan` plus a `mode: 'menu-item' | 'button'` prop.
2. If `inMyDay` is `true`, render the "Remove from My Day" label and fire `useRemoveFromMyDay`; otherwise render "Focus today" + `Sun` icon and fire `useAddToMyDay`.
3. Use the tenant-local "today" string via `useTenantTimezone()` + `Intl.DateTimeFormat`. This keeps the server + client aligned without a server roundtrip.
4. Disable while mutation is pending; show a `<Spinner />` per design rule.
5. In `menu-item` mode render as a shadcn `DropdownMenuItem`. In `button` mode render as `<Button variant="ghost" size="sm">`.

- [ ] **Step 1: Write the failing spec.**

```tsx
// add-to-my-day-button.spec.tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AddToMyDayButton } from './add-to-my-day-button'
import { trpcClient } from '../../lib/trpc-client'

jest.mock('../../lib/trpc-client', () => ({
  trpcClient: {
    personal: { myDay: { add: { mutate: jest.fn() }, remove: { mutate: jest.fn() } } },
  },
}))
jest.mock('../../lib/hooks/use-tenant-timezone', () => ({
  useTenantTimezone: () => ({ timezone: 'Asia/Ho_Chi_Minh' }),
}))

const task = {
  taskId: 't1',
  title: 'Task 1',
  planId: 'p1',
  planName: 'Personal',
  planKind: 'personal',
} as any

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('AddToMyDayButton', () => {
  it('renders Focus today when the task is not in My Day', () => {
    wrap(<AddToMyDayButton task={task} inMyDay={false} mode="button" />)
    expect(screen.getByRole('button', { name: /focus today/i })).toBeInTheDocument()
  })

  it('calls add.mutate when clicked and not in My Day', async () => {
    ;(trpcClient.personal.myDay.add.mutate as jest.Mock).mockResolvedValue(undefined)
    wrap(<AddToMyDayButton task={task} inMyDay={false} mode="button" />)
    await userEvent.click(screen.getByRole('button', { name: /focus today/i }))
    await waitFor(() => expect(trpcClient.personal.myDay.add.mutate).toHaveBeenCalled())
  })

  it('renders Remove from My Day when task is in My Day', () => {
    wrap(<AddToMyDayButton task={task} inMyDay mode="button" />)
    expect(screen.getByRole('button', { name: /remove from my day/i })).toBeInTheDocument()
  })

  it('calls remove.mutate when clicked and in My Day', async () => {
    ;(trpcClient.personal.myDay.remove.mutate as jest.Mock).mockResolvedValue(undefined)
    wrap(<AddToMyDayButton task={task} inMyDay mode="button" />)
    await userEvent.click(screen.getByRole('button', { name: /remove from my day/i }))
    await waitFor(() => expect(trpcClient.personal.myDay.remove.mutate).toHaveBeenCalled())
  })
})
```

- [ ] **Step 2: Run — expect failure.**

Run: `bun test apps/web-planner/src/components/my-day/add-to-my-day-button.spec.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement.**

```tsx
// add-to-my-day-button.tsx
'use client'

import { Sun, SunOff } from 'lucide-react'
import { Button, Spinner } from '@future/ui'
import { DropdownMenuItem } from '@future/ui/dropdown-menu'
import { useTenantTimezone } from '../../lib/hooks/use-tenant-timezone'
import { useAddToMyDay } from '../../lib/hooks/use-add-to-my-day'
import { useRemoveFromMyDay } from '../../lib/hooks/use-remove-from-my-day'
import type { TaskFlatWithPlan } from '@future/planner-contracts'

interface Props {
  task: TaskFlatWithPlan
  inMyDay: boolean
  mode: 'menu-item' | 'button'
}

function todayInTimezone(tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function AddToMyDayButton({ task, inMyDay, mode }: Props) {
  const { timezone } = useTenantTimezone()
  const date = todayInTimezone(timezone)
  const add = useAddToMyDay(date)
  const remove = useRemoveFromMyDay(date)

  const label = inMyDay ? 'Remove from My Day' : 'Focus today'
  const Icon = inMyDay ? SunOff : Sun
  const pending = inMyDay ? remove.isPending : add.isPending

  const onClick = () => {
    if (inMyDay) {
      remove.mutate({ taskId: task.taskId })
    } else {
      add.mutate({ taskId: task.taskId, taskStub: task })
    }
  }

  if (mode === 'menu-item') {
    return (
      <DropdownMenuItem onSelect={onClick} disabled={pending}>
        <Icon className="mr-2 size-4" aria-hidden />
        {label}
        {pending ? <Spinner className="ml-auto size-4" /> : null}
      </DropdownMenuItem>
    )
  }

  return (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={pending}>
      <Icon className="mr-2 size-4" aria-hidden />
      {label}
      {pending ? <Spinner className="ml-2 size-4" /> : null}
    </Button>
  )
}
```

- [ ] **Step 4: Run — expect pass.**

Run: `bun test apps/web-planner/src/components/my-day/add-to-my-day-button.spec.tsx`
Expected: PASS (4/4).

- [ ] **Step 5: Commit.**

```bash
git add apps/web-planner/src/components/my-day/add-to-my-day-button.tsx apps/web-planner/src/components/my-day/add-to-my-day-button.spec.tsx
git commit -m "feat(web-planner): AddToMyDayButton component"
```

---

## Task 14 — Wire `AddToMyDayButton` into task card kebab + detail panel

**Files:**

- Modify: `apps/web-planner/src/components/task-card/task-card-kebab.tsx`
- Modify: `apps/web-planner/src/components/task-detail/task-detail-panel.tsx`

If the existing file paths differ, confirm with `ls apps/web-planner/src/components/` first and adapt — the Sub-project #2 task card + detail panel are the integration points.

- [ ] **Step 1: Task card kebab.**

Import `AddToMyDayButton` and insert it as the **first** menu item in the dropdown, separated from the existing items by a `<DropdownMenuSeparator />` below it.

The kebab needs to know `inMyDay` — add it as a prop on the card:

```tsx
interface TaskCardKebabProps {
  task: TaskFlatWithPlan
  inMyDay?: boolean // undefined in contexts that don't know (e.g. raw plan views); defaults to false
}
```

Inside:

```tsx
<DropdownMenuContent>
  <AddToMyDayButton task={task} inMyDay={inMyDay ?? false} mode="menu-item" />
  <DropdownMenuSeparator />
  {/* existing items */}
</DropdownMenuContent>
```

- [ ] **Step 2: Detail panel.**

Import `AddToMyDayButton` and render it as a `mode="button"` in the panel header toolbar, alongside other header actions. Same `inMyDay` prop threading.

For plan-route usage, `inMyDay` is unknown without a second query — accept `undefined` and default to `false`. The My Day view itself always passes `true` because every row on the page is by construction in My Day.

- [ ] **Step 3: Update/extend the existing kebab + detail panel specs.**

Add a sanity test in each:

```tsx
it('renders the Add to My Day menu item', () => {
  render(<TaskCardKebab task={task} inMyDay={false} />)
  // open the menu…
  expect(screen.getByText(/focus today/i)).toBeInTheDocument()
})
```

- [ ] **Step 4: Run tests — expect pass.**

Run: `bun test apps/web-planner/src/components/task-card/ apps/web-planner/src/components/task-detail/`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/web-planner/src/components/task-card/ apps/web-planner/src/components/task-detail/
git commit -m "feat(web-planner): wire AddToMyDayButton into task card + detail panel"
```

---

## Task 15 — `MyDayEmptyState` component

**Files:**

- Create: `apps/web-planner/src/components/my-day/my-day-empty-state.tsx`
- Create: `apps/web-planner/src/components/my-day/my-day-empty-state.spec.tsx`

Per spec 8.7: **"Nothing scheduled for today. Click 'Focus today' on any task to add it here."**

- [ ] **Step 1: Write failing spec.**

```tsx
// my-day-empty-state.spec.tsx
import { render, screen } from '@testing-library/react'
import { MyDayEmptyState } from './my-day-empty-state'

describe('MyDayEmptyState', () => {
  it('renders the spec copy', () => {
    render(<MyDayEmptyState />)
    expect(screen.getByText(/nothing scheduled for today/i)).toBeInTheDocument()
    expect(screen.getByText(/focus today/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run — expect failure.**

Run: `bun test apps/web-planner/src/components/my-day/my-day-empty-state.spec.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement.**

```tsx
// my-day-empty-state.tsx
import { Sun } from 'lucide-react'

export function MyDayEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <Sun className="size-10 text-muted-foreground" aria-hidden />
      <h3 className="text-lg font-medium">Nothing scheduled for today</h3>
      <p className="max-w-md text-sm text-muted-foreground">
        Click <span className="font-medium">Focus today</span> on any task to add it here.
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Run — expect pass.**

Run: `bun test apps/web-planner/src/components/my-day/my-day-empty-state.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/web-planner/src/components/my-day/my-day-empty-state.tsx apps/web-planner/src/components/my-day/my-day-empty-state.spec.tsx
git commit -m "feat(web-planner): MyDayEmptyState component"
```

---

## Task 16 — Remove placeholder `today/page.tsx` redirect from 3.2

**Files:**

- Delete: `apps/web-planner/src/app/personal/today/page.tsx`

In Plan 3.2 a tiny placeholder page at `/personal/today/page.tsx` was added to keep the sidebar link from 404'ing. With the real layout + view pages landing next, we replace it with `/personal/today/board/page.tsx` plus a layout-level default routing; no root `page.tsx` is needed.

- [ ] **Step 1: Delete the placeholder.**

```bash
git rm apps/web-planner/src/app/personal/today/page.tsx
```

- [ ] **Step 2: Commit after Task 17 (layout) lands so the route tree stays consistent.**

Hold this commit — fold it into Task 17's commit to avoid a transient broken state in bisect.

---

## Task 17 — `/personal/today/layout.tsx`

**Files:**

- Create: `apps/web-planner/src/app/personal/today/layout.tsx`

The layout:

1. Reads the tenant timezone via `useTenantTimezone()`, computes today's date, passes it via React Context (`MyDayContext`) to child pages.
2. Renders the shared view picker + filter bar + group-by picker (reused from Sub-project #2 via `<ViewPicker />` and `<FilterBar />`).
3. Renders a date header — "Today, Monday April 20" localised to tenant timezone.
4. Renders children (board/grid/schedule/charts page).
5. Sets view-state scope to `'my-day'` so localStorage keys don't collide with `my-tasks` view state.

- [ ] **Step 1: Create the layout.**

```tsx
// apps/web-planner/src/app/personal/today/layout.tsx
'use client'

import { createContext, useContext, useMemo } from 'react'
import { useTenantTimezone } from '../../../lib/hooks/use-tenant-timezone'
import { ViewPicker } from '../../../components/views/view-picker'
import { FilterBar } from '../../../components/views/filter-bar'
import { ViewStateProvider } from '../../../lib/hooks/useViewState'

interface MyDayCtx {
  date: string
  timezone: string
}
const MyDayContext = createContext<MyDayCtx | null>(null)

export function useMyDayContext(): MyDayCtx {
  const ctx = useContext(MyDayContext)
  if (!ctx) throw new Error('useMyDayContext must be used within /personal/today/*')
  return ctx
}

function todayInTz(tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

function humanHeader(date: string, tz: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${date}T12:00:00Z`))
}

export default function TodayLayout({ children }: { children: React.ReactNode }) {
  const { timezone } = useTenantTimezone()
  const date = todayInTz(timezone)
  const value = useMemo(() => ({ date, timezone }), [date, timezone])

  return (
    <MyDayContext.Provider value={value}>
      <ViewStateProvider scope="my-day" defaultGroupBy="progress">
        <div className="flex h-full flex-col">
          <header className="flex items-baseline justify-between border-b px-6 py-4">
            <div>
              <h1 className="text-xl font-semibold">My Day</h1>
              <p className="text-sm text-muted-foreground">Today · {humanHeader(date, timezone)}</p>
            </div>
            <ViewPicker routeBase="/personal/today" />
          </header>
          <FilterBar />
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </ViewStateProvider>
    </MyDayContext.Provider>
  )
}
```

> If `ViewStateProvider` doesn't support a `scope` prop yet, follow the Sub-project #2 convention — the provider should already accept a scope-like key; adapt the prop name as needed. If it doesn't support `defaultGroupBy`, drop that prop and explicitly set the store value in a `useEffect` on mount.

- [ ] **Step 2: Commit the deleted placeholder + the new layout together.**

```bash
git rm apps/web-planner/src/app/personal/today/page.tsx
git add apps/web-planner/src/app/personal/today/layout.tsx
git commit -m "feat(web-planner): /personal/today layout + drop placeholder"
```

---

## Task 18 — `/personal/today/board/page.tsx` (default view)

**Files:**

- Create: `apps/web-planner/src/app/personal/today/board/page.tsx`

Default group-by is **Progress** (spec 3.4 phasing row). Reuses the Board view primitive from Sub-project #2 Plan 02. Filter + group-by come from `useViewState` context (scope `'my-day'`).

- [ ] **Step 1: Implement the page.**

```tsx
// apps/web-planner/src/app/personal/today/board/page.tsx
'use client'

import { useMyDay } from '../../../../lib/hooks/use-my-day'
import { useMyDayContext } from '../layout'
import { useViewState } from '../../../../lib/hooks/useViewState'
import { BoardView } from '../../../../components/views/board-view'
import { MyDayEmptyState } from '../../../../components/my-day/my-day-empty-state'
import { Skeleton } from '@future/ui'

export default function MyDayBoardPage() {
  const { date } = useMyDayContext()
  const { groupBy, filter, sort } = useViewState()
  const { data, isLoading, isError } = useMyDay(date)

  if (isLoading) return <Skeleton className="h-full w-full" />
  if (isError)
    return <div className="p-6 text-sm text-destructive">Failed to load My Day. Retrying…</div>
  if (!data || data.length === 0) return <MyDayEmptyState />

  return (
    <BoardView tasks={data} groupBy={groupBy ?? 'progress'} filter={filter} sort={sort} isInMyDay />
  )
}
```

The `isInMyDay` prop tells the Board view to render the card kebab's `AddToMyDayButton` with `inMyDay={true}` (so it becomes the "Remove from My Day" item). Pipe this through in the Board → task-card chain if not already supported — a one-line prop drill.

- [ ] **Step 2: Write a smoke test.**

```tsx
// apps/web-planner/src/app/personal/today/board/page.spec.tsx
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Page from './page'

jest.mock('../../../../lib/hooks/use-my-day', () => ({
  useMyDay: () => ({ data: [], isLoading: false, isError: false }),
}))
jest.mock('../layout', () => ({
  useMyDayContext: () => ({ date: '2026-04-20', timezone: 'Asia/Ho_Chi_Minh' }),
}))
jest.mock('../../../../lib/hooks/useViewState', () => ({
  useViewState: () => ({ groupBy: 'progress', filter: {}, sort: {} }),
}))

describe('MyDayBoardPage', () => {
  it('renders the empty state when no entries', () => {
    const qc = new QueryClient()
    render(
      <QueryClientProvider client={qc}>
        <Page />
      </QueryClientProvider>,
    )
    expect(screen.getByText(/nothing scheduled for today/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run — expect pass.**

Run: `bun test apps/web-planner/src/app/personal/today/board/page.spec.tsx`
Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add apps/web-planner/src/app/personal/today/board/
git commit -m "feat(web-planner): /personal/today/board Board view (default Progress group-by)"
```

---

## Task 19 — `/personal/today/grid/page.tsx`

**Files:**

- Create: `apps/web-planner/src/app/personal/today/grid/page.tsx`

Mirrors Task 18 but uses `<GridView>` from Sub-project #2 Plan 02.

- [ ] **Step 1: Implement.**

```tsx
// apps/web-planner/src/app/personal/today/grid/page.tsx
'use client'

import { useMyDay } from '../../../../lib/hooks/use-my-day'
import { useMyDayContext } from '../layout'
import { useViewState } from '../../../../lib/hooks/useViewState'
import { GridView } from '../../../../components/views/grid-view'
import { MyDayEmptyState } from '../../../../components/my-day/my-day-empty-state'
import { Skeleton } from '@future/ui'

export default function MyDayGridPage() {
  const { date } = useMyDayContext()
  const { filter, sort } = useViewState()
  const { data, isLoading, isError } = useMyDay(date)

  if (isLoading) return <Skeleton className="h-full w-full" />
  if (isError)
    return <div className="p-6 text-sm text-destructive">Failed to load My Day. Retrying…</div>
  if (!data || data.length === 0) return <MyDayEmptyState />

  return <GridView tasks={data} filter={filter} sort={sort} isInMyDay />
}
```

- [ ] **Step 2: Smoke test** mirroring Task 18.

- [ ] **Step 3: Commit.**

```bash
git add apps/web-planner/src/app/personal/today/grid/
git commit -m "feat(web-planner): /personal/today/grid Grid view"
```

---

## Task 20 — `/personal/today/schedule/page.tsx`

**Files:**

- Create: `apps/web-planner/src/app/personal/today/schedule/page.tsx`

Uses the Schedule view from Sub-project #2 Plan 03 (`@future/schedule` package). The Schedule view defaults to a "week containing today" window — for My Day, restrict to the single day by passing `window={{ from: date, to: date }}`.

- [ ] **Step 1: Implement.**

```tsx
// apps/web-planner/src/app/personal/today/schedule/page.tsx
'use client'

import { useMyDay } from '../../../../lib/hooks/use-my-day'
import { useMyDayContext } from '../layout'
import { ScheduleView } from '@future/schedule'
import { MyDayEmptyState } from '../../../../components/my-day/my-day-empty-state'
import { Skeleton } from '@future/ui'

export default function MyDaySchedulePage() {
  const { date, timezone } = useMyDayContext()
  const { data, isLoading, isError } = useMyDay(date)

  if (isLoading) return <Skeleton className="h-full w-full" />
  if (isError)
    return <div className="p-6 text-sm text-destructive">Failed to load My Day. Retrying…</div>
  if (!data || data.length === 0) return <MyDayEmptyState />

  return <ScheduleView tasks={data} window={{ from: date, to: date }} timezone={timezone} />
}
```

- [ ] **Step 2: Smoke test.**

- [ ] **Step 3: Commit.**

```bash
git add apps/web-planner/src/app/personal/today/schedule/
git commit -m "feat(web-planner): /personal/today/schedule Schedule view"
```

---

## Task 21 — `/personal/today/charts/page.tsx`

**Files:**

- Create: `apps/web-planner/src/app/personal/today/charts/page.tsx`

Charts for My Day is intentionally simple: the existing `personal.getCharts` procedure (Plan 3.3) is called with `filter.taskIds = [...today's ids]`. No new backend surface.

- [ ] **Step 1: Implement.**

```tsx
// apps/web-planner/src/app/personal/today/charts/page.tsx
'use client'

import { useMyDay } from '../../../../lib/hooks/use-my-day'
import { useMyDayContext } from '../layout'
import { useQuery } from '@tanstack/react-query'
import { trpcClient } from '../../../../lib/trpc-client'
import { ChartsView } from '../../../../components/views/charts-view'
import { MyDayEmptyState } from '../../../../components/my-day/my-day-empty-state'
import { Skeleton } from '@future/ui'

export default function MyDayChartsPage() {
  const { date } = useMyDayContext()
  const { data: entries, isLoading } = useMyDay(date)

  const taskIds = entries?.map((e) => e.taskId) ?? []
  const charts = useQuery({
    queryKey: ['personal', 'myDay', 'charts', date, taskIds.join(',')],
    queryFn: () => trpcClient.personal.getCharts.query({ filter: { taskIds } }),
    enabled: !isLoading && taskIds.length > 0,
  })

  if (isLoading) return <Skeleton className="h-full w-full" />
  if (!entries || entries.length === 0) return <MyDayEmptyState />
  if (charts.isLoading || !charts.data) return <Skeleton className="h-full w-full" />

  return <ChartsView data={charts.data} />
}
```

> **Check the `personal.getCharts` input schema.** If Plan 3.3 didn't ship `filter.taskIds` as a field, add it there — the spec's "all four views on My Day" requires it. If the `filter` shape is already `TaskFilter`, add `taskIds?: string[]` to the filter type and honor it in the handler SQL (`WHERE task.id = ANY(:taskIds)`). Land that change as part of this task's commit, and add a quick unit test at `get-charts-for-actor.handler.spec.ts` asserting the filter is applied.

- [ ] **Step 2: Smoke test.**

- [ ] **Step 3: Commit.**

```bash
git add apps/web-planner/src/app/personal/today/charts/ apps/api/src/modules/planner/application/queries/personal/
git commit -m "feat(web-planner): /personal/today/charts Charts view with taskIds filter"
```

---

## Task 22 — Coverage + final verification

- [ ] **Step 1: Run the full planner unit suite.**

```bash
bun run --filter api test:unit -- planner
bun run --filter web-planner test
```

Expected: all green.

- [ ] **Step 2: Run the personal router integration tests.**

```bash
bun run --filter api test:integration -- personal.router.integration
```

Expected: all green.

- [ ] **Step 3: Check coverage thresholds.**

```bash
bun run --filter api test:coverage -- planner
bun run --filter web-planner test:coverage
```

Coverage must be ≥70% on lines, branches, and functions for:

- `apps/api/src/modules/planner/application/commands/my-day/**`
- `apps/api/src/modules/planner/application/queries/personal/get-my-day.*`
- `apps/api/src/modules/planner/application/listeners/task-progress-completed.*`
- `apps/api/src/modules/planner/infrastructure/repositories/drizzle-my-day.*`
- `apps/web-planner/src/lib/hooks/use-my-day.ts`
- `apps/web-planner/src/lib/hooks/use-add-to-my-day.ts`
- `apps/web-planner/src/lib/hooks/use-remove-from-my-day.ts`
- `apps/web-planner/src/components/my-day/**`

If any area is below 70%, add tests until it passes. Do not merge a coverage regression.

- [ ] **Step 4: Manual smoke test against running dev stack.**

```bash
bun run dev
```

Open `http://localhost:3001/personal/today/board`. Confirm:

1. Empty state renders with copy "Nothing scheduled for today."
2. Navigate to a plan → open a task → click the kebab → "Focus today" adds it. Go back to `/personal/today/board`; task appears.
3. In the card kebab on My Day, the same menu item now reads "Remove from My Day". Click → optimistic remove works.
4. Change the task's progress to 100% via the normal progress control. Reopen the task detail panel on My Day; `completedAt` should now be populated (surfaced as a checkmark or similar).
5. Switch between Board / Grid / Schedule / Charts via the view picker. All four render without errors.

- [ ] **Step 5: Commit any coverage-backfill tests separately.**

```bash
git add <test files>
git commit -m "test(planner): backfill my-day coverage to ≥70%"
```

- [ ] **Step 6: Open the PR.**

```bash
gh pr create --title "feat(planner): Plan 3.4 — My Day core" --body "$(cat <<'EOF'
## Summary
- `personal.myDay.{get,add,remove}` tRPC procedures
- `MyDayRepository` + `DrizzleMyDayRepository`
- `TaskProgressSetEvent` listener marks `my_day_entry.completed_at`
- `/personal/today/{board,grid,schedule,charts}` routes with default Progress group-by on Board
- `AddToMyDayButton` wired into task card kebab + task detail panel

Out of scope (shipped in Plan 3.5): carry-over banner, orphan-sweep nightly job, E2E coverage.

## Test plan
- [ ] `bun run --filter api test:unit -- planner` green
- [ ] `bun run --filter api test:integration -- personal.router.integration` green
- [ ] `bun run --filter web-planner test` green
- [ ] Coverage ≥70% on new files
- [ ] Manual smoke: add → see on /personal/today/board → complete task → completedAt populated → remove → gone
EOF
)"
```

---

## Acceptance checklist

- [ ] `my_day_entry` rows created only via `personal.myDay.add`; no other write path.
- [ ] `completedAt` auto-populated by the listener on `progress=100`.
- [ ] `/personal/today/board` is the Personal Hubs default and opens to the Progress-grouped board.
- [ ] Four view tabs all functional. Empty state shown when no entries exist for today.
- [ ] Task card kebab shows "Focus today" or "Remove from My Day" based on context.
- [ ] Task detail panel has the same toggle in the header toolbar.
- [ ] Mutations are optimistic and roll back on server error.
- [ ] No outbox events emitted for My Day state changes.
- [ ] No `Promise.all` for DB queries in any new handler.
- [ ] All unit + integration tests pass; coverage ≥70% on new files.
- [ ] No `.js` extensions on relative imports anywhere in new code.
- [ ] Plan 3.5 work (carry-over, orphan sweep, Playwright) is untouched.
