---
module: holidays
task: handlers-and-router
created: 2026-04-14
updated: 2026-04-14
status: pending
depends-on:
  - 2026-04-14-001-schema-entity-repository
---

# Task: handlers-and-router

## Scope

Build all application-layer handlers and the tRPC router contribution for the holidays sub-module:

1. `ListHolidaysHandler` — query handler (hrm only)
2. `CreateHolidayHandler` — command handler with overlap check + timesheet linking in transaction
3. `UpdateHolidayHandler` — command handler with overlap check + timesheet re-linking in transaction
4. `DeleteHolidayHandler` — command handler with timesheet unlinking in transaction
5. tRPC procedures wired into `interface/trpc/time.router.ts`
6. NestJS module wiring in `time.module.ts`
7. Unit + integration tests for all handlers

---

## Business Context

These four operations are the only way hrm manages company holidays. The transactional back-linking to `time_sheet` ensures attendance calculations are always consistent with the holiday calendar — no manual sync required. The overlap guard prevents double-booking a date as two different holidays.

---

## Source Reference

- **Files:**
  - `server/services/admin.service.js`:
    - `createHolidayService` → calls `checkDuplicateHoliday`, then `insertHolidayInDatabase` (transaction: insert + link timesheets)
    - `updateHoliday` → transaction: update holiday, clear old refs, re-link
    - `getAllHolidaysSevice` → simple select, compute `end_date`
    - `deleteHolidaysSevice` → transaction: clear refs, delete
    - `checkDuplicateHoliday` → calls `checkDuplicateHolidayQuery`
  - `server/query/admin.query.js`:
    - `checkDuplicateHolidayQuery` — `daterange && daterange` with optional `id != :id` exclusion
    - `getAllHolidaysQuery` — `SELECT *, to_char(start_date, 'yyyy-mm-dd'), to_char(start_date + duration - 1, 'yyyy-mm-dd') as end_date`
    - `insertHolidayQuery` — INSERT returning `*`
    - `updateHoliday` — UPDATE SET ... WHERE id returning id
    - `deleteHolidayIdInTimesheet` — UPDATE time_sheet SET holiday_id = null WHERE holiday_id = :id
    - `updateHolidayIdInTimesheetQuery` — UPDATE time_sheet SET holiday_id = :id WHERE date BETWEEN startDate AND endDate

- **Key logic:**
  - Duration: `countOffdays(startDate, endDate) || 1` (see task 001 for exact implementation)
  - `endDate` input for create/update: passed by client; defaults to `startDate` if not provided (single-day holiday)
  - `endDate` on list: computed from stored `start_date + duration - 1` — NOT stored directly
  - **BUG-01 (fix):** Legacy `updateHoliday` never calls overlap check. This task adds it: check overlap on update, excluding `self.id`.

---

## Target Location

```
apps/api/src/modules/time/
  application/
    queries/
      list-holidays.handler.ts
      list-holidays.handler.spec.ts
    commands/
      create-holiday.handler.ts
      create-holiday.handler.spec.ts
      update-holiday.handler.ts
      update-holiday.handler.spec.ts
      delete-holiday.handler.ts
      delete-holiday.handler.spec.ts
  interface/
    trpc/
      time.router.ts                 ← add holiday procedures here
  time.module.ts                     ← wire providers
```

**Conventions to follow:**

- Command/query handlers are plain classes with a single `execute(ctx, input)` method — no NestJS `@Injectable()` decorator on the handler class itself; inject via constructor in the handler class if needed
- tRPC `hrmProcedure` — use the procedure builder that enforces `role === 'hrm'`; check how it is defined in `apps/api/src/common/trpc/trpc-init.ts`
- Input validation: Zod schemas inline in the tRPC procedure definitions
- `generateId()` from `@future/db` for uuid v7 on create
- All operations are wrapped in a Drizzle transaction (`db.transaction(async tx => {...})`) for create/update/delete
- Error classes: use existing domain error pattern (check other modules for `DomainError` or similar base class)

---

## Data Model

No new schema changes — task 001 owns all schema. This task only reads/writes through `IHolidayRepository`.

---

## Interface Contract

### tRPC Procedures (all under `time.holidays.*`)

```typescript
// List all holidays for the tenant
time.holidays.list
input: z.object({})
output: z.array(
  z.object({
    id: z.string().uuid(),
    name: z.string(),
    startDate: z.string(), // 'YYYY-MM-DD'
    endDate: z.string(), // 'YYYY-MM-DD' — computed: startDate + duration - 1
    duration: z.number().int().min(1),
    description: z.string().nullable(),
  }),
)
auth: hrmProcedure

// Create a new holiday
time.holidays.create
input: z.object({
  name: z.string().min(1).max(255),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(), // defaults to startDate
  description: z.string().max(1000).optional(),
})
output: z.object({ id: z.string().uuid() })
auth: hrmProcedure

// Update an existing holiday
time.holidays.update
input: z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  description: z.string().max(1000).nullable().optional(),
})
output: z.object({ id: z.string().uuid() })
auth: hrmProcedure

// Delete a holiday
time.holidays.delete
input: z.object({ id: z.string().uuid() })
output: z.object({ success: z.literal(true) })
auth: hrmProcedure
```

### Handler signatures

```typescript
// ListHolidaysHandler
execute(ctx: TrpcContext): Promise<HolidayDto[]>

// CreateHolidayHandler
execute(ctx: TrpcContext, input: CreateHolidayInput): Promise<{ id: string }>

// UpdateHolidayHandler
execute(ctx: TrpcContext, input: UpdateHolidayInput): Promise<{ id: string }>

// DeleteHolidayHandler
execute(ctx: TrpcContext, input: { id: string }): Promise<{ success: true }>
```

### HolidayDto (output shape)

```typescript
interface HolidayDto {
  id: string
  name: string
  startDate: string // 'YYYY-MM-DD'
  endDate: string // 'YYYY-MM-DD' — computed, not stored
  duration: number
  description: string | null
}
```

---

## Handler Logic

### ListHolidaysHandler

```
1. Call repo.findAll(ctx.tenantId)
2. Map each Holiday entity → HolidayDto (use entity.endDate getter)
3. Return array
```

### CreateHolidayHandler

```
1. Resolve effectiveEndDate = input.endDate ?? input.startDate
2. duration = HolidayDuration.calculate(input.startDate, effectiveEndDate)
3. Call repo.checkOverlap(input.startDate, effectiveEndDate, ctx.tenantId)
   → if true, throw HolidayOverlapError('This holiday overlaps with an existing one.')
4. id = generateId()
5. Build Holiday entity
6. Within a Drizzle transaction:
   a. repo.create(holiday)
   b. repo.linkToTimesheets(id, input.startDate, effectiveEndDate, ctx.tenantId)
7. Return { id }
```

### UpdateHolidayHandler

```
1. Fetch existing = repo.findById(input.id, ctx.tenantId)
   → if null, throw HolidayNotFoundError
2. Resolve new values (merge input over existing):
   - newStartDate = input.startDate ?? existing.startDate
   - newEndDate = input.endDate ?? existing.endDate   // existing.endDate uses getter
   - newDuration = HolidayDuration.calculate(newStartDate, newEndDate)
   - newName = input.name ?? existing.name
   - newDescription = input.description !== undefined ? input.description : existing.description
3. Call repo.checkOverlap(newStartDate, newEndDate, ctx.tenantId, excludeId: input.id)
   → if true, throw HolidayOverlapError
4. Build updated Holiday entity
5. Within a Drizzle transaction:
   a. repo.update(updatedHoliday)
   b. repo.unlinkFromTimesheets(input.id, ctx.tenantId)   // clear old refs
   c. repo.linkToTimesheets(input.id, newStartDate, newEndDate, ctx.tenantId)  // re-link
6. Return { id: input.id }
```

### DeleteHolidayHandler

```
1. Fetch existing = repo.findById(input.id, ctx.tenantId)
   → if null, throw HolidayNotFoundError
2. Within a Drizzle transaction:
   a. repo.unlinkFromTimesheets(input.id, ctx.tenantId)  // clear refs first
   b. repo.deleteById(input.id, ctx.tenantId)
3. Return { success: true }
```

---

## Edge Cases

- **Single-day holiday:** `endDate` omitted → defaults to `startDate`. `duration = 1`. `endDate` getter returns same date as `startDate`. Overlap check still uses inclusive daterange.
- **Update with no date changes:** If `startDate` and `endDate` not in input, use existing values. Re-linking should produce the same result (idempotent). Overlap check excludes self, so no false positive.
- **Update changes only name/description:** Still runs the full unlink/re-link cycle. This is safe and simpler than conditionally skipping it.
- **Delete non-existent holiday:** Return `HolidayNotFoundError` (404-equivalent TRPCError).
- **Overlap with self on update:** Must exclude `self.id` from overlap query. If not excluded, updating a holiday (e.g. just changing the name) would always report an overlap.
- **`linkToTimesheets` with no matching timesheet rows:** This is normal (e.g. a future holiday with no timesheet rows yet). The UPDATE affects 0 rows — not an error.
- **Transaction rollback:** If any step in the transaction throws, Drizzle rolls back automatically. All three mutating handlers must use `db.transaction()`.

---

## Error Types

Define in `domain/` or reuse existing pattern:

```typescript
export class HolidayOverlapError extends Error {
  constructor() {
    super('This holiday overlaps with an existing one.')
    this.name = 'HolidayOverlapError'
  }
}

export class HolidayNotFoundError extends Error {
  constructor(id: string) {
    super(`Holiday ${id} not found.`)
    this.name = 'HolidayNotFoundError'
  }
}
```

Map to tRPC errors in the router:

- `HolidayOverlapError` → `TRPCError({ code: 'CONFLICT' })`
- `HolidayNotFoundError` → `TRPCError({ code: 'NOT_FOUND' })`

---

## Acceptance Criteria

- [ ] `list` procedure returns all holidays for the caller's tenant, each with a computed `endDate` (`startDate + duration - 1`)
- [ ] `create` procedure rejects overlapping holidays with a `CONFLICT` tRPC error
- [ ] `create` procedure inserts holiday and sets `holiday_id` on all matching `time_sheet` rows within the date range, all in one transaction
- [ ] `update` procedure rejects overlapping holidays (excluding self) with a `CONFLICT` tRPC error — **this is the BUG-01 fix**
- [ ] `update` procedure: clears old timesheet refs, then re-links with new date range, all in one transaction
- [ ] `delete` procedure: clears timesheet refs first, then deletes holiday, all in one transaction
- [ ] All procedures are `hrmProcedure` — `staff` and `manager` roles receive `FORBIDDEN`
- [ ] `HolidayOverlapError` maps to `CONFLICT` TRPCError
- [ ] `HolidayNotFoundError` maps to `NOT_FOUND` TRPCError
- [ ] `CreateHolidayHandler` unit test: happy path (no overlap), overlap throws, single-day (no endDate)
- [ ] `UpdateHolidayHandler` unit test: happy path, overlap throws, not found throws, overlap excludes self
- [ ] `DeleteHolidayHandler` unit test: happy path, not found throws
- [ ] `ListHolidaysHandler` unit test: returns mapped DTOs with computed `endDate`
- [ ] Integration test: full create → list → update → delete cycle against real DB (pgSchema('time'))
- [ ] No `.js` extensions in any relative import
- [ ] `time.module.ts` registers all 4 handlers as providers and injects `HOLIDAY_REPOSITORY_TOKEN`
