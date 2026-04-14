# Task 005: Bulk Update Command + tRPC Router

**Module:** time / requests
**Sequence:** 005
**Depends on:** Tasks 001–004 (all handlers and entities must exist)
**Estimated size:** Medium

---

## Scope

1. `BulkUpdateRequestsHandler` — manager/HRM bulk approve or confirm multiple requests
2. Wire all commands and queries into the `time.router.ts` tRPC procedures
3. Register all handlers and repositories in `time.module.ts`
4. Implement the Drizzle repository (`drizzle-time-request.repository.ts`) fully
5. Implement the Drizzle timesheet comp repository (`drizzle-timesheet-comp.repository.ts`) fully

This is the integration task — it makes everything actually runnable.

---

## Business Context

Bulk update allows managers and HRM to approve or confirm multiple requests in one action. This is a critical operational workflow — reviewing 20 forget requests one by one would be painful. The legacy implementation does a raw SQL `UPDATE ... WHERE id IN (...)`.

In the target: each request in the bulk update is an individual row update — no partial success. If any fails, the entire batch rolls back.

---

## Source Reference

- `updateMultipleRequest` in `request.service.js` (lines 733–811)
- `PUT /requests/multiple` in `request.js` (lines 1029–1042) — note: guarded by `['admin', 'manager']` = hrm/manager in Future

---

## BulkUpdateRequestsCommand

```typescript
export class BulkUpdateRequestsCommand {
  constructor(
    readonly tenantId: string,
    readonly actorId: string,
    readonly requestIds: string[],
    readonly status?: 'confirmed' | 'approved' | 'rejected',
    readonly approvedBy?: string, // manager confirming
    readonly confirmedBy?: string, // HRM approving/rejecting
    readonly managerComment?: string,
    readonly adminComment?: string,
  ) {}
}
```

### BulkUpdateRequestsHandler Logic

```
1. Validate: at least one of status/approvedBy/confirmedBy/managerComment/adminComment must be present
2. Validate: requestIds must be non-empty
3. repo.bulkUpdate(requestIds, tenantId, { status, approvedBy, confirmedBy, managerComment, adminComment })
4. Return: { updatedCount: requestIds.length }
```

Note: The bulk update handler does NOT recalculate `timesheet.comp` on status change — `comp` is only written on request creation/date-update/delete, not on approval status change. This matches legacy behavior.

---

## tRPC Router Procedures

Extend `apps/api/src/modules/time/interface/trpc/time.router.ts`:

### Input Schemas (Zod)

```typescript
const requestTypeEnum = z.enum(['forget', 'compensation'])
const requestStatusEnum = z.enum(['new', 'confirmed', 'approved', 'rejected'])

const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
})

const dateRangeSchema = z.object({
  fromDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  toDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
})
```

### Procedures

| Procedure name                | Type     | Permission                         | Handler                          |
| ----------------------------- | -------- | ---------------------------------- | -------------------------------- |
| `requests.submitForget`       | mutation | `time:request:create`              | SubmitForgetRequestHandler       |
| `requests.submitCompensation` | mutation | `time:request:create`              | SubmitCompensationRequestHandler |
| `requests.listMine`           | query    | `time:request:self:read`           | ListMyRequestsHandler            |
| `requests.listTeam`           | query    | `time:request:team:read` (manager) | ListTeamRequestsHandler          |
| `requests.listAll`            | query    | `time:request:all:read` (hrm)      | ListAllRequestsHandler           |
| `requests.getOne`             | query    | `time:request:self:read`           | GetRequestHandler                |
| `requests.updateForget`       | mutation | `time:request:review`              | UpdateForgetRequestHandler       |
| `requests.updateCompensation` | mutation | `time:request:review`              | UpdateCompensationRequestHandler |
| `requests.bulkUpdate`         | mutation | `time:request:review`              | BulkUpdateRequestsHandler        |
| `requests.delete`             | mutation | `time:request:delete`              | DeleteRequestHandler             |
| `requests.getForgetQuota`     | query    | `time:request:self:read`           | GetForgetQuotaHandler            |
| `requests.getCompQuota`       | query    | `time:request:self:read`           | GetCompQuotaHandler              |
| `requests.getPendingCount`    | query    | `time:request:team:read` (manager) | GetPendingRequestCountHandler    |

### Input Definitions

```typescript
// requests.submitForget
z.object({
  requestDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkInTime: z.string().datetime().nullable().optional(),
  checkOutTime: z.string().datetime().nullable().optional(),
  errorCount: z.boolean().default(true),
  comment: z.string().max(500).nullable().optional(),
}).refine((d) => d.checkInTime != null || d.checkOutTime != null, {
  message: 'At least one of checkInTime or checkOutTime is required',
})

// requests.submitCompensation
z.object({
  requestDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  compensationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  errorCount: z.boolean().default(true),
  comment: z.string().max(500).nullable().optional(),
})

// requests.listMine / listTeam
paginationSchema.merge(dateRangeSchema).extend({
  requestTypes: z.array(requestTypeEnum).optional(),
  status: requestStatusEnum.optional(),
})

// requests.listAll (HRM)
paginationSchema.merge(dateRangeSchema).extend({
  requestTypes: z.array(requestTypeEnum).optional(),
  status: requestStatusEnum.optional(),
  managerActorId: z.string().uuid().optional(),
})

// requests.getOne
z.object({ requestId: z.string().uuid() })

// requests.updateForget
z.object({
  requestId: z.string().uuid(),
  status: z.enum(['confirmed', 'approved', 'rejected']).optional(),
  approvedBy: z.string().uuid().optional(),
  confirmedBy: z.string().uuid().optional(),
  managerComment: z.string().max(500).optional(),
  adminComment: z.string().max(500).optional(),
  comment: z.string().max(500).optional(),
  requestDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  checkInTime: z.string().datetime().nullable().optional(),
  checkOutTime: z.string().datetime().nullable().optional(),
  errorCount: z.boolean().optional(),
})

// requests.updateCompensation
z.object({
  requestId: z.string().uuid(),
  status: z.enum(['confirmed', 'approved', 'rejected']).optional(),
  approvedBy: z.string().uuid().optional(),
  confirmedBy: z.string().uuid().optional(),
  managerComment: z.string().max(500).optional(),
  adminComment: z.string().max(500).optional(),
  requestDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  compensationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
})

// requests.bulkUpdate
z.object({
  requestIds: z.array(z.string().uuid()).min(1).max(100),
  status: z.enum(['confirmed', 'approved', 'rejected']).optional(),
  approvedBy: z.string().uuid().optional(),
  confirmedBy: z.string().uuid().optional(),
  managerComment: z.string().max(500).optional(),
  adminComment: z.string().max(500).optional(),
})

// requests.delete
z.object({ requestId: z.string().uuid() })

// requests.getForgetQuota / getCompQuota
z.object({
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

// requests.getPendingCount — no input (uses ctx.actorId)
```

---

## Drizzle Repository Implementation

### drizzle-time-request.repository.ts

Implement `ITimeRequestRepository` in full:

- `findById`: `db.select().from(timeRequest).where(and(eq(id), eq(tenantId))).limit(1)`
- `list`: dynamic WHERE with optional filters, `count(*)` for total, `limit/offset` for pagination
  - Date filter: matches on `requestDate BETWEEN fromDate AND toDate`
  - Team filter: `actorId IN (actorIds array)` — actorIds resolved by handler via PeopleQueryFacade
- `countForgetRequestsInMonth`: count where `requestType='forget' AND errorCount=true AND status!='rejected' AND requestDate BETWEEN from AND to AND actorId=x AND tenantId=y`
- `countDistinctCompRequestDatesInMonth`: two sub-selects:
  - `COUNT(DISTINCT request_date)` where `requestType='compensation' AND status!='rejected' AND compensationDate BETWEEN from AND to`
  - `COUNT(DISTINCT compensation_date)` same filter
- `findDuplicateForget`: `requestType='forget' AND actorId=x AND requestDate=date AND status!='rejected' AND tenantId=y`
- `findDuplicateComp`: `requestType='compensation' AND actorId=x AND requestDate=date AND status!='rejected' AND tenantId=y`
- `insertForget` / `insertComp`: standard Drizzle `db.insert(timeRequest).values(...).returning()`
- `update` / `updateComp`: `db.update(timeRequest).set({...fields, updatedAt: new Date()}).where(and(id, tenantId)).returning()`
- `bulkUpdate`: `db.update(timeRequest).set({...}).where(and(inArray(timeRequest.id, ids), eq(timeRequest.tenantId, tenantId)))`
- `delete`: `db.delete(timeRequest).where(and(eq(id), eq(actorId), eq(tenantId), eq(status,'new'))).returning()`
- `countNewForManager`: subquery — actorIds of direct reports, then count `status='new'`

### drizzle-timesheet-comp.repository.ts

Implement `ITimesheetCompRepository`:

- `getCompValidationData`:
  ```sql
  SELECT
    (SELECT over_time FROM time.time_sheet WHERE actor_id=x AND tenant_id=y AND date=compensationDate) as over_time,
    (SELECT lack FROM time.time_sheet WHERE actor_id=x AND tenant_id=y AND date=requestDate) as lack,
    COALESCE(SUM(ts.comp), '00:00:00') as current_comp
  FROM time.time_sheet ts
  INNER JOIN time.time_request r ON r.request_date::date = ts.date::date
    AND r.actor_id = ts.actor_id
    AND r.request_type = 'compensation'
  WHERE r.compensation_date::date = compensationDate
    AND ts.actor_id = actorId
    AND ts.tenant_id = tenantId
  ```
- `writeComp`: `UPDATE time.time_sheet SET comp = $comp WHERE date = $requestDate AND actor_id = $actorId AND tenant_id = $tenantId`
- `clearComp`: `UPDATE time.time_sheet SET comp = NULL WHERE date = $requestDate AND actor_id = $actorId AND tenant_id = $tenantId`

---

## time.module.ts — Register Everything

Update `apps/api/src/modules/time/time.module.ts` to register:

```typescript
providers: [
  TimeQueryFacade,
  // Repositories
  { provide: TIME_REQUEST_REPOSITORY, useClass: DrizzleTimeRequestRepository },
  { provide: TIMESHEET_COMP_REPOSITORY, useClass: DrizzleTimesheetCompRepository },
  // Command handlers
  SubmitForgetRequestHandler,
  SubmitCompensationRequestHandler,
  UpdateForgetRequestHandler,
  UpdateCompensationRequestHandler,
  BulkUpdateRequestsHandler,
  DeleteRequestHandler,
  // Query handlers
  ListMyRequestsHandler,
  ListTeamRequestsHandler,
  ListAllRequestsHandler,
  GetRequestHandler,
  GetForgetQuotaHandler,
  GetCompQuotaHandler,
  GetPendingRequestCountHandler,
],
imports: [CqrsModule],
exports: [TimeQueryFacade],
```

---

## Unit Tests

### bulk-update-requests.handler.spec.ts

- [ ] Happy path: calls repo.bulkUpdate with correct ids and fields
- [ ] Empty ids: throws validation error (Zod handles this at tRPC layer, but handler should also guard)
- [ ] No update fields provided: throws error
- [ ] Returns updated count

### time.router.ts (integration-style, using tRPC `createCaller`)

These are lightweight wiring tests — not full integration tests:

- [ ] `requests.listMine` calls `ListMyRequestsHandler` with ctx.actorId
- [ ] `requests.submitForget` dispatches `SubmitForgetRequestCommand`
- [ ] `requests.bulkUpdate` dispatches `BulkUpdateRequestsCommand`
- [ ] `requests.getPendingCount` dispatches `GetPendingRequestCountQuery`

---

## Acceptance Criteria

- [ ] All 13 tRPC procedures defined in `time.router.ts` for the `requests` namespace
- [ ] Each procedure has a Zod input schema
- [ ] `requests.submitForget` validates that at least one of checkInTime/checkOutTime is provided
- [ ] `requests.listAll` is accessible only with `time:request:all:read` permission
- [ ] `requests.bulkUpdate` is accessible with `time:request:review` permission
- [ ] `DrizzleTimeRequestRepository` implements all `ITimeRequestRepository` methods in full
- [ ] `DrizzleTimesheetCompRepository` implements all `ITimesheetCompRepository` methods in full
- [ ] `time.module.ts` registers all handlers and repository providers
- [ ] `CqrsModule` imported in `time.module.ts`
- [ ] All bulk update test cases pass
- [ ] No `.js` extensions in imports
- [ ] No `line_manager_id` anywhere in any Drizzle query
