# Task: work-time — Query Handler & tRPC Router

**Module:** work-time  
**Sequence:** 003  
**Depends on:** task 001 (schema-entity-calculator), task 002 (commands) — repository must be registered in NestJS module  
**Required by:** nothing (this is the API surface)

---

## Scope

1. `GetWorkTimeHandler` query — list all work-time rows for a user
2. tRPC procedures for all four work-time operations (get, create, update, delete) wired into `time.router.ts`
3. Input validation schemas (Zod)
4. Role enforcement inline in tRPC procedures
5. Unit test for `GetWorkTimeHandler`

---

## Business Context

The get query is the only read operation. All roles (staff, manager, hrm) can view their own work-time schedule. HRM can view any user's schedule. The tRPC router is the integration point that enforces role-based access before dispatching to handlers.

**Legacy bug fixed:** the GET route had no `roleAndPermission` middleware — any authenticated user could query any `userId`. The new tRPC procedure enforces: actor may only query `userId === actorId` unless they have the `hrm` role.

---

## Source Reference

- `server/services/admin.service.js` — `getWorkTimeService`
- `server/query/admin.query.js` — `getWorkTimeQuery`
- `server/routes/admin.js` — `router.get(apiRoute.workTime, ...)`
- `server/validations/validation.js` — `getWorkTimeValidation`

---

## Target Location

```
apps/api/src/modules/time/
  application/queries/get-work-time/
    get-work-time.query.ts                ← CREATE
    get-work-time.handler.ts              ← CREATE
    get-work-time.handler.spec.ts         ← CREATE
  interface/trpc/time.router.ts           ← UPDATE (add workTime procedures)
  time.module.ts                          ← UPDATE (register GetWorkTimeHandler)
```

---

## GetWorkTimeQuery

```typescript
// application/queries/get-work-time/get-work-time.query.ts
export interface GetWorkTimeQuery {
  readonly tenantId: string
  readonly actorId: string // who is asking
  readonly actorRole: 'staff' | 'manager' | 'hrm'
  readonly userId: string // whose work-time to fetch
}
```

## GetWorkTimeHandler

```typescript
// application/queries/get-work-time/get-work-time.handler.ts
import { Injectable, ForbiddenException } from '@nestjs/common'
import { Inject } from '@nestjs/common'
import {
  WORK_TIME_REPOSITORY,
  IWorkTimeRepository,
} from '../../domain/repositories/work-time.repository'
import type { GetWorkTimeQuery } from './get-work-time.query'
import type { WorkTime } from '../../domain/entities/work-time.entity'

@Injectable()
export class GetWorkTimeHandler {
  constructor(
    @Inject(WORK_TIME_REPOSITORY)
    private readonly repo: IWorkTimeRepository,
  ) {}

  async execute(query: GetWorkTimeQuery): Promise<WorkTime[]> {
    const { tenantId, actorId, actorRole, userId } = query

    // Role enforcement: staff/manager can only view own work time
    if (actorRole !== 'hrm' && actorId !== userId) {
      throw new ForbiddenException('You may only view your own work time schedule')
    }

    return this.repo.findByUserId(userId, tenantId)
  }
}
```

---

## tRPC Procedures

Add to `interface/trpc/time.router.ts`. Follow the existing patterns in the file.

All procedures live under the `workTime` namespace:

```typescript
workTime: {
  list: protectedProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getWorkTimeHandler.execute({
        tenantId: ctx.tenantId,
        actorId: ctx.userId,
        actorRole: ctx.role,   // 'staff' | 'manager' | 'hrm'
        userId: input.userId,
      })
    }),

  create: hrmProcedure
    .input(z.object({
      userId: z.string().uuid(),
      fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      fromTime: z.string().regex(/^\d{2}:\d{2}:\d{2}$/),
      toTime: z.string().regex(/^\d{2}:\d{2}:\d{2}$/),
      startBreakTime: z.string().regex(/^\d{2}:\d{2}:\d{2}$/),
      endBreakTime: z.string().regex(/^\d{2}:\d{2}:\d{2}$/),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return createWorkTimeHandler.execute({
        tenantId: ctx.tenantId,
        actorId: ctx.userId,
        ...input,
      })
    }),

  update: hrmProcedure
    .input(z.object({
      id: z.string().uuid(),
      fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      fromTime: z.string().regex(/^\d{2}:\d{2}:\d{2}$/).optional(),
      toTime: z.string().regex(/^\d{2}:\d{2}:\d{2}$/).optional(),
      startBreakTime: z.string().regex(/^\d{2}:\d{2}:\d{2}$/).optional(),
      endBreakTime: z.string().regex(/^\d{2}:\d{2}:\d{2}$/).optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return updateWorkTimeHandler.execute({
        tenantId: ctx.tenantId,
        actorId: ctx.userId,
        ...input,
      })
    }),

  delete: hrmProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await deleteWorkTimeHandler.execute({
        tenantId: ctx.tenantId,
        actorId: ctx.userId,
        id: input.id,
      })
    }),
}
```

**Procedure helpers:**

- `protectedProcedure` — any authenticated user (all roles)
- `hrmProcedure` — must have `hrm` role; throws `ForbiddenException` if not

Check the existing `time.router.ts` for the actual helper names and injection pattern — adapt accordingly. Do not invent new patterns.

---

## Zod Validation Notes

| Field                                                     | Validation                                                                          |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `fromDate` / `toDate`                                     | ISO date string `YYYY-MM-DD` regex                                                  |
| `fromTime` / `toTime` / `startBreakTime` / `endBreakTime` | `HH:mm:ss` regex                                                                    |
| `userId` / `id`                                           | UUID v4/v7 format (`z.string().uuid()`)                                             |
| `description`                                             | optional string                                                                     |
| `toDate`                                                  | optional; when provided, Zod superRefine or handler validates it's after `fromDate` |

---

## NestJS Module Registration

Add to `time.module.ts` providers:

```typescript
GetWorkTimeHandler,
```

---

## Unit Tests

### GetWorkTimeHandler spec

```
application/queries/get-work-time/get-work-time.handler.spec.ts
```

Mock `IWorkTimeRepository`.

- **Happy path (staff views own):** `actorId === userId`, role = `'staff'` → returns rows
- **Happy path (hrm views any user):** `actorId !== userId`, role = `'hrm'` → returns rows
- **Forbidden (staff views other):** `actorId !== userId`, role = `'staff'` → throws `ForbiddenException`
- **Forbidden (manager views other):** `actorId !== userId`, role = `'manager'` → throws `ForbiddenException`
- **Empty result:** `findByUserId` returns `[]` → returns `[]` (no error)

---

## Acceptance Criteria

- [ ] `GetWorkTimeHandler.execute` enforces: staff/manager can only fetch own userId
- [ ] `GetWorkTimeHandler.execute` allows hrm to fetch any userId
- [ ] tRPC `workTime.list` procedure exists, accepts `{ userId: UUID }`
- [ ] tRPC `workTime.create` procedure exists, hrm-only, validates all time fields as `HH:mm:ss`
- [ ] tRPC `workTime.update` procedure exists, hrm-only, all fields optional
- [ ] tRPC `workTime.delete` procedure exists, hrm-only, accepts `{ id: UUID }`
- [ ] All Zod schemas use regex for date and time string validation (not `z.date()`)
- [ ] `GetWorkTimeHandler` registered in `time.module.ts`
- [ ] Unit test: 5 cases, all pass, ForbiddenException tested for both staff and manager roles
- [ ] No `.js` extensions in relative imports
