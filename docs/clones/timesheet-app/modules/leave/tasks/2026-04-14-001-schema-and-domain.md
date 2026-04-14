---
module: leave
task: schema-and-domain
created: 2026-04-14
updated: 2026-04-14
status: pending
depends-on: []
---

# Task: schema-and-domain

## Scope

Define the complete Drizzle schema for the leave module, all domain entities, all repository interfaces, the `OffTimeHourCalculator` pure domain service, and domain exceptions. No application logic, no NestJS wiring.

## Business Context

This is the foundation all other leave tasks depend on. The schema must be correct before any command handler or query can be built. The domain entities capture the invariants (e.g. carry-over is Q1-only, balance deducted on approval) so handlers can enforce them without re-reading source files.

## Source Reference

- **Files:**
  - `server/query/userLeave.query.js` — `user_leave` table shape
  - `server/query/request.query.js` — `request` table shape (leave-relevant columns)
  - `server/helper/constants.js` — discriminator UUIDs → these become enum values
  - `server/helper/calculation.js` — `getOffTimeHour` and all sub-functions

- **Key logic from source:**
  - `user_leave` columns: `id`, `user_id`, `year`, `total_leave`, `total_remain`, `carry_over`, `carry_over_remain`
  - `request` columns relevant to leave: `id`, `user_id`, `request_type_id` (discriminator), `status`, `comment`, `reason_id`, `start_date_time`, `end_date_time`, `off_time_hour`, `approve_by`, `confirm_by`, `manager_comment`, `admin_comment`, `error_count`, `created_date_time`, `modified_date_time`
  - `reason` columns: `id`, `name`, `request_type_id`, `max_request_day`, `description`
  - `leaveRequestTypeId = '6c2cc1c7-9555-49b6-89a7-debd4c10d46f'` → not needed; use enum `leave_type` on `leave_request` table instead
  - `reasonLeaveRequestId = '8a0e91a5-d449-408e-a31f-d964ed605f00'` → `leave_type = 'annual'`
  - `leaveCarryOverType = '75e5b87b-a7d0-4dcb-8ad6-09910d2d8b83'` → `leave_type = 'carry_over'`

- **`getOffTimeHour` algorithm:**
  1. Count business days between `startDateTime` and `endDateTime` (excludes weekends)
  2. Clamp request start/end times to user's work schedule `from_time`/`to_time`
  3. Adjust for break times (start and end break boundaries)
  4. Handle multi-work-schedule spans (user's schedule changed mid-period): iterate work time segments, compute each segment's contribution
  5. Returns hours as a float (e.g. 4.0 for half a working day)

## Target Location

- **Schema:** `apps/api/src/modules/time/infrastructure/schema/time.schema.ts`
  - Append new tables to existing file (which currently has only `export const timeSchema = pgSchema('time')`)
- **Domain entities:** `apps/api/src/modules/time/domain/entities/`
  - `leave-request.entity.ts`
  - `leave-balance.entity.ts`
  - `leave-reason.entity.ts`
- **Domain service:** `apps/api/src/modules/time/domain/services/off-time-hour.calculator.ts`
  - Also: `off-time-hour.calculator.spec.ts` (unit tests)
- **Repository interfaces:** `apps/api/src/modules/time/domain/repositories/`
  - `leave-request.repository.ts`
  - `leave-balance.repository.ts`
  - `leave-reason.repository.ts`
- **Domain exceptions:** `apps/api/src/modules/time/domain/exceptions/leave.exceptions.ts`

- **Conventions to follow:**
  - `id: uuid('id').$defaultFn(() => uuidv7()).primaryKey()`
  - `tenantId: uuid('tenant_id').notNull()`
  - All timestamps: `timestamp('...').notNull()` (no timezone — store UTC)
  - Repository token: `export const LEAVE_REQUEST_REPOSITORY = Symbol('ILeaveRequestRepository')`
  - No NestJS imports in `domain/` layer

## Data Model

### `time.leave_request`

```
id              uuid PK (uuidv7)
tenant_id       uuid NOT NULL
actor_id        uuid NOT NULL          -- the requesting employee (replaces user_id)
leave_type      text NOT NULL          -- enum: 'annual' | 'carry_over'
status          text NOT NULL          -- enum: 'new' | 'confirmed' | 'approved' | 'rejected' | 'cancelled'
reason_id       uuid NOT NULL          -- FK to time.leave_reason.id (soft FK, no DB constraint)
start_at        timestamp NOT NULL     -- renamed from start_date_time
end_at          timestamp NOT NULL     -- renamed from end_date_time
off_time_hour   numeric(6,2) NOT NULL  -- calculated hours
comment         text                   -- requester's note
approve_by      uuid                   -- manager who confirmed (set when status → confirmed)
approved_by     uuid                   -- hrm who approved/rejected (set when status → approved|rejected)
manager_comment text
hrm_comment     text                   -- renamed from admin_comment
created_at      timestamp NOT NULL DEFAULT now()
updated_at      timestamp NOT NULL DEFAULT now()
```

Note: `error_count` from legacy — this was a varchar 'true'/'false' for forget requests, not meaningful for leave. **Drop it.**

### `time.leave_balance`

```
id              uuid PK (uuidv7)
tenant_id       uuid NOT NULL
actor_id        uuid NOT NULL
year            integer NOT NULL
total_leave     numeric(6,2) NOT NULL  -- total annual leave hours allocated
total_remain    numeric(6,2) NOT NULL  -- remaining annual leave hours
carry_over      numeric(6,2) NOT NULL DEFAULT 0  -- carry-over hours granted
carry_over_remain numeric(6,2) NOT NULL DEFAULT 0  -- carry-over hours remaining

UNIQUE (tenant_id, actor_id, year)
```

### `time.leave_reason`

```
id              uuid PK (uuidv7)
tenant_id       uuid NOT NULL
name            text NOT NULL
leave_type      text NOT NULL          -- enum: 'annual' | 'carry_over' (which leave_type this reason applies to)
max_request_day integer                -- max days per request (nullable = unlimited)
description     text
is_active       boolean NOT NULL DEFAULT true
created_at      timestamp NOT NULL DEFAULT now()
updated_at      timestamp NOT NULL DEFAULT now()
```

Note: `request_type_id` in legacy was a FK back to the `request_type` table. Replaced by `leave_type` enum — simpler and removes the extra lookup table.

## Interface Contract

### `ILeaveRequestRepository`

```typescript
findById(id: string, tenantId: string): Promise<LeaveRequest | null>
findByActorAndDateRange(
  actorId: string, tenantId: string,
  from: Date, to: Date
): Promise<LeaveRequest[]>
insert(data: Omit<LeaveRequest, 'id' | 'createdAt' | 'updatedAt'>): Promise<LeaveRequest>
update(id: string, tenantId: string, data: Partial<Omit<LeaveRequest, 'id' | 'tenantId' | 'actorId' | 'createdAt'>>): Promise<LeaveRequest>
listByActor(actorId: string, tenantId: string, filters: LeaveRequestFilters): Promise<{ items: LeaveRequest[]; total: number }>
listByManager(managerId: string, tenantId: string, filters: LeaveRequestFilters): Promise<{ items: LeaveRequest[]; total: number }>
listAll(tenantId: string, filters: LeaveRequestFilters): Promise<{ items: LeaveRequest[]; total: number }>
checkOverlap(actorId: string, tenantId: string, startAt: Date, endAt: Date, leaveType: LeaveType, excludeId?: string): Promise<boolean>
```

### `ILeaveBalanceRepository`

```typescript
findByActorAndYear(actorId: string, tenantId: string, year: number): Promise<LeaveBalance | null>
listByTenant(tenantId: string, filters?: LeaveBalanceFilters): Promise<{ items: LeaveBalance[]; total: number }>
upsert(data: Omit<LeaveBalance, 'id'>): Promise<LeaveBalance>
update(id: string, tenantId: string, data: Partial<Omit<LeaveBalance, 'id' | 'tenantId' | 'actorId' | 'year'>>): Promise<LeaveBalance>
```

### `ILeaveReasonRepository`

```typescript
findById(id: string, tenantId: string): Promise<LeaveReason | null>
listByType(leaveType: LeaveType, tenantId: string): Promise<LeaveReason[]>
listAll(tenantId: string): Promise<LeaveReason[]>
insert(data: Omit<LeaveReason, 'id' | 'createdAt' | 'updatedAt'>): Promise<LeaveReason>
update(id: string, tenantId: string, data: Partial<Omit<LeaveReason, 'id' | 'tenantId' | 'createdAt'>>): Promise<LeaveReason>
delete(id: string, tenantId: string): Promise<void>
```

### `OffTimeHourCalculator` (pure domain service — no DI)

```typescript
interface WorkScheduleSegment {
  fromDate: Date
  toDate: Date | null // null = open-ended (current schedule)
  fromTime: number // decimal hour, e.g. 8.0
  toTime: number // e.g. 17.5
  startBreakTime: number // e.g. 12.0
  endBreakTime: number // e.g. 13.0
}

class OffTimeHourCalculator {
  calculate(startAt: Date, endAt: Date, schedules: WorkScheduleSegment[]): number
}
```

### Domain exceptions

```typescript
class LeaveRequestNotFoundException extends Error {}
class LeaveBalanceNotFoundException extends Error {}
class LeaveReasonNotFoundException extends Error {}
class DuplicateLeaveRequestException extends Error {}
class InsufficientLeaveBalanceException extends Error {}
class CarryOverOutsideQ1Exception extends Error {} // BR-04
class LeaveRequestNotCancellableException extends Error {} // status not 'new'
class InvalidLeaveStatusTransitionException extends Error {}
```

## Edge Cases

- `getOffTimeHour` returns 0 when `startAt === endAt` (same moment) — treat as invalid input, throw `InvalidLeaveRequestDateRangeException`
- `getOffTimeHour` returns 0 when the date range spans only weekend days — the request covers no business days; throw `InvalidLeaveRequestDateRangeException`
- Work schedule segments may not cover the full requested range (user has no schedule for some dates) — `OffTimeHourCalculator` should throw `MissingWorkScheduleException` rather than silently returning 0
- `leave_balance` row may not exist for current year if user was just hired — `findByActorAndYear` returns null; caller handles this with appropriate error
- `carry_over` values should be stored as hours (not days), matching `total_leave`

## Acceptance Criteria

- [ ] `time.leave_request` table defined in Drizzle with all columns, correct types, unique constraint on overlap prevention handled at app layer
- [ ] `time.leave_balance` table defined with UNIQUE(tenant_id, actor_id, year)
- [ ] `time.leave_reason` table defined
- [ ] All three domain entity types defined (pure TypeScript interfaces, no NestJS/Drizzle imports)
- [ ] All three repository interfaces defined with Symbol tokens
- [ ] `OffTimeHourCalculator.calculate()` implemented as a pure class (no `Inject`)
- [ ] `OffTimeHourCalculator` spec covers: single-day request, multi-day same schedule, multi-day with schedule change, weekend-spanning range (returns 0 business days), break-time clamping, start/end within break time
- [ ] Domain exceptions defined for all error cases
- [ ] No `.js` extensions in any import
- [ ] No NestJS decorators in `domain/` layer
- [ ] No imports from any other module's `domain/` or `infrastructure/`
