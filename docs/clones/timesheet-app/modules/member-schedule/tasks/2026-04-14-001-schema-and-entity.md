# Task: member-schedule — Schema, Entity & Repository

**Module:** member-schedule
**Sequence:** 001
**Status:** pending
**Depends on:** none

---

## Scope

Build the full data layer for the member-schedule sub-domain:

1. Drizzle table definition in `time.member_schedule` (adds to the existing `time.schema.ts`)
2. Domain entity `MemberSchedule` (plain TypeScript interface, zero NestJS/Drizzle)
3. Repository interface `IMemberScheduleRepository` in `domain/repositories/`
4. Drizzle repository implementation `DrizzleMemberScheduleRepository` in `infrastructure/repositories/`
5. Unit tests for the repository (happy path + key error paths)

---

## Business Context

The `member_schedule` table stores one RRule-based schedule string per user. At most one row per user may be `status = 'active'` at a time. When a new schedule is assigned the old active row is set to `inactive` (soft replace). When deactivated, the active row is set to `inactive` with no new row inserted.

The attendance module reads the active schedule for a user during online check-in validation (BR-08). This read must be fast — it is on the critical check-in path.

---

## Source Reference

Legacy table (`public.work_schedule` — note: inventory calls it `member_schedule`; use target name):

```sql
id            serial PRIMARY KEY
user_id       integer  -- FK to user; in Future: actorId (uuid), no FK constraint across schemas
from_date     timestamptz  -- when schedule became active
to_date       timestamptz  -- when schedule was deactivated (null while active)
schedule      text         -- RRule string e.g. "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"
state         text         -- 'ACTIVE' | 'INACTIVE'
```

Legacy query patterns (for reference):

- `getMemberSchedule`: `SELECT * FROM work_schedule WHERE user_id = :userId AND state = 'ACTIVE'`
- `setInactiveMemberSchedule`: `UPDATE work_schedule SET state = 'INACTIVE', to_date = now() WHERE id = :id AND state = 'ACTIVE' RETURNING *`
- `postMemberSchedule`: `INSERT INTO work_schedule (user_id, from_date, schedule, state) VALUES (:user_id, now(), :schedule, :state) RETURNING *`

---

## Target Location

```
apps/api/src/modules/time/
  infrastructure/schema/time.schema.ts          ← ADD memberScheduleTable here
  domain/entities/member-schedule.entity.ts     ← CREATE
  domain/repositories/member-schedule.repository.ts  ← CREATE
  infrastructure/repositories/drizzle-member-schedule.repository.ts  ← CREATE
  infrastructure/repositories/drizzle-member-schedule.repository.spec.ts  ← CREATE
```

---

## Drizzle Schema

Add to `apps/api/src/modules/time/infrastructure/schema/time.schema.ts`:

```typescript
// member_schedule table
export const memberScheduleTable = timeSchema.table('member_schedule', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => generateUlidAsUuid()),
  tenantId: uuid('tenant_id').notNull(),
  actorId: uuid('actor_id').notNull(), // references people schema — no FK constraint
  schedule: text('schedule').notNull(), // RRule string
  status: text('status').notNull().default('active'), // 'active' | 'inactive'
  activatedAt: timestamp('activated_at', { withTimezone: true }).notNull().defaultNow(),
  deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

Notes:

- `id`: uuid v7 — look at how other tables in this codebase generate uuid v7 (search for `generateUlidAsUuid` or `ulidToUuid` helpers in `packages/db` or `apps/api/src/common`).
- No FK constraint to people schema (cross-schema boundary rule).
- `status` is a plain `text` column (not a pgEnum) to keep migrations simple; validated at application layer.
- Index needed: `(tenant_id, actor_id, status)` for the "find active schedule for user" query. Add a Drizzle `.index()`.

---

## Domain Entity

```typescript
// domain/entities/member-schedule.entity.ts
export type ScheduleStatus = 'active' | 'inactive'

export interface MemberSchedule {
  id: string
  tenantId: string
  actorId: string
  schedule: string // RRule string
  status: ScheduleStatus
  activatedAt: Date
  deactivatedAt: Date | null
  createdAt: Date
}
```

---

## Repository Interface

```typescript
// domain/repositories/member-schedule.repository.ts
import type { MemberSchedule } from '../entities/member-schedule.entity'

export const MEMBER_SCHEDULE_REPOSITORY = Symbol('IMemberScheduleRepository')

export interface IMemberScheduleRepository {
  /** Find the currently active schedule for a user, or null if none. */
  findActive(actorId: string, tenantId: string): Promise<MemberSchedule | null>

  /** Deactivate all active schedules for the given user. Returns count of rows updated. */
  deactivateAllForUser(actorId: string, tenantId: string, deactivatedAt: Date): Promise<number>

  /** Insert a new active schedule row. */
  insert(data: Omit<MemberSchedule, 'id' | 'createdAt'>): Promise<MemberSchedule>

  /**
   * For each actorId in the array: returns the actorId and whether they have an active schedule.
   * Used by the registration-status query to check a list of team members.
   */
  findActiveStatusForUsers(
    actorIds: string[],
    tenantId: string,
  ): Promise<Array<{ actorId: string; hasActive: boolean }>>
}
```

---

## Drizzle Repository Implementation

`DrizzleMemberScheduleRepository` implements `IMemberScheduleRepository`. Key points:

- Inject `DrizzleDb` (the Drizzle client token — find how other repositories in `apps/api` inject the DB, e.g. look at `drizzle-employment-profile.repository.ts`).
- `findActive`: `WHERE actor_id = actorId AND tenant_id = tenantId AND status = 'active' LIMIT 1`
- `deactivateAllForUser`: `UPDATE member_schedule SET status = 'inactive', deactivated_at = $deactivatedAt WHERE actor_id = actorId AND tenant_id = tenantId AND status = 'active'` — return `rowsAffected`.
- `insert`: standard Drizzle insert + returning.
- `findActiveStatusForUsers`: if `actorIds` is empty return `[]`. Otherwise query `WHERE actor_id IN (...) AND tenant_id = tenantId AND status = 'active'`. Build result map; users not in the result set get `hasActive: false`.

Register the repository in `TimeModule`:

```typescript
{
  provide: MEMBER_SCHEDULE_REPOSITORY,
  useClass: DrizzleMemberScheduleRepository,
}
```

---

## Unit Tests

File: `drizzle-member-schedule.repository.spec.ts`

Test cases (mock the Drizzle db):

- `findActive` returns `MemberSchedule` when active row exists
- `findActive` returns `null` when no active row
- `deactivateAllForUser` updates rows and returns count
- `deactivateAllForUser` returns 0 when no active row exists (idempotent)
- `insert` returns the inserted row
- `findActiveStatusForUsers` returns correct `hasActive` flags for a mixed set (some with, some without active schedules)
- `findActiveStatusForUsers` returns `[]` for empty input without hitting DB

---

## Acceptance Criteria

- [ ] `time.member_schedule` table defined in `time.schema.ts` with all required columns including `tenant_id` and uuid v7 `id`
- [ ] Index on `(tenant_id, actor_id, status)` defined
- [ ] `MemberSchedule` entity is a plain TypeScript interface (no class decorators, no ORM imports)
- [ ] `IMemberScheduleRepository` lives in `domain/repositories/` with the `MEMBER_SCHEDULE_REPOSITORY` symbol
- [ ] `DrizzleMemberScheduleRepository` implements the interface and lives in `infrastructure/repositories/`
- [ ] Repository is registered in `TimeModule` providers
- [ ] All four repository methods have unit tests
- [ ] No `.js` extensions in relative imports
- [ ] No imports from another module's `domain/` or `infrastructure/`
- [ ] Tests co-located (`.spec.ts` next to `.ts`), no `__tests__/` directory
