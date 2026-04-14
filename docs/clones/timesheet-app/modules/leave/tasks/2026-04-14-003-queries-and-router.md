---
module: leave
task: queries-and-router
created: 2026-04-14
updated: 2026-04-14
status: pending
depends-on:
  - 2026-04-14-001-schema-and-domain
  - 2026-04-14-002-commands
---

# Task: queries-and-router

## Scope

Implement all read-side query handlers, the `LeaveQueryFacade` (for cross-module reads), and the tRPC router contribution for the leave module. Covers:

**Query handlers:**

1. `GetMyLeaveRequestsQuery` — staff views their own requests (paginated, filterable)
2. `GetTeamLeaveRequestsQuery` — manager views direct reports' requests
3. `GetAllLeaveRequestsQuery` — HRM views all requests (company-wide)
4. `GetLeaveQuotaQuery` — any role checks remaining hours for a given leave type
5. `GetLeaveReasonsQuery` — list reasons (filterable by leave_type)
6. `GetLeaveBalancesQuery` — HRM views all users' balances (paginated, filterable)
7. `GetMyLeaveBalanceQuery` — staff views their own balance for a year

**tRPC router:** `apps/api/src/modules/time/interface/trpc/time.router.ts`

- All 7 query procedures + all 10 mutation procedures from Task 002
- Role guards using `KernelDecisionFacade`

**Facade:** `LeaveQueryFacade` — exported from `TimeModule` for any future cross-module consumer

## Business Context

Read paths are where role enforcement is most critical — legacy had NO guards on leave balance endpoints. In Future every procedure must check the caller's role before returning data.

Role matrix for leave procedures:
| Procedure | staff | manager | hrm |
|---|---|---|---|
| `leave.submitRequest` | ✓ | ✓ | ✓ |
| `leave.cancelRequest` | own only | own only | ✓ |
| `leave.confirmRequest` | ✗ | ✓ (direct reports) | ✗ |
| `leave.approveRequest` | ✗ | ✗ | ✓ |
| `leave.rejectRequest` | ✗ | ✗ | ✓ |
| `leave.myRequests` | ✓ | ✓ | ✓ |
| `leave.teamRequests` | ✗ | ✓ | ✓ |
| `leave.allRequests` | ✗ | ✗ | ✓ |
| `leave.myQuota` | ✓ | ✓ | ✓ |
| `leave.reasons` | ✓ | ✓ | ✓ |
| `leave.createReason` | ✗ | ✗ | ✓ |
| `leave.updateReason` | ✗ | ✗ | ✓ |
| `leave.deleteReason` | ✗ | ✗ | ✓ |
| `leave.allBalances` | ✗ | ✗ | ✓ |
| `leave.myBalance` | ✓ | ✓ | ✓ |
| `leave.updateBalance` | ✗ | ✗ | ✓ |
| `leave.recalculate` | ✗ | ✗ | ✓ |

## Source Reference

- **Files:**
  - `server/services/request.service.js` — `getMyRequestService`, `getRequestForManagerService`, `getRequestsForAdmin`
  - `server/services/userLeave.service.js` — `getAllUserLeave`
  - `server/query/request.query.js` — `getMyRequestQuery`, `countMyRequestQuery`, `getRequestsQuery`, `countRequestsQuery`, `getRequestForAdminQuery`, `countRequestForAdminQuery`
  - `server/query/userLeave.query.js` — `getAllUserLeaveQuery`, `countAllUserLeaveQuery`, `getUserLeaveByUserIdAndYear`
  - `server/routes/request.js` — route definitions (for understanding what params each endpoint accepted)

- **Key source logic:**
  - **My requests filter params:** `requestTypeIds[]`, `fromDate`, `toDate`, `reasonId`, `status`, `limit`, `page`
  - **Manager requests:** same params + `badgeNumber` (for searching by employee); filters to `u.manager_id = userId`; legacy had `managerOnly` flag (drop it — in Future manager always sees direct reports only)
  - **Admin requests:** same params + `badgeNumber`, `name`, `managerId` (search by manager)
  - **Leave quota (`getLeaveQuotaQuery`):** fetch `user_leave` row for current year → return `totalRemain` (annual) or `carryOverRemain` (carry-over); legacy scattered this across service calls — centralize as a dedicated query
  - **Leave balances filter:** `name`, `badgeNumber`, `year`, `title` (maps to job title in Future)

  **Important source bug to fix:** `getRequestForManagerService` uses `line_manager_id` in the `managerOnly=false` branch — **drop this**; manager sees `u.manager_id = actorId` only.

## Target Location

- **Query handlers:** `apps/api/src/modules/time/application/queries/`
  - `get-my-leave-requests.query.ts` + `get-my-leave-requests.handler.ts` + `.handler.spec.ts`
  - `get-team-leave-requests.query.ts` + `get-team-leave-requests.handler.ts` + `.handler.spec.ts`
  - `get-all-leave-requests.query.ts` + `get-all-leave-requests.handler.ts` + `.handler.spec.ts`
  - `get-leave-quota.query.ts` + `get-leave-quota.handler.ts` + `.handler.spec.ts`
  - `get-leave-reasons.query.ts` + `get-leave-reasons.handler.ts` + `.handler.spec.ts`
  - `get-leave-balances.query.ts` + `get-leave-balances.handler.ts` + `.handler.spec.ts`
  - `get-my-leave-balance.query.ts` + `get-my-leave-balance.handler.ts` + `.handler.spec.ts`

- **Facade:** `apps/api/src/modules/time/application/facades/leave-query.facade.ts`

- **tRPC router:** `apps/api/src/modules/time/interface/trpc/time.router.ts` (replace TODO)

- **Conventions to follow:**
  - `@QueryHandler(XQuery)` decorator, implements `IQueryHandler<XQuery, ReturnType>`
  - Input validation via Zod in the tRPC layer (not in query handlers themselves)
  - tRPC procedures use `protectedProcedure` (authenticated) — no public procedures for leave
  - Role checks in tRPC procedures using `KernelDecisionFacade.can(ctx.actorId, 'leave:read:team', ctx.tenantId)` etc.
  - Pagination: `{ items: T[]; total: number; page: number; limit: number }`
  - Sort: always `created_at DESC` (matching legacy)

## Data Model

Read operations only. All queries on tables from Task 001:

- `time.leave_request` joined to `time.leave_reason` for reason name
- `time.leave_balance`
- User/people data (name, badge_number, job_title, manager_id) fetched from `PeopleQueryFacade` or via a denormalized join if PeopleQueryFacade exposes list methods

**Pattern for cross-module display data:**
The tRPC procedures may need to enrich leave request data with user names. Two options:

1. Query handlers return raw IDs; tRPC layer enriches via `PeopleQueryFacade` (preferred for small result sets)
2. Drizzle repositories do a cross-schema join if the `people` schema is accessible from the same DB (acceptable for performance, but note it's a schema boundary crossing — use only for read-only, document the exception)

Recommendation: use option 1 (enrichment in tRPC layer) to preserve strict module boundaries.

## Interface Contract

### Query types

```typescript
// Pagination shared type
interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  limit: number
}

// Leave request DTO (returned by queries)
interface LeaveRequestDto {
  id: string
  tenantId: string
  actorId: string
  actorName: string | null           // enriched from PeopleQueryFacade
  actorBadgeNumber: string | null   // enriched
  leaveType: 'annual' | 'carry_over'
  status: 'new' | 'confirmed' | 'approved' | 'rejected' | 'cancelled'
  reasonId: string
  reasonName: string | null          // joined from leave_reason
  startAt: Date
  endAt: Date
  offTimeHour: number
  comment: string | null
  approveBy: string | null           -- managerId who confirmed
  approveByName: string | null       -- enriched
  approvedBy: string | null          -- hrmId who approved/rejected
  approvedByName: string | null      -- enriched
  managerComment: string | null
  hrmComment: string | null
  createdAt: Date
  updatedAt: Date
}

// Leave balance DTO
interface LeaveBalanceDto {
  id: string
  actorId: string
  actorName: string | null
  actorBadgeNumber: string | null
  actorJobTitle: string | null
  year: number
  totalLeave: number
  totalRemain: number
  carryOver: number
  carryOverRemain: number
}
```

### tRPC procedures (Zod input schemas)

```typescript
// leave.myRequests
input: z.object({
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  leaveType: z.enum(['annual', 'carry_over']).optional(),
  reasonId: z.string().uuid().optional(),
  status: z.enum(['new', 'confirmed', 'approved', 'rejected', 'cancelled']).optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
})

// leave.teamRequests (manager)
input: z.object({
  badgeNumber: z.string().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  leaveType: z.enum(['annual', 'carry_over']).optional(),
  status: z.enum(['new', 'confirmed', 'approved', 'rejected', 'cancelled']).optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
})

// leave.allRequests (hrm)
input: z.object({
  badgeNumber: z.string().optional(),
  name: z.string().optional(),
  managerId: z.string().uuid().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  leaveType: z.enum(['annual', 'carry_over']).optional(),
  status: z.enum(['new', 'confirmed', 'approved', 'rejected', 'cancelled']).optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
})

// leave.myQuota
input: z.object({
  leaveType: z.enum(['annual', 'carry_over']),
  year: z.number().int().optional(), // defaults to current year
})
output: {
  totalAllocated: number
  remaining: number
}

// leave.reasons
input: z.object({
  leaveType: z.enum(['annual', 'carry_over']).optional(),
})

// leave.allBalances (hrm)
input: z.object({
  name: z.string().optional(),
  badgeNumber: z.string().optional(),
  jobTitle: z.string().optional(),
  year: z.number().int().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
})

// leave.myBalance
input: z.object({ year: z.number().int().optional() }) // defaults to current year

// leave.submitRequest
input: z.object({
  leaveType: z.enum(['annual', 'carry_over']),
  reasonId: z.string().uuid(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  comment: z.string().max(500).optional(),
})

// leave.confirmRequest (manager)
input: z.object({
  requestId: z.string().uuid(),
  managerComment: z.string().max(500).optional(),
})

// leave.approveRequest / leave.rejectRequest (hrm)
input: z.object({
  requestId: z.string().uuid(),
  hrmComment: z.string().max(500).optional(),
})

// leave.cancelRequest
input: z.object({ requestId: z.string().uuid() })

// leave.updateBalance (hrm)
input: z.object({
  targetActorId: z.string().uuid(),
  year: z.number().int(),
  totalLeave: z.number().min(0),
  totalRemain: z.number().min(0),
  carryOver: z.number().min(0),
  carryOverRemain: z.number().min(0),
})

// leave.recalculate (hrm)
input: z.object({
  year: z.number().int(),
  actorIds: z.array(z.string().uuid()).optional(),
  maxCarryOverHours: z.number().min(0).default(40),
})

// leave.createReason / leave.updateReason / leave.deleteReason (hrm)
// create:
input: z.object({
  name: z.string().min(1).max(100),
  leaveType: z.enum(['annual', 'carry_over']),
  maxRequestDay: z.number().int().min(1).optional(),
  description: z.string().max(500).optional(),
})
// update:
input: z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  maxRequestDay: z.number().int().min(1).optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
})
// delete:
input: z.object({ id: z.string().uuid() })
```

### `LeaveQueryFacade` (exported from TimeModule)

```typescript
@Injectable()
export class LeaveQueryFacade {
  // Used by other modules that need to know if a user is on approved leave
  async isOnApprovedLeave(actorId: string, tenantId: string, date: Date): Promise<boolean>
  async getLeaveBalance(
    actorId: string,
    tenantId: string,
    year: number,
  ): Promise<LeaveBalance | null>
}
```

## Edge Cases

- `leave.teamRequests`: manager can only see requests for users where `people.manager_id = ctx.actorId`. If a manager queries with a `badgeNumber` that belongs to someone outside their team, return empty (not 403 — avoids information leakage about other employees)
- `leave.myQuota`: if no `leave_balance` row for the requested year → return `{ totalAllocated: 0, remaining: 0 }` with a `hasBalance: false` flag (not an error)
- `leave.allRequests` filtering by `name`: use case-insensitive `ILIKE '%name%'` via Drizzle `ilike()`
- `leave.allBalances` filtering by `jobTitle`: needs join to people module. Since `jobTitle` is in the `people` schema, use `PeopleQueryFacade.listSummaries(filters)` to get matching `actorId`s first, then query `leave_balance` by those IDs. This avoids cross-schema joins.
- Pagination: `total` must reflect the count with filters applied, not total table rows

## Acceptance Criteria

- [ ] All 7 query handlers implemented with co-located specs
- [ ] `GetMyLeaveRequestsHandler` spec: returns only the calling actor's requests, pagination works, filters apply correctly
- [ ] `GetTeamLeaveRequestsHandler` spec: only returns direct reports (not other employees), empty result for out-of-team employee badge number
- [ ] `GetLeaveQuotaHandler` spec: returns correct remaining hours for annual and carry-over, returns `hasBalance: false` when no balance row exists
- [ ] `LeaveQueryFacade` implemented and added to `TimeModule` exports
- [ ] `time.router.ts` fully implemented: all 17 procedures wired (7 queries + 10 mutations from Task 002)
- [ ] Role guards applied to every procedure (no procedure is accessible without appropriate role)
- [ ] Zod input schemas cover all filter and input parameters
- [ ] Pagination response shape is consistent: `{ items, total, page, limit }`
- [ ] `line_manager_id` does not appear anywhere in the codebase
- [ ] No `.js` extensions in imports
- [ ] No direct imports from `people` or any other module's `domain/` or `infrastructure/`
- [ ] Coverage ≥ 70% on all query handler files
