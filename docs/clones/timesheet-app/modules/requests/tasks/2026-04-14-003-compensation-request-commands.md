# Task 003: Compensation Request Commands + Timesheet.comp Write

**Module:** time / requests
**Sequence:** 003
**Depends on:** Task 001 (schema + entities + repository interface), Task 002 (delete-request.handler — must extend it to handle comp cleanup)
**Estimated size:** Medium-Large (core BR-07 logic is complex)

---

## Scope

Implement command handlers for compensation requests:

1. `SubmitCompensationRequestHandler` — create comp request with OT availability check, quota checks, BR-07 `timesheet.comp` write, all in a single DB transaction
2. `UpdateCompensationRequestHandler` — manager confirm or HRM approve/reject; if dates change, clear old `timesheet.comp` and recalculate
3. Extend `DeleteRequestHandler` (from Task 002) to clear `timesheet.comp` when deleting a compensation request

Also implement the `ITimesheetCompRepository` (or extend the timesheet repository interface) for the `timesheet.comp` write — since timesheet is within the same `time` module, direct DB access via Drizzle is permitted.

---

## Business Context (BR-07)

When a compensation request is submitted:

- `compensationDate`: the day the user worked overtime (has `over_time` in timesheet)
- `requestDate`: the day the user was late (has `lack` in timesheet)
- The system validates: `over_time(compensationDate) > 0` AND `lack(requestDate) > 0`
- The system validates: `over_time(compensationDate) >= existing_comp(compensationDate) + new_request_lack(requestDate)`
  (i.e., the OT is not already exhausted by other comp requests)
- On success: writes `comp = min(over_time, lack)` to `timesheet` row for `requestDate`

**BR-03:**

- Max 6 distinct `request_date` values per user per month (status != rejected) — the "6 late days" limit
- Max 3 distinct `compensation_date` values per user per month (status != rejected) — the "3 source OT days" limit

**Bugs fixed vs legacy:**

- Legacy `countNumberOfCompThisMonthQuery` uses `forgetRequestTypeId` instead of `lateEarlyRequestTypeId` (wrong type ID) → fixed by using `requestType = 'compensation'` enum
- Legacy quota check: `rows[0].length >= 3` (always false, object has no .length) → fixed: `rows.length >= MAX_COMP_SOURCE_DAYS_PER_MONTH`
- Legacy delete: cleared `timesheet.comp` for all request types → fixed: only clear for comp type

---

## Source Reference

- `postCompensationRequestService` in `request.service.js` (lines 240–321)
- `updateTimesheetService` in `request.service.js` (lines 189–220)
- `checkAvailableCompDay` in `request.service.js` (lines 228–238)
- `PUT /compensation-request/:id` in `request.js` (lines 440–603)
- `DELETE /request/:id` in `request.js` (lines 605–639) — comp cleanup part
- `selectCompensationTimeQuery`, `findDuplicateCompensationRequestQuery`, `countNumberOfCompThisMonthQuery`, `updatedRequestDateTimesheetQuery` in `request.query.js`

---

## Target Location

```
apps/api/src/modules/time/application/commands/
  submit-compensation-request.command.ts
  submit-compensation-request.handler.ts
  submit-compensation-request.handler.spec.ts
  update-compensation-request.command.ts
  update-compensation-request.handler.ts
  update-compensation-request.handler.spec.ts
  (delete-request.handler.ts — extend from Task 002 to handle comp cleanup)

apps/api/src/modules/time/domain/repositories/
  timesheet-comp.repository.ts              ← new interface for comp-specific timesheet writes

apps/api/src/modules/time/infrastructure/repositories/
  drizzle-timesheet-comp.repository.ts
```

---

## New Repository Interface: ITimesheetCompRepository

The requests sub-module needs to read `over_time` and `lack` from timesheet, and write `comp`. Since this is within the same `time` module, direct DB access is allowed.

```typescript
// domain/repositories/timesheet-comp.repository.ts

export const TIMESHEET_COMP_REPOSITORY = Symbol('ITimesheetCompRepository')

export interface TimesheetOtInfo {
  overTime: string | null // interval string e.g. "01:30:00"
  lack: string | null // interval string
  currentComp: string | null // sum of comp already committed for this compensation_date
}

export interface ITimesheetCompRepository {
  // Read OT info needed for comp validation (BR-07)
  getCompValidationData(
    actorId: string,
    tenantId: string,
    compensationDate: string, // ISO date
    requestDate: string, // ISO date
  ): Promise<TimesheetOtInfo | null>

  // Write comp to the request_date timesheet row
  writeComp(
    actorId: string,
    tenantId: string,
    requestDate: string,
    comp: string, // interval string
  ): Promise<void>

  // Clear comp from the request_date timesheet row (on delete or date change)
  clearComp(actorId: string, tenantId: string, requestDate: string): Promise<void>
}
```

The Drizzle implementation queries the `time.time_sheet` table (defined in time.schema.ts by the `attendance` sub-module task).

**If `time_sheet` table is not yet defined in time.schema.ts**, add a minimal reference to it here — just enough columns for the comp read/write:

- `date` (date), `actor_id` (uuid), `tenant_id` (uuid), `over_time` (text/interval), `lack` (text/interval), `comp` (text/interval)

---

## Command Definitions

### SubmitCompensationRequestCommand

```typescript
export class SubmitCompensationRequestCommand {
  constructor(
    readonly tenantId: string,
    readonly actorId: string,
    readonly requestDate: string, // ISO date — the late day
    readonly compensationDate: string, // ISO date — the OT day
    readonly errorCount: boolean,
    readonly comment: string | null,
    readonly monthFromDate: string, // first day of compensationDate's month
    readonly monthToDate: string, // last day of compensationDate's month
  ) {}
}
```

### UpdateCompensationRequestCommand

```typescript
export class UpdateCompensationRequestCommand {
  constructor(
    readonly tenantId: string,
    readonly actorId: string,
    readonly requestId: string,
    readonly status?: 'confirmed' | 'approved' | 'rejected',
    readonly approvedBy?: string,
    readonly confirmedBy?: string,
    readonly managerComment?: string,
    readonly adminComment?: string,
    readonly comment?: string,
    readonly requestDate?: string, // if changing dates, triggers comp recalculation
    readonly compensationDate?: string,
  ) {}
}
```

---

## Handler Logic

### SubmitCompensationRequestHandler

```
1. Duplicate check:
   - repo.findDuplicateComp(actorId, tenantId, requestDate)
   - if found → throw DuplicateRequestException('compensation')

2. Quota check (BR-03 — source-day limit):
   - repo.countDistinctCompRequestDatesInMonth(actorId, tenantId, monthFrom, monthTo)
   - if sourceDays >= MAX_COMP_SOURCE_DAYS_PER_MONTH (3) → throw CompQuotaExceededException('source-days', 3)

3. Quota check (BR-03 — request-day limit):
   - if requestDays >= MAX_COMP_REQUEST_DAYS_PER_MONTH (6) → throw CompQuotaExceededException('request-days', 6)

4. OT availability check (BR-07):
   - timesheetCompRepo.getCompValidationData(actorId, tenantId, compensationDate, requestDate)
   - if null → throw TimesheetNotFoundException(compensationDate)
   - if overTime is null OR lack is null → throw InsufficientOvertimeException
   - compute: availableSeconds = intervalToSeconds(overTime) - intervalToSeconds(currentComp)
   - if availableSeconds < intervalToSeconds(lack) → throw InsufficientOvertimeException

5. Compute comp = min(overTime, lack) → the lesser of the two intervals

6. Transaction:
   a. repo.insertComp({ tenantId, actorId, requestType: 'compensation', status: 'new',
        requestDate, compensationDate, errorCount, comment })
   b. timesheetCompRepo.writeComp(actorId, tenantId, requestDate, comp)
   If either fails → rollback

7. Return: { id: compensationRequest.id }
```

### UpdateCompensationRequestHandler

```
1. Load request: repo.findById(requestId, tenantId)
   - if null → throw RequestNotFoundException

2. If requestDate or compensationDate is changing:
   a. timesheetCompRepo.clearComp(actorId, tenantId, oldRequest.requestDate)
   b. timesheetCompRepo.getCompValidationData(actorId, tenantId,
        newCompDate ?? oldRequest.compensationDate,
        newRequestDate ?? oldRequest.requestDate)
   c. Re-validate OT availability (same as step 4 above)
   d. Compute new comp value
   e. timesheetCompRepo.writeComp(actorId, tenantId,
        newRequestDate ?? oldRequest.requestDate, newComp)

3. Build update data from non-undefined fields
4. repo.updateComp(requestId, tenantId, updateData)

5. Return: updated request
```

### DeleteRequestHandler Extension (from Task 002)

When `deletedRow.requestType === 'compensation'`:

```
  timesheetCompRepo.clearComp(actorId, tenantId, deletedRow.requestDate)
```

The `DeleteRequestHandler` must inject both `ITimeRequestRepository` and `ITimesheetCompRepository`.

---

## Interval Utility

Create `infrastructure/utils/interval.util.ts`:

```typescript
// Convert "HH:MM:SS" interval string to seconds
export function intervalToSeconds(interval: string | null): number {
  if (!interval) return 0
  const [h = '0', m = '0', s = '0'] = interval.split(':')
  return Number(h) * 3600 + Number(m) * 60 + Number(s)
}

// Return the smaller of two interval strings
export function minInterval(a: string, b: string): string {
  return intervalToSeconds(a) <= intervalToSeconds(b) ? a : b
}
```

---

## Unit Tests

### submit-compensation-request.handler.spec.ts

Test cases:

- [ ] Happy path: comp request submitted, timesheet.comp written, returns id
- [ ] Duplicate found: throws DuplicateRequestException
- [ ] Source-day quota exceeded (sourceDays >= 3): throws CompQuotaExceededException('source-days', 3)
- [ ] Request-day quota exceeded (requestDays >= 6): throws CompQuotaExceededException('request-days', 6)
- [ ] Timesheet not found for compensationDate: throws TimesheetNotFoundException
- [ ] overTime is null: throws InsufficientOvertimeException
- [ ] lack is null: throws InsufficientOvertimeException
- [ ] Available OT < lack: throws InsufficientOvertimeException

### update-compensation-request.handler.spec.ts

Test cases:

- [ ] Happy path: manager confirms (approvedBy set), no date change
- [ ] Happy path: HRM approves, no date change
- [ ] Date change: old comp cleared, new comp calculated and written
- [ ] Date change with insufficient OT: throws InsufficientOvertimeException, no partial state written
- [ ] Request not found: throws RequestNotFoundException

---

## Acceptance Criteria

- [ ] `SubmitCompensationRequestHandler` enforces both BR-03 quota checks (source-days AND request-days)
- [ ] `SubmitCompensationRequestHandler` runs timesheet write in the same transaction as the request insert (via Drizzle `db.transaction()`)
- [ ] `UpdateCompensationRequestHandler` clears old comp before writing new comp when dates change
- [ ] `DeleteRequestHandler` (extended) clears `timesheet.comp` only when `requestType === 'compensation'`
- [ ] `ITimesheetCompRepository` interface defined with `getCompValidationData`, `writeComp`, `clearComp`
- [ ] `intervalToSeconds` and `minInterval` utilities implemented and tested
- [ ] All test cases listed pass
- [ ] No `.js` extensions in imports
- [ ] No email/notification code in handlers
- [ ] Drizzle implementation shells created (can throw 'not implemented' until integration test task)
