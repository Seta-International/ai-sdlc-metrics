# Task 001: Schema, Entity & Repository Interface

**Module:** attendance  
**Sequence:** 1 of 5  
**Depends on:** nothing  
**Estimated size:** small

---

## Scope

Define the foundational types for the attendance module:

1. Drizzle table definition `time.time_sheet` in `infrastructure/schema/time.schema.ts`
2. TypeScript domain entity `TimesheetEntry` in `domain/entities/timesheet-entry.entity.ts`
3. Repository interface `ITimesheetEntryRepository` in `domain/repositories/timesheet-entry.repository.ts`
4. Pure calculation value-object `AttendanceCalculator` in `domain/value-objects/attendance-calculator.ts`

---

## Business Context

The `time_sheet` table is the source of truth for every working day. Every other attendance feature (queries, check-in, recalculation) depends on this schema being correct. The calculated fields (`late`, `early`, `lack`, `work_time`, `over_time`) implement BR-01 (6-minute grace period) and must be mathematically identical to the legacy `utils/timesheet.js` logic.

---

## Source Reference

- `server/utils/timesheet.js` — contains `getLate`, `getEarly`, `getLack`, `getWorkTime`, `getOverTime` pure functions
- `server/query/timesheet.js` — reveals the full column set of `time_sheet`
- `server/query/timesheet.js` lines 249-256 — `checkInOnlineQuery` reveals all writable columns

---

## Target Location

```
apps/api/src/modules/time/
  infrastructure/schema/time.schema.ts          ← add table here
  domain/entities/timesheet-entry.entity.ts     ← new file
  domain/repositories/timesheet-entry.repository.ts   ← new file
  domain/value-objects/attendance-calculator.ts ← new file
```

---

## Data Model

### `time.time_sheet` table (Drizzle)

```ts
import { pgSchema, uuid, text, timestamp, boolean, date, integer } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const timeSchema = pgSchema('time')

export const timesheetEntry = timeSchema.table('time_sheet', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  userId: uuid('user_id').notNull(), // maps to actorId in people module
  date: date('date').notNull(), // calendar day (UTC midnight)
  checkIn: timestamp('check_in'), // actual moment user checked in
  checkOut: timestamp('check_out'), // projected or actual check-out
  actualIn: timestamp('actual_in'), // same as checkIn for online; biometric may differ
  actualOut: timestamp('actual_out'),
  late: text('late'), // HH:mm:ss | null
  early: text('early'), // HH:mm:ss | null
  lack: text('lack'), // HH:mm:ss | null — total missing time
  workTime: text('work_time'), // HH:mm:ss | null
  overTime: text('over_time'), // HH:mm:ss | null
  inOffice: text('in_office'), // HH:mm:ss — time between checkIn and checkOut
  comp: text('comp'), // HH:mm:ss — compensation OT applied
  holidayId: uuid('holiday_id'), // FK within time schema only
  inAccordance: boolean('in_accordance'), // online check-in schedule compliance
  workSchedule: text('work_schedule'), // RRule string snapshot at check-in time
  checkInType: integer('check_in_type'), // 0=biometric, 1=online
  comment: text('comment'),
  modifiedBy: uuid('modified_by'),
  modifiedDateTime: timestamp('modified_date_time'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
```

**Constraints:**

- Unique index on `(tenant_id, user_id, date)` — one row per user per day
- No FK to `people.employment_profile` (cross-schema boundary rule)
- No FK to `time.holiday` yet (holiday table added in holidays task)

---

## Domain Entity

```ts
// domain/entities/timesheet-entry.entity.ts
export type CheckInType = 'biometric' | 'online'

export interface TimesheetEntry {
  id: string
  tenantId: string
  userId: string
  date: string // ISO date string YYYY-MM-DD
  checkIn: Date | null
  checkOut: Date | null
  actualIn: Date | null
  actualOut: Date | null
  late: string | null // HH:mm:ss
  early: string | null // HH:mm:ss
  lack: string | null // HH:mm:ss
  workTime: string | null // HH:mm:ss
  overTime: string | null // HH:mm:ss
  inOffice: string | null // HH:mm:ss
  comp: string | null // HH:mm:ss
  holidayId: string | null
  inAccordance: boolean | null
  workSchedule: string | null // RRule snapshot
  checkInType: CheckInType | null
  comment: string | null
  modifiedBy: string | null
  modifiedDateTime: Date | null
  createdAt: Date
  updatedAt: Date
}
```

---

## Repository Interface

```ts
// domain/repositories/timesheet-entry.repository.ts
import type { TimesheetEntry } from '../entities/timesheet-entry.entity'

export const TIMESHEET_ENTRY_REPOSITORY = Symbol('TIMESHEET_ENTRY_REPOSITORY')

export interface TimesheetCalendarRow {
  day: string // YYYY-MM-DD
  entry: TimesheetEntry | null // null = no check-in that day
}

export interface ListTimesheetOptions {
  tenantId: string
  userId: string
  fromDate: string // YYYY-MM-DD
  toDate: string // YYYY-MM-DD
  limit: number
  offset: number
}

export interface ListMemberTimesheetOptions {
  tenantId: string
  managerId: string
  fromDate: string
  toDate: string
  badgeNumber?: string // filter by specific employee
  limit: number
  offset: number
}

export interface ListAllTimesheetOptions {
  tenantId: string
  fromDate: string
  toDate: string
  badgeNumber?: string
  name?: string
  limit: number
  offset: number
}

export interface ITimesheetEntryRepository {
  /** Find a single timesheet entry by userId + date */
  findByUserAndDate(userId: string, date: string, tenantId: string): Promise<TimesheetEntry | null>

  /** Calendar view of own timesheet (generates days even with no check-in) */
  listByUser(
    options: ListTimesheetOptions,
  ): Promise<{ rows: TimesheetCalendarRow[]; total: number }>

  /** Calendar view for manager's direct reports */
  listByManager(
    options: ListMemberTimesheetOptions,
  ): Promise<{ rows: TimesheetCalendarRow[]; total: number }>

  /** Company-wide calendar view (manager + hrm) */
  listAll(
    options: ListAllTimesheetOptions,
  ): Promise<{ rows: TimesheetCalendarRow[]; total: number }>

  /** All rows in date range for export (no pagination, max 31-day cap enforced in handler) */
  findAllForExport(
    tenantId: string,
    fromDate: string,
    toDate: string,
    badgeNumber?: string,
  ): Promise<TimesheetEntry[]>

  /** Check if user already has a check-in row for today */
  findTodayEntry(userId: string, tenantId: string): Promise<TimesheetEntry | null>

  /** Insert a new timesheet entry (online check-in) */
  insert(entry: Omit<TimesheetEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<TimesheetEntry>

  /** Update computed fields on an existing entry (recalculation) */
  updateComputedFields(
    id: string,
    tenantId: string,
    fields: Pick<TimesheetEntry, 'late' | 'early' | 'lack' | 'workTime' | 'overTime' | 'inOffice'>,
  ): Promise<void>

  /** Find all entries for a user within a date range (for recalculation cascade) */
  findByUserInRange(
    userId: string,
    tenantId: string,
    fromDate: string,
    toDate?: string,
  ): Promise<TimesheetEntry[]>
}
```

---

## AttendanceCalculator Value-Object

Port `utils/timesheet.js` exactly — no behavior changes, just TypeScript and no moment dependency.

```ts
// domain/value-objects/attendance-calculator.ts

const LATE_EARLY_GRACE_MS = 6 * 60 * 1000 - 1  // BR-01: 359_999 ms

/** Parse HH:mm:ss to total milliseconds */
function parseHHmmss(time: string): number { ... }

/** Format milliseconds to HH:mm:ss */
function formatMs(ms: number): string { ... }

function getDiffMs(startTime: string, endTime: string, type?: 'add'): number { ... }

export function getLate(params: {
  startTime: string        // fromTime (work start)
  endTime: string          // checkIn HH:mm:ss
  startBreakTime: string
  endBreakTime: string
}): string | null { ... }

export function getEarly(params: {
  startTime: string        // checkOut HH:mm:ss
  endTime: string          // toTime (work end)
  startBreakTime: string
  endBreakTime: string
}): string | null { ... }

export function getLack(late: string | null, early?: string | null): string | null { ... }

export function getWorkTime(params: {
  fromTime: string
  toTime: string
  startBreakTime: string
  endBreakTime: string
  lack: string | null
}): string | null { ... }

export function getOverTime(params: {
  workTime: string | null
  inOffice: string | null
  startBreakTime: string
  endBreakTime: string
}): string | null { ... }
```

**Test file:** `domain/value-objects/attendance-calculator.spec.ts`

---

## Acceptance Criteria

- [ ] `time.time_sheet` table defined in `infrastructure/schema/time.schema.ts` with all columns listed above
- [ ] Unique index `(tenant_id, user_id, date)` defined
- [ ] `TimesheetEntry` interface exported from `domain/entities/timesheet-entry.entity.ts`
- [ ] `ITimesheetEntryRepository` interface and `TIMESHEET_ENTRY_REPOSITORY` symbol exported
- [ ] `AttendanceCalculator` functions exported from `domain/value-objects/attendance-calculator.ts`
- [ ] `getLate` returns `null` when any input is missing
- [ ] `getLate` returns `'00:00:00'` when diff <= 6 min (BR-01 grace period)
- [ ] `getLate` returns correct duration when check-in spans break time
- [ ] `getEarly` mirrors `getLate` behavior for early departure
- [ ] `getLack` adds late + early correctly
- [ ] `getWorkTime` subtracts break and lack from full working window
- [ ] `getOverTime` returns `null` when inputs missing; zero-floors negative values
- [ ] All functions have co-located unit tests with at least: happy path, grace period boundary, break-time overlap, all-null inputs
- [ ] No `moment` or `moment-timezone` imports anywhere in target files
- [ ] No `.js` extensions in relative imports
