# Task 002: Forget Request Commands

**Module:** time / requests
**Sequence:** 002
**Depends on:** Task 001 (schema + entities + repository interface)
**Estimated size:** Medium

---

## Scope

Implement the three command handlers for forget requests:

1. `SubmitForgetRequestHandler` — create a new forget request with quota + duplicate checks
2. `UpdateForgetRequestHandler` — manager confirm or HRM approve/reject
3. `DeleteRequestHandler` — staff deletes own request (status='new' only); shared with compensation (delegates to repository)

Each handler gets a co-located `.spec.ts` unit test.

---

## Business Context

A forget request corrects a missed check-in and/or check-out. The user provides:

- `requestDate` — the day they forgot to check in/out
- `checkInTime` (optional) — the correct check-in time
- `checkOutTime` (optional) — the correct check-out time
- `errorCount` — whether this counts toward the monthly quota (true for actual errors)

**BR-02:** Max 3 forget requests with `errorCount = true` per user per month (status != rejected).

Workflow: staff submits → manager sets `approvedBy` (status stays 'new', but staff sees "confirmed") → HRM sets `status = approved|rejected`.

---

## Source Reference

- `postForgetRequestService` in `request.service.js` (lines 419–446)
- `PUT /forget-request/:id` in `request.js` (lines 218–295)
- `DELETE /request/:id` in `request.js` (lines 605–639)
- `findDuplicateForgetRequestQuery`, `countForgetRequestQuery`, `postForgetRequestQuery` in `request.query.js`

**Bug to fix:** Legacy `countForgetRequest` runs two queries and sums them — this double-counts requests that have both `start_date_time` and `end_date_time`. The correct count is a single query: `count(*) where error_count = true AND status != 'rejected' AND request_date between fromDate and toDate`.

---

## Target Location

```
apps/api/src/modules/time/application/commands/
  submit-forget-request.command.ts
  submit-forget-request.handler.ts
  submit-forget-request.handler.spec.ts
  update-forget-request.command.ts
  update-forget-request.handler.ts
  update-forget-request.handler.spec.ts
  delete-request.command.ts
  delete-request.handler.ts
  delete-request.handler.spec.ts
```

---

## Command Definitions

### SubmitForgetRequestCommand

```typescript
export class SubmitForgetRequestCommand {
  constructor(
    readonly tenantId: string,
    readonly actorId: string,
    readonly requestDate: string, // ISO date YYYY-MM-DD
    readonly checkInTime: Date | null,
    readonly checkOutTime: Date | null,
    readonly errorCount: boolean,
    readonly comment: string | null,
    readonly monthFromDate: string, // first day of requestDate's month
    readonly monthToDate: string, // last day of requestDate's month
  ) {}
}
```

### UpdateForgetRequestCommand

```typescript
export class UpdateForgetRequestCommand {
  constructor(
    readonly tenantId: string,
    readonly actorId: string, // the actor performing the update (manager or HRM)
    readonly requestId: string,
    readonly status?: 'confirmed' | 'approved' | 'rejected',
    readonly approvedBy?: string, // set when manager confirms
    readonly confirmedBy?: string, // set when HRM approves/rejects
    readonly managerComment?: string,
    readonly adminComment?: string,
    readonly comment?: string,
    readonly requestDate?: string,
    readonly checkInTime?: Date | null,
    readonly checkOutTime?: Date | null,
    readonly errorCount?: boolean,
  ) {}
}
```

### DeleteRequestCommand

```typescript
export class DeleteRequestCommand {
  constructor(
    readonly tenantId: string,
    readonly actorId: string,
    readonly requestId: string,
  ) {}
}
```

---

## Handler Logic

### SubmitForgetRequestHandler

```
1. Validate: at least one of checkInTime or checkOutTime must be provided
2. Quota check (BR-02):
   - repo.countForgetRequestsInMonth(actorId, tenantId, monthFromDate, monthToDate)
   - if errorCount = true AND count >= MAX_FORGET_REQUESTS_PER_MONTH → throw ForgetQuotaExceededException
3. Duplicate check:
   - repo.findDuplicateForget(actorId, tenantId, requestDate)
   - if found → throw DuplicateRequestException('forget')
4. Insert:
   - repo.insertForget({ tenantId, actorId, requestType: 'forget', status: 'new', requestDate,
       checkInTime, checkOutTime, errorCount, comment })
5. Return: { id: forgetRequest.id }
```

### UpdateForgetRequestHandler

```
1. Load request: repo.findById(requestId, tenantId)
   - if null → throw RequestNotFoundException
2. At least one update field must be provided — throw if all undefined
3. Build partial update object from non-undefined fields
4. repo.update(requestId, tenantId, updateData)
5. Return: updated request
```

Note: This handler does not enforce role checks — that is done at the tRPC layer via permission guards.

### DeleteRequestHandler

```
1. repo.delete(requestId, actorId, tenantId)
   - repository must filter by `status = 'new' AND actor_id = actorId`
   - if null returned → request not found OR not owned by actorId OR not in 'new' status
     → throw RequestNotFoundException or RequestNotDeletableException (infer from a prior findById)
2. If deleted request was a compensation request (requestType = 'compensation'):
   - Clear timesheet.comp for requestDate (see Task 003 for this cross-concern)
   - The delete handler receives the deleted row back and checks requestType
   - For forget type: nothing extra to do
3. Return: void
```

**Important:** The delete handler should do a `findById` first to distinguish "not found" from "not deletable" for better error messages.

---

## Unit Tests (co-located .spec.ts)

### submit-forget-request.handler.spec.ts

Test cases:

- [ ] Happy path: inserts forget request, returns id
- [ ] Quota exceeded (errorCount=true, count already=3): throws ForgetQuotaExceededException
- [ ] Quota not exceeded when errorCount=false: proceeds to insert
- [ ] Duplicate found: throws DuplicateRequestException
- [ ] Neither checkInTime nor checkOutTime provided: throws validation error

Mock strategy: create a mock `ITimeRequestRepository` with jest.fn() stubs.

### update-forget-request.handler.spec.ts

Test cases:

- [ ] Happy path: manager confirms (sets approvedBy)
- [ ] Happy path: HRM approves (sets status=approved, confirmedBy)
- [ ] Happy path: HRM rejects (sets status=rejected, confirmedBy)
- [ ] Request not found: throws RequestNotFoundException
- [ ] Empty update (no fields): throws error

### delete-request.handler.spec.ts

Test cases:

- [ ] Happy path: deletes own request with status='new', forget type, no comp cleanup
- [ ] Request not found: throws RequestNotFoundException
- [ ] Request not in 'new' status: throws RequestNotDeletableException
- [ ] Request owned by different actor: throws RequestNotFoundException (repo returns null)

---

## Acceptance Criteria

- [ ] All 3 command classes defined with correct constructor signatures
- [ ] All 3 handlers implement `ICommandHandler<TCommand, TResult>`
- [ ] `@CommandHandler(SubmitForgetRequestCommand)` decorator on each handler
- [ ] Handlers inject `ITimeRequestRepository` via `@Inject(TIME_REQUEST_REPOSITORY)`
- [ ] `SubmitForgetRequestHandler`: BR-02 quota check fires only when `errorCount = true`
- [ ] `SubmitForgetRequestHandler`: duplicate check uses `status != rejected` semantics
- [ ] `DeleteRequestHandler`: after delete, checks `requestType` of returned row to determine if comp cleanup needed (logs a domain event or calls repo — see Task 003)
- [ ] No `.js` extensions in imports
- [ ] All test cases listed above pass
- [ ] Tests co-located (no `__tests__/` directory)
- [ ] No email or push notification calls anywhere in handlers
