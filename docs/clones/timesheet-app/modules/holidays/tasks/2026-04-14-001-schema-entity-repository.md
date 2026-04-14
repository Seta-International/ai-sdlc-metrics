---
module: holidays
task: schema-entity-repository
created: 2026-04-14
updated: 2026-04-14
status: pending
depends-on: []
---

# Task: schema-entity-repository

## Scope

Build the data and domain foundation for the holidays sub-module inside `apps/api/src/modules/time/`:

1. Drizzle schema — add `holiday` table to `infrastructure/schema/time.schema.ts`
2. Domain entity — `Holiday` class in `domain/entities/holiday.entity.ts`
3. Value object — `HolidayDuration` in `domain/value-objects/holiday-duration.vo.ts` (ports `countOffdays`)
4. Repository interface — `IHolidayRepository` in `domain/repositories/holiday.repository.ts`
5. Drizzle repository implementation — `DrizzleHolidayRepository` in `infrastructure/repositories/drizzle-holiday.repository.ts`
6. Unit tests co-located with each source file

---

## Business Context

The `holiday` table is the source of truth for company non-working days. It is small (dozens of rows per tenant per year) but critical: when a holiday is created or updated, its `id` is written back into `time.time_sheet` rows so that attendance calculations know to skip late/lack computation for those days. Getting the schema and repository right is the prerequisite for all command/query logic.

---

## Source Reference

- **Files:**
  - `server/query/admin.query.js` — `insertHolidayQuery`, `getAllHolidaysQuery`, `updateHoliday`, `deleteHolidayQuery`, `updateHolidayIdInTimesheetQuery`, `deleteHolidayIdInTimesheet`, `checkDuplicateHolidayQuery`
  - `server/helper/calculation.js` — `countOffdays` function

- **Key logic:**
  - Legacy `holiday` table: `id` (serial), `name` (varchar), `start_date` (date), `duration` (int), `description` (text/varchar)
  - `countOffdays(startDate, endDate)`:
    ```js
    startDateTime.setHours(0, 0, 0, 0)
    endDateTime.setHours(23, 59, 59, 999)
    const offDays = Math.round((endDateTime - startDateTime) / 3600 / 1000 / 24)
    return Math.max(offDays, 0)
    ```
    Note: uses `Math.round`, not `Math.ceil`. The user-facing description says "ceiling" but the implementation rounds. **Preserve `Math.round` exactly** — changing to ceiling would alter stored durations for any fractional-hour-difference edge cases.
  - `endDate` is always computed from stored values: `start_date + duration - 1` (inclusive)
  - Overlap check uses PostgreSQL `daterange` with inclusive bounds `'[]'`

---

## Target Location

```
apps/api/src/modules/time/
  domain/
    entities/
      holiday.entity.ts
      holiday.entity.spec.ts
    value-objects/
      holiday-duration.vo.ts
      holiday-duration.vo.spec.ts
    repositories/
      holiday.repository.ts          ← interface only, no NestJS deps
  infrastructure/
    schema/
      time.schema.ts                 ← add holiday table here
    repositories/
      drizzle-holiday.repository.ts
      drizzle-holiday.repository.spec.ts
```

**Conventions to follow:**

- `pgSchema('time')` — all tables live in the `time` PostgreSQL schema
- `id`: `uuid('id').defaultRandom().primaryKey()` — use `generateId()` from `@future/db` for uuid v7 at the application layer (do not use `defaultRandom()` for uuid v7; call `generateId()` in the command handler and pass it in)
- `tenantId`: `uuid('tenant_id').notNull()` — every table, no exceptions
- No FK constraints across schema boundaries — `holiday_id` in `time_sheet` is a plain `uuid` column, not a FK reference
- Repository interface in `domain/repositories/` — plain TypeScript interface, zero NestJS or Drizzle imports
- Drizzle repo implementation in `infrastructure/repositories/` — injected with `@InjectDrizzle()` token

---

## Data Model

### New table: `time.holiday`

```typescript
export const holiday = timeSchema.table('holiday', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  startDate: date('start_date').notNull(),
  duration: integer('duration').notNull(), // number of calendar days (min 1)
  description: varchar('description', { length: 1000 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
```

### Modification to existing `time.time_sheet` (attendance task owns the full definition)

The `time_sheet` table already has a `holiday_id uuid` column (no FK constraint). This task does **not** modify that table definition — it references it only in the repository methods that link/unlink holidays.

### Domain entity shape

```typescript
export class Holiday {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public readonly name: string,
    public readonly startDate: string, // ISO date string 'YYYY-MM-DD'
    public readonly duration: number, // calendar days, min 1
    public readonly description: string | null,
  ) {}

  get endDate(): string {
    // Returns inclusive end date: startDate + duration - 1 days
    const d = new Date(this.startDate)
    d.setDate(d.getDate() + this.duration - 1)
    return d.toISOString().slice(0, 10)
  }
}
```

### Value object: `HolidayDuration`

```typescript
export class HolidayDuration {
  /** Port of legacy countOffdays. Uses Math.round (NOT Math.ceil) to preserve exact legacy behavior. */
  static calculate(startDate: string, endDate: string): number {
    const start = new Date(startDate)
    const end = new Date(endDate)
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
    const days = Math.round((end.getTime() - start.getTime()) / 3600 / 1000 / 24)
    return Math.max(days, 0) || 1 // min 1
  }
}
```

### Repository interface

```typescript
export interface IHolidayRepository {
  findAll(tenantId: string): Promise<Holiday[]>
  findById(id: string, tenantId: string): Promise<Holiday | null>
  checkOverlap(
    startDate: string,
    endDate: string,
    tenantId: string,
    excludeId?: string,
  ): Promise<boolean>
  create(holiday: Holiday): Promise<Holiday>
  update(holiday: Holiday): Promise<Holiday>
  deleteById(id: string, tenantId: string): Promise<void>
  /** Links holiday_id = holidayId in time_sheet rows whose date falls within [startDate, endDate] */
  linkToTimesheets(
    holidayId: string,
    startDate: string,
    endDate: string,
    tenantId: string,
  ): Promise<void>
  /** Clears holiday_id = null for all time_sheet rows referencing this holiday */
  unlinkFromTimesheets(holidayId: string, tenantId: string): Promise<void>
}
```

---

## Interface Contract

This task produces no tRPC procedures — that is task 002. It exposes only the `IHolidayRepository` interface and injects the `DrizzleHolidayRepository` token.

The NestJS injection token should be `HOLIDAY_REPOSITORY_TOKEN` (a symbol), exported from `infrastructure/repositories/drizzle-holiday.repository.ts`.

---

## Edge Cases

- `startDate === endDate` — `HolidayDuration.calculate` must return 1 (verified by unit test)
- `endDate < startDate` — `calculate` returns 1 via `|| 1` fallback (same as legacy)
- `checkOverlap` with `excludeId` — used for update validation; must exclude the holiday being updated from the overlap set
- Overlap check uses inclusive daterange on both ends: `daterange(start, end, '[]')`. Drizzle: use `sql` template with `::date` casts.
- `linkToTimesheets` operates on `time.time_sheet.date` column using `BETWEEN :startDate::date AND :endDate::date` — note `endDate` here is `startDate + duration - 1` (the inclusive end date, NOT the raw `endDate` param that might not be stored)
- `unlinkFromTimesheets` must also filter by `tenant_id` to avoid cross-tenant corruption

---

## Acceptance Criteria

- [ ] `time.holiday` table exists in `time.schema.ts` with `id`, `tenant_id`, `name`, `start_date`, `duration`, `description`, `created_at`, `updated_at`
- [ ] `Holiday` entity has `endDate` getter that returns `startDate + duration - 1` days as `YYYY-MM-DD`
- [ ] `HolidayDuration.calculate('2026-01-01', '2026-01-01')` returns `1`
- [ ] `HolidayDuration.calculate('2026-01-01', '2026-01-05')` returns `5`
- [ ] `HolidayDuration.calculate('2026-01-05', '2026-01-01')` returns `1` (min guard)
- [ ] `IHolidayRepository` interface defined with all 7 methods
- [ ] `DrizzleHolidayRepository` implements all 7 methods; `checkOverlap` uses `daterange &&` via Drizzle `sql` template
- [ ] `linkToTimesheets` and `unlinkFromTimesheets` both filter by `tenant_id`
- [ ] All Drizzle queries include `tenantId` filter
- [ ] `holiday-duration.vo.spec.ts` covers: same-day, multi-day, reversed dates
- [ ] `drizzle-holiday.repository.spec.ts` integration tests: create, overlap check (no conflict), overlap check (conflict), overlap check (excludeId excludes self), link/unlink timesheets
- [ ] No `.js` extensions in any relative import
- [ ] No imports from other modules' `domain/` or `infrastructure/` paths
