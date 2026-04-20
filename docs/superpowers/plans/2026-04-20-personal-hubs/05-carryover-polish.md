# Plan 3.5 — Carry-over + Polish (Sub-project #3 Close-out)

> Covers spec **Plan 3.5** — see [design spec §3 (Carry-over mechanics)](../../specs/2026-04-20-personal-hubs-design.md#carry-over-mechanics), [§7.1 `personal.myDay.{getCarryOverCandidates, carryOver}`](../../specs/2026-04-20-personal-hubs-design.md#71-new-personal-router), [§8.8 (Carry-over banner UX)](../../specs/2026-04-20-personal-hubs-design.md#88-carry-over-banner-ux), [§10 Risks](../../specs/2026-04-20-personal-hubs-design.md#risks--mitigations).
> Depends on Plan 3.4 merged — `my_day_entry` table populated, `personal.myDay.{get,add,remove}` live, `completed_at` wired via the `TaskProgressSetEvent` listener.

**Goal:** Ship the final slice of Sub-project #3. Two new tRPC procedures (`getCarryOverCandidates`, `carryOver`) let yesterday's uncompleted My Day entries be re-added to today. A dismissible banner in the My Day layout surfaces the prompt once per tenant-local day, per spec 8.8. A nightly pg-boss job sweeps orphan `my_day_entry` rows whose referenced task has been deleted. A Playwright E2E proves the whole Personal Hubs flow end-to-end. The sub-project closes with an acceptance-sign-off checklist and short housekeeping commits to the briefing and AGENTS.md.

**Architecture:** Query handler reads yesterday's `my_day_entry` rows for the actor, joins `planner.task` to filter to `progress < 100`, returns the same `MyDayTask[]` shape as `personal.myDay.get`. Command handler inserts new `my_day_entry` rows for `toDate` with `ON CONFLICT DO NOTHING` (idempotent). The orphan-sweep job follows the recurring-job pattern landed in Sub-project #2 Plan 05 (`task-daily-snapshot.scheduler.ts`) — `boss.schedule(name, cron)` + `boss.work(name, handler)` wired from a module-init scheduler. Banner lives in `apps/web-planner/src/components/my-day/` and is rendered by the My Day layout above the view content. Dismissal state is `localStorage` only — **no DB-backed dismissal table** (locked decision 9).

**Tech stack:** NestJS CQRS, Drizzle ORM, Postgres, pg-boss (`PgBossService`), tRPC + zod, React 19 / Next.js / React Query, `@future/ui` primitives, `lucide-react`, Vitest (unit + integration), Playwright (E2E).

---

## File Map

### Backend — `getCarryOverCandidates`

| File                                                                                                              | Action | Purpose                                                                                 |
| ----------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| `apps/api/src/modules/planner/application/queries/personal/get-carry-over-candidates.query.ts`                    | Create | Query DTO                                                                               |
| `apps/api/src/modules/planner/application/queries/personal/get-carry-over-candidates.handler.ts`                  | Create | Reads yesterday's entries where `completed_at IS NULL` and joined `task.progress < 100` |
| `apps/api/src/modules/planner/application/queries/personal/get-carry-over-candidates.handler.spec.ts`             | Create | Unit test (mocked repo)                                                                 |
| `apps/api/src/modules/planner/application/queries/personal/get-carry-over-candidates.handler.integration.spec.ts` | Create | Integration test — real DB, seeded fixture                                              |

### Backend — `carryOver` mutation

| File                                                                                                           | Action | Purpose                                                                       |
| -------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------- |
| `apps/api/src/modules/planner/application/commands/my-day/carry-over.command.ts`                               | Create | Command DTO                                                                   |
| `apps/api/src/modules/planner/application/commands/my-day/carry-over.handler.ts`                               | Create | Bulk `INSERT … ON CONFLICT DO NOTHING` per taskId, returns `{ carriedCount }` |
| `apps/api/src/modules/planner/application/commands/my-day/carry-over.handler.spec.ts`                          | Create | Unit tests — happy path, idempotency, empty input                             |
| `apps/api/src/modules/planner/application/commands/my-day/carry-over.handler.integration.spec.ts`              | Create | Integration — verifies rows exist post-insert, repeat = no duplication        |
| `apps/api/src/modules/planner/domain/repositories/my-day-entry.repository.ts`                                  | Modify | Add `insertMany(entries: MyDayEntryRow[]): Promise<number>` port method       |
| `apps/api/src/modules/planner/infrastructure/repositories/drizzle-my-day-entry.repository.ts`                  | Modify | Implement `insertMany` with `onConflictDoNothing`                             |
| `apps/api/src/modules/planner/infrastructure/repositories/drizzle-my-day-entry.repository.integration.spec.ts` | Modify | Add coverage for `insertMany`                                                 |

### Backend — tRPC router wiring

| File                                                                  | Action | Purpose                                                            |
| --------------------------------------------------------------------- | ------ | ------------------------------------------------------------------ |
| `apps/api/src/modules/planner/interface/trpc/personal.router.ts`      | Modify | Add `myDay.getCarryOverCandidates` + `myDay.carryOver` procedures  |
| `apps/api/src/modules/planner/interface/trpc/personal.router.spec.ts` | Modify | Cover both procedures — input validation + authorization           |
| `apps/api/src/modules/planner/planner.module.ts`                      | Modify | Register `CarryOverMyDayHandler` + `GetCarryOverCandidatesHandler` |

### Backend — orphan-sweep job

| File                                                                                           | Action | Purpose                                                                 |
| ---------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| `apps/api/src/modules/planner/infrastructure/jobs/my-day-orphan-sweep.job.ts`                  | Create | Worker — deletes `my_day_entry` rows whose `task_id` no longer resolves |
| `apps/api/src/modules/planner/infrastructure/jobs/my-day-orphan-sweep.job.spec.ts`             | Create | Unit test                                                               |
| `apps/api/src/modules/planner/infrastructure/jobs/my-day-orphan-sweep.job.integration.spec.ts` | Create | Integration — seeds 5 entries (2 orphan), asserts exactly 3 survive     |
| `apps/api/src/modules/planner/infrastructure/jobs/my-day-orphan-sweep.scheduler.ts`            | Create | Registers recurring job at 03:00 UTC on module init                     |
| `apps/api/src/modules/planner/infrastructure/jobs/my-day-orphan-sweep.scheduler.spec.ts`       | Create | Asserts `boss.schedule` + `boss.work` called with correct args          |

### Frontend — carry-over hooks + banner

| File                                                                       | Action | Purpose                                                                     |
| -------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------- |
| `apps/web-planner/src/lib/hooks/use-carry-over.ts`                         | Create | `useMyDayCarryOverCandidates(date)` + `useCarryOver()` React Query wrappers |
| `apps/web-planner/src/lib/hooks/use-carry-over.spec.tsx`                   | Create | Unit tests — cache key, invalidation targets                                |
| `apps/web-planner/src/components/my-day/carry-over-banner.tsx`             | Create | Banner component per spec 8.8                                               |
| `apps/web-planner/src/components/my-day/carry-over-banner.spec.tsx`        | Create | Unit tests — dismissal persistence, actions, empty-state hiding             |
| `apps/web-planner/src/components/my-day/carry-over-picker-dialog.tsx`      | Create | "Pick which" multi-select dialog                                            |
| `apps/web-planner/src/components/my-day/carry-over-picker-dialog.spec.tsx` | Create | Unit tests                                                                  |
| `apps/web-planner/src/app/personal/today/layout.tsx`                       | Modify | Mount `<CarryOverBanner />` above view content                              |

### E2E + housekeeping

| File                                                               | Action | Purpose                                                                                   |
| ------------------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------- |
| `apps/web-planner/e2e/personal-hubs.spec.ts`                       | Create | Full end-to-end: My Day empty → add → complete → simulate yesterday → banner → carry over |
| `docs/superpowers/plans/2026-04-18-planner-future-sub-projects.md` | Modify | Add close-out note: shipped date, PRs, flag state                                         |
| `AGENTS.md`                                                        | Modify | Add one-line "Personal Hubs" navigation rule under Sidebar section (if missing)           |
| `CLAUDE.md`                                                        | Modify | Mirror the same AGENTS.md update                                                          |

### Dependencies

No new packages. Everything on hand from prior plans (`date-fns-tz` server-side, `lucide-react` icons, `@future/ui` primitives).

---

## Task 1 — Query handler: `GetCarryOverCandidatesQuery` (TDD)

**Files:**

- Create: `apps/api/src/modules/planner/application/queries/personal/get-carry-over-candidates.query.ts`
- Create: `apps/api/src/modules/planner/application/queries/personal/get-carry-over-candidates.handler.ts`
- Create: `apps/api/src/modules/planner/application/queries/personal/get-carry-over-candidates.handler.spec.ts`

- [ ] **Step 1: Write the failing unit test first.**

```ts
// get-carry-over-candidates.handler.spec.ts
import { Test } from '@nestjs/testing'
import { GetCarryOverCandidatesHandler } from './get-carry-over-candidates.handler'
import { GetCarryOverCandidatesQuery } from './get-carry-over-candidates.query'
import { MY_DAY_ENTRY_REPOSITORY } from '../../../domain/repositories/my-day-entry.repository'

describe('GetCarryOverCandidatesHandler', () => {
  const actorId = '00000000-0000-0000-0000-0000000000a1'
  const tenantId = '00000000-0000-0000-0000-0000000000t1'
  const today = '2026-04-20'
  const yesterday = '2026-04-19'

  let repo: { findCandidatesForCarryOver: ReturnType<typeof vi.fn> }
  let handler: GetCarryOverCandidatesHandler

  beforeEach(async () => {
    repo = { findCandidatesForCarryOver: vi.fn() }
    const moduleRef = await Test.createTestingModule({
      providers: [
        GetCarryOverCandidatesHandler,
        { provide: MY_DAY_ENTRY_REPOSITORY, useValue: repo },
      ],
    }).compile()
    handler = moduleRef.get(GetCarryOverCandidatesHandler)
  })

  it('queries the repo using yesterday = today - 1 day', async () => {
    repo.findCandidatesForCarryOver.mockResolvedValue([])
    await handler.execute(new GetCarryOverCandidatesQuery(actorId, tenantId, today))
    expect(repo.findCandidatesForCarryOver).toHaveBeenCalledWith({
      actorId,
      tenantId,
      yesterday,
    })
  })

  it('returns the rows returned by the repo unchanged', async () => {
    const rows = [{ taskId: 't1', planId: 'p1', title: 'Do the thing' }] as any
    repo.findCandidatesForCarryOver.mockResolvedValue(rows)
    const out = await handler.execute(new GetCarryOverCandidatesQuery(actorId, tenantId, today))
    expect(out).toBe(rows)
  })

  it('rejects invalid today format', async () => {
    await expect(
      handler.execute(new GetCarryOverCandidatesQuery(actorId, tenantId, 'not-a-date')),
    ).rejects.toThrow(/invalid date/i)
  })
})
```

Run: `bun test apps/api/src/modules/planner/application/queries/personal/get-carry-over-candidates.handler.spec.ts`
Expected: **FAIL** (file does not exist).

- [ ] **Step 2: Create the query class.**

```ts
// get-carry-over-candidates.query.ts
export class GetCarryOverCandidatesQuery {
  constructor(
    public readonly actorId: string,
    public readonly tenantId: string,
    /** tenant-local YYYY-MM-DD string for "today"; caller resolves tenant timezone */
    public readonly today: string,
  ) {}
}
```

- [ ] **Step 3: Implement the handler.**

```ts
// get-carry-over-candidates.handler.ts
import { Inject } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import {
  MY_DAY_ENTRY_REPOSITORY,
  type IMyDayEntryRepository,
  type MyDayTaskRow,
} from '../../../domain/repositories/my-day-entry.repository'
import { GetCarryOverCandidatesQuery } from './get-carry-over-candidates.query'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

@QueryHandler(GetCarryOverCandidatesQuery)
export class GetCarryOverCandidatesHandler implements IQueryHandler<
  GetCarryOverCandidatesQuery,
  MyDayTaskRow[]
> {
  constructor(
    @Inject(MY_DAY_ENTRY_REPOSITORY)
    private readonly repo: IMyDayEntryRepository,
  ) {}

  async execute(q: GetCarryOverCandidatesQuery): Promise<MyDayTaskRow[]> {
    if (!DATE_RE.test(q.today)) throw new Error(`invalid date: ${q.today}`)
    const yesterday = minusOneDay(q.today)
    return this.repo.findCandidatesForCarryOver({
      actorId: q.actorId,
      tenantId: q.tenantId,
      yesterday,
    })
  }
}

function minusOneDay(ymd: string): string {
  // Parse YYYY-MM-DD as UTC — consistent with tz helper. "Tenant-local" is already baked
  // in by the caller: they pass today = tenantLocalDate(now, tenantTimezone). Subtracting
  // one day in UTC produces the correct tenant-local yesterday because we never convert
  // back across a DST boundary for this subtraction (both values are plain date strings).
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}
```

Run the unit spec — expected: **PASS**.

- [ ] **Step 4: Add repo port signature.**

Modify `apps/api/src/modules/planner/domain/repositories/my-day-entry.repository.ts`:

```ts
export interface MyDayTaskRow {
  taskId: string
  planId: string
  planName: string
  title: string
  progress: number
  priority: 'urgent' | 'important' | 'medium' | 'low'
  addedAt: string
  completedAt: string | null
}

export interface IMyDayEntryRepository {
  // ... existing methods from Plan 3.4 ...

  findCandidatesForCarryOver(input: {
    actorId: string
    tenantId: string
    yesterday: string
  }): Promise<MyDayTaskRow[]>

  insertMany(
    entries: Array<{
      actorId: string
      tenantId: string
      taskId: string
      addedDate: string
    }>,
  ): Promise<number>
}
```

- [ ] **Step 5: Implement the repo query.**

In `apps/api/src/modules/planner/infrastructure/repositories/drizzle-my-day-entry.repository.ts`:

```ts
async findCandidatesForCarryOver(input: {
  actorId: string
  tenantId: string
  yesterday: string
}): Promise<MyDayTaskRow[]> {
  const rows = await this.db
    .select({
      taskId: myDayEntry.taskId,
      planId: task.planId,
      planName: plan.name,
      title: task.title,
      progress: task.progress,
      priority: task.priority,
      addedAt: myDayEntry.addedAt,
      completedAt: myDayEntry.completedAt,
    })
    .from(myDayEntry)
    .innerJoin(task, eq(myDayEntry.taskId, task.id))
    .innerJoin(plan, eq(task.planId, plan.id))
    .where(
      and(
        eq(myDayEntry.tenantId, input.tenantId),
        eq(myDayEntry.actorId, input.actorId),
        eq(myDayEntry.addedDate, input.yesterday),
        isNull(myDayEntry.completedAt),
        lt(task.progress, 100),
        isNull(task.deletedAt),
      ),
    )

  return rows.map((r) => ({
    ...r,
    addedAt: r.addedAt.toISOString(),
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  }))
}
```

Run: `bun test apps/api/src/modules/planner/application/queries/personal/get-carry-over-candidates.handler.spec.ts`
Expected: **PASS**.

- [ ] **Step 6: Integration test against real Postgres.**

Create `get-carry-over-candidates.handler.integration.spec.ts`. Seeds one actor + one plan + three yesterday entries: one with `progress = 100` (should be excluded), one with `completed_at` set (excluded), one ready for carry-over (included). Assert only the third is returned.

```ts
it('returns only open, uncompleted yesterday entries', async () => {
  // Given — 3 entries dated yesterday
  const y = '2026-04-19'
  await seed.task({ id: 'tOpen', progress: 50 })
  await seed.task({ id: 'tDone', progress: 100 })
  await seed.task({ id: 'tCompleted', progress: 30 })
  await seed.myDayEntry({ taskId: 'tOpen', actorId, addedDate: y })
  await seed.myDayEntry({ taskId: 'tDone', actorId, addedDate: y })
  await seed.myDayEntry({
    taskId: 'tCompleted',
    actorId,
    addedDate: y,
    completedAt: new Date(),
  })

  // When
  const out = await handler.execute(
    new GetCarryOverCandidatesQuery(actorId, tenantId, '2026-04-20'),
  )

  // Then
  expect(out.map((r) => r.taskId)).toEqual(['tOpen'])
})
```

Run: `bun test apps/api/src/modules/planner/application/queries/personal/get-carry-over-candidates.handler.integration.spec.ts`
Expected: **PASS**.

- [ ] **Step 7: Commit.**

```bash
git add apps/api/src/modules/planner/application/queries/personal/get-carry-over-candidates.* \
        apps/api/src/modules/planner/domain/repositories/my-day-entry.repository.ts \
        apps/api/src/modules/planner/infrastructure/repositories/drizzle-my-day-entry.repository.ts
git commit -m "feat(planner): GetCarryOverCandidatesQuery + handler"
```

---

## Task 2 — Command handler: `CarryOverMyDayCommand` (TDD)

**Files:**

- Create: `apps/api/src/modules/planner/application/commands/my-day/carry-over.command.ts`
- Create: `apps/api/src/modules/planner/application/commands/my-day/carry-over.handler.ts`
- Create: `apps/api/src/modules/planner/application/commands/my-day/carry-over.handler.spec.ts`

- [ ] **Step 1: Write the failing unit test.**

```ts
// carry-over.handler.spec.ts
describe('CarryOverMyDayHandler', () => {
  const actorId = '...'
  const tenantId = '...'

  let repo: { insertMany: ReturnType<typeof vi.fn> }
  let handler: CarryOverMyDayHandler

  beforeEach(async () => {
    repo = { insertMany: vi.fn() }
    const moduleRef = await Test.createTestingModule({
      providers: [CarryOverMyDayHandler, { provide: MY_DAY_ENTRY_REPOSITORY, useValue: repo }],
    }).compile()
    handler = moduleRef.get(CarryOverMyDayHandler)
  })

  it('inserts one entry per task id on toDate and returns the insert count', async () => {
    repo.insertMany.mockResolvedValue(2)
    const out = await handler.execute(
      new CarryOverMyDayCommand(actorId, tenantId, '2026-04-19', '2026-04-20', ['t1', 't2']),
    )
    expect(repo.insertMany).toHaveBeenCalledWith([
      { actorId, tenantId, taskId: 't1', addedDate: '2026-04-20' },
      { actorId, tenantId, taskId: 't2', addedDate: '2026-04-20' },
    ])
    expect(out).toEqual({ carriedCount: 2 })
  })

  it('is a no-op on empty taskIds', async () => {
    const out = await handler.execute(
      new CarryOverMyDayCommand(actorId, tenantId, '2026-04-19', '2026-04-20', []),
    )
    expect(repo.insertMany).not.toHaveBeenCalled()
    expect(out).toEqual({ carriedCount: 0 })
  })

  it('rejects when fromDate >= toDate', async () => {
    await expect(
      handler.execute(
        new CarryOverMyDayCommand(actorId, tenantId, '2026-04-20', '2026-04-20', ['t1']),
      ),
    ).rejects.toThrow(/fromDate must be before toDate/)
  })

  it('rejects invalid date formats', async () => {
    await expect(
      handler.execute(new CarryOverMyDayCommand(actorId, tenantId, 'bad', '2026-04-20', ['t1'])),
    ).rejects.toThrow(/invalid date/i)
  })
})
```

Run — expected: **FAIL** (missing handler).

- [ ] **Step 2: Create the command.**

```ts
// carry-over.command.ts
export class CarryOverMyDayCommand {
  constructor(
    public readonly actorId: string,
    public readonly tenantId: string,
    public readonly fromDate: string, // tenant-local YYYY-MM-DD
    public readonly toDate: string,
    public readonly taskIds: string[],
  ) {}
}
```

- [ ] **Step 3: Implement the handler.**

```ts
// carry-over.handler.ts
import { Inject } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import {
  MY_DAY_ENTRY_REPOSITORY,
  type IMyDayEntryRepository,
} from '../../../domain/repositories/my-day-entry.repository'
import { CarryOverMyDayCommand } from './carry-over.command'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

@CommandHandler(CarryOverMyDayCommand)
export class CarryOverMyDayHandler implements ICommandHandler<
  CarryOverMyDayCommand,
  { carriedCount: number }
> {
  constructor(
    @Inject(MY_DAY_ENTRY_REPOSITORY)
    private readonly repo: IMyDayEntryRepository,
  ) {}

  async execute(cmd: CarryOverMyDayCommand): Promise<{ carriedCount: number }> {
    if (!DATE_RE.test(cmd.fromDate)) throw new Error(`invalid date: ${cmd.fromDate}`)
    if (!DATE_RE.test(cmd.toDate)) throw new Error(`invalid date: ${cmd.toDate}`)
    if (cmd.fromDate >= cmd.toDate) {
      throw new Error('fromDate must be before toDate')
    }
    if (cmd.taskIds.length === 0) return { carriedCount: 0 }

    // Sequential DB call — no Promise.all (RLS single-client rule).
    const entries = cmd.taskIds.map((taskId) => ({
      actorId: cmd.actorId,
      tenantId: cmd.tenantId,
      taskId,
      addedDate: cmd.toDate,
    }))
    const carriedCount = await this.repo.insertMany(entries)
    return { carriedCount }
  }
}
```

- [ ] **Step 4: Implement `insertMany` on the Drizzle repo.**

```ts
// drizzle-my-day-entry.repository.ts
async insertMany(entries: Array<{
  actorId: string
  tenantId: string
  taskId: string
  addedDate: string
}>): Promise<number> {
  if (entries.length === 0) return 0
  const result = await this.db
    .insert(myDayEntry)
    .values(
      entries.map((e) => ({
        actorId: e.actorId,
        tenantId: e.tenantId,
        taskId: e.taskId,
        addedDate: e.addedDate,
      })),
    )
    .onConflictDoNothing({ target: [myDayEntry.actorId, myDayEntry.taskId, myDayEntry.addedDate] })
    .returning({ taskId: myDayEntry.taskId })
  return result.length
}
```

Run unit spec — expected: **PASS**.

- [ ] **Step 5: Integration test.**

`carry-over.handler.integration.spec.ts` — seed two tasks and a pre-existing `my_day_entry` for today with `taskId=t1`. Carry-over `[t1, t2]`. Assert:

- Total today-entries for actor = 2 (t1 was idempotent no-op, t2 inserted).
- Return value `{ carriedCount: 1 }` (only `t2` was actually inserted per `onConflictDoNothing`).

Run — expected: **PASS**.

- [ ] **Step 6: Extend the integration spec for `drizzle-my-day-entry.repository` with `insertMany` coverage.**

Assert: inserts N rows on a clean state returns N; inserting the same rows again returns 0.

Run: `bun test apps/api/src/modules/planner/infrastructure/repositories/drizzle-my-day-entry.repository.integration.spec.ts`
Expected: **PASS**.

- [ ] **Step 7: Commit.**

```bash
git add apps/api/src/modules/planner/application/commands/my-day/carry-over.* \
        apps/api/src/modules/planner/infrastructure/repositories/drizzle-my-day-entry.*
git commit -m "feat(planner): CarryOverMyDayCommand + idempotent insertMany"
```

---

## Task 3 — Expose both procedures on the `personal` tRPC router

**Files:**

- Modify: `apps/api/src/modules/planner/interface/trpc/personal.router.ts`
- Modify: `apps/api/src/modules/planner/interface/trpc/personal.router.spec.ts`
- Modify: `apps/api/src/modules/planner/planner.module.ts`

- [ ] **Step 1: Write failing router-level tests first.**

```ts
// personal.router.spec.ts (additions)
describe('personal.myDay.getCarryOverCandidates', () => {
  it('forwards today to the query bus and returns candidates', async () => {
    const spy = vi.spyOn(queryBus, 'execute').mockResolvedValue([{ taskId: 't1' }] as any)
    const out = await caller.personal.myDay.getCarryOverCandidates({ date: '2026-04-20' })
    expect(spy).toHaveBeenCalledWith(expect.any(GetCarryOverCandidatesQuery))
    expect(out).toEqual([{ taskId: 't1' }])
  })

  it('rejects malformed date', async () => {
    await expect(caller.personal.myDay.getCarryOverCandidates({ date: 'oops' })).rejects.toThrow(
      /invalid|date/i,
    )
  })
})

describe('personal.myDay.carryOver', () => {
  it('dispatches the command and returns carriedCount', async () => {
    const spy = vi.spyOn(commandBus, 'execute').mockResolvedValue({ carriedCount: 2 })
    const out = await caller.personal.myDay.carryOver({
      fromDate: '2026-04-19',
      toDate: '2026-04-20',
      taskIds: ['t1', 't2'],
    })
    expect(spy).toHaveBeenCalledWith(expect.any(CarryOverMyDayCommand))
    expect(out).toEqual({ carriedCount: 2 })
  })

  it('requires planner:personal:write', async () => {
    const unauthorizedCaller = makeCaller({ permissions: [] })
    await expect(
      unauthorizedCaller.personal.myDay.carryOver({
        fromDate: '2026-04-19',
        toDate: '2026-04-20',
        taskIds: [],
      }),
    ).rejects.toThrow(/FORBIDDEN/)
  })
})
```

- [ ] **Step 2: Extend `personal.router.ts`.**

```ts
// Inside myDay router factory
getCarryOverCandidates: tenantProcedure
  .use(requirePermission('planner:personal:read'))
  .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
  .query(({ ctx, input }) =>
    ctx.queryBus.execute(
      new GetCarryOverCandidatesQuery(ctx.actorId, ctx.tenantId, input.date),
    ),
  ),

carryOver: tenantProcedure
  .use(requirePermission('planner:personal:write'))
  .input(
    z.object({
      fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      taskIds: z.array(z.string().uuid()).max(200),
    }),
  )
  .mutation(({ ctx, input }) =>
    ctx.commandBus.execute(
      new CarryOverMyDayCommand(
        ctx.actorId,
        ctx.tenantId,
        input.fromDate,
        input.toDate,
        input.taskIds,
      ),
    ),
  ),
```

`taskIds.max(200)` is a defense-in-depth cap — the banner's "Carry over all" button can't exceed a day's worth of entries in realistic usage; the ceiling is conservative.

- [ ] **Step 3: Register the handler in `planner.module.ts`.**

```ts
// planner.module.ts — add to providers
providers: [
  // ... existing ...
  GetCarryOverCandidatesHandler,
  CarryOverMyDayHandler,
],
```

- [ ] **Step 4: Run all router + handler tests.**

```bash
bun test apps/api/src/modules/planner/interface/trpc/personal.router.spec.ts
bun test apps/api/src/modules/planner/application/commands/my-day/carry-over.handler.spec.ts
bun test apps/api/src/modules/planner/application/queries/personal/get-carry-over-candidates.handler.spec.ts
```

Expected: all **PASS**.

- [ ] **Step 5: Commit.**

```bash
git add apps/api/src/modules/planner/interface/trpc/personal.router.* \
        apps/api/src/modules/planner/planner.module.ts
git commit -m "feat(planner): personal.myDay.{getCarryOverCandidates,carryOver} tRPC procedures"
```

---

## Task 4 — React Query hooks: `useMyDayCarryOverCandidates` + `useCarryOver`

**Files:**

- Create: `apps/web-planner/src/lib/hooks/use-carry-over.ts`
- Create: `apps/web-planner/src/lib/hooks/use-carry-over.spec.tsx`

- [ ] **Step 1: Write the failing test first.**

```tsx
// use-carry-over.spec.tsx
describe('useMyDayCarryOverCandidates', () => {
  it('queries with the correct key and calls trpc.personal.myDay.getCarryOverCandidates', async () => {
    const spy = vi
      .spyOn(trpc.personal.myDay.getCarryOverCandidates, 'useQuery')
      .mockReturnValue({ data: [], isLoading: false } as any)

    renderHook(() => useMyDayCarryOverCandidates('2026-04-20'), { wrapper })

    expect(spy).toHaveBeenCalledWith({ date: '2026-04-20' }, expect.any(Object))
  })
})

describe('useCarryOver', () => {
  it('invalidates both the My Day list and carry-over candidates on success', async () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useCarryOver(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        fromDate: '2026-04-19',
        toDate: '2026-04-20',
        taskIds: ['t1'],
      })
    })

    // Both cache keys are invalidated
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: expect.arrayContaining(['personal', 'myDay', 'get']),
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: expect.arrayContaining(['personal', 'myDay', 'getCarryOverCandidates']),
    })
  })
})
```

- [ ] **Step 2: Implement the hooks.**

```ts
// use-carry-over.ts
'use client'
import { useQueryClient } from '@tanstack/react-query'
import { trpc } from '@/lib/trpc/client'

export function useMyDayCarryOverCandidates(date: string) {
  return trpc.personal.myDay.getCarryOverCandidates.useQuery(
    { date },
    {
      // Poll once on mount — tenant-midnight is not in-session, so no background refetch needed
      staleTime: 60_000 * 5,
      refetchOnWindowFocus: false,
    },
  )
}

export function useCarryOver() {
  const qc = useQueryClient()
  return trpc.personal.myDay.carryOver.useMutation({
    onSuccess: async (_out, vars) => {
      await qc.invalidateQueries({
        queryKey: [['personal', 'myDay', 'get'], { date: vars.toDate }],
      })
      await qc.invalidateQueries({
        queryKey: [['personal', 'myDay', 'getCarryOverCandidates'], { date: vars.toDate }],
      })
    },
  })
}
```

Run: `bun test apps/web-planner/src/lib/hooks/use-carry-over.spec.tsx`
Expected: **PASS**.

- [ ] **Step 3: Commit.**

```bash
git add apps/web-planner/src/lib/hooks/use-carry-over.*
git commit -m "feat(web-planner): carry-over hooks"
```

---

## Task 5 — `CarryOverBanner` component (TDD)

**Files:**

- Create: `apps/web-planner/src/components/my-day/carry-over-banner.tsx`
- Create: `apps/web-planner/src/components/my-day/carry-over-banner.spec.tsx`
- Create: `apps/web-planner/src/components/my-day/carry-over-picker-dialog.tsx`
- Create: `apps/web-planner/src/components/my-day/carry-over-picker-dialog.spec.tsx`

- [ ] **Step 1: Write the failing banner test first.**

```tsx
// carry-over-banner.spec.tsx
describe('CarryOverBanner', () => {
  const today = '2026-04-20'
  const candidates = [
    { taskId: 't1', title: 'Task 1', planName: 'Personal' },
    { taskId: 't2', title: 'Task 2', planName: 'Platform' },
  ]

  beforeEach(() => {
    localStorage.clear()
    mockHook(useMyDayCarryOverCandidates, { data: candidates, isLoading: false })
  })

  it('renders with the N-tasks count', () => {
    render(<CarryOverBanner today={today} />)
    expect(screen.getByText(/2 tasks in My Day/i)).toBeInTheDocument()
  })

  it('hides when there are no candidates', () => {
    mockHook(useMyDayCarryOverCandidates, { data: [], isLoading: false })
    const { container } = render(<CarryOverBanner today={today} />)
    expect(container.firstChild).toBeNull()
  })

  it('hides when dismissed for today via localStorage', () => {
    localStorage.setItem('myDay.carryOver.dismissed.2026-04-20', '1')
    const { container } = render(<CarryOverBanner today={today} />)
    expect(container.firstChild).toBeNull()
  })

  it('"Carry over all" calls useCarryOver with every task id', async () => {
    const mutate = vi.fn().mockResolvedValue({ carriedCount: 2 })
    mockHook(useCarryOver, { mutateAsync: mutate, isPending: false })

    render(<CarryOverBanner today={today} />)
    await userEvent.click(screen.getByRole('button', { name: /carry over all/i }))

    expect(mutate).toHaveBeenCalledWith({
      fromDate: '2026-04-19',
      toDate: '2026-04-20',
      taskIds: ['t1', 't2'],
    })
  })

  it('"Dismiss" sets the localStorage key and removes the banner', async () => {
    render(<CarryOverBanner today={today} />)
    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }))

    expect(localStorage.getItem('myDay.carryOver.dismissed.2026-04-20')).toBe('1')
    expect(screen.queryByText(/2 tasks in My Day/i)).not.toBeInTheDocument()
  })

  it('"Pick which" opens the picker dialog', async () => {
    render(<CarryOverBanner today={today} />)
    await userEvent.click(screen.getByRole('button', { name: /pick which/i }))
    expect(screen.getByRole('dialog')).toBeVisible()
  })
})
```

Run — expected: **FAIL**.

- [ ] **Step 2: Implement the banner.**

```tsx
// carry-over-banner.tsx
'use client'
import { useState } from 'react'
import { Alert, AlertDescription, Button, Spinner } from '@future/ui'
import { Sunrise } from 'lucide-react'
import { useMyDayCarryOverCandidates, useCarryOver } from '@/lib/hooks/use-carry-over'
import { CarryOverPickerDialog } from './carry-over-picker-dialog'

const STORAGE_KEY = (today: string) => `myDay.carryOver.dismissed.${today}`

function getYesterday(today: string): string {
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export function CarryOverBanner({ today }: { today: string }) {
  const { data: candidates, isLoading } = useMyDayCarryOverCandidates(today)
  const { mutateAsync, isPending } = useCarryOver()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [dismissed, setDismissed] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY(today)) === '1',
  )

  if (isLoading) return null
  if (!candidates || candidates.length === 0) return null
  if (dismissed) return null

  const yesterday = getYesterday(today)

  async function carryOverAll() {
    await mutateAsync({
      fromDate: yesterday,
      toDate: today,
      taskIds: candidates!.map((c) => c.taskId),
    })
  }

  function dismiss() {
    localStorage.setItem(STORAGE_KEY(today), '1')
    setDismissed(true)
  }

  return (
    <>
      <Alert className="mb-4 flex items-start gap-3">
        <Sunrise className="mt-0.5 size-5 text-muted-foreground" aria-hidden />
        <div className="flex-1">
          <AlertDescription>
            Yesterday you had <strong>{candidates.length} tasks in My Day</strong> that weren't
            completed.
          </AlertDescription>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={carryOverAll} disabled={isPending}>
              {isPending && <Spinner className="size-4" />}
              Carry over all
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
              Pick which
            </Button>
            <Button size="sm" variant="ghost" onClick={dismiss}>
              Dismiss
            </Button>
          </div>
        </div>
      </Alert>

      <CarryOverPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        candidates={candidates}
        fromDate={yesterday}
        toDate={today}
      />
    </>
  )
}
```

- [ ] **Step 3: Implement the picker dialog.**

```tsx
// carry-over-picker-dialog.tsx
'use client'
import { useState } from 'react'
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from '@future/ui'
import { useCarryOver } from '@/lib/hooks/use-carry-over'
import type { MyDayTask } from '@future/api-client/planner'

export function CarryOverPickerDialog({
  open,
  onOpenChange,
  candidates,
  fromDate,
  toDate,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  candidates: MyDayTask[]
  fromDate: string
  toDate: string
}) {
  const { mutateAsync, isPending } = useCarryOver()
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(candidates.map((c) => c.taskId)),
  )

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function submit() {
    await mutateAsync({ fromDate, toDate, taskIds: [...selected] })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Carry over which tasks?</DialogTitle>
        </DialogHeader>
        <ul className="space-y-2">
          {candidates.map((c) => (
            <li key={c.taskId} className="flex items-center gap-2">
              <Checkbox
                id={`co-${c.taskId}`}
                checked={selected.has(c.taskId)}
                onCheckedChange={() => toggle(c.taskId)}
              />
              <label htmlFor={`co-${c.taskId}`} className="flex-1 cursor-pointer text-sm">
                <span className="font-medium">{c.title}</span>
                <span className="ml-2 text-muted-foreground">{c.planName}</span>
              </label>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isPending || selected.size === 0}>
            {isPending && <Spinner className="size-4" />}
            Carry over {selected.size}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: Picker-dialog tests.**

`carry-over-picker-dialog.spec.tsx` — covers:

- Opens with all candidates selected by default.
- Unchecking a candidate excludes it from the mutation payload.
- "Carry over 0" button is disabled.
- Submit closes the dialog.

Run: `bun test apps/web-planner/src/components/my-day/`
Expected: **PASS** for both files.

- [ ] **Step 5: Commit.**

```bash
git add apps/web-planner/src/components/my-day/carry-over-*
git commit -m "feat(web-planner): carry-over banner + picker dialog"
```

---

## Task 6 — Mount banner inside My Day layout

**Files:**

- Modify: `apps/web-planner/src/app/personal/today/layout.tsx`

- [ ] **Step 1: Edit the layout.**

The layout already renders the My Day view-picker + filter bar (shipped in Plan 3.4). Insert the banner immediately above `{children}`:

```tsx
// apps/web-planner/src/app/personal/today/layout.tsx
'use client'
import { ReactNode } from 'react'
import { CarryOverBanner } from '@/components/my-day/carry-over-banner'
import { useTenantTimezone } from '@/lib/hooks/use-tenant-timezone'
import { tenantLocalDateClient } from '@/lib/tz-client'
// ... existing imports (view picker, filter bar, group-by) ...

export default function MyDayLayout({ children }: { children: ReactNode }) {
  const timezone = useTenantTimezone()
  const today = tenantLocalDateClient(new Date(), timezone)

  return (
    <div className="flex h-full flex-col">
      {/* Existing header row — view picker, filter bar, group-by */}
      <MyDayHeader />

      <div className="px-6 pt-4">
        <CarryOverBanner today={today} />
      </div>

      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  )
}
```

> `tenantLocalDateClient` is the client mirror of the server helper from Plan 3.1 (`apps/web-planner/src/lib/tz-client.ts`). It uses `Intl.DateTimeFormat({ timeZone })` + a sortable `YYYY-MM-DD` format. Added in Plan 3.4.

- [ ] **Step 2: Run the full My Day test suite to catch any regression.**

```bash
bun test apps/web-planner/src/app/personal/today/
```

Expected: **PASS**.

- [ ] **Step 3: Commit.**

```bash
git add apps/web-planner/src/app/personal/today/layout.tsx
git commit -m "feat(web-planner): mount carry-over banner in My Day layout"
```

---

## Task 7 — Orphan-sweep pg-boss job (TDD)

**Files:**

- Create: `apps/api/src/modules/planner/infrastructure/jobs/my-day-orphan-sweep.job.ts`
- Create: `apps/api/src/modules/planner/infrastructure/jobs/my-day-orphan-sweep.job.spec.ts`
- Create: `apps/api/src/modules/planner/infrastructure/jobs/my-day-orphan-sweep.job.integration.spec.ts`

- [ ] **Step 1: Write the failing unit test first.**

```ts
// my-day-orphan-sweep.job.spec.ts
describe('MyDayOrphanSweepJob.handle', () => {
  let repo: { deleteOrphanEntries: ReturnType<typeof vi.fn> }
  let job: MyDayOrphanSweepJob

  beforeEach(() => {
    repo = { deleteOrphanEntries: vi.fn().mockResolvedValue(2) }
    job = new MyDayOrphanSweepJob(repo as any, new Logger('test'))
  })

  it('delegates deletion to the repo and logs the count', async () => {
    await job.handle()
    expect(repo.deleteOrphanEntries).toHaveBeenCalledOnce()
  })

  it('does not throw when no orphans exist', async () => {
    repo.deleteOrphanEntries.mockResolvedValue(0)
    await expect(job.handle()).resolves.toBeUndefined()
  })
})
```

Run — expected: **FAIL**.

- [ ] **Step 2: Add the repo method.**

Port signature in `my-day-entry.repository.ts`:

```ts
deleteOrphanEntries(): Promise<number>
```

Drizzle implementation:

```ts
async deleteOrphanEntries(): Promise<number> {
  // DELETE all my_day_entry rows where the referenced task does not exist
  // OR exists but is soft-deleted. No tenant scoping — the job runs with
  // a service role outside RLS (see scheduler setup).
  const result = await this.db.execute(sql`
    DELETE FROM planner.my_day_entry e
    WHERE NOT EXISTS (
      SELECT 1 FROM planner.task t
      WHERE t.id = e.task_id
        AND t.deleted_at IS NULL
    )
    RETURNING e.task_id
  `)
  return (result as unknown as { rowCount: number }).rowCount ?? 0
}
```

- [ ] **Step 3: Implement the worker.**

```ts
// my-day-orphan-sweep.job.ts
import { Inject, Injectable, Logger } from '@nestjs/common'
import {
  MY_DAY_ENTRY_REPOSITORY,
  type IMyDayEntryRepository,
} from '../../domain/repositories/my-day-entry.repository'

@Injectable()
export class MyDayOrphanSweepJob {
  private readonly logger = new Logger(MyDayOrphanSweepJob.name)

  constructor(
    @Inject(MY_DAY_ENTRY_REPOSITORY)
    private readonly repo: IMyDayEntryRepository,
  ) {}

  /** Runs nightly. Removes my_day_entry rows whose task_id no longer resolves. */
  async handle(): Promise<void> {
    const deleted = await this.repo.deleteOrphanEntries()
    this.logger.log(`Swept ${deleted} orphan my_day_entry row(s)`)
  }
}
```

Run unit spec — expected: **PASS**.

- [ ] **Step 4: Integration test.**

```ts
// my-day-orphan-sweep.job.integration.spec.ts
describe('MyDayOrphanSweepJob (integration)', () => {
  it('deletes only orphaned rows', async () => {
    // Given: 5 my_day_entry rows
    await seed.task({ id: 'tA', deletedAt: null })
    await seed.task({ id: 'tB', deletedAt: null })
    await seed.task({ id: 'tC', deletedAt: new Date() }) // soft-deleted → orphan
    // tD task is never inserted → hard orphan
    await seed.myDayEntry({ taskId: 'tA', addedDate: '2026-04-20' })
    await seed.myDayEntry({ taskId: 'tA', addedDate: '2026-04-19' })
    await seed.myDayEntry({ taskId: 'tB', addedDate: '2026-04-20' })
    await seed.myDayEntry({ taskId: 'tC', addedDate: '2026-04-20' })
    await seed.myDayEntry({ taskId: 'tD', addedDate: '2026-04-20' })

    // When
    await job.handle()

    // Then — exactly 3 rows survive: tA×2 + tB×1
    const rows = await db.select().from(myDayEntry)
    expect(rows).toHaveLength(3)
    const taskIds = rows.map((r) => r.taskId).sort()
    expect(taskIds).toEqual(['tA', 'tA', 'tB'].sort())
  })
})
```

Run: `bun test apps/api/src/modules/planner/infrastructure/jobs/my-day-orphan-sweep.job.integration.spec.ts`
Expected: **PASS**.

- [ ] **Step 5: Commit.**

```bash
git add apps/api/src/modules/planner/infrastructure/jobs/my-day-orphan-sweep.job.* \
        apps/api/src/modules/planner/domain/repositories/my-day-entry.repository.ts \
        apps/api/src/modules/planner/infrastructure/repositories/drizzle-my-day-entry.repository.ts
git commit -m "feat(planner): orphan-sweep job for my_day_entry"
```

---

## Task 8 — Scheduler registration + pg-boss wiring

**Files:**

- Create: `apps/api/src/modules/planner/infrastructure/jobs/my-day-orphan-sweep.scheduler.ts`
- Create: `apps/api/src/modules/planner/infrastructure/jobs/my-day-orphan-sweep.scheduler.spec.ts`
- Modify: `apps/api/src/modules/planner/planner.module.ts`

- [ ] **Step 1: Implement the scheduler following the pattern from `task-daily-snapshot.scheduler.ts` (Sub-project #2 Plan 05).**

```ts
// my-day-orphan-sweep.scheduler.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { PgBossService } from '../../../../common/jobs/pg-boss.service'
import { MyDayOrphanSweepJob } from './my-day-orphan-sweep.job'

const JOB_NAME = 'planner.my-day-orphan-sweep'
const CRON = '0 3 * * *' // 03:00 UTC daily

@Injectable()
export class MyDayOrphanSweepScheduler implements OnModuleInit {
  private readonly logger = new Logger(MyDayOrphanSweepScheduler.name)

  constructor(
    private readonly pgBoss: PgBossService,
    private readonly job: MyDayOrphanSweepJob,
  ) {}

  async onModuleInit(): Promise<void> {
    const boss = this.pgBoss.instance
    await boss.schedule(JOB_NAME, CRON, {}, { tz: 'UTC' })
    await boss.work(JOB_NAME, { teamSize: 1, teamConcurrency: 1 }, async () => {
      try {
        await this.job.handle()
      } catch (err) {
        this.logger.error('Orphan sweep failed', err)
        throw err
      }
    })
    this.logger.log(`Registered ${JOB_NAME} on ${CRON} UTC`)
  }
}
```

- [ ] **Step 2: Write the scheduler spec.**

```ts
// my-day-orphan-sweep.scheduler.spec.ts
describe('MyDayOrphanSweepScheduler', () => {
  it('registers a recurring job at 03:00 UTC and binds a worker', async () => {
    const boss = {
      schedule: vi.fn().mockResolvedValue(undefined),
      work: vi.fn().mockResolvedValue('worker-id'),
    }
    const pgBoss = { instance: boss } as any
    const job = { handle: vi.fn() }
    const scheduler = new MyDayOrphanSweepScheduler(pgBoss, job as any)

    await scheduler.onModuleInit()

    expect(boss.schedule).toHaveBeenCalledWith(
      'planner.my-day-orphan-sweep',
      '0 3 * * *',
      {},
      { tz: 'UTC' },
    )
    expect(boss.work).toHaveBeenCalledWith(
      'planner.my-day-orphan-sweep',
      expect.objectContaining({ teamSize: 1 }),
      expect.any(Function),
    )
  })

  it('worker handler invokes job.handle', async () => {
    let worker!: () => Promise<void>
    const boss = {
      schedule: vi.fn().mockResolvedValue(undefined),
      work: vi.fn().mockImplementation(async (_name, _opts, fn) => {
        worker = fn
        return 'id'
      }),
    }
    const job = { handle: vi.fn().mockResolvedValue(undefined) }
    const scheduler = new MyDayOrphanSweepScheduler({ instance: boss } as any, job as any)

    await scheduler.onModuleInit()
    await worker()

    expect(job.handle).toHaveBeenCalledOnce()
  })
})
```

Run: `bun test apps/api/src/modules/planner/infrastructure/jobs/my-day-orphan-sweep.scheduler.spec.ts`
Expected: **PASS**.

- [ ] **Step 3: Register in `planner.module.ts`.**

```ts
providers: [
  // ... existing ...
  MyDayOrphanSweepJob,
  MyDayOrphanSweepScheduler,
],
```

- [ ] **Step 4: Commit.**

```bash
git add apps/api/src/modules/planner/infrastructure/jobs/my-day-orphan-sweep.scheduler.* \
        apps/api/src/modules/planner/planner.module.ts
git commit -m "feat(planner): schedule orphan-sweep job at 03:00 UTC daily"
```

---

## Task 9 — Playwright E2E: full Personal Hubs flow

**Files:**

- Create: `apps/web-planner/e2e/personal-hubs.spec.ts`

This is the only end-to-end test in Sub-project #3. It exercises the full flow across the My Tasks and My Day surfaces and the carry-over banner. Uses the same env-based session injection pattern as `planner-smoke.spec.ts`.

- [ ] **Step 1: Write the test.**

```ts
// apps/web-planner/e2e/personal-hubs.spec.ts
/**
 * Personal Hubs E2E — Plan 3.5 Task 9
 *
 * Full flow:
 *   1. Sign in → /personal/today/board shows empty state
 *   2. Add a task from My Tasks kebab → it appears in My Day
 *   3. Mark the task complete → My Day reflects completed_at
 *   4. Simulate "next day" by directly inserting a yesterday-dated my_day_entry
 *      (plus a new open task with progress < 100) via an API test hook
 *   5. Reload My Day today → carry-over banner appears
 *   6. Click "Carry over all" → task appears in today's My Day
 *   7. Click "Dismiss" → banner hides
 *   8. Reload → banner stays hidden for today (localStorage persistence)
 *
 * Requires docker-compose stack + test env:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3011
 *   E2E_SESSION_TOKEN=<jwt>
 *   E2E_ACTOR_ID=<uuid>
 *   E2E_TENANT_ID=<uuid>
 */
import { test, expect } from '@playwright/test'
import { injectSession, testDb, requiredEnv } from './helpers/session'

test.describe('Personal Hubs', () => {
  test('full flow: empty → add → complete → carry-over → dismiss', async ({ page, context }) => {
    await injectSession(context)
    const actorId = requiredEnv('E2E_ACTOR_ID')
    const tenantId = requiredEnv('E2E_TENANT_ID')

    // Clean slate — remove any pre-existing entries for this actor.
    await testDb.deleteMyDayEntriesForActor(tenantId, actorId)

    // -----------------------------------------------------------------------
    // Step 1 — My Day empty
    // -----------------------------------------------------------------------
    await page.goto('/personal/today/board')
    await expect(page.getByText(/nothing scheduled for today/i)).toBeVisible()

    // -----------------------------------------------------------------------
    // Step 2 — Add task from My Tasks → appears in My Day
    // -----------------------------------------------------------------------
    // Seed one assigned task in a plan this actor is a member of
    const taskId = await testDb.seedAssignedTask({ tenantId, actorId, title: 'E2E task A' })

    await page.goto('/personal/tasks/grid')
    const row = page.getByRole('row', { name: /E2E task A/i })
    await row.getByRole('button', { name: /open task menu/i }).click()
    await page.getByRole('menuitem', { name: /focus today/i }).click()

    await page.goto('/personal/today/board')
    await expect(page.getByText('E2E task A')).toBeVisible()

    // -----------------------------------------------------------------------
    // Step 3 — Mark task complete → completed_at renders
    // -----------------------------------------------------------------------
    const card = page.getByTestId(`my-day-card-${taskId}`)
    await card.getByRole('button', { name: /mark complete/i }).click()
    await expect(card.getByText(/completed/i)).toBeVisible()

    // -----------------------------------------------------------------------
    // Step 4 — Simulate yesterday: direct DB insert, bypassing tRPC
    //          so we can freely set added_date = yesterday.
    // -----------------------------------------------------------------------
    const yesterdayTaskId = await testDb.seedAssignedTask({
      tenantId,
      actorId,
      title: 'E2E carry-over candidate',
      progress: 30,
    })
    await testDb.insertMyDayEntry({
      tenantId,
      actorId,
      taskId: yesterdayTaskId,
      addedDate: 'yesterday', // helper resolves to tenant-local yesterday
      completedAt: null,
    })

    // -----------------------------------------------------------------------
    // Step 5 — Reload My Day → carry-over banner visible
    // -----------------------------------------------------------------------
    await page.goto('/personal/today/board')
    const banner = page.getByRole('alert').filter({ hasText: /tasks in my day/i })
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('1 tasks')

    // -----------------------------------------------------------------------
    // Step 6 — Carry over all → task appears today
    // -----------------------------------------------------------------------
    await banner.getByRole('button', { name: /carry over all/i }).click()
    await expect(page.getByText('E2E carry-over candidate')).toBeVisible()
    // Banner should disappear after candidates are carried (now empty)
    await expect(banner).not.toBeVisible()

    // -----------------------------------------------------------------------
    // Step 7 — Add another yesterday-dated entry → banner returns → dismiss
    // -----------------------------------------------------------------------
    const another = await testDb.seedAssignedTask({
      tenantId,
      actorId,
      title: 'E2E candidate 2',
      progress: 20,
    })
    await testDb.insertMyDayEntry({
      tenantId,
      actorId,
      taskId: another,
      addedDate: 'yesterday',
      completedAt: null,
    })
    await page.goto('/personal/today/board')
    const banner2 = page.getByRole('alert').filter({ hasText: /tasks in my day/i })
    await expect(banner2).toBeVisible()
    await banner2.getByRole('button', { name: /dismiss/i }).click()
    await expect(banner2).not.toBeVisible()

    // -----------------------------------------------------------------------
    // Step 8 — Reload → banner still hidden (localStorage persisted)
    // -----------------------------------------------------------------------
    await page.reload()
    await expect(page.getByRole('alert').filter({ hasText: /tasks in my day/i })).not.toBeVisible()

    // Cleanup
    await testDb.deleteMyDayEntriesForActor(tenantId, actorId)
    await page.context().clearCookies()
  })
})
```

- [ ] **Step 2: Extend the test DB helpers if missing.**

`apps/web-planner/e2e/helpers/session.ts` already exports `testDb.seedAssignedTask` + `testDb.insertMyDayEntry` (added during Plan 3.4). If `deleteMyDayEntriesForActor` is not present, add it:

```ts
export const testDb = {
  // ... existing ...
  async deleteMyDayEntriesForActor(tenantId: string, actorId: string) {
    await rawSql(
      `
      DELETE FROM planner.my_day_entry
      WHERE tenant_id = $1 AND actor_id = $2
    `,
      [tenantId, actorId],
    )
  },
}
```

- [ ] **Step 3: Run the E2E locally.**

```bash
bun run --filter api dev &                  # API on :4000
bun run --filter web-shell dev &            # shell on :3000
bun run --filter web-planner dev &          # planner on :3011
# Wait for all three to be ready, then:
PLAYWRIGHT_BASE_URL=http://localhost:3011 \
E2E_SESSION_TOKEN=$(bun run scripts/e2e-token.ts) \
E2E_ACTOR_ID=<uuid> \
E2E_TENANT_ID=<uuid> \
bunx playwright test apps/web-planner/e2e/personal-hubs.spec.ts \
  --config apps/web-planner/e2e/playwright.config.ts
```

Expected: **PASS**.

- [ ] **Step 4: Commit.**

```bash
git add apps/web-planner/e2e/personal-hubs.spec.ts \
        apps/web-planner/e2e/helpers/session.ts
git commit -m "test(e2e): Personal Hubs full-flow Playwright coverage"
```

---

## Task 10 — Coverage gate + full-suite regression

- [ ] **Step 1: Run every new/modified suite in isolation to confirm PASS.**

```bash
bun test apps/api/src/modules/planner/application/queries/personal/get-carry-over-candidates
bun test apps/api/src/modules/planner/application/commands/my-day/carry-over
bun test apps/api/src/modules/planner/interface/trpc/personal.router.spec.ts
bun test apps/api/src/modules/planner/infrastructure/jobs/my-day-orphan-sweep
bun test apps/web-planner/src/lib/hooks/use-carry-over
bun test apps/web-planner/src/components/my-day/carry-over-banner
bun test apps/web-planner/src/components/my-day/carry-over-picker-dialog
```

Expected: every suite **PASS**.

- [ ] **Step 2: Run the full planner test suite to catch regressions.**

```bash
bun test --filter api -- apps/api/src/modules/planner
bun test --filter web-planner
```

Expected: **PASS**.

- [ ] **Step 3: Coverage check — must be ≥70% lines/functions/branches across all new files.**

```bash
bun run --filter api test:coverage -- apps/api/src/modules/planner
bun run --filter web-planner test:coverage
```

Expected: threshold met. If not, back-fill tests before proceeding. **Do not commit under threshold.**

- [ ] **Step 4: No commit for this task — it's a gate, not a change.**

---

## Task 11 — Acceptance checklist (SETA internal tenant)

Add this checklist verbatim to the PR description for Plan 3.5. A reviewer (or the implementing engineer) runs through each step against the SETA staging tenant before approving. **No new feature flag.**

- [ ] **Sign in as an employee** (non-admin) via magic link. Land on `/plans`. Confirm the sidebar shows the Personal Hubs section (Plan 3.2 wiring) and three items: My Day, My Tasks, My Plans.

- [ ] **My Plans → create a task.** Open My Plans. If no plans exist, click the empty-state CTA ("Create a personal task"). Write a task. Confirm a **Personal** plan is provisioned (sidebar Plans section, top entry with the user icon).

- [ ] **My Tasks Board.** Navigate to `/personal/tasks/board`. The task created above is visible in the "Not started" column, with a "Personal" badge on its card.

- [ ] **My Tasks Grid: Focus today.** Open row kebab → "Focus today". Navigate to `/personal/today/board`. Task is there.

- [ ] **Complete the task** via the kebab → "Mark complete". Confirm it renders as completed in My Day, with the completion timestamp visible.

- [ ] **Charts view on both hubs.** Navigate to `/personal/tasks/charts` and `/personal/today/charts`. Confirm: (a) no JS console errors, (b) charts render without empty-state flicker once the data arrives.

- [ ] **Simulated carry-over.** Run the staging helper script `bun run scripts/e2e-seed-yesterday-entry.ts --actor <actor-id> --tenant <tenant-id>`. Reload `/personal/today/board`. **Carry-over banner appears** with "1 tasks in My Day" (assuming 1 seeded).

- [ ] **Carry over all.** Click the banner's "Carry over all" button. Yesterday's task now appears in today's My Day. Banner disappears.

- [ ] **Pick which.** Seed two yesterday entries. Banner reads "2 tasks". Click "Pick which". Dialog opens with both pre-selected. Uncheck one. Click "Carry over 1". Only the selected task appears; the other does not.

- [ ] **Dismiss + persistence.** Seed another yesterday entry. Banner returns. Click "Dismiss". Banner hides. Reload the page. Banner stays hidden. In DevTools → Application → Local Storage, confirm `myDay.carryOver.dismissed.<today>` is set to `1`.

- [ ] **Tenant admin flips timezone.** Sign in as tenant admin. Go to `/settings/tenant`. Change timezone to `America/New_York`. Sign back in as employee. My Day's "today" now reflects New York's date — carry-over candidates are computed against New York's yesterday. Flip back to `Asia/Ho_Chi_Minh`.

- [ ] **Orphan-sweep.** Hard-delete a task that has a `my_day_entry` row pointing to it (use the Drizzle Studio or a direct SQL command on staging). Wait for the next 03:00 UTC run, **or** manually trigger via `bun run scripts/pgboss-fire.ts planner.my-day-orphan-sweep`. Confirm the `my_day_entry` row is gone. Confirm no other entries were removed.

- [ ] **No console errors.** Open DevTools. Navigate all of: `/personal/plans`, `/personal/tasks/{board,grid,schedule,charts}`, `/personal/today/{board,grid,schedule,charts}`. Zero warnings, zero errors.

- [ ] **Perf sanity.** Lighthouse run on `/personal/today/board` shows TTI < 3s on the SETA staging VM (Graviton t4g.medium).

Sign-off: PR reviewer ticks every box **before** approving.

---

## Task 12 — Sub-project #3 close-out housekeeping

**Files:**

- Modify: `docs/superpowers/plans/2026-04-18-planner-future-sub-projects.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Append the Sub-project #3 close-out note to the briefing.**

Find the Sub-project #3 heading in the briefing book. Below its existing description, append:

```md
### Sub-project #3 — Personal Hubs — **SHIPPED**

- Shipped date: `YYYY-MM-DD` (fill in at merge of Plan 3.5).
- PRs: Plan 3.1 #**_, Plan 3.2 #_**, Plan 3.3 #**_, Plan 3.4 #_**, Plan 3.5 #\_\_\_.
- Feature flag: `planner.personal.enabled` — on for SETA internal tenant since Plan 3.2, no other tenant rolled out yet.
- Out-of-scope deferred items still deferred: global sidebar rollout (Sub-project #3b),
  MS sync of personal plans (Sub-project #4), per-user timezone override (future).
```

- [ ] **Step 2: Ensure AGENTS.md has the Personal Hubs navigation rule.**

Look under the **Navigation / Sidebar** section. If not already present (added in Plan 3.1), add:

```md
- **`NavGroup`** — exactly one of `items` (static) or `render` (dynamic). Never both. No shim, no fallback.
- **Personal Hubs** — every zone's sidebar config may contribute a dynamic render group. Render components must use React Query, respect `PermissionContext`, and render only `@future/ui` sidebar primitives.
```

Mirror the same update to `CLAUDE.md` (our convention is that both files stay in lockstep).

- [ ] **Step 3: Commit.**

```bash
git add docs/superpowers/plans/2026-04-18-planner-future-sub-projects.md AGENTS.md CLAUDE.md
git commit -m "docs(planner): Sub-project #3 close-out note + sidebar navigation rule"
```

---

## Acceptance

- All Vitest suites pass. Coverage ≥70% lines/functions/branches across all new files in this plan.
- `personal.myDay.getCarryOverCandidates` returns yesterday's incomplete entries; filters correctly on `completed_at IS NULL` and `task.progress < 100`.
- `personal.myDay.carryOver` is idempotent — calling twice with the same payload inserts only the first time (`onConflictDoNothing`).
- `<CarryOverBanner />` renders when and only when candidates exist and `localStorage[myDay.carryOver.dismissed.{today}]` is unset. Three actions present. Dismissal persists across reloads for the same day.
- Nightly `planner.my-day-orphan-sweep` job is registered on module init, runs at 03:00 UTC, idempotent, deletes exactly the orphan rows (integration test verifies 2 of 5 seeded rows removed).
- Playwright `personal-hubs.spec.ts` passes end-to-end on the local docker stack.
- No `Promise.all` for DB queries in any new handler (CLAUDE.md rule).
- No `.js` extensions in any new relative import (CLAUDE.md rule).
- Co-located `.spec.ts` files next to every new source file. No `__tests__/` directories created.
- Close-out note in the briefing book; AGENTS.md + CLAUDE.md navigation rule in place.
- Acceptance checklist (Task 11) signed off in the PR description.

## Risks for this plan

| Risk                                                                                  | Mitigation                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Banner showing stale "N tasks" count after the mutation succeeds but before refetch   | `useCarryOver` invalidates both `getCarryOverCandidates` and `myDay.get` cache keys on success. Unit-test proves both are invalidated.                                                          |
| `localStorage` cleared mid-day → banner re-appears after dismiss                      | Accepted. Dismissal is UX sugar, not a correctness concern (decision 9). Document in the banner component as an inline comment.                                                                 |
| Orphan-sweep deletes entries that transiently fail a join during soft-delete rollback | Soft-delete + rollback is not a supported flow in this codebase. If encountered, surface a bug. The sweep deletes only rows whose task is already gone at sweep time.                           |
| Carry-over N large enough to breach request-size limits                               | Router caps `taskIds.max(200)`. Realistic max is < 50 per day. If hit, sharded client-side loop is a 5-line follow-up.                                                                          |
| pg-boss job fires across multiple API instances simultaneously                        | `boss.schedule(name, cron)` is idempotent by name — only one scheduler instance owns the run. Worker uses `teamSize: 1, teamConcurrency: 1`.                                                    |
| DST boundary on `minusOneDay` subtraction                                             | Subtraction is done in UTC on `YYYY-MM-DD`-only strings, so no DST math is involved. DST-correctness is the caller's responsibility (they pass tenant-local `today` from Plan 3.1's tz helper). |
| E2E flakiness when the API test-hook inserts rows before the page hydrates            | `page.goto` forces a fresh render; the carry-over-candidates query runs after hydration. Playwright's auto-waiting on `toBeVisible` handles the async render race.                              |
| Dismissed-in-browser-A-visible-in-browser-B                                           | Accepted. Locked decision 9 says dismissal is `localStorage` only. No cross-device sync by design.                                                                                              |
| Orphan-sweep running under RLS cannot see tasks from other tenants                    | Sweep SQL does not filter on `tenant_id` (NOT EXISTS across whole `planner.task`). Scheduler runs with service role outside RLS — `deleteOrphanEntries` uses the unscoped pool.                 |

---

## Follow-ups flagged from this plan

- **Catch-up carry-over prompt** — if a user is away for >1 day, the banner currently shows only yesterday's candidates. A future tweak could surface "You have N tasks from the last 3 days" using a range query. Not built — single-day carry-over matches MS Planner's UX.
- **Server-side dismissal memory** — if cross-device dismissal is ever requested, add a `my_day_dismissal` table + `personal.myDay.dismissBanner(date)` mutation. Decision 9 deferred this; revisit only on user feedback.
- **Personal-plan offboarding reconciliation** — per spec §5 Edge Cases #3, an ops follow-up should sweep personal plans of offboarded users. Out of scope for Sub-project #3.
- **Perf telemetry follow-up** — if `personal.listTasks` p95 breaches 500ms in production at any tenant, schedule the materialization sub-project (spec §3 Query strategy).

---

**End of Plan 3.5 — End of Sub-project #3.**
