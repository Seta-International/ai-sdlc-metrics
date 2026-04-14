# Task: work-time — Schema, Entity, Repository Interface & AttendanceCalculator

**Module:** work-time  
**Sequence:** 001  
**Depends on:** nothing (foundational)  
**Required by:** task 002 (commands), task 003 (query-and-router)

---

## Scope

Build the static foundation of the work-time sub-domain:

1. Drizzle schema — `time.work_time` table
2. Domain entity — `WorkTime`
3. Repository interface — `IWorkTimeRepository`
4. `AttendanceCalculator` value-object — pure TypeScript port of all five calculation functions from `server/utils/timesheet.js`
5. `WorkTimeConfigChanged` event contract in `packages/event-contracts`
6. Unit tests for `AttendanceCalculator` (co-located)

---

## Business Context

`work_time` is the per-user working schedule configuration that drives all time computations. Every attendance late/early/overtime calculation references the active work-time row for the user on that day. It is foundational — both the work-time commands (task 002) and the attendance module's cascade handler depend on the calculator and the repository interface defined here.

---

## Source Reference

- `server/utils/timesheet.js` — five pure functions to port
- `server/query/admin.query.js` — `insertWorkTimeQuery` reveals table columns
- `server/validations/validation.js` — `postWorkTimeValidation` reveals required fields and formats

---

## Target Location

```
apps/api/src/modules/time/
  infrastructure/schema/time.schema.ts          ← ADD work_time table (file exists, has stub)
  domain/entities/work-time.entity.ts           ← CREATE
  domain/repositories/work-time.repository.ts   ← CREATE
  domain/value-objects/attendance-calculator.ts ← CREATE
  domain/value-objects/attendance-calculator.spec.ts ← CREATE

packages/event-contracts/src/time/
  work-time-config-changed.event.ts             ← CREATE
  index.ts                                      ← ADD export
```

---

## Drizzle Schema

Add to `apps/api/src/modules/time/infrastructure/schema/time.schema.ts`:

```typescript
import { pgSchema, uuid, date, time, text, timestamp } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const timeSchema = pgSchema('time')

export const workTimeTable = timeSchema.table('work_time', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  tenantId: uuid('tenant_id').notNull(),
  userId: uuid('user_id').notNull(),
  fromDate: date('from_date', { mode: 'string' }).notNull(), // ISO date 'YYYY-MM-DD'
  toDate: date('to_date', { mode: 'string' }), // nullable = open-ended
  fromTime: time('from_time').notNull(), // 'HH:mm:ss' shift start
  toTime: time('to_time').notNull(), // 'HH:mm:ss' shift end
  startBreakTime: time('start_break_time').notNull(), // 'HH:mm:ss' break start
  endBreakTime: time('end_break_time').notNull(), // 'HH:mm:ss' break end
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type WorkTimeRow = typeof workTimeTable.$inferSelect
export type InsertWorkTimeRow = typeof workTimeTable.$inferInsert
```

**Note:** No FK constraint to `identity.users` — cross-schema FK is prohibited by hard rules. `userId` is a plain UUID.

---

## Domain Entity

```typescript
// domain/entities/work-time.entity.ts
export interface WorkTime {
  readonly id: string
  readonly tenantId: string
  readonly userId: string
  readonly fromDate: string // 'YYYY-MM-DD'
  readonly toDate: string | null // null = open-ended / current
  readonly fromTime: string // 'HH:mm:ss'
  readonly toTime: string // 'HH:mm:ss'
  readonly startBreakTime: string // 'HH:mm:ss'
  readonly endBreakTime: string // 'HH:mm:ss'
  readonly description: string | null
}
```

Plain interface — no class, no decorators, no NestJS deps.

---

## Repository Interface

```typescript
// domain/repositories/work-time.repository.ts
import type { WorkTime } from '../entities/work-time.entity'

export interface IWorkTimeRepository {
  /** All rows for user ordered by fromDate DESC */
  findByUserId(userId: string, tenantId: string): Promise<WorkTime[]>

  findById(id: string, tenantId: string): Promise<WorkTime | null>

  /** Latest row (highest fromDate) with toDate IS NULL, for closing on new create */
  findLatestOpenEnded(userId: string, tenantId: string): Promise<WorkTime | null>

  /**
   * Overlap check: find any existing row for the user whose date range overlaps [fromDate, toDate].
   * Uses SQL tstzrange && operator.
   * @param excludeId - exclude this row from check (used for updates)
   */
  findOverlapping(
    userId: string,
    tenantId: string,
    fromDate: string,
    toDate: string | null,
    excludeId?: string,
  ): Promise<WorkTime | null>

  insert(data: Omit<WorkTime, 'id'>): Promise<WorkTime>

  /** Partial update — only provided fields are changed */
  update(
    id: string,
    tenantId: string,
    data: Partial<
      Pick<
        WorkTime,
        | 'fromDate'
        | 'toDate'
        | 'fromTime'
        | 'toTime'
        | 'startBreakTime'
        | 'endBreakTime'
        | 'description'
      >
    >,
  ): Promise<WorkTime>

  /** Close an open-ended row by setting toDate */
  setToDate(id: string, tenantId: string, toDate: string): Promise<void>

  delete(id: string, tenantId: string): Promise<void>
}

export const WORK_TIME_REPOSITORY = Symbol('IWorkTimeRepository')
```

---

## AttendanceCalculator Value-Object

Port `server/utils/timesheet.js` to TypeScript. Eliminate `moment`. All time inputs are `'HH:mm:ss'` strings. All outputs are `'HH:mm:ss'` strings or `null`.

```typescript
// domain/value-objects/attendance-calculator.ts

/** Grace period: ≤ 6 minutes is not counted as late or early (BR-01) */
const LATE_EARLY_GRACE_MS = 6 * 60 * 1000 - 1

/** Parse 'HH:mm:ss' into total milliseconds since midnight */
function timeToMs(time: string): number {
  const [h, m, s] = time.split(':').map(Number)
  return ((h * 60 + m) * 60 + s) * 1000
}

/** Format milliseconds to 'HH:mm:ss' */
function msToTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':')
}

export interface LateParams {
  startTime: string // schedule start (fromTime)
  endTime: string // actual check-in time
  startBreakTime: string
  endBreakTime: string
}

export interface EarlyParams {
  startTime: string // actual check-out time
  endTime: string // schedule end (toTime)
  startBreakTime: string
  endBreakTime: string
}

export interface WorkTimeParams {
  fromTime: string
  toTime: string
  startBreakTime: string
  endBreakTime: string
  lack: string | null
}

export interface OverTimeParams {
  workTime: string | null
  inOffice: string // 'HH:mm:ss' of total time in office
  startBreakTime: string
  endBreakTime: string
}

export function getLate(params: LateParams): string | null {
  const { startTime, endTime, startBreakTime, endBreakTime } = params
  if (!startTime || !endTime || !startBreakTime || !endBreakTime) return null

  let diffMs = timeToMs(endTime) - timeToMs(startTime)

  if (diffMs <= LATE_EARLY_GRACE_MS) {
    diffMs = 0
  } else {
    const diffStartBreakAndEndTime = timeToMs(endTime) - timeToMs(startBreakTime)
    const diffEndBreakAndEndTime = timeToMs(endBreakTime) - timeToMs(endTime)
    const overlapBreak = diffStartBreakAndEndTime > 0 && diffEndBreakAndEndTime > 0

    if (overlapBreak) {
      diffMs = timeToMs(startBreakTime) - timeToMs(startTime)
    } else if (diffEndBreakAndEndTime <= 0) {
      diffMs -= timeToMs(endBreakTime) - timeToMs(startBreakTime)
    }
  }

  return msToTime(Math.max(diffMs, 0))
}

export function getEarly(params: EarlyParams): string | null {
  const { startTime, endTime, startBreakTime, endBreakTime } = params
  if (!startTime || !endTime || !startBreakTime || !endBreakTime) return null

  let diffMs = timeToMs(endTime) - timeToMs(startTime)

  if (diffMs <= LATE_EARLY_GRACE_MS) {
    diffMs = 0
  } else {
    const diffStartBreakAndStartTime = timeToMs(startTime) - timeToMs(startBreakTime)
    const diffStartTimeAndEndBreak = timeToMs(endBreakTime) - timeToMs(startTime)
    const overlapBreak = diffStartBreakAndStartTime > 0 && diffStartTimeAndEndBreak > 0

    if (overlapBreak) {
      diffMs = timeToMs(endTime) - timeToMs(endBreakTime)
    } else if (diffStartBreakAndStartTime <= 0) {
      diffMs -= timeToMs(endBreakTime) - timeToMs(startBreakTime)
    }
  }

  return msToTime(Math.max(diffMs, 0))
}

export function getLack(late: string | null, early: string | null): string | null {
  if (late && early) return msToTime(timeToMs(late) + timeToMs(early))
  if (late) return late
  if (early) return early
  return null
}

export function getWorkTime(params: WorkTimeParams): string {
  const { fromTime, toTime, startBreakTime, endBreakTime, lack } = params
  const breakMs = timeToMs(endBreakTime) - timeToMs(startBreakTime)
  const inOfficeMs = timeToMs(toTime) - timeToMs(fromTime)
  const lackMs = lack ? timeToMs(lack) : 0
  return msToTime(Math.max(inOfficeMs - breakMs - lackMs, 0))
}

export function getOverTime(params: OverTimeParams): string | null {
  const { workTime, inOffice, startBreakTime, endBreakTime } = params
  if (!workTime || !inOffice || !startBreakTime || !endBreakTime) return null

  const diffMs = timeToMs(inOffice) - timeToMs(workTime)
  const breakMs = timeToMs(endBreakTime) - timeToMs(startBreakTime)
  return msToTime(Math.max(diffMs - breakMs, 0))
}
```

---

## Domain Event Contract

```typescript
// packages/event-contracts/src/time/work-time-config-changed.event.ts
export interface WorkTimeConfigChangedEvent {
  readonly type: 'time.WorkTimeConfigChanged'
  readonly tenantId: string
  readonly userId: string
  readonly workTimeId: string
  readonly fromDate: string // 'YYYY-MM-DD'
  readonly toDate: string | null // 'YYYY-MM-DD' or null (open-ended)
  readonly fromTime: string // 'HH:mm:ss'
  readonly toTime: string // 'HH:mm:ss'
  readonly startBreakTime: string // 'HH:mm:ss'
  readonly endBreakTime: string // 'HH:mm:ss'
}
```

Add to `packages/event-contracts/src/time/index.ts` (create if absent):

```typescript
export * from './work-time-config-changed.event'
```

And re-export from `packages/event-contracts/src/index.ts`.

---

## Tests (co-located)

File: `domain/value-objects/attendance-calculator.spec.ts`

Cover all five functions. Key cases:

### getLate

- Returns `null` when any param missing
- Within grace period (≤ 6 min) → `'00:00:00'`
- Late arrival that overlaps break start → uses `startBreakTime - fromTime` as late
- Late arrival past break end → subtracts full break duration
- Normal late arrival (no break overlap) → raw diff

### getEarly

- Mirror of getLate for early departure
- Within grace period → `'00:00:00'`
- Early departure that overlaps break → uses `toTime - endBreakTime`
- Early departure before break → subtracts full break duration

### getLack

- Both late and early → sum
- Only late → returns late
- Only early → returns early
- Both null → null

### getWorkTime

- Normal case: `(toTime - fromTime) - break - lack`
- Zero lack: no subtraction
- Result cannot go below `'00:00:00'`

### getOverTime

- Returns null if workTime or inOffice missing
- inOffice > workTime + break → positive overtime
- No overtime (inOffice ≤ workTime) → `'00:00:00'`

**Minimum: 15 test cases. ≥ 80% branch coverage on the calculator.**

---

## Acceptance Criteria

- [ ] `workTimeTable` added to `time.schema.ts` with all columns: id (uuid v7), tenant_id (notNull), user_id, from_date, to_date (nullable), from_time, to_time, start_break_time, end_break_time, description, created_at, updated_at
- [ ] `WorkTime` domain entity interface exists in `domain/entities/work-time.entity.ts`
- [ ] `IWorkTimeRepository` interface with all 7 methods exists in `domain/repositories/work-time.repository.ts`
- [ ] `WORK_TIME_REPOSITORY` symbol exported from the repository file
- [ ] `AttendanceCalculator` exports all 5 functions: `getLate`, `getEarly`, `getLack`, `getWorkTime`, `getOverTime`
- [ ] No `moment` import anywhere in the calculator
- [ ] `LATE_EARLY_GRACE_MS = 6 * 60 * 1000 - 1` constant is named and preserved exactly
- [ ] `WorkTimeConfigChangedEvent` interface exported from `packages/event-contracts`
- [ ] Unit tests cover all 5 functions with ≥ 15 cases; grace period edge case is tested; all pass
- [ ] No `.js` extensions in any relative import
- [ ] No NestJS decorators in domain/ files
