# Task 004: Query Handlers + Quota Checks

**Module:** time / requests
**Sequence:** 004
**Depends on:** Task 001 (schema + entities + repository interface)
**Estimated size:** Medium

---

## Scope

Implement all read-side query handlers:

1. `ListMyRequestsHandler` — staff: paginated list of own requests, filtered by type/status/date
2. `ListTeamRequestsHandler` — manager: paginated list of requests from direct reports
3. `ListAllRequestsHandler` — HRM: paginated company-wide requests with search
4. `GetRequestHandler` — get single request by id
5. `GetForgetQuotaHandler` — remaining forget requests for current month (BR-02)
6. `GetCompQuotaHandler` — remaining comp request-days + source-days for current month (BR-03)
7. `GetPendingRequestCountHandler` — badge count for managers (count of status='new' requests from their team)

Each handler gets a co-located `.spec.ts` unit test.

---

## Business Context

- **Staff** can only see their own requests
- **Manager** sees requests from all staff where `manager_id = manager's actorId` (BR-11: single manager only)
- **HRM** sees all requests company-wide, can filter by employee name, badge number, manager
- Quota queries are used client-side to show remaining quota before submission — must be accurate

---

## Source Reference

- `getMyRequestService` in `request.service.js` (lines 52–116)
- `getRequestForManagerService` in `request.service.js` (lines 118–187)
- `getRequestsForAdmin` in `request.service.js` (lines 665–696)
- `GET /request/:id` in `request.js` (lines 189–215)
- `checkForgetRequestService` in `request.service.js` (lines 448–492)
- `GET /check-comp-request` in `request.js` (lines 848–914)
- `countNewRequestsForPM` in `request.service.js` (lines 494–502)
- Query functions: `getMyRequestQuery`, `countMyRequestQuery`, `getRequestsQuery`, `countRequestsQuery`, `countForgetRequestQuery`, `countNewRequestsForPM` in `request.query.js`

**Key differences from legacy:**

- Manager query uses only `manager_id` — no `line_manager_id` (BR-11)
- `managerOnly` flag kept as an optional filter: when true, show only direct reports; when false (default in future), same — since there's only one manager level now, the flag becomes a no-op but is kept for API compatibility
- User display name enrichment (name, badge_number) must come via `PeopleQueryFacade` — no JOIN to `user` table
- HRM `getRequestForAdmin` merged as `ListAllRequestsHandler` — same shape as manager list with different scope

---

## Target Location

```
apps/api/src/modules/time/application/queries/
  list-my-requests.query.ts + .handler.ts + .handler.spec.ts
  list-team-requests.query.ts + .handler.ts + .handler.spec.ts
  list-all-requests.query.ts + .handler.ts + .handler.spec.ts
  get-request.query.ts + .handler.ts + .handler.spec.ts
  get-forget-quota.query.ts + .handler.ts + .handler.spec.ts
  get-comp-quota.query.ts + .handler.ts + .handler.spec.ts
  get-pending-request-count.query.ts + .handler.ts + .handler.spec.ts
```

---

## Query Definitions

```typescript
// list-my-requests.query.ts
export class ListMyRequestsQuery {
  constructor(
    readonly tenantId: string,
    readonly actorId: string,
    readonly requestTypes?: ('forget' | 'compensation')[],
    readonly status?: 'new' | 'confirmed' | 'approved' | 'rejected',
    readonly fromDate?: string,
    readonly toDate?: string,
    readonly page: number = 1,
    readonly limit: number = 20,
  ) {}
}

// list-team-requests.query.ts
export class ListTeamRequestsQuery {
  constructor(
    readonly tenantId: string,
    readonly managerActorId: string,
    readonly requestTypes?: ('forget' | 'compensation')[],
    readonly status?: 'new' | 'confirmed' | 'approved' | 'rejected',
    readonly fromDate?: string,
    readonly toDate?: string,
    readonly page: number = 1,
    readonly limit: number = 20,
  ) {}
}

// list-all-requests.query.ts
export class ListAllRequestsQuery {
  constructor(
    readonly tenantId: string,
    readonly requestTypes?: ('forget' | 'compensation')[],
    readonly status?: 'new' | 'confirmed' | 'approved' | 'rejected',
    readonly fromDate?: string,
    readonly toDate?: string,
    readonly managerActorId?: string, // filter by team
    readonly page: number = 1,
    readonly limit: number = 20,
  ) {}
}

// get-request.query.ts
export class GetRequestQuery {
  constructor(
    readonly tenantId: string,
    readonly requestId: string,
  ) {}
}

// get-forget-quota.query.ts
export class GetForgetQuotaQuery {
  constructor(
    readonly tenantId: string,
    readonly actorId: string,
    readonly fromDate: string, // first day of month
    readonly toDate: string, // last day of month
  ) {}
}

// get-comp-quota.query.ts
export class GetCompQuotaQuery {
  constructor(
    readonly tenantId: string,
    readonly actorId: string,
    readonly fromDate: string,
    readonly toDate: string,
  ) {}
}

// get-pending-request-count.query.ts
export class GetPendingRequestCountQuery {
  constructor(
    readonly tenantId: string,
    readonly managerActorId: string,
  ) {}
}
```

---

## Handler Return Shapes

```typescript
// Paginated list result
interface RequestListResult {
  items: TimeRequest[]
  total: number
  page: number
  limit: number
}

// Single request
type GetRequestResult = TimeRequest | null

// Forget quota
interface ForgetQuotaResult {
  used: number
  remaining: number
  max: number // always 3 (MAX_FORGET_REQUESTS_PER_MONTH)
}

// Comp quota
interface CompQuotaResult {
  requestDaysUsed: number
  requestDaysRemaining: number
  requestDaysMax: number // 6
  sourceDaysUsed: number
  sourceDaysRemaining: number
  sourceDaysMax: number // 3
}

// Pending count
interface PendingRequestCountResult {
  count: number
}
```

---

## Handler Logic

### ListMyRequestsHandler

```
1. Compute offset = (page - 1) * limit
2. repo.list({ tenantId, actorId, requestTypes, status, fromDate, toDate, limit, offset })
3. Return: { items, total, page, limit }
```

### ListTeamRequestsHandler

```
1. Compute offset = (page - 1) * limit
2. repo.list({ tenantId, managerActorId, requestTypes, status, fromDate, toDate, limit, offset })
   Note: repository implementation filters by actorId IN (SELECT actor_id FROM ... WHERE manager_id = managerActorId)
   — this requires either a subquery in Drizzle or calling PeopleQueryFacade to get the list of subordinate actorIds first
3. Return: { items, total, page, limit }
```

**Cross-module strategy for team filter:** The requests repository cannot JOIN to `people.employment_profile`. Two options:

- Option A: `PeopleQueryFacade.listSubordinateActorIds(managerActorId, tenantId)` → get array of actorIds → filter `time_request.actor_id IN (...)`. This is the correct hexagonal approach.
- Use Option A. The query handler injects `PeopleQueryFacade` and resolves subordinate IDs before calling the repo.

### ListAllRequestsHandler

```
1. If managerActorId provided:
   - Get subordinate actorIds via PeopleQueryFacade (same as above)
   - Filter by those actorIds
2. repo.list({ tenantId, requestTypes, status, fromDate, toDate, actorIds (optional), limit, offset })
3. Return: { items, total, page, limit }
```

### GetRequestHandler

```
1. repo.findById(requestId, tenantId)
2. if null → throw RequestNotFoundException
3. Return: timeRequest
```

### GetForgetQuotaHandler

```
1. used = repo.countForgetRequestsInMonth(actorId, tenantId, fromDate, toDate)
2. remaining = max(MAX_FORGET_REQUESTS_PER_MONTH - used, 0)
3. Return: { used, remaining, max: MAX_FORGET_REQUESTS_PER_MONTH }
```

### GetCompQuotaHandler

```
1. { requestDays, sourceDays } = repo.countDistinctCompRequestDatesInMonth(actorId, tenantId, fromDate, toDate)
2. Return: {
     requestDaysUsed: requestDays,
     requestDaysRemaining: max(MAX_COMP_REQUEST_DAYS_PER_MONTH - requestDays, 0),
     requestDaysMax: MAX_COMP_REQUEST_DAYS_PER_MONTH,
     sourceDaysUsed: sourceDays,
     sourceDaysRemaining: max(MAX_COMP_SOURCE_DAYS_PER_MONTH - sourceDays, 0),
     sourceDaysMax: MAX_COMP_SOURCE_DAYS_PER_MONTH,
   }
```

### GetPendingRequestCountHandler

```
1. count = repo.countNewForManager(managerActorId, tenantId)
2. Return: { count }
```

---

## Repository Method Additions (ITimeRequestRepository)

Add to the interface from Task 001:

```typescript
// For list-all-requests when filtering by a set of actorIds
listByActorIds(
  actorIds: string[],
  filter: Omit<ListRequestsFilter, 'actorId' | 'managerActorId'>,
): Promise<{ items: TimeRequest[]; total: number }>
```

---

## Unit Tests

### list-my-requests.handler.spec.ts

- [ ] Returns paginated result from repo
- [ ] Empty result: returns { items: [], total: 0 }
- [ ] Passes all filter params through to repo

### list-team-requests.handler.spec.ts

- [ ] Calls PeopleQueryFacade to resolve subordinate IDs
- [ ] Filters repo by resolved actorIds
- [ ] Empty team: returns empty result

### list-all-requests.handler.spec.ts

- [ ] No manager filter: lists all tenant requests
- [ ] Manager filter: calls PeopleQueryFacade, filters by subordinate IDs

### get-request.handler.spec.ts

- [ ] Found: returns request
- [ ] Not found: throws RequestNotFoundException

### get-forget-quota.handler.spec.ts

- [ ] 0 used: remaining = 3
- [ ] 2 used: remaining = 1
- [ ] 3 used: remaining = 0 (clamped, not negative)

### get-comp-quota.handler.spec.ts

- [ ] Returns correct used/remaining for both request-days and source-days
- [ ] Clamps to 0 when quota exceeded

### get-pending-request-count.handler.spec.ts

- [ ] Returns count from repo
- [ ] Returns 0 when no pending

---

## Acceptance Criteria

- [ ] All 7 query handlers implement `IQueryHandler<TQuery, TResult>`
- [ ] `@QueryHandler(...)` decorator on each
- [ ] `ListTeamRequestsHandler` and `ListAllRequestsHandler` inject `PeopleQueryFacade` for subordinate resolution
- [ ] No direct JOIN to `people.*` tables or imports from `people/domain` or `people/infrastructure`
- [ ] `GetForgetQuotaHandler` and `GetCompQuotaHandler` return `remaining` clamped to ≥ 0
- [ ] All test cases listed pass
- [ ] No `.js` extensions in imports
- [ ] Tests co-located (no `__tests__/` directory)
