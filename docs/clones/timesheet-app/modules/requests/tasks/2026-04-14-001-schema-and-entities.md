# Task 001: Schema and Entities — Requests

**Module:** time / requests
**Sequence:** 001 (no dependencies)
**Estimated size:** Small-Medium

---

## Scope

Define the Drizzle schema tables, domain entity interfaces, repository interfaces, and exceptions for the `forget_request` and `compensation_request` sub-types.

This task creates the foundational layer — all subsequent tasks depend on it.

---

## Business Context

The legacy `request` table is a discriminated union of all request types (leave, forget, compensation). In Future we keep a **single `time.request` table** (discriminated by `requestType` enum) but only implement forget and compensation types here. Leave requests are a separate sub-module.

Every table in Future must have `id` (uuid v7) and `tenant_id` (uuid, notNull).

---

## Source Reference

- `server/query/request.query.js` — INSERT statements reveal the column set:
  - Forget: `user_id, request_type_id, status, comment, request_date, error_count, start_date_time?, end_date_time?`
  - Comp: `user_id, request_type_id, status, comment, error_count, request_date, compensation_date`
  - Shared: `approve_by, confirm_by, manager_comment, admin_comment, off_time_hour, reason_id, modified_date_time`

The legacy table name is `request`. We rename to `time_request` inside the `time` schema to avoid conflict with reserved words.

---

## Target Location

```
apps/api/src/modules/time/
  infrastructure/schema/time.schema.ts        ← add tables here
  domain/entities/
    time-request.entity.ts                    ← shared entity + ForgetRequest + CompensationRequest types
  domain/repositories/
    time-request.repository.ts               ← ITimeRequestRepository interface + token
  domain/exceptions/
    time-request.exceptions.ts               ← typed exceptions
```

---

## Schema Definition

Add to `infrastructure/schema/time.schema.ts`:

```typescript
import { pgSchema, uuid, text, timestamp, boolean, integer, date } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const timeSchema = pgSchema('time')

// Discriminated by requestType
export const timeRequest = timeSchema.table('time_request', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  actorId: uuid('actor_id').notNull(), // replaces user_id (actor in identity/people)
  requestType: text('request_type', {
    enum: ['forget', 'compensation'],
  }).notNull(),
  status: text('status', {
    enum: ['new', 'confirmed', 'approved', 'rejected'],
  })
    .notNull()
    .default('new'),

  // Forget fields
  requestDate: date('request_date'), // the day to correct (forget) or the late day (comp)
  checkInTime: timestamp('check_in_time', { withTimezone: true }), // replaces start_date_time for forget
  checkOutTime: timestamp('check_out_time', { withTimezone: true }), // replaces end_date_time for forget
  errorCount: boolean('error_count').default(false),

  // Compensation fields
  compensationDate: date('compensation_date'), // the OT day used as source

  // Approval
  approvedBy: uuid('approved_by'), // manager who set approve_by (step 1: confirmed)
  confirmedBy: uuid('confirmed_by'), // HRM who set final status (step 2: approved/rejected)

  // Comments
  comment: text('comment'),
  managerComment: text('manager_comment'),
  adminComment: text('admin_comment'),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
```

**Note on field naming changes vs legacy:**

- `user_id` → `actorId` (consistent with other modules)
- `request_type_id` (UUID FK to request_type table) → `requestType` (enum — eliminates the `request_type` table as a runtime concern; type IDs become seed/config constants)
- `start_date_time` / `end_date_time` → `checkInTime` / `checkOutTime` (meaningful names for forget type)
- `off_time_hour` — **excluded**: this field belongs to leave requests only
- `reason_id` — **excluded**: belongs to leave requests only
- `modified_date_time` → `updatedAt` (standard naming)

---

## Domain Entities

```typescript
// domain/entities/time-request.entity.ts

export type RequestStatus = 'new' | 'confirmed' | 'approved' | 'rejected'
export type RequestType = 'forget' | 'compensation'

export interface TimeRequest {
  id: string
  tenantId: string
  actorId: string
  requestType: RequestType
  status: RequestStatus
  comment: string | null
  managerComment: string | null
  adminComment: string | null
  approvedBy: string | null // actor who confirmed (manager, step 1)
  confirmedBy: string | null // actor who approved/rejected (HRM, step 2)
  createdAt: Date
  updatedAt: Date
}

export interface ForgetRequest extends TimeRequest {
  requestType: 'forget'
  requestDate: string // ISO date string (YYYY-MM-DD)
  checkInTime: Date | null // corrected check-in
  checkOutTime: Date | null // corrected check-out
  errorCount: boolean
}

export interface CompensationRequest extends TimeRequest {
  requestType: 'compensation'
  requestDate: string // the late day (lack)
  compensationDate: string // the OT day (over_time source)
  errorCount: boolean
}
```

---

## Repository Interface

```typescript
// domain/repositories/time-request.repository.ts

import type {
  ForgetRequest,
  CompensationRequest,
  RequestStatus,
  TimeRequest,
} from '../entities/time-request.entity'

export const TIME_REQUEST_REPOSITORY = Symbol('ITimeRequestRepository')

export interface ListRequestsFilter {
  tenantId: string
  actorId?: string // filter by specific user (my requests)
  managerActorId?: string // filter team (staff where manager_id = this)
  requestTypes?: ('forget' | 'compensation')[]
  status?: RequestStatus
  fromDate?: string // ISO date
  toDate?: string // ISO date
  limit: number
  offset: number
}

export interface ITimeRequestRepository {
  // Reads
  findById(id: string, tenantId: string): Promise<TimeRequest | null>
  list(filter: ListRequestsFilter): Promise<{ items: TimeRequest[]; total: number }>
  countNewForManager(managerActorId: string, tenantId: string): Promise<number>

  // Forget quota
  countForgetRequestsInMonth(
    actorId: string,
    tenantId: string,
    fromDate: string,
    toDate: string,
  ): Promise<number>

  // Comp quota
  countDistinctCompRequestDatesInMonth(
    actorId: string,
    tenantId: string,
    fromDate: string,
    toDate: string,
  ): Promise<{ requestDays: number; sourceDays: number }>

  // Duplicate checks
  findDuplicateForget(
    actorId: string,
    tenantId: string,
    requestDate: string,
  ): Promise<TimeRequest | null>
  findDuplicateComp(
    actorId: string,
    tenantId: string,
    requestDate: string,
  ): Promise<TimeRequest | null>

  // Writes
  insertForget(data: Omit<ForgetRequest, 'id' | 'createdAt' | 'updatedAt'>): Promise<ForgetRequest>
  insertComp(
    data: Omit<CompensationRequest, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<CompensationRequest>
  update(
    id: string,
    tenantId: string,
    data: Partial<
      Pick<
        TimeRequest,
        'status' | 'approvedBy' | 'confirmedBy' | 'managerComment' | 'adminComment' | 'comment'
      > &
        Pick<ForgetRequest, 'requestDate' | 'checkInTime' | 'checkOutTime' | 'errorCount'>
    >,
  ): Promise<TimeRequest>
  updateComp(
    id: string,
    tenantId: string,
    data: Partial<
      Pick<
        CompensationRequest,
        | 'status'
        | 'approvedBy'
        | 'confirmedBy'
        | 'managerComment'
        | 'adminComment'
        | 'requestDate'
        | 'compensationDate'
      >
    >,
  ): Promise<CompensationRequest>
  bulkUpdate(
    ids: string[],
    tenantId: string,
    data: Partial<
      Pick<TimeRequest, 'status' | 'approvedBy' | 'confirmedBy' | 'managerComment' | 'adminComment'>
    >,
  ): Promise<void>
  delete(id: string, actorId: string, tenantId: string): Promise<TimeRequest | null> // returns deleted row or null if not found/not owned
}
```

---

## Exceptions

```typescript
// domain/exceptions/time-request.exceptions.ts

export class ForgetQuotaExceededException extends Error {
  constructor(remaining: number) {
    super(`Forget request quota exceeded. Remaining this month: ${remaining}`)
    this.name = 'ForgetQuotaExceededException'
  }
}

export class CompQuotaExceededException extends Error {
  constructor(type: 'request-days' | 'source-days', max: number) {
    super(`Compensation quota exceeded: max ${max} ${type} per month`)
    this.name = 'CompQuotaExceededException'
  }
}

export class DuplicateRequestException extends Error {
  constructor(type: string) {
    super(`A ${type} request already exists for this date`)
    this.name = 'DuplicateRequestException'
  }
}

export class RequestNotFoundException extends Error {
  constructor(id: string) {
    super(`Request not found: ${id}`)
    this.name = 'RequestNotFoundException'
  }
}

export class RequestNotDeletableException extends Error {
  constructor() {
    super('Only requests with status "new" can be deleted')
    this.name = 'RequestNotDeletableException'
  }
}

export class InsufficientOvertimeException extends Error {
  constructor() {
    super('Insufficient overtime on compensation date to cover the late time on request date')
    this.name = 'InsufficientOvertimeException'
  }
}

export class TimesheetNotFoundException extends Error {
  constructor(date: string) {
    super(`Timesheet not found for date: ${date}`)
    this.name = 'TimesheetNotFoundException'
  }
}
```

---

## Drizzle Repository Implementation Shell

Create `infrastructure/repositories/drizzle-time-request.repository.ts` — implement `ITimeRequestRepository` using `db` (Drizzle instance injected via NestJS). Use `timeRequest` table from `time.schema.ts`.

For the `list` method — join to `people` data is **not allowed** (cross-schema FK). The tRPC layer (or a query handler) resolves user display names via `PeopleQueryFacade` if needed.

---

## Constants

Define in `infrastructure/constants/request-type.constants.ts`:

```typescript
export const FORGET_REQUEST_TYPE = 'forget' as const
export const COMPENSATION_REQUEST_TYPE = 'compensation' as const
export const MAX_FORGET_REQUESTS_PER_MONTH = 3
export const MAX_COMP_REQUEST_DAYS_PER_MONTH = 6
export const MAX_COMP_SOURCE_DAYS_PER_MONTH = 3
```

---

## Acceptance Criteria

- [ ] `time.time_request` table defined in `time.schema.ts` with all required columns, `id` as uuid v7, `tenant_id` notNull
- [ ] `ForgetRequest`, `CompensationRequest`, `TimeRequest` entity interfaces defined, no NestJS/Drizzle imports
- [ ] `ITimeRequestRepository` interface defined with all methods listed above
- [ ] `TIME_REQUEST_REPOSITORY` symbol exported
- [ ] All domain exceptions defined and typed
- [ ] `drizzle-time-request.repository.ts` stub created (methods can throw `new Error('not implemented')` — full implementation comes in tasks 002–004)
- [ ] Constants file created with quota values
- [ ] No `.js` extensions in relative imports
- [ ] No FK constraints to other schemas in Drizzle table definition
