# Plan 3.1 — Personal Hubs Foundation

> Covers spec **Plan 3.1** — see [design spec](../../specs/2026-04-20-personal-hubs-design.md) sections 3 (Architecture), 6 (Schema), 7 (tRPC), 8.1 (NavGroup).
> Depends on Sub-project #2 Plans 01–04 merged (current state). Plan 05 is not a blocker.

**Goal:** Land every foundational backend piece that Plans 3.2–3.5 will consume. After this plan ships, no user sees any new UI (the feature flag stays off) — but the schema, facades, commands, permissions, visibility rules, the `NavGroup.render` API, the tenant-timezone helper, and the admin timezone setting are all in place and covered by tests.

**Architecture:** Additive schema migration (4 changes — one admin column, two plan columns, one new `my_day_entry` table). New `CreatePersonalPlan` command + `EnsurePersonalPlan` service. Visibility filter baked into existing `plans.list` / `addMember` / `delete` handlers. `@future/app-layout` `NavGroup` refactored to a strict union (no shim). Admin timezone editable via a new `web-admin` form.

**Tech stack:** Drizzle ORM + Postgres, NestJS CQRS, tRPC, `date-fns-tz`, React 19 / Next.js / React Query, shadcn `Select` primitive for the admin form, Vitest, Playwright (not used until Plan 3.5).

---

## File Map

### Schema & migrations

| File                                                                   | Action | Purpose                                                                          |
| ---------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------- |
| `apps/api/src/modules/admin/infrastructure/schema/admin.schema.ts`     | Modify | Add `timezone`, `plannerPersonalEnabled` columns to `tenant_settings`            |
| `apps/api/src/modules/planner/infrastructure/schema/planner.schema.ts` | Modify | Add `ownerActorId`, `syncEnabled` to `plan`; add `myDayEntry` table; add indices |
| `packages/db/drizzle/migrations/*`                                     | Create | Generated migration — `bun run db:generate` from repo root                       |

### Admin — timezone + personal flag

| File                                                                                     | Action | Purpose                                                                    |
| ---------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------- |
| `apps/api/src/modules/admin/application/queries/get-tenant-timezone.query.ts`            | Create | Query class                                                                |
| `apps/api/src/modules/admin/application/queries/get-tenant-timezone.handler.ts`          | Create | Reads `tenant_settings.timezone`, defaults to `Asia/Ho_Chi_Minh` if absent |
| `apps/api/src/modules/admin/application/queries/get-tenant-timezone.handler.spec.ts`     | Create | Unit tests                                                                 |
| `apps/api/src/modules/admin/application/queries/get-planner-view-flags.handler.ts`       | Modify | Extend return type with `personalEnabled` field                            |
| `apps/api/src/modules/admin/application/queries/planner-view-flags.types.ts`             | Modify | Add `personalEnabled: boolean` to `PlannerViewFlags`                       |
| `apps/api/src/modules/admin/application/commands/update-tenant-timezone.command.ts`      | Create | Command class with IANA zone validation                                    |
| `apps/api/src/modules/admin/application/commands/update-tenant-timezone.handler.ts`      | Create | Handler — upserts `timezone` on `tenant_settings`                          |
| `apps/api/src/modules/admin/application/commands/update-tenant-timezone.handler.spec.ts` | Create | Unit tests                                                                 |
| `apps/api/src/modules/admin/application/facades/admin-query.facade.ts`                   | Modify | Add `getTenantTimezone(tenantId): Promise<string>`                         |
| `apps/api/src/modules/admin/application/facades/admin-query.facade.spec.ts`              | Modify | Cover new method                                                           |
| `apps/api/src/modules/admin/interface/trpc/admin.router.ts`                              | Modify | Add `admin.getTenantTimezone` + `admin.updateTimezone` procedures          |

### Planner — personal plans + My Day table + tz helper

| File                                                                                           | Action | Purpose                                                                  |
| ---------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------ |
| `apps/api/src/modules/planner/domain/entities/plan.entity.ts`                                  | Modify | Add `ownerActorId?: string`, `syncEnabled: boolean` props + invariants   |
| `apps/api/src/modules/planner/domain/entities/plan.entity.spec.ts`                             | Modify | Cover invariants (can't add member when owner set; delete only by owner) |
| `apps/api/src/modules/planner/application/commands/plans/create-personal-plan.command.ts`      | Create | Command class                                                            |
| `apps/api/src/modules/planner/application/commands/plans/create-personal-plan.handler.ts`      | Create | Idempotent handler — returns existing personal plan id if any            |
| `apps/api/src/modules/planner/application/commands/plans/create-personal-plan.handler.spec.ts` | Create | Unit tests including idempotency                                         |
| `apps/api/src/modules/planner/application/services/ensure-personal-plan.service.ts`            | Create | Wraps `CreatePersonalPlanCommand` for use in task-create path (Plan 3.3) |
| `apps/api/src/modules/planner/application/services/ensure-personal-plan.service.spec.ts`       | Create | Unit tests                                                               |
| `apps/api/src/modules/planner/application/commands/plans/add-plan-member.handler.ts`           | Modify | Reject `FORBIDDEN` if `plan.ownerActorId != null`                        |
| `apps/api/src/modules/planner/application/commands/plans/add-plan-member.handler.spec.ts`      | Modify | Add rejection test                                                       |
| `apps/api/src/modules/planner/application/commands/plans/delete-plan.handler.ts`               | Modify | Reject `FORBIDDEN` when owner set and actor != owner                     |
| `apps/api/src/modules/planner/application/commands/plans/delete-plan.handler.spec.ts`          | Modify | Add rejection + owner-allowed tests                                      |
| `apps/api/src/modules/planner/application/queries/plans/list-plans.handler.ts`                 | Modify | Filter `owner_actor_id IS NULL OR owner_actor_id = :actorId`             |
| `apps/api/src/modules/planner/application/queries/plans/list-plans.handler.spec.ts`            | Modify | Add leak-prevention test — actor A cannot see actor B's personal plan    |
| `apps/api/src/modules/planner/infrastructure/repositories/drizzle-plan.repository.ts`          | Modify | Persist `ownerActorId`, `syncEnabled` fields                             |
| `apps/api/src/modules/planner/application/lib/tz.ts`                                           | Create | `tenantLocalDate(ts, tz): string` helper                                 |
| `apps/api/src/modules/planner/application/lib/tz.spec.ts`                                      | Create | DST edge-case + `Asia/Ho_Chi_Minh` tests                                 |
| `apps/api/src/modules/planner/planner.module.ts`                                               | Modify | Wire new command handler + service                                       |

### Permissions

| File                                                                       | Action | Purpose                                                                               |
| -------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------- |
| `apps/api/src/common/auth/permissions.ts`                                  | Modify | Add `PLANNER_PERSONAL_READ`, `PLANNER_PERSONAL_WRITE`, `ADMIN_TENANT_TIMEZONE_UPDATE` |
| `apps/api/src/modules/kernel/domain/constants/default-role-permissions.ts` | Modify | Grant personal read/write to `employee` by default; timezone update to `tenant_admin` |
| `apps/api/src/common/auth/permissions.spec.ts`                             | Modify | Assert new strings exist                                                              |

### `@future/app-layout` — NavGroup refactor

| File                                                        | Action | Purpose                                                   |
| ----------------------------------------------------------- | ------ | --------------------------------------------------------- |
| `packages/app-layout/src/types.ts`                          | Modify | `NavGroup` → strict union (`items` OR `render`)           |
| `packages/app-layout/src/types.spec.ts`                     | Modify | Type-level test — TS rejects `{items, render}` together   |
| `packages/app-layout/src/sidebar/sidebar-renderer.tsx`      | Modify | Add `'render' in group` discriminant branch               |
| `packages/app-layout/src/sidebar/sidebar-renderer.spec.tsx` | Modify | Test dynamic-group rendering with a stub render component |

### `web-admin` — tenant timezone UI

| File                                                                     | Action | Purpose                                                                      |
| ------------------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------- |
| `apps/web-admin/src/app/(tenant)/settings/tenant/page.tsx`               | Modify | Add Timezone section                                                         |
| `apps/web-admin/src/app/(tenant)/settings/tenant/timezone-form.tsx`      | Create | Controlled form with shadcn `Select` over IANA zones                         |
| `apps/web-admin/src/app/(tenant)/settings/tenant/timezone-form.spec.tsx` | Create | Unit tests — optimistic update, error recovery                               |
| `apps/web-admin/src/lib/iana-timezones.ts`                               | Create | Curated list of the 50 most common IANA zones (full list is ~400 — too long) |

### Dependencies

Run exactly once at the root of the repo (never edit `package.json` manually):

```bash
bun add -F @future/db date-fns-tz
bun add -F api date-fns-tz
```

> Do **not** add `date-fns-tz` to `web-planner` — the client uses `Intl.DateTimeFormat` (already built into the browser). `date-fns-tz` is server-only.

---

## Task 1 — Migration: `admin.tenant_settings` gains `timezone` + `plannerPersonalEnabled`

**Files:**

- Modify: `apps/api/src/modules/admin/infrastructure/schema/admin.schema.ts`

- [ ] **Step 1: Edit the Drizzle schema.**

Extend the `tenantSettings` table definition with the two new columns:

```ts
// apps/api/src/modules/admin/infrastructure/schema/admin.schema.ts
export const tenantSettings = adminSchema.table('tenant_settings', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull().unique(),
  plannerCoreEnabled: boolean('planner_core_enabled').notNull().default(false),
  plannerViewsEnabled: boolean('planner_views_enabled').notNull().default(false),
  plannerGridEnabled: boolean('planner_grid_enabled').notNull().default(false),
  plannerScheduleEnabled: boolean('planner_schedule_enabled').notNull().default(false),
  plannerChartsEnabled: boolean('planner_charts_enabled').notNull().default(false),
  plannerPersonalEnabled: boolean('planner_personal_enabled').notNull().default(false),
  timezone: text('timezone').notNull().default('Asia/Ho_Chi_Minh'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
```

- [ ] **Step 2: Generate the migration.**

Run: `bun run db:generate`
Expected output: a new file `packages/db/drizzle/migrations/NNNN_*.sql` containing `ALTER TABLE "admin"."tenant_settings" ADD COLUMN "planner_personal_enabled" boolean DEFAULT false NOT NULL;` and the `timezone` add.

- [ ] **Step 3: Apply it locally.**

Run: `bun run db:up && bun run db:migrate`
Expected: migration applies without error; `\d admin.tenant_settings` in psql shows both columns.

- [ ] **Step 4: Commit.**

```bash
git add apps/api/src/modules/admin/infrastructure/schema/admin.schema.ts packages/db/drizzle/migrations/
git commit -m "feat(admin): add tenant_settings.timezone + planner_personal_enabled"
```

---

## Task 2 — Migration: `planner.plan` gains `owner_actor_id` + `sync_enabled`; `my_day_entry` table

**Files:**

- Modify: `apps/api/src/modules/planner/infrastructure/schema/planner.schema.ts`

- [ ] **Step 1: Edit the Drizzle schema — extend `plan`.**

```ts
// in planner.schema.ts, within the `plan` table definition
export const plan = plannerSchema.table(
  'plan',
  {
    // ... existing columns ...
    ownerActorId: uuid('owner_actor_id'), // NEW — nullable
    syncEnabled: boolean('sync_enabled').notNull().default(true), // NEW — true for team, false for personal (overridden by handler)
    // ... existing columns continue ...
  },
  (t) => [
    // ... existing indexes ...
    index('idx_plan_tenant_owner_actor')
      .on(t.tenantId, t.ownerActorId)
      .where(sql`${t.ownerActorId} IS NOT NULL`), // NEW — partial index
  ],
)
```

Required import (top of file if not already present): `import { sql } from 'drizzle-orm'`.

- [ ] **Step 2: Add the `my_day_entry` table to `planner.schema.ts`.**

```ts
export const myDayEntry = plannerSchema.table(
  'my_day_entry',
  {
    actorId: uuid('actor_id').notNull(),
    taskId: uuid('task_id').notNull(),
    addedDate: date('added_date').notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    tenantId: uuid('tenant_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.actorId, t.taskId, t.addedDate] }),
    index('idx_my_day_entry_today').on(t.tenantId, t.actorId, t.addedDate),
    index('idx_my_day_entry_task').on(t.taskId),
  ],
)
```

Ensure imports at top: `import { date, primaryKey } from 'drizzle-orm/pg-core'`.

- [ ] **Step 3: Generate + inspect the migration.**

Run: `bun run db:generate`

Open the generated SQL. Confirm it contains:

- `ALTER TABLE "planner"."plan" ADD COLUMN "owner_actor_id" uuid;`
- `ALTER TABLE "planner"."plan" ADD COLUMN "sync_enabled" boolean DEFAULT true NOT NULL;`
- `CREATE TABLE "planner"."my_day_entry" …`
- Partial index on `(tenant_id, owner_actor_id) WHERE owner_actor_id IS NOT NULL`.

- [ ] **Step 4: Append RLS policy to the generated SQL file** (Drizzle does not emit RLS).

Open the generated `.sql` and add at the bottom:

```sql
ALTER TABLE "planner"."my_day_entry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "planner"."my_day_entry"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

- [ ] **Step 5: Apply + verify.**

Run: `bun run db:migrate`
Expected: all migrations apply. In psql: `\d planner.my_day_entry` shows all columns + indices + `pg_policies` shows the `tenant_isolation` policy.

- [ ] **Step 6: Commit.**

```bash
git add apps/api/src/modules/planner/infrastructure/schema/planner.schema.ts packages/db/drizzle/migrations/
git commit -m "feat(planner): add plan.owner_actor_id, plan.sync_enabled, my_day_entry table"
```

---

## Task 3 — Permission strings registered

**Files:**

- Modify: `apps/api/src/common/auth/permissions.ts`
- Modify: `apps/api/src/common/auth/permissions.spec.ts`
- Modify: `apps/api/src/modules/kernel/domain/constants/default-role-permissions.ts`

- [ ] **Step 1: Write failing test for the new permission strings.**

```ts
// in permissions.spec.ts — add to the existing describe block
it('exposes personal-hubs and timezone-update permission strings', () => {
  expect(PERMISSIONS.PLANNER_PERSONAL_READ).toBe('planner:personal:read')
  expect(PERMISSIONS.PLANNER_PERSONAL_WRITE).toBe('planner:personal:write')
  expect(PERMISSIONS.ADMIN_TENANT_TIMEZONE_UPDATE).toBe('admin:tenant:timezone:update')
})
```

- [ ] **Step 2: Run test — expect failure.**

Run: `bun test apps/api/src/common/auth/permissions.spec.ts`
Expected: FAIL — `Cannot read property 'PLANNER_PERSONAL_READ' of ...`.

- [ ] **Step 3: Add the strings.**

```ts
// in permissions.ts — append inside the PERMISSIONS const object
PLANNER_PERSONAL_READ: 'planner:personal:read',
PLANNER_PERSONAL_WRITE: 'planner:personal:write',
ADMIN_TENANT_TIMEZONE_UPDATE: 'admin:tenant:timezone:update',
```

- [ ] **Step 4: Run test — expect pass.**

Run: `bun test apps/api/src/common/auth/permissions.spec.ts`
Expected: PASS.

- [ ] **Step 5: Grant defaults in `default-role-permissions.ts`.**

Append to the `employee` role's permission array: `PERMISSIONS.PLANNER_PERSONAL_READ`, `PERMISSIONS.PLANNER_PERSONAL_WRITE`.
Append to the `tenant_admin` role's permission array: `PERMISSIONS.ADMIN_TENANT_TIMEZONE_UPDATE`.

- [ ] **Step 6: Run the kernel permission tests.**

Run: `bun test apps/api/src/modules/kernel`
Expected: all pass. If any test asserts a fixed count of default permissions, update it to reflect the new count.

- [ ] **Step 7: Commit.**

```bash
git add apps/api/src/common/auth/permissions.ts apps/api/src/common/auth/permissions.spec.ts apps/api/src/modules/kernel/domain/constants/default-role-permissions.ts
git commit -m "feat(auth): register planner:personal:read/write + admin:tenant:timezone:update"
```

---

## Task 4 — `AdminQueryFacade.getTenantTimezone` + query handler

**Files:**

- Create: `apps/api/src/modules/admin/application/queries/get-tenant-timezone.query.ts`
- Create: `apps/api/src/modules/admin/application/queries/get-tenant-timezone.handler.ts`
- Create: `apps/api/src/modules/admin/application/queries/get-tenant-timezone.handler.spec.ts`
- Modify: `apps/api/src/modules/admin/application/facades/admin-query.facade.ts`
- Modify: `apps/api/src/modules/admin/application/facades/admin-query.facade.spec.ts`

- [ ] **Step 1: Write failing handler test.**

```ts
// get-tenant-timezone.handler.spec.ts
import { Test } from '@nestjs/testing'
import { GetTenantTimezoneHandler } from './get-tenant-timezone.handler'
import { GetTenantTimezoneQuery } from './get-tenant-timezone.query'
import { DB_TOKEN } from '../../../../common/database/db.token'

describe('GetTenantTimezoneHandler', () => {
  const tenantId = '00000000-0000-0000-0000-000000000001'
  let handler: GetTenantTimezoneHandler
  let db: { query: { tenantSettings: { findFirst: jest.Mock } } }

  beforeEach(async () => {
    db = { query: { tenantSettings: { findFirst: jest.fn() } } }
    const mod = await Test.createTestingModule({
      providers: [GetTenantTimezoneHandler, { provide: DB_TOKEN, useValue: db }],
    }).compile()
    handler = mod.get(GetTenantTimezoneHandler)
  })

  it('returns the stored timezone', async () => {
    db.query.tenantSettings.findFirst.mockResolvedValue({ timezone: 'America/New_York' })
    const tz = await handler.execute(new GetTenantTimezoneQuery(tenantId))
    expect(tz).toBe('America/New_York')
  })

  it('defaults to Asia/Ho_Chi_Minh when no tenant_settings row exists', async () => {
    db.query.tenantSettings.findFirst.mockResolvedValue(undefined)
    const tz = await handler.execute(new GetTenantTimezoneQuery(tenantId))
    expect(tz).toBe('Asia/Ho_Chi_Minh')
  })
})
```

- [ ] **Step 2: Run test — expect failure** (handler file doesn't exist).

Run: `bun test apps/api/src/modules/admin/application/queries/get-tenant-timezone.handler.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the query class.**

```ts
// get-tenant-timezone.query.ts
export class GetTenantTimezoneQuery {
  constructor(public readonly tenantId: string) {}
}
```

- [ ] **Step 4: Create the handler.**

```ts
// get-tenant-timezone.handler.ts
import { Inject } from '@nestjs/common'
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs'
import { eq } from 'drizzle-orm'
import { DB_TOKEN, type DrizzleDb } from '../../../../common/database/db.token'
import { tenantSettings } from '../../infrastructure/schema/admin.schema'
import { GetTenantTimezoneQuery } from './get-tenant-timezone.query'

const DEFAULT_TENANT_TIMEZONE = 'Asia/Ho_Chi_Minh'

@QueryHandler(GetTenantTimezoneQuery)
export class GetTenantTimezoneHandler implements IQueryHandler<GetTenantTimezoneQuery, string> {
  constructor(@Inject(DB_TOKEN) private readonly db: DrizzleDb) {}

  async execute(query: GetTenantTimezoneQuery): Promise<string> {
    const row = await this.db.query.tenantSettings.findFirst({
      where: eq(tenantSettings.tenantId, query.tenantId),
      columns: { timezone: true },
    })
    return row?.timezone ?? DEFAULT_TENANT_TIMEZONE
  }
}
```

- [ ] **Step 5: Register in the admin module.**

Open `apps/api/src/modules/admin/admin.module.ts` and add `GetTenantTimezoneHandler` to the `providers` array.

- [ ] **Step 6: Run tests — expect pass.**

Run: `bun test apps/api/src/modules/admin/application/queries/get-tenant-timezone.handler.spec.ts`
Expected: PASS.

- [ ] **Step 7: Extend `AdminQueryFacade`.**

```ts
// admin-query.facade.ts — add method
async getTenantTimezone(tenantId: string): Promise<string> {
  return this.queryBus.execute(new GetTenantTimezoneQuery(tenantId))
}
```

Add corresponding test in `admin-query.facade.spec.ts` asserting the facade delegates to `QueryBus.execute` with a `GetTenantTimezoneQuery`.

- [ ] **Step 8: Run the facade test.**

Run: `bun test apps/api/src/modules/admin/application/facades/admin-query.facade.spec.ts`
Expected: PASS.

- [ ] **Step 9: Commit.**

```bash
git add apps/api/src/modules/admin/
git commit -m "feat(admin): getTenantTimezone query + facade method"
```

---

## Task 5 — `UpdateTenantTimezone` command

**Files:**

- Create: `apps/api/src/modules/admin/application/commands/update-tenant-timezone.command.ts`
- Create: `apps/api/src/modules/admin/application/commands/update-tenant-timezone.handler.ts`
- Create: `apps/api/src/modules/admin/application/commands/update-tenant-timezone.handler.spec.ts`

- [ ] **Step 1: Write failing tests.**

```ts
// update-tenant-timezone.handler.spec.ts
import { Test } from '@nestjs/testing'
import { BadRequestException } from '@nestjs/common'
import { UpdateTenantTimezoneHandler } from './update-tenant-timezone.handler'
import { UpdateTenantTimezoneCommand } from './update-tenant-timezone.command'
import { DB_TOKEN } from '../../../../common/database/db.token'

describe('UpdateTenantTimezoneHandler', () => {
  const tenantId = '00000000-0000-0000-0000-000000000001'
  let handler: UpdateTenantTimezoneHandler
  let db: { insert: jest.Mock; update: jest.Mock }

  beforeEach(async () => {
    db = {
      insert: jest.fn().mockReturnValue({
        values: jest
          .fn()
          .mockReturnValue({ onConflictDoUpdate: jest.fn().mockResolvedValue(undefined) }),
      }),
      update: jest.fn(),
    }
    const mod = await Test.createTestingModule({
      providers: [UpdateTenantTimezoneHandler, { provide: DB_TOKEN, useValue: db }],
    }).compile()
    handler = mod.get(UpdateTenantTimezoneHandler)
  })

  it('upserts the timezone', async () => {
    await handler.execute(new UpdateTenantTimezoneCommand(tenantId, 'America/New_York'))
    expect(db.insert).toHaveBeenCalled()
  })

  it('rejects an unknown IANA zone', async () => {
    await expect(
      handler.execute(new UpdateTenantTimezoneCommand(tenantId, 'Mars/Olympus_Mons')),
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})
```

- [ ] **Step 2: Verify test fails.**

Run: `bun test apps/api/src/modules/admin/application/commands/update-tenant-timezone.handler.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the command.**

```ts
// update-tenant-timezone.command.ts
export class UpdateTenantTimezoneCommand {
  constructor(
    public readonly tenantId: string,
    public readonly timezone: string,
  ) {}
}
```

- [ ] **Step 4: Write the handler.**

```ts
// update-tenant-timezone.handler.ts
import { BadRequestException, Inject } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { DB_TOKEN, type DrizzleDb } from '../../../../common/database/db.token'
import { tenantSettings } from '../../infrastructure/schema/admin.schema'
import { UpdateTenantTimezoneCommand } from './update-tenant-timezone.command'

function isValidIanaZone(tz: string): boolean {
  try {
    // Will throw on invalid zones
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date())
    return true
  } catch {
    return false
  }
}

@CommandHandler(UpdateTenantTimezoneCommand)
export class UpdateTenantTimezoneHandler implements ICommandHandler<UpdateTenantTimezoneCommand> {
  constructor(@Inject(DB_TOKEN) private readonly db: DrizzleDb) {}

  async execute(command: UpdateTenantTimezoneCommand): Promise<void> {
    if (!isValidIanaZone(command.timezone)) {
      throw new BadRequestException(`Unknown IANA timezone: ${command.timezone}`)
    }
    await this.db
      .insert(tenantSettings)
      .values({ tenantId: command.tenantId, timezone: command.timezone })
      .onConflictDoUpdate({
        target: tenantSettings.tenantId,
        set: { timezone: command.timezone, updatedAt: new Date() },
      })
  }
}
```

- [ ] **Step 5: Register in the admin module.**

Add `UpdateTenantTimezoneHandler` to the `providers` array in `admin.module.ts`.

- [ ] **Step 6: Run the test — expect pass.**

Run: `bun test apps/api/src/modules/admin/application/commands/update-tenant-timezone.handler.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add apps/api/src/modules/admin/
git commit -m "feat(admin): updateTenantTimezone command with IANA validation"
```

---

## Task 6 — `admin` tRPC: `getTenantTimezone` + `updateTimezone`

**Files:**

- Modify: `apps/api/src/modules/admin/interface/trpc/admin.router.ts`

- [ ] **Step 1: Write failing router test.**

Add tests to the existing `admin.router.spec.ts`:

```ts
it('exposes getTenantTimezone — returns stored or default', async () => {
  // arrange tenant with stored zone
  const result = await caller.getTenantTimezone()
  expect(result).toMatchObject({ timezone: expect.any(String) })
})

it('rejects updateTimezone without admin:tenant:timezone:update permission', async () => {
  const callerWithoutPerm = makeCaller({ permissions: new Set() })
  await expect(callerWithoutPerm.updateTimezone({ timezone: 'UTC' })).rejects.toMatchObject({
    code: 'FORBIDDEN',
  })
})

it('accepts updateTimezone with permission', async () => {
  const adminCaller = makeCaller({ permissions: new Set(['admin:tenant:timezone:update']) })
  await expect(adminCaller.updateTimezone({ timezone: 'UTC' })).resolves.toBeUndefined()
})
```

- [ ] **Step 2: Run tests — expect failure.**

Expected: FAIL — procedures don't exist.

- [ ] **Step 3: Extend the router.**

```ts
// admin.router.ts — inside the router object
getTenantTimezone: protectedProcedure.query(async ({ ctx }) => {
  const timezone = await ctx.adminFacade.getTenantTimezone(ctx.tenantId)
  return { timezone }
}),

updateTimezone: protectedProcedure
  .input(z.object({ timezone: z.string().min(1) }))
  .mutation(async ({ ctx, input }) => {
    ctx.auth.requirePermission(PERMISSIONS.ADMIN_TENANT_TIMEZONE_UPDATE)
    await ctx.commandBus.execute(new UpdateTenantTimezoneCommand(ctx.tenantId, input.timezone))
  }),
```

Verify the imports at the top of the file include `z` from `zod`, `PERMISSIONS`, and `UpdateTenantTimezoneCommand`.

- [ ] **Step 4: Run tests — expect pass.**

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/api/src/modules/admin/
git commit -m "feat(admin): expose getTenantTimezone + updateTimezone tRPC procedures"
```

---

## Task 7 — `personalEnabled` added to `getPlannerViewFlags`

**Files:**

- Modify: `apps/api/src/modules/admin/application/queries/planner-view-flags.types.ts`
- Modify: `apps/api/src/modules/admin/application/queries/get-planner-view-flags.handler.ts`
- Modify: `apps/api/src/modules/admin/application/queries/get-planner-view-flags.handler.spec.ts`

- [ ] **Step 1: Update the spec first (TDD).**

Add to `get-planner-view-flags.handler.spec.ts`:

```ts
it('returns personalEnabled=true when the tenant setting is on', async () => {
  db.query.tenantSettings.findFirst.mockResolvedValue({
    plannerViewsEnabled: false,
    plannerGridEnabled: false,
    plannerScheduleEnabled: false,
    plannerChartsEnabled: false,
    plannerPersonalEnabled: true,
  })
  const flags = await handler.execute(new GetPlannerViewFlagsQuery(tenantId))
  expect(flags.personalEnabled).toBe(true)
})

it('defaults personalEnabled to false when no tenant_settings row exists', async () => {
  db.query.tenantSettings.findFirst.mockResolvedValue(undefined)
  const flags = await handler.execute(new GetPlannerViewFlagsQuery(tenantId))
  expect(flags.personalEnabled).toBe(false)
})
```

- [ ] **Step 2: Run — expect failure.**

Expected: FAIL — `personalEnabled` not on the type.

- [ ] **Step 3: Add to the types file.**

```ts
// planner-view-flags.types.ts
export interface PlannerViewFlags {
  viewsEnabled: boolean
  gridEnabled: boolean
  scheduleEnabled: boolean
  chartsEnabled: boolean
  personalEnabled: boolean // NEW
}
```

- [ ] **Step 4: Update the handler.**

```ts
// get-planner-view-flags.handler.ts — inside execute()
return {
  viewsEnabled: row?.plannerViewsEnabled ?? false,
  gridEnabled: row?.plannerGridEnabled ?? false,
  scheduleEnabled: row?.plannerScheduleEnabled ?? false,
  chartsEnabled: row?.plannerChartsEnabled ?? false,
  personalEnabled: row?.plannerPersonalEnabled ?? false, // NEW
}
```

- [ ] **Step 5: Run tests — expect pass.**

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add apps/api/src/modules/admin/
git commit -m "feat(admin): expose personalEnabled in PlannerViewFlags"
```

---

## Task 8 — `Plan` domain entity extended with `ownerActorId` + `syncEnabled`

**Files:**

- Modify: `apps/api/src/modules/planner/domain/entities/plan.entity.ts`
- Modify: `apps/api/src/modules/planner/domain/entities/plan.entity.spec.ts`

- [ ] **Step 1: Write failing invariant tests.**

```ts
// plan.entity.spec.ts — append
describe('personal plan invariants', () => {
  const tenantId = 'tenant-1'
  const actorId = 'actor-owner'

  it('can be constructed with an ownerActorId to represent a personal plan', () => {
    const plan = Plan.createPersonal({ tenantId, ownerActorId: actorId, name: 'Personal' })
    expect(plan.ownerActorId).toBe(actorId)
    expect(plan.syncEnabled).toBe(false) // personal plans default syncEnabled=false
  })

  it('rejects addMember when ownerActorId is set', () => {
    const plan = Plan.createPersonal({ tenantId, ownerActorId: actorId, name: 'Personal' })
    expect(() => plan.assertCanAddMember()).toThrow(/personal plan/i)
  })

  it('rejects delete when a non-owner tries to delete a personal plan', () => {
    const plan = Plan.createPersonal({ tenantId, ownerActorId: actorId, name: 'Personal' })
    expect(() => plan.assertCanDelete('actor-other')).toThrow(/personal plan/i)
  })

  it('allows owner to delete their personal plan', () => {
    const plan = Plan.createPersonal({ tenantId, ownerActorId: actorId, name: 'Personal' })
    expect(() => plan.assertCanDelete(actorId)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests — expect failures.**

Expected: FAIL — `Plan.createPersonal` is undefined; `assertCanAddMember` and `assertCanDelete` may not exist.

- [ ] **Step 3: Extend the `Plan` entity.**

```ts
// plan.entity.ts — add fields + factory + invariant methods
export class Plan {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public name: string,
    // ... existing fields ...
    public readonly ownerActorId: string | null, // NEW
    public readonly syncEnabled: boolean, // NEW
  ) {}

  static createPersonal(input: { tenantId: string; ownerActorId: string; name: string }): Plan {
    return new Plan(
      generateUuidV7(),
      input.tenantId,
      input.name,
      // ... existing defaults ...
      input.ownerActorId,
      false, // personal plans default to sync_enabled = false
    )
  }

  get isPersonal(): boolean {
    return this.ownerActorId !== null
  }

  assertCanAddMember(): void {
    if (this.isPersonal) {
      throw new Error('Cannot add members to a personal plan')
    }
  }

  assertCanDelete(actorId: string): void {
    if (this.isPersonal && this.ownerActorId !== actorId) {
      throw new Error('Only the owner can delete a personal plan')
    }
  }
}
```

- [ ] **Step 4: Run tests — expect pass.**

Expected: PASS.

- [ ] **Step 5: Update the plan repository to persist the new fields.**

Open `apps/api/src/modules/planner/infrastructure/repositories/drizzle-plan.repository.ts` and add `ownerActorId` + `syncEnabled` mapping in every `toRow` / `fromRow` helper + in the `insert().values()` call. Update the corresponding spec if it asserts specific insertions.

- [ ] **Step 6: Run repo tests.**

Run: `bun test apps/api/src/modules/planner/infrastructure/repositories/drizzle-plan.repository.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add apps/api/src/modules/planner/domain/ apps/api/src/modules/planner/infrastructure/repositories/
git commit -m "feat(planner): Plan.createPersonal factory + ownerActorId/syncEnabled persistence"
```

---

## Task 9 — `CreatePersonalPlan` command (idempotent)

**Files:**

- Create: `apps/api/src/modules/planner/application/commands/plans/create-personal-plan.command.ts`
- Create: `apps/api/src/modules/planner/application/commands/plans/create-personal-plan.handler.ts`
- Create: `apps/api/src/modules/planner/application/commands/plans/create-personal-plan.handler.spec.ts`

- [ ] **Step 1: Write failing tests.**

```ts
// create-personal-plan.handler.spec.ts
import { Test } from '@nestjs/testing'
import { CreatePersonalPlanHandler } from './create-personal-plan.handler'
import { CreatePersonalPlanCommand } from './create-personal-plan.command'
import { PLAN_REPOSITORY, type IPlanRepository } from '../../../domain/repositories/plan.repository'

describe('CreatePersonalPlanHandler', () => {
  const tenantId = 'tenant-1'
  const actorId = 'actor-1'
  let handler: CreatePersonalPlanHandler
  let repo: jest.Mocked<IPlanRepository>

  beforeEach(async () => {
    repo = {
      findPersonalByOwner: jest.fn(),
      save: jest.fn(),
      addMember: jest.fn(),
      // ... other methods as needed
    } as unknown as jest.Mocked<IPlanRepository>
    const mod = await Test.createTestingModule({
      providers: [CreatePersonalPlanHandler, { provide: PLAN_REPOSITORY, useValue: repo }],
    }).compile()
    handler = mod.get(CreatePersonalPlanHandler)
  })

  it('creates a personal plan and returns created=true', async () => {
    repo.findPersonalByOwner.mockResolvedValue(null)
    const result = await handler.execute(new CreatePersonalPlanCommand(actorId, tenantId))
    expect(result.created).toBe(true)
    expect(repo.save).toHaveBeenCalled()
    expect(repo.addMember).toHaveBeenCalledWith(
      expect.any(String),
      actorId,
      'owner',
      actorId,
      tenantId,
    )
  })

  it('returns the existing plan with created=false when one exists', async () => {
    repo.findPersonalByOwner.mockResolvedValue({ id: 'existing-plan-id' } as any)
    const result = await handler.execute(new CreatePersonalPlanCommand(actorId, tenantId))
    expect(result).toEqual({ planId: 'existing-plan-id', created: false })
    expect(repo.save).not.toHaveBeenCalled()
    expect(repo.addMember).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run — expect failure.**

Expected: FAIL — module not found.

- [ ] **Step 3: Add the repository method.**

In `apps/api/src/modules/planner/domain/repositories/plan.repository.ts`, add to the interface:

```ts
findPersonalByOwner(tenantId: string, ownerActorId: string): Promise<Plan | null>
```

Implement in `drizzle-plan.repository.ts`:

```ts
async findPersonalByOwner(tenantId: string, ownerActorId: string): Promise<Plan | null> {
  const row = await this.db.query.plan.findFirst({
    where: and(
      eq(plan.tenantId, tenantId),
      eq(plan.ownerActorId, ownerActorId),
      isNull(plan.deletedAt),
    ),
  })
  return row ? this.fromRow(row) : null
}
```

- [ ] **Step 4: Create the command class.**

```ts
// create-personal-plan.command.ts
export class CreatePersonalPlanCommand {
  constructor(
    public readonly actorId: string,
    public readonly tenantId: string,
  ) {}
}
```

- [ ] **Step 5: Create the handler.**

```ts
// create-personal-plan.handler.ts
import { Inject } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Plan } from '../../../domain/entities/plan.entity'
import { PLAN_REPOSITORY, type IPlanRepository } from '../../../domain/repositories/plan.repository'
import { CreatePersonalPlanCommand } from './create-personal-plan.command'

export interface CreatePersonalPlanResult {
  planId: string
  created: boolean
}

@CommandHandler(CreatePersonalPlanCommand)
export class CreatePersonalPlanHandler implements ICommandHandler<
  CreatePersonalPlanCommand,
  CreatePersonalPlanResult
> {
  constructor(@Inject(PLAN_REPOSITORY) private readonly repo: IPlanRepository) {}

  async execute(command: CreatePersonalPlanCommand): Promise<CreatePersonalPlanResult> {
    const existing = await this.repo.findPersonalByOwner(command.tenantId, command.actorId)
    if (existing) {
      return { planId: existing.id, created: false }
    }
    const plan = Plan.createPersonal({
      tenantId: command.tenantId,
      ownerActorId: command.actorId,
      name: 'Personal',
    })
    await this.repo.save(plan)
    await this.repo.addMember(plan.id, command.actorId, 'owner', command.actorId, command.tenantId)
    return { planId: plan.id, created: true }
  }
}
```

- [ ] **Step 6: Register in `planner.module.ts`.**

Add to the `providers` array. Run tests — expect PASS.

- [ ] **Step 7: Commit.**

```bash
git add apps/api/src/modules/planner/
git commit -m "feat(planner): CreatePersonalPlan command (idempotent)"
```

---

## Task 10 — `EnsurePersonalPlanService`

**Files:**

- Create: `apps/api/src/modules/planner/application/services/ensure-personal-plan.service.ts`
- Create: `apps/api/src/modules/planner/application/services/ensure-personal-plan.service.spec.ts`

- [ ] **Step 1: Write failing tests.**

```ts
// ensure-personal-plan.service.spec.ts
import { Test } from '@nestjs/testing'
import { CommandBus } from '@nestjs/cqrs'
import { EnsurePersonalPlanService } from './ensure-personal-plan.service'
import { CreatePersonalPlanCommand } from '../commands/plans/create-personal-plan.command'

describe('EnsurePersonalPlanService', () => {
  let svc: EnsurePersonalPlanService
  let commandBus: { execute: jest.Mock }

  beforeEach(async () => {
    commandBus = { execute: jest.fn() }
    const mod = await Test.createTestingModule({
      providers: [EnsurePersonalPlanService, { provide: CommandBus, useValue: commandBus }],
    }).compile()
    svc = mod.get(EnsurePersonalPlanService)
  })

  it('delegates to the CreatePersonalPlan command bus and returns the plan id', async () => {
    commandBus.execute.mockResolvedValue({ planId: 'p1', created: false })
    const id = await svc.ensure('actor-1', 'tenant-1')
    expect(id).toBe('p1')
    expect(commandBus.execute).toHaveBeenCalledWith(expect.any(CreatePersonalPlanCommand))
  })
})
```

- [ ] **Step 2: Run — expect failure.**

Expected: FAIL.

- [ ] **Step 3: Implement.**

```ts
// ensure-personal-plan.service.ts
import { Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { CreatePersonalPlanCommand } from '../commands/plans/create-personal-plan.command'

@Injectable()
export class EnsurePersonalPlanService {
  constructor(private readonly commandBus: CommandBus) {}

  async ensure(actorId: string, tenantId: string): Promise<string> {
    const result = await this.commandBus.execute<
      CreatePersonalPlanCommand,
      { planId: string; created: boolean }
    >(new CreatePersonalPlanCommand(actorId, tenantId))
    return result.planId
  }
}
```

- [ ] **Step 4: Register in `planner.module.ts` (providers AND exports — task-create in Plan 3.3 needs this).**

- [ ] **Step 5: Run tests — expect pass.**

- [ ] **Step 6: Commit.**

```bash
git add apps/api/src/modules/planner/
git commit -m "feat(planner): EnsurePersonalPlanService"
```

---

## Task 11 — `AddPlanMember` rejects on personal plans; `DeletePlan` enforces owner-only

**Files:**

- Modify: `apps/api/src/modules/planner/application/commands/plans/add-plan-member.handler.ts`
- Modify: `apps/api/src/modules/planner/application/commands/plans/add-plan-member.handler.spec.ts`
- Modify: `apps/api/src/modules/planner/application/commands/plans/delete-plan.handler.ts`
- Modify: `apps/api/src/modules/planner/application/commands/plans/delete-plan.handler.spec.ts`

- [ ] **Step 1: Extend `add-plan-member.handler.spec.ts` with a personal-plan rejection test.**

```ts
it('rejects adding a member when the plan is personal', async () => {
  repo.findById.mockResolvedValue(
    Plan.createPersonal({ tenantId, ownerActorId: 'actor-1', name: 'Personal' }),
  )
  await expect(
    handler.execute(new AddPlanMemberCommand(planId, 'actor-2', 'editor', 'actor-1', tenantId)),
  ).rejects.toThrow(/personal plan/i)
})
```

- [ ] **Step 2: Run — expect failure.**

Expected: FAIL — handler currently allows it.

- [ ] **Step 3: Update `add-plan-member.handler.ts`.**

Inside `execute`, after fetching `plan`, add:

```ts
plan.assertCanAddMember()
```

- [ ] **Step 4: Run tests — expect pass.**

- [ ] **Step 5: Extend `delete-plan.handler.spec.ts`.**

```ts
it('rejects delete when a non-owner tries to delete a personal plan', async () => {
  repo.findById.mockResolvedValue(
    Plan.createPersonal({ tenantId, ownerActorId: 'actor-owner', name: 'Personal' }),
  )
  await expect(
    handler.execute(new DeletePlanCommand(planId, 'actor-other', tenantId)),
  ).rejects.toThrow(/personal plan/i)
})

it('allows owner to delete their personal plan', async () => {
  repo.findById.mockResolvedValue(
    Plan.createPersonal({ tenantId, ownerActorId: 'actor-owner', name: 'Personal' }),
  )
  await expect(
    handler.execute(new DeletePlanCommand(planId, 'actor-owner', tenantId)),
  ).resolves.toBeUndefined()
})
```

- [ ] **Step 6: Update `delete-plan.handler.ts`.**

Inside `execute`, after fetching `plan`, add:

```ts
plan.assertCanDelete(command.actorId)
```

- [ ] **Step 7: Run tests — expect pass.**

- [ ] **Step 8: Commit.**

```bash
git add apps/api/src/modules/planner/application/commands/plans/
git commit -m "feat(planner): personal-plan invariants in addMember + delete handlers"
```

---

## Task 12 — `ListPlans` filters out other actors' personal plans (leak-prevention)

**Files:**

- Modify: `apps/api/src/modules/planner/application/queries/plans/list-plans.handler.ts`
- Modify: `apps/api/src/modules/planner/application/queries/plans/list-plans.handler.spec.ts`

Exact file names may differ — if the repo has `list-my-plans.handler.ts` or similar, adapt. Confirm path before editing.

- [ ] **Step 1: Add a leak-prevention test.**

```ts
it("does not leak another actor's personal plan", async () => {
  // seed:
  //   planA (team, owner_actor_id=null) — both actors are members
  //   planB (personal, owner_actor_id=actor-1)
  //   planC (personal, owner_actor_id=actor-2)
  const result = await handler.execute(new ListPlansQuery('actor-1', tenantId))
  const ids = result.map((p) => p.id)
  expect(ids).toContain('planA')
  expect(ids).toContain('planB')
  expect(ids).not.toContain('planC')
})
```

- [ ] **Step 2: Run — expect failure.**

Expected: FAIL — current query returns all plans the actor is a member of; personal plans may not be member-visible anyway, but the filter is missing.

- [ ] **Step 3: Update the SQL in `list-plans.handler.ts`.**

```ts
// inside the query builder
.where(
  and(
    eq(plan.tenantId, query.tenantId),
    isNull(plan.deletedAt),
    or(
      isNull(plan.ownerActorId),
      eq(plan.ownerActorId, query.actorId),
    ),
    // existing member-check condition goes alongside via exists()
  )
)
```

(If the handler uses raw SQL instead of Drizzle query builder, thread the equivalent clause in.)

- [ ] **Step 4: Integration test against real Postgres.**

Create `list-plans.handler.integration.spec.ts` if one doesn't exist — seed two actors, run the handler as each, assert the isolation described in Step 1.

Run: `bun run test:integration`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/api/src/modules/planner/application/queries/plans/
git commit -m "fix(planner): listPlans filters out other actors' personal plans"
```

---

## Task 13 — `tenantLocalDate` helper

**Files:**

- Create: `apps/api/src/modules/planner/application/lib/tz.ts`
- Create: `apps/api/src/modules/planner/application/lib/tz.spec.ts`

- [ ] **Step 1: Install `date-fns-tz` in the api workspace.**

```bash
bun add -F api date-fns-tz
```

- [ ] **Step 2: Write the tests first.**

```ts
// tz.spec.ts
import { tenantLocalDate } from './tz'

describe('tenantLocalDate', () => {
  it('returns a YYYY-MM-DD string in Asia/Ho_Chi_Minh (UTC+7, no DST)', () => {
    const ts = new Date('2026-04-20T20:00:00Z') // 03:00 next day in ICT
    expect(tenantLocalDate(ts, 'Asia/Ho_Chi_Minh')).toBe('2026-04-21')
  })

  it('handles DST spring-forward in America/New_York', () => {
    // 2026-03-08 06:00 UTC = 02:00 EDT (after spring-forward — "2am" skipped locally)
    const ts = new Date('2026-03-08T06:00:00Z')
    expect(tenantLocalDate(ts, 'America/New_York')).toBe('2026-03-08')
  })

  it('handles a pre-midnight moment crossing day boundary', () => {
    const ts = new Date('2026-04-20T16:59:59Z')
    expect(tenantLocalDate(ts, 'Asia/Ho_Chi_Minh')).toBe('2026-04-20')
    const after = new Date('2026-04-20T17:00:00Z')
    expect(tenantLocalDate(after, 'Asia/Ho_Chi_Minh')).toBe('2026-04-21')
  })

  it('throws on invalid IANA zones', () => {
    expect(() => tenantLocalDate(new Date(), 'Mars/Olympus_Mons')).toThrow()
  })
})
```

- [ ] **Step 3: Run — expect failure.**

Expected: FAIL — file does not exist.

- [ ] **Step 4: Implement.**

```ts
// tz.ts
import { formatInTimeZone } from 'date-fns-tz'

export function tenantLocalDate(ts: Date, timezone: string): string {
  // formatInTimeZone throws on invalid zones
  return formatInTimeZone(ts, timezone, 'yyyy-MM-dd')
}
```

- [ ] **Step 5: Run — expect pass.**

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add apps/api/src/modules/planner/application/lib/ package.json bun.lock
git commit -m "feat(planner): tenantLocalDate tz helper"
```

---

## Task 14 — `NavGroup` refactored to strict union; `SidebarRenderer` updated

**Files:**

- Modify: `packages/app-layout/src/types.ts`
- Modify: `packages/app-layout/src/types.spec.ts`
- Modify: `packages/app-layout/src/sidebar/sidebar-renderer.tsx`
- Modify: `packages/app-layout/src/sidebar/sidebar-renderer.spec.tsx`

- [ ] **Step 1: Refactor `NavGroup`.**

```ts
// types.ts — replace the existing NavGroup with this union
export type NavGroupStatic = {
  label?: string
  items: NavItem[]
}

export type NavGroupDynamic = {
  label?: string
  render: () => React.ReactElement
}

export type NavGroup = NavGroupStatic | NavGroupDynamic
```

Remove the old interface. Update any internal re-exports accordingly.

- [ ] **Step 2: Type-level test — TS rejects mixing items + render.**

```ts
// types.spec.ts — type-only test (uses ts-expect-error)
// @ts-expect-error — a group cannot have both `items` and `render`
const invalid: NavGroup = { items: [], render: () => <></> }
```

Run: `bun run typecheck --filter @future/app-layout`
Expected: no errors (the `@ts-expect-error` must be required — if it's not, the TS union isn't strict enough).

- [ ] **Step 3: Write failing test for dynamic group rendering.**

```tsx
// sidebar-renderer.spec.tsx — append
it('renders dynamic group content via NavGroup.render', () => {
  const groups: NavGroup[] = [
    { label: 'Dynamic', render: () => <div data-testid="dynamic">hi</div> },
  ]
  render(
    <PermissionContext.Provider value={{ permissions: new Set(), isLoading: false }}>
      <SidebarProvider>
        <SidebarRenderer groups={groups} />
      </SidebarProvider>
    </PermissionContext.Provider>,
  )
  expect(screen.getByTestId('dynamic')).toBeInTheDocument()
})
```

- [ ] **Step 4: Run — expect failure.**

Expected: FAIL — renderer only handles `items`.

- [ ] **Step 5: Update `SidebarRenderer`.**

```tsx
// sidebar-renderer.tsx — inside the map over groups
function SidebarNavGroup({ group }: { group: NavGroup }) {
  if ('render' in group) {
    return (
      <SidebarGroup>
        {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
        <SidebarGroupContent>{group.render()}</SidebarGroupContent>
      </SidebarGroup>
    )
  }
  // existing static-items path below
  const visibleItems = useFilteredItems(group.items)
  if (visibleItems.length === 0) return null
  return (
    <SidebarGroup>
      {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {visibleItems.map((item) => (
            <SidebarNavItem key={item.href} item={item} />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
```

Note: the conditional hook-call on `useFilteredItems` is the reason the branches split cleanly — React hooks cannot conditionally call `useFilteredItems`. Either branch runs all its hooks top-to-bottom.

- [ ] **Step 6: Run the test — expect pass.**

Expected: PASS.

- [ ] **Step 7: Verify no non-planner zone regresses.**

Run: `bun run --filter "apps/web-*" typecheck`
Expected: no errors. The 10 non-planner zones should continue to work — their configs use `items`, which is still valid per the union.

- [ ] **Step 8: Commit.**

```bash
git add packages/app-layout/
git commit -m "feat(app-layout): NavGroup strict-union refactor with render branch"
```

---

## Task 15 — `web-admin`: tenant timezone select

**Files:**

- Modify: `apps/web-admin/src/app/(tenant)/settings/tenant/page.tsx`
- Create: `apps/web-admin/src/app/(tenant)/settings/tenant/timezone-form.tsx`
- Create: `apps/web-admin/src/app/(tenant)/settings/tenant/timezone-form.spec.tsx`
- Create: `apps/web-admin/src/lib/iana-timezones.ts`

If the path `app/(tenant)/settings/tenant/page.tsx` does not exist exactly, locate the tenant-settings page via `grep -r "Tenant Settings" apps/web-admin/src` and use that path. Do not create a parallel settings page.

- [ ] **Step 1: Create the IANA zone list.**

```ts
// iana-timezones.ts — curated list
export const COMMON_IANA_TIMEZONES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'Asia/Ho_Chi_Minh', label: 'Ho Chi Minh City (UTC+7)' },
  { value: 'Asia/Bangkok', label: 'Bangkok (UTC+7)' },
  { value: 'Asia/Singapore', label: 'Singapore (UTC+8)' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong (UTC+8)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (UTC+9)' },
  { value: 'Asia/Seoul', label: 'Seoul (UTC+9)' },
  { value: 'Asia/Kolkata', label: 'Mumbai/Kolkata (UTC+5:30)' },
  { value: 'Asia/Dubai', label: 'Dubai (UTC+4)' },
  { value: 'Europe/London', label: 'London (UTC+0 / DST)' },
  { value: 'Europe/Paris', label: 'Paris (UTC+1 / DST)' },
  { value: 'Europe/Berlin', label: 'Berlin (UTC+1 / DST)' },
  { value: 'Europe/Moscow', label: 'Moscow (UTC+3)' },
  { value: 'America/New_York', label: 'New York (UTC-5 / DST)' },
  { value: 'America/Chicago', label: 'Chicago (UTC-6 / DST)' },
  { value: 'America/Denver', label: 'Denver (UTC-7 / DST)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (UTC-8 / DST)' },
  { value: 'America/Sao_Paulo', label: 'São Paulo (UTC-3)' },
  { value: 'Australia/Sydney', label: 'Sydney (UTC+10 / DST)' },
  { value: 'Pacific/Auckland', label: 'Auckland (UTC+12 / DST)' },
  { value: 'UTC', label: 'UTC' },
]
```

- [ ] **Step 2: Write the form test.**

```tsx
// timezone-form.spec.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TimezoneForm } from './timezone-form'

describe('TimezoneForm', () => {
  it('renders the current timezone as selected', () => {
    render(<TimezoneForm initial="Asia/Ho_Chi_Minh" onSave={jest.fn()} />)
    expect(screen.getByRole('combobox')).toHaveTextContent(/Ho Chi Minh/)
  })

  it('calls onSave with the chosen IANA value', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined)
    render(<TimezoneForm initial="Asia/Ho_Chi_Minh" onSave={onSave} />)
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(screen.getByText(/New York/))
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('America/New_York'))
  })
})
```

- [ ] **Step 3: Run — expect failure.**

Expected: FAIL.

- [ ] **Step 4: Implement `TimezoneForm`.**

```tsx
// timezone-form.tsx
'use client'
import { useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Button,
  Spinner,
} from '@future/ui'
import { COMMON_IANA_TIMEZONES } from '@/lib/iana-timezones'

export interface TimezoneFormProps {
  initial: string
  onSave: (timezone: string) => Promise<void>
}

export function TimezoneForm({ initial, onSave }: TimezoneFormProps) {
  const [value, setValue] = useState(initial)
  const [pending, setPending] = useState(false)
  const dirty = value !== initial

  async function submit() {
    setPending(true)
    try {
      await onSave(value)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger className="w-80">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {COMMON_IANA_TIMEZONES.map((z) => (
            <SelectItem key={z.value} value={z.value}>
              {z.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button onClick={submit} disabled={!dirty || pending}>
        {pending && <Spinner className="size-4" />}
        Save
      </Button>
    </div>
  )
}
```

- [ ] **Step 5: Wire the form into the settings page via React Query.**

```tsx
// in page.tsx — within the existing settings layout
import { trpc } from '@/lib/trpc'
import { TimezoneForm } from './timezone-form'

export default function TenantSettingsPage() {
  const tz = trpc.admin.getTenantTimezone.useQuery()
  const update = trpc.admin.updateTimezone.useMutation({
    onSuccess: () => tz.refetch(),
  })
  if (!tz.data) return null
  return (
    <section>
      <h2 className="text-lg font-semibold">Timezone</h2>
      <p className="text-sm text-muted-foreground">All My-Day date math uses this timezone.</p>
      <TimezoneForm
        initial={tz.data.timezone}
        onSave={async (timezone) => {
          await update.mutateAsync({ timezone })
        }}
      />
    </section>
  )
}
```

- [ ] **Step 6: Run tests — expect pass.**

Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add apps/web-admin/
git commit -m "feat(web-admin): tenant timezone select form"
```

---

## Task 16 — End-to-end typecheck + unit-suite + integration pass

- [ ] **Step 1: Run full typecheck.**

Run: `bun run typecheck`
Expected: no errors anywhere in the monorepo.

- [ ] **Step 2: Run full unit suite.**

First ensure workspace packages are built:

```bash
bun run --filter "@future/*" build
```

Then:

```bash
bun run test:unit
```

Expected: PASS. Coverage report shows ≥70% for the changed files.

- [ ] **Step 3: Run integration suite (real Postgres).**

```bash
bun run db:up
bun run db:migrate
bun run test:integration
```

Expected: PASS, including the `list-plans.handler.integration.spec.ts` leak-prevention test added in Task 12.

- [ ] **Step 4: Flag stays OFF — no release flip.**

Do **not** flip `planner_personal_enabled` to true for any tenant in this plan. Plan 3.2 is responsible for the flip.

- [ ] **Step 5: Final commit if anything housekeeping changed.**

```bash
git status
# if clean, no commit needed
# otherwise:
git commit -am "chore: typecheck + coverage housekeeping for Plan 3.1"
```

- [ ] **Step 6: Open PR.**

Title: `feat(planner): Plan 3.1 — Personal Hubs foundation`

Body: link to spec, summary of what landed (schema, facades, commands, tz helper, NavGroup refactor, admin timezone UI), note that `planner.personal.enabled` stays off — no user-visible change.

---

## Self-review checklist before requesting PR review

- [ ] Every file in the File Map has been touched (created/modified per plan).
- [ ] TDD order preserved — failing test, then implementation, for every piece of new logic.
- [ ] Coverage ≥70% on every changed file (Vitest summary output).
- [ ] No `__tests__/` directory created anywhere.
- [ ] No `.js` extension on any relative import.
- [ ] No manual edits to `package.json` / `bun.lock` — only `bun add -F` commands.
- [ ] Migration applies cleanly from a fresh `db:up`.
- [ ] Admin timezone update roundtrips through the UI (local smoke: set to `Europe/London`, refresh, see it persisted).
- [ ] All 10 non-planner zones still typecheck (no regression from `NavGroup` refactor).
- [ ] Leak-prevention integration test ships with the PR.
