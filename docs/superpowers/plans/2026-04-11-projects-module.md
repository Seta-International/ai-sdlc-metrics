# Projects Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Projects module — accounts, projects, demand-based project roles, hours-per-day allocations, and capacity reporting — following the same hexagonal DDD pattern as People and Kernel.

**Architecture:** The Projects module owns the `projects` PostgreSQL schema. It reads from People via `PeopleQueryFacade` and from Time via `TimeQueryFacade` (for leave/capacity). It receives events from People (`OffboardingStartedEvent`, `EmployeeTerminatedEvent`) and emits its own events (`StaffingRequestCreatedEvent`, `AllocationConfirmedEvent`). The module follows hexagonal layout: `domain/` → `application/` → `infrastructure/` → `interface/trpc/`.

**Tech Stack:** NestJS 11, @nestjs/cqrs, Drizzle ORM on PostgreSQL 16, tRPC v11, Zod v4, vitest, uuidv7

**Spec:** `docs/superpowers/specs/2026-04-11-people-projects-design.md` (Projects section)

**Prerequisite:** People module (plan: `docs/superpowers/plans/2026-04-11-people-module.md`) must be implemented first. The Projects module depends on `PeopleQueryFacade` and People event contracts.

---

## File Map

### Domain Layer (`apps/api/src/modules/projects/domain/`)

| File                                           | Responsibility                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------ |
| `entities/account.entity.ts`                   | `Account` interface + `BillingModel`, `AccountStatus` types                    |
| `entities/project.entity.ts`                   | `Project` interface + `DeliveryModel`, `ProjectStatus` types                   |
| `entities/project-role.entity.ts`              | `ProjectRole` interface + `ProjectRoleStatus` type                             |
| `entities/allocation.entity.ts`                | `Allocation` interface + `BillingType`, `MemberType`, `AllocationStatus` types |
| `exceptions/projects.exceptions.ts`            | All domain exceptions for the Projects module                                  |
| `repositories/account.repository.port.ts`      | `IAccountRepository` port                                                      |
| `repositories/project.repository.port.ts`      | `IProjectRepository` port                                                      |
| `repositories/project-role.repository.port.ts` | `IProjectRoleRepository` port                                                  |
| `repositories/allocation.repository.port.ts`   | `IAllocationRepository` port                                                   |

### Application Layer (`apps/api/src/modules/projects/application/`)

| File                                                    | Responsibility                                 |
| ------------------------------------------------------- | ---------------------------------------------- |
| `commands/create-account.command.ts`                    | Command DTO                                    |
| `commands/create-account.handler.ts`                    | Handler                                        |
| `commands/create-account.handler.spec.ts`               | Unit test                                      |
| `commands/create-project.command.ts`                    | Command DTO                                    |
| `commands/create-project.handler.ts`                    | Handler — validates account exists             |
| `commands/create-project.handler.spec.ts`               | Unit test                                      |
| `commands/create-project-role.command.ts`               | Command DTO                                    |
| `commands/create-project-role.handler.ts`               | Handler — creates demand slot                  |
| `commands/create-project-role.handler.spec.ts`          | Unit test                                      |
| `commands/create-allocation.command.ts`                 | Command DTO                                    |
| `commands/create-allocation.handler.ts`                 | Handler — nullable actor_id, tentative default |
| `commands/create-allocation.handler.spec.ts`            | Unit test                                      |
| `commands/confirm-allocation.command.ts`                | Command DTO                                    |
| `commands/confirm-allocation.handler.ts`                | Handler — tentative → confirmed                |
| `commands/confirm-allocation.handler.spec.ts`           | Unit test                                      |
| `commands/close-allocation.command.ts`                  | Command DTO                                    |
| `commands/close-allocation.handler.ts`                  | Handler — sets ended_at                        |
| `commands/close-allocation.handler.spec.ts`             | Unit test                                      |
| `queries/get-account.query.ts`                          | Query DTO                                      |
| `queries/get-account.handler.ts`                        | Returns account + projects summary             |
| `queries/list-accounts.query.ts`                        | Query DTO                                      |
| `queries/list-accounts.handler.ts`                      | Paginated account list                         |
| `queries/get-staffing-overview.query.ts`                | Query DTO                                      |
| `queries/get-staffing-overview.handler.ts`              | Company-wide utilization table                 |
| `queries/get-person-allocations.query.ts`               | Query DTO                                      |
| `queries/get-person-allocations.handler.ts`             | All allocations for one actor                  |
| `queries/get-capacity-report.query.ts`                  | Query DTO                                      |
| `queries/get-capacity-report.handler.ts`                | Bench + over-allocated + available             |
| `facades/projects-query.facade.ts`                      | Cross-module read API                          |
| `event-handlers/on-offboarding-started.handler.ts`      | Flags allocations as tentative                 |
| `event-handlers/on-offboarding-started.handler.spec.ts` | Unit test                                      |
| `event-handlers/on-employee-terminated.handler.ts`      | Closes allocations, reopens roles              |
| `event-handlers/on-employee-terminated.handler.spec.ts` | Unit test                                      |

### Infrastructure Layer (`apps/api/src/modules/projects/infrastructure/`)

| File                                                             | Responsibility                                      |
| ---------------------------------------------------------------- | --------------------------------------------------- |
| `schema/projects.schema.ts`                                      | All Drizzle table definitions for `projects` schema |
| `schema/index.ts`                                                | Re-exports all schema symbols                       |
| `repositories/drizzle-account.repository.ts`                     | Drizzle implementation                              |
| `repositories/drizzle-project.repository.ts`                     | Drizzle implementation                              |
| `repositories/drizzle-project-role.repository.ts`                | Drizzle implementation                              |
| `repositories/drizzle-allocation.repository.ts`                  | Drizzle implementation                              |
| `repositories/drizzle-allocation.repository.integration.spec.ts` | Integration test                                    |

### Interface Layer (`apps/api/src/modules/projects/interface/trpc/`)

| File                 | Responsibility                           |
| -------------------- | ---------------------------------------- |
| `projects.router.ts` | tRPC router with all Projects procedures |

### Event Contracts (`packages/event-contracts/src/projects/`)

| File                                | Responsibility |
| ----------------------------------- | -------------- |
| `staffing-request-created.event.ts` | New event      |
| `allocation-confirmed.event.ts`     | New event      |

---

## Task 1: Projects Schema — Drizzle Table Definitions

**Files:**

- Modify: `apps/api/src/modules/projects/infrastructure/schema/projects.schema.ts`
- Create: `apps/api/src/modules/projects/infrastructure/schema/index.ts`

- [ ] **Step 1: Write the Drizzle schema file**

Replace the placeholder in `projects.schema.ts`:

```typescript
import { pgSchema, uuid, text, timestamp, integer, jsonb, numeric } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const projectsSchema = pgSchema('projects')

// --- Account ---

export const account = projectsSchema.table('account', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  clientCompany: text('client_company'),
  description: text('description'),
  domain: text('domain'),
  location: text('location'),
  timezone: text('timezone'),
  billingModel: text('billing_model', {
    enum: ['fixed_price', 't_and_m', 'dedicated', 'retainer'],
  }),
  status: text('status', {
    enum: ['active', 'on_hold', 'closed'],
  })
    .notNull()
    .default('active'),
  accountManagerId: uuid('account_manager_id'),
  startedAt: timestamp('started_at'),
  endedAt: timestamp('ended_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// --- Project ---

export const project = projectsSchema.table('project', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  accountId: uuid('account_id').notNull(),
  name: text('name').notNull(),
  code: text('code'),
  description: text('description'),
  deliveryModel: text('delivery_model', {
    enum: ['scrum', 'kanban', 'waterfall', 'other'],
  }),
  status: text('status', {
    enum: ['active', 'on_hold', 'closed', 'tentative'],
  })
    .notNull()
    .default('active'),
  startedAt: timestamp('started_at'),
  endedAt: timestamp('ended_at'),
  tags: jsonb('tags'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// --- Project Role (demand slot) ---

export const projectRole = projectsSchema.table('project_role', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  projectId: uuid('project_id').notNull(),
  roleName: text('role_name').notNull(),
  skillsRequired: text('skills_required').array(),
  headcount: integer('headcount').notNull().default(1),
  status: text('status', {
    enum: ['open', 'filled', 'cancelled'],
  })
    .notNull()
    .default('open'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// --- Allocation (supply — hours-per-day, not percentage) ---

export const allocation = projectsSchema.table('allocation', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  projectId: uuid('project_id').notNull(),
  projectRoleId: uuid('project_role_id').notNull(),
  actorId: uuid('actor_id'), // nullable = placeholder
  position: text('position'),
  hoursPerDay: numeric('hours_per_day', { precision: 4, scale: 2 }).notNull(),
  billingType: text('billing_type', {
    enum: ['billable', 'non_billable'],
  }).notNull(),
  memberType: text('member_type', {
    enum: ['core', 'shadow', 'backfill'],
  })
    .notNull()
    .default('core'),
  status: text('status', {
    enum: ['tentative', 'confirmed'],
  })
    .notNull()
    .default('tentative'),
  startedAt: timestamp('started_at').notNull(),
  endedAt: timestamp('ended_at'),
  note: text('note'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
```

- [ ] **Step 2: Create the schema index file**

Create `apps/api/src/modules/projects/infrastructure/schema/index.ts`:

```typescript
export { projectsSchema, account, project, projectRole, allocation } from './projects.schema'
```

- [ ] **Step 3: Run typecheck**

Run: `cd apps/api && bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/projects/infrastructure/schema/
git commit -m "feat(projects): add all Drizzle table definitions for projects schema"
```

---

## Task 2: Database Migration — Projects Schema DDL + RLS

**Files:**

- Create: `packages/db/drizzle/migrations/0004_projects_schema.sql`

- [ ] **Step 1: Generate the migration**

```bash
cd packages/db && bunx drizzle-kit generate
```

- [ ] **Step 2: Add RLS policies**

Append to the generated migration:

```sql
ALTER TABLE "projects"."account" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "projects"."account"
  USING ("tenant_id" = current_setting('app.tenant_id')::uuid);

ALTER TABLE "projects"."project" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "projects"."project"
  USING ("tenant_id" = current_setting('app.tenant_id')::uuid);

ALTER TABLE "projects"."project_role" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "projects"."project_role"
  USING ("tenant_id" = current_setting('app.tenant_id')::uuid);

ALTER TABLE "projects"."allocation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "projects"."allocation"
  USING ("tenant_id" = current_setting('app.tenant_id')::uuid);
```

- [ ] **Step 3: Run the migration**

```bash
cd packages/db && bunx drizzle-kit migrate
```

- [ ] **Step 4: Commit**

```bash
git add packages/db/drizzle/
git commit -m "feat(projects): add projects schema DDL migration with RLS policies"
```

---

## Task 3: Test Helpers — Seed Functions for Projects

**Files:**

- Modify: `packages/db/src/test-helpers/index.ts`

- [ ] **Step 1: Add projects seed helpers**

```typescript
export async function truncateProjectsSchema(db: Db): Promise<void> {
  await db.execute(
    sql`TRUNCATE
      projects.allocation,
      projects.project_role,
      projects.project,
      projects.account
    RESTART IDENTITY CASCADE`,
  )
}

export async function seedAccount(
  db: Db,
  overrides: Partial<{
    id: string
    tenantId: string
    name: string
    clientCompany: string
    status: string
  }> = {},
): Promise<{ id: string; tenantId: string }> {
  const id = overrides.id ?? uuidv7()
  const tenantId = overrides.tenantId ?? uuidv7()
  const name = overrides.name ?? `Test Account ${id.slice(0, 8)}`
  const clientCompany = overrides.clientCompany ?? 'Test Client'
  const status = overrides.status ?? 'active'

  await db.execute(
    sql`INSERT INTO projects.account
        (id, tenant_id, name, client_company, status, created_at, updated_at)
        VALUES (${id}, ${tenantId}, ${name}, ${clientCompany}, ${status}, NOW(), NOW())`,
  )

  return { id, tenantId }
}

export async function seedProject(
  db: Db,
  overrides: Partial<{
    id: string
    tenantId: string
    accountId: string
    name: string
    code: string
    status: string
  }> = {},
): Promise<{ id: string; tenantId: string; accountId: string }> {
  const id = overrides.id ?? uuidv7()
  const tenantId = overrides.tenantId ?? uuidv7()
  const accountId = overrides.accountId ?? uuidv7()
  const name = overrides.name ?? `Test Project ${id.slice(0, 8)}`
  const code = overrides.code ?? `PRJ-${id.slice(0, 4)}`
  const status = overrides.status ?? 'active'

  await db.execute(
    sql`INSERT INTO projects.project
        (id, tenant_id, account_id, name, code, status, created_at, updated_at)
        VALUES (${id}, ${tenantId}, ${accountId}, ${name}, ${code}, ${status}, NOW(), NOW())`,
  )

  return { id, tenantId, accountId }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/db/src/test-helpers/index.ts
git commit -m "feat(projects): add seedAccount, seedProject and truncateProjectsSchema test helpers"
```

---

## Task 4: Domain Entities + Exceptions

**Files:**

- Create: `apps/api/src/modules/projects/domain/entities/account.entity.ts`
- Create: `apps/api/src/modules/projects/domain/entities/project.entity.ts`
- Create: `apps/api/src/modules/projects/domain/entities/project-role.entity.ts`
- Create: `apps/api/src/modules/projects/domain/entities/allocation.entity.ts`
- Create: `apps/api/src/modules/projects/domain/exceptions/projects.exceptions.ts`

- [ ] **Step 1: Create all entity files**

```typescript
// account.entity.ts
export type BillingModel = 'fixed_price' | 't_and_m' | 'dedicated' | 'retainer'
export type AccountStatus = 'active' | 'on_hold' | 'closed'

export interface Account {
  id: string
  tenantId: string
  name: string
  clientCompany: string | null
  description: string | null
  domain: string | null
  location: string | null
  timezone: string | null
  billingModel: BillingModel | null
  status: AccountStatus
  accountManagerId: string | null
  startedAt: Date | null
  endedAt: Date | null
  createdAt: Date
  updatedAt: Date
}
```

```typescript
// project.entity.ts
export type DeliveryModel = 'scrum' | 'kanban' | 'waterfall' | 'other'
export type ProjectStatus = 'active' | 'on_hold' | 'closed' | 'tentative'

export interface Project {
  id: string
  tenantId: string
  accountId: string
  name: string
  code: string | null
  description: string | null
  deliveryModel: DeliveryModel | null
  status: ProjectStatus
  startedAt: Date | null
  endedAt: Date | null
  tags: unknown
  createdAt: Date
  updatedAt: Date
}
```

```typescript
// project-role.entity.ts
export type ProjectRoleStatus = 'open' | 'filled' | 'cancelled'

export interface ProjectRole {
  id: string
  tenantId: string
  projectId: string
  roleName: string
  skillsRequired: string[] | null
  headcount: number
  status: ProjectRoleStatus
  createdAt: Date
}
```

```typescript
// allocation.entity.ts
export type BillingType = 'billable' | 'non_billable'
export type MemberType = 'core' | 'shadow' | 'backfill'
export type AllocationStatus = 'tentative' | 'confirmed'

export interface Allocation {
  id: string
  tenantId: string
  projectId: string
  projectRoleId: string
  actorId: string | null
  position: string | null
  hoursPerDay: string // numeric comes back as string from PG
  billingType: BillingType
  memberType: MemberType
  status: AllocationStatus
  startedAt: Date
  endedAt: Date | null
  note: string | null
  createdAt: Date
  updatedAt: Date
}
```

- [ ] **Step 2: Create domain exceptions**

```typescript
// projects.exceptions.ts
import { DomainException } from '../../../kernel/domain/exceptions/domain.exception'

export class AccountNotFoundException extends DomainException {
  readonly code = 'ACCOUNT_NOT_FOUND'
  constructor(id: string) {
    super(`Account not found: ${id}`)
  }
}

export class ProjectNotFoundException extends DomainException {
  readonly code = 'PROJECT_NOT_FOUND'
  constructor(id: string) {
    super(`Project not found: ${id}`)
  }
}

export class ProjectRoleNotFoundException extends DomainException {
  readonly code = 'PROJECT_ROLE_NOT_FOUND'
  constructor(id: string) {
    super(`Project role not found: ${id}`)
  }
}

export class AllocationNotFoundException extends DomainException {
  readonly code = 'ALLOCATION_NOT_FOUND'
  constructor(id: string) {
    super(`Allocation not found: ${id}`)
  }
}

export class AllocationAlreadyConfirmedException extends DomainException {
  readonly code = 'ALLOCATION_ALREADY_CONFIRMED'
  constructor(id: string) {
    super(`Allocation is already confirmed: ${id}`)
  }
}
```

- [ ] **Step 3: Remove .gitkeep files and commit**

```bash
rm apps/api/src/modules/projects/domain/entities/.gitkeep
rm apps/api/src/modules/projects/domain/repositories/.gitkeep
rm apps/api/src/modules/projects/domain/value-objects/.gitkeep
git add apps/api/src/modules/projects/domain/
git commit -m "feat(projects): add domain entities and exceptions"
```

---

## Task 5: Repository Ports

**Files:**

- Create: `apps/api/src/modules/projects/domain/repositories/account.repository.port.ts`
- Create: `apps/api/src/modules/projects/domain/repositories/project.repository.port.ts`
- Create: `apps/api/src/modules/projects/domain/repositories/project-role.repository.port.ts`
- Create: `apps/api/src/modules/projects/domain/repositories/allocation.repository.port.ts`

- [ ] **Step 1: Create all repository ports**

```typescript
// account.repository.port.ts
import type { Account, BillingModel, AccountStatus } from '../entities/account.entity'

export const ACCOUNT_REPOSITORY = Symbol('IAccountRepository')

export interface IAccountRepository {
  findById(id: string, tenantId: string): Promise<Account | null>
  insert(data: {
    tenantId: string
    name: string
    clientCompany: string | null
    description: string | null
    domain: string | null
    location: string | null
    timezone: string | null
    billingModel: BillingModel | null
    accountManagerId: string | null
    startedAt: Date | null
  }): Promise<Account>
  update(id: string, tenantId: string, data: Partial<Account>): Promise<void>
  list(tenantId: string, options: { limit: number; offset: number }): Promise<Account[]>
  count(tenantId: string): Promise<number>
}
```

```typescript
// project.repository.port.ts
import type { Project, DeliveryModel } from '../entities/project.entity'

export const PROJECT_REPOSITORY = Symbol('IProjectRepository')

export interface IProjectRepository {
  findById(id: string, tenantId: string): Promise<Project | null>
  findByAccountId(accountId: string, tenantId: string): Promise<Project[]>
  insert(data: {
    tenantId: string
    accountId: string
    name: string
    code: string | null
    description: string | null
    deliveryModel: DeliveryModel | null
    startedAt: Date | null
    tags: unknown
  }): Promise<Project>
  update(id: string, tenantId: string, data: Partial<Project>): Promise<void>
  list(
    tenantId: string,
    options: { limit: number; offset: number; accountId?: string },
  ): Promise<Project[]>
}
```

```typescript
// project-role.repository.port.ts
import type { ProjectRole, ProjectRoleStatus } from '../entities/project-role.entity'

export const PROJECT_ROLE_REPOSITORY = Symbol('IProjectRoleRepository')

export interface IProjectRoleRepository {
  findById(id: string, tenantId: string): Promise<ProjectRole | null>
  findByProjectId(projectId: string, tenantId: string): Promise<ProjectRole[]>
  insert(data: {
    tenantId: string
    projectId: string
    roleName: string
    skillsRequired: string[] | null
    headcount: number
  }): Promise<ProjectRole>
  updateStatus(id: string, tenantId: string, status: ProjectRoleStatus): Promise<void>
}
```

```typescript
// allocation.repository.port.ts
import type {
  Allocation,
  BillingType,
  MemberType,
  AllocationStatus,
} from '../entities/allocation.entity'

export const ALLOCATION_REPOSITORY = Symbol('IAllocationRepository')

export interface IAllocationRepository {
  findById(id: string, tenantId: string): Promise<Allocation | null>
  findByActorId(actorId: string, tenantId: string): Promise<Allocation[]>
  findConfirmedByActorId(actorId: string, tenantId: string): Promise<Allocation[]>
  findByProjectRoleId(projectRoleId: string, tenantId: string): Promise<Allocation[]>
  insert(data: {
    tenantId: string
    projectId: string
    projectRoleId: string
    actorId: string | null
    position: string | null
    hoursPerDay: string
    billingType: BillingType
    memberType: MemberType
    startedAt: Date
    endedAt: Date | null
    note: string | null
  }): Promise<Allocation>
  updateStatus(id: string, tenantId: string, status: AllocationStatus): Promise<void>
  close(id: string, tenantId: string, endedAt: Date): Promise<void>
  closeAllForActor(actorId: string, tenantId: string, endedAt: Date): Promise<void>
  flagTentativeForActor(actorId: string, tenantId: string): Promise<void>
  sumConfirmedHoursPerDay(actorId: string, tenantId: string): Promise<number>
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/projects/domain/repositories/
git commit -m "feat(projects): add repository ports for all domain entities"
```

---

## Task 6: Event Contracts — Projects Events

**Files:**

- Create: `packages/event-contracts/src/projects/staffing-request-created.event.ts`
- Create: `packages/event-contracts/src/projects/allocation-confirmed.event.ts`
- Modify: `packages/event-contracts/src/index.ts`

- [ ] **Step 1: Create event contracts**

```typescript
// staffing-request-created.event.ts
export class StaffingRequestCreatedEvent {
  static readonly eventName = 'projects.staffing-request-created'
  constructor(
    public readonly tenantId: string,
    public readonly projectRoleId: string,
    public readonly projectId: string,
    public readonly roleName: string,
    public readonly skillsRequired: string[],
  ) {}
}
```

```typescript
// allocation-confirmed.event.ts
export class AllocationConfirmedEvent {
  static readonly eventName = 'projects.allocation-confirmed'
  constructor(
    public readonly tenantId: string,
    public readonly allocationId: string,
    public readonly actorId: string,
    public readonly projectId: string,
    public readonly hoursPerDay: number,
  ) {}
}
```

- [ ] **Step 2: Add exports to index.ts**

```typescript
export { StaffingRequestCreatedEvent } from './projects/staffing-request-created.event'
export { AllocationConfirmedEvent } from './projects/allocation-confirmed.event'
```

- [ ] **Step 3: Commit**

```bash
git add packages/event-contracts/
git commit -m "feat(event-contracts): add StaffingRequestCreated and AllocationConfirmed events"
```

---

## Task 7: Drizzle Repositories — All Four

**Files:**

- Create: `apps/api/src/modules/projects/infrastructure/repositories/drizzle-account.repository.ts`
- Create: `apps/api/src/modules/projects/infrastructure/repositories/drizzle-project.repository.ts`
- Create: `apps/api/src/modules/projects/infrastructure/repositories/drizzle-project-role.repository.ts`
- Create: `apps/api/src/modules/projects/infrastructure/repositories/drizzle-allocation.repository.ts`
- Create: `apps/api/src/modules/projects/infrastructure/repositories/drizzle-allocation.repository.integration.spec.ts`

- [ ] **Step 1: Implement all four repositories**

Follow the kernel's `DrizzleActorRepository` pattern: inject `DB_TOKEN`, use Drizzle query builder, filter by `tenantId` on every query.

Key implementation details for `DrizzleAllocationRepository`:

```typescript
// Key methods in drizzle-allocation.repository.ts

async closeAllForActor(actorId: string, tenantId: string, endedAt: Date): Promise<void> {
  await this.db
    .update(allocation)
    .set({ endedAt, updatedAt: new Date() })
    .where(
      and(
        eq(allocation.actorId, actorId),
        eq(allocation.tenantId, tenantId),
        isNull(allocation.endedAt),
      ),
    )
}

async flagTentativeForActor(actorId: string, tenantId: string): Promise<void> {
  await this.db
    .update(allocation)
    .set({ status: 'tentative', updatedAt: new Date() })
    .where(
      and(
        eq(allocation.actorId, actorId),
        eq(allocation.tenantId, tenantId),
        eq(allocation.status, 'confirmed'),
        isNull(allocation.endedAt),
      ),
    )
}

async sumConfirmedHoursPerDay(actorId: string, tenantId: string): Promise<number> {
  const result = await this.db
    .select({ total: sql<number>`COALESCE(SUM(${allocation.hoursPerDay}::numeric), 0)` })
    .from(allocation)
    .where(
      and(
        eq(allocation.actorId, actorId),
        eq(allocation.tenantId, tenantId),
        eq(allocation.status, 'confirmed'),
        isNull(allocation.endedAt),
      ),
    )
  return Number(result[0]?.total ?? 0)
}
```

- [ ] **Step 2: Write integration test for allocation**

Test: insert account → insert project → insert project_role → insert allocation → confirm → verify hours sum → close → verify ended_at set.

- [ ] **Step 3: Run integration tests**

Run: `cd apps/api && bun run test:integration`
Expected: all integration tests pass

- [ ] **Step 4: Commit**

```bash
rm apps/api/src/modules/projects/infrastructure/repositories/.gitkeep
git add apps/api/src/modules/projects/infrastructure/repositories/
git commit -m "feat(projects): add all Drizzle repository implementations with integration tests"
```

---

## Task 8: Command — CreateAllocation (TDD)

**Files:**

- Create: `apps/api/src/modules/projects/application/commands/create-allocation.command.ts`
- Create: `apps/api/src/modules/projects/application/commands/create-allocation.handler.spec.ts`
- Create: `apps/api/src/modules/projects/application/commands/create-allocation.handler.ts`

- [ ] **Step 1: Create the command DTO**

```typescript
// create-allocation.command.ts
import type { BillingType, MemberType } from '../../domain/entities/allocation.entity'

export class CreateAllocationCommand {
  constructor(
    readonly tenantId: string,
    readonly projectRoleId: string,
    readonly actorId: string | null,
    readonly position: string | null,
    readonly hoursPerDay: string,
    readonly billingType: BillingType,
    readonly memberType: MemberType,
    readonly startedAt: Date,
    readonly endedAt: Date | null,
    readonly note: string | null,
  ) {}
}
```

- [ ] **Step 2: Write the failing unit test**

```typescript
// create-allocation.handler.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateAllocationCommand } from './create-allocation.command'
import { CreateAllocationHandler } from './create-allocation.handler'
import { ProjectRoleNotFoundException } from '../../domain/exceptions/projects.exceptions'
import type { IProjectRoleRepository } from '../../domain/repositories/project-role.repository.port'
import type { IAllocationRepository } from '../../domain/repositories/allocation.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ROLE_ID = '01900000-0000-7000-8000-000000000010'
const PROJECT_ID = '01900000-0000-7000-8000-000000000020'
const ACTOR_ID = '01900000-0000-7000-8000-000000000030'
const ALLOC_ID = '01900000-0000-7000-8000-000000000040'

describe('CreateAllocationHandler', () => {
  let handler: CreateAllocationHandler
  let roleRepo: IProjectRoleRepository
  let allocRepo: IAllocationRepository

  beforeEach(() => {
    roleRepo = {
      findById: vi.fn(),
      findByProjectId: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
    }
    allocRepo = {
      findById: vi.fn(),
      findByActorId: vi.fn(),
      findConfirmedByActorId: vi.fn(),
      findByProjectRoleId: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      close: vi.fn(),
      closeAllForActor: vi.fn(),
      flagTentativeForActor: vi.fn(),
      sumConfirmedHoursPerDay: vi.fn(),
    }
    handler = new CreateAllocationHandler(roleRepo, allocRepo)
  })

  it('creates a tentative allocation for a valid project role', async () => {
    vi.mocked(roleRepo.findById).mockResolvedValue({
      id: ROLE_ID,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      roleName: 'Senior DevOps',
      skillsRequired: ['k8s'],
      headcount: 2,
      status: 'open',
      createdAt: new Date(),
    })
    vi.mocked(allocRepo.insert).mockResolvedValue({
      id: ALLOC_ID,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      projectRoleId: ROLE_ID,
      actorId: ACTOR_ID,
      position: 'Tech Lead',
      hoursPerDay: '6.00',
      billingType: 'billable',
      memberType: 'core',
      status: 'tentative',
      startedAt: new Date('2026-03-01'),
      endedAt: null,
      note: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const result = await handler.execute(
      new CreateAllocationCommand(
        TENANT_ID,
        ROLE_ID,
        ACTOR_ID,
        'Tech Lead',
        '6.00',
        'billable',
        'core',
        new Date('2026-03-01'),
        null,
        null,
      ),
    )

    expect(result).toBe(ALLOC_ID)
    expect(allocRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: ACTOR_ID,
        hoursPerDay: '6.00',
        status: undefined, // default tentative from schema
      }),
    )
  })

  it('allows placeholder allocation with null actorId', async () => {
    vi.mocked(roleRepo.findById).mockResolvedValue({
      id: ROLE_ID,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      roleName: 'BA',
      skillsRequired: null,
      headcount: 1,
      status: 'open',
      createdAt: new Date(),
    })
    vi.mocked(allocRepo.insert).mockResolvedValue({
      id: ALLOC_ID,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      projectRoleId: ROLE_ID,
      actorId: null,
      position: null,
      hoursPerDay: '8.00',
      billingType: 'billable',
      memberType: 'core',
      status: 'tentative',
      startedAt: new Date('2026-04-01'),
      endedAt: null,
      note: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const result = await handler.execute(
      new CreateAllocationCommand(
        TENANT_ID,
        ROLE_ID,
        null,
        null,
        '8.00',
        'billable',
        'core',
        new Date('2026-04-01'),
        null,
        null,
      ),
    )

    expect(result).toBe(ALLOC_ID)
    expect(allocRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: null,
      }),
    )
  })

  it('throws ProjectRoleNotFoundException when role does not exist', async () => {
    vi.mocked(roleRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(
        new CreateAllocationCommand(
          TENANT_ID,
          ROLE_ID,
          ACTOR_ID,
          null,
          '8.00',
          'billable',
          'core',
          new Date('2026-03-01'),
          null,
          null,
        ),
      ),
    ).rejects.toThrow(ProjectRoleNotFoundException)
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `cd apps/api && bun run test -- --testPathPattern create-allocation.handler.spec`
Expected: FAIL

- [ ] **Step 4: Write the handler**

```typescript
// create-allocation.handler.ts
import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { ProjectRoleNotFoundException } from '../../domain/exceptions/projects.exceptions'
import {
  PROJECT_ROLE_REPOSITORY,
  type IProjectRoleRepository,
} from '../../domain/repositories/project-role.repository.port'
import {
  ALLOCATION_REPOSITORY,
  type IAllocationRepository,
} from '../../domain/repositories/allocation.repository.port'
import { CreateAllocationCommand } from './create-allocation.command'

@CommandHandler(CreateAllocationCommand)
export class CreateAllocationHandler implements ICommandHandler<CreateAllocationCommand, string> {
  constructor(
    @Inject(PROJECT_ROLE_REPOSITORY) private readonly roleRepo: IProjectRoleRepository,
    @Inject(ALLOCATION_REPOSITORY) private readonly allocRepo: IAllocationRepository,
  ) {}

  async execute(command: CreateAllocationCommand): Promise<string> {
    const role = await this.roleRepo.findById(command.projectRoleId, command.tenantId)
    if (!role) {
      throw new ProjectRoleNotFoundException(command.projectRoleId)
    }

    const allocation = await this.allocRepo.insert({
      tenantId: command.tenantId,
      projectId: role.projectId,
      projectRoleId: command.projectRoleId,
      actorId: command.actorId,
      position: command.position,
      hoursPerDay: command.hoursPerDay,
      billingType: command.billingType,
      memberType: command.memberType,
      startedAt: command.startedAt,
      endedAt: command.endedAt,
      note: command.note,
    })

    return allocation.id
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/api && bun run test -- --testPathPattern create-allocation.handler.spec`
Expected: PASS — all 3 tests pass

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/projects/application/commands/create-allocation*
git commit -m "feat(projects): add CreateAllocation command with placeholder support (TDD)"
```

---

## Task 9: Remaining Commands — CreateAccount, CreateProject, CreateProjectRole, ConfirmAllocation, CloseAllocation

Each follows the same TDD pattern. Key business logic:

- [ ] **Step 1: CreateAccount** — simple insert, no complex validation
- [ ] **Step 2: CreateProject** — validates account exists via `IAccountRepository.findById`; throws `AccountNotFoundException` if not
- [ ] **Step 3: CreateProjectRole** — validates project exists; creates demand slot with `status: open`
- [ ] **Step 4: ConfirmAllocation** — validates allocation exists + is `tentative`; transitions to `confirmed`; throws `AllocationAlreadyConfirmedException` if already confirmed
- [ ] **Step 5: CloseAllocation** — sets `ended_at` on the allocation

Each step: write spec → verify failure → write handler → verify pass → commit.

- [ ] **Step 6: Commit all**

```bash
git add apps/api/src/modules/projects/application/commands/
git commit -m "feat(projects): add remaining command handlers (create account/project/role, confirm/close allocation)"
```

---

## Task 10: Event Handlers — OffboardingStarted + EmployeeTerminated

**Files:**

- Create: `apps/api/src/modules/projects/application/event-handlers/on-offboarding-started.handler.ts`
- Create: `apps/api/src/modules/projects/application/event-handlers/on-offboarding-started.handler.spec.ts`
- Create: `apps/api/src/modules/projects/application/event-handlers/on-employee-terminated.handler.ts`
- Create: `apps/api/src/modules/projects/application/event-handlers/on-employee-terminated.handler.spec.ts`

- [ ] **Step 1: Write failing test for OnOffboardingStarted**

```typescript
// on-offboarding-started.handler.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OnOffboardingStartedHandler } from './on-offboarding-started.handler'
import type { IAllocationRepository } from '../../domain/repositories/allocation.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'

describe('OnOffboardingStartedHandler', () => {
  let handler: OnOffboardingStartedHandler
  let allocRepo: IAllocationRepository

  beforeEach(() => {
    allocRepo = {
      findById: vi.fn(),
      findByActorId: vi.fn(),
      findConfirmedByActorId: vi.fn(),
      findByProjectRoleId: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      close: vi.fn(),
      closeAllForActor: vi.fn(),
      flagTentativeForActor: vi.fn(),
      sumConfirmedHoursPerDay: vi.fn(),
    }
    handler = new OnOffboardingStartedHandler(allocRepo)
  })

  it('flags all confirmed allocations as tentative for the offboarding actor', async () => {
    await handler.handle({ tenantId: TENANT_ID, actorId: ACTOR_ID, expectedLastDay: '2026-05-01' })

    expect(allocRepo.flagTentativeForActor).toHaveBeenCalledWith(ACTOR_ID, TENANT_ID)
  })
})
```

- [ ] **Step 2: Write the handler**

```typescript
// on-offboarding-started.handler.ts
import { Inject } from '@nestjs/common'
import {
  ALLOCATION_REPOSITORY,
  type IAllocationRepository,
} from '../../domain/repositories/allocation.repository.port'

export class OnOffboardingStartedHandler {
  constructor(@Inject(ALLOCATION_REPOSITORY) private readonly allocRepo: IAllocationRepository) {}

  async handle(event: {
    tenantId: string
    actorId: string
    expectedLastDay: string
  }): Promise<void> {
    await this.allocRepo.flagTentativeForActor(event.actorId, event.tenantId)
  }
}
```

- [ ] **Step 3: Write failing test for OnEmployeeTerminated**

```typescript
// on-employee-terminated.handler.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OnEmployeeTerminatedHandler } from './on-employee-terminated.handler'
import type { IAllocationRepository } from '../../domain/repositories/allocation.repository.port'
import type { IProjectRoleRepository } from '../../domain/repositories/project-role.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'

describe('OnEmployeeTerminatedHandler', () => {
  let handler: OnEmployeeTerminatedHandler
  let allocRepo: IAllocationRepository
  let roleRepo: IProjectRoleRepository

  beforeEach(() => {
    allocRepo = {
      findById: vi.fn(),
      findByActorId: vi.fn(),
      findConfirmedByActorId: vi.fn(),
      findByProjectRoleId: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      close: vi.fn(),
      closeAllForActor: vi.fn(),
      flagTentativeForActor: vi.fn(),
      sumConfirmedHoursPerDay: vi.fn(),
    }
    roleRepo = {
      findById: vi.fn(),
      findByProjectId: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
    }
    handler = new OnEmployeeTerminatedHandler(allocRepo, roleRepo)
  })

  it('closes all allocations and reopens corresponding project roles', async () => {
    vi.mocked(allocRepo.findByActorId).mockResolvedValue([
      {
        id: 'alloc-1',
        tenantId: TENANT_ID,
        projectId: 'proj-1',
        projectRoleId: 'role-1',
        actorId: ACTOR_ID,
        position: null,
        hoursPerDay: '8.00',
        billingType: 'billable',
        memberType: 'core',
        status: 'tentative',
        startedAt: new Date(),
        endedAt: null,
        note: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    await handler.handle({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      terminationDate: '2026-05-01',
    })

    expect(allocRepo.closeAllForActor).toHaveBeenCalledWith(
      ACTOR_ID,
      TENANT_ID,
      new Date('2026-05-01'),
    )
    expect(roleRepo.updateStatus).toHaveBeenCalledWith('role-1', TENANT_ID, 'open')
  })
})
```

- [ ] **Step 4: Write the handler**

```typescript
// on-employee-terminated.handler.ts
import { Inject } from '@nestjs/common'
import {
  ALLOCATION_REPOSITORY,
  type IAllocationRepository,
} from '../../domain/repositories/allocation.repository.port'
import {
  PROJECT_ROLE_REPOSITORY,
  type IProjectRoleRepository,
} from '../../domain/repositories/project-role.repository.port'

export class OnEmployeeTerminatedHandler {
  constructor(
    @Inject(ALLOCATION_REPOSITORY) private readonly allocRepo: IAllocationRepository,
    @Inject(PROJECT_ROLE_REPOSITORY) private readonly roleRepo: IProjectRoleRepository,
  ) {}

  async handle(event: {
    tenantId: string
    actorId: string
    terminationDate: string
  }): Promise<void> {
    // Find all active allocations for this actor before closing
    const allocations = await this.allocRepo.findByActorId(event.actorId, event.tenantId)
    const activeAllocations = allocations.filter((a) => a.endedAt === null)

    // Close all allocations
    await this.allocRepo.closeAllForActor(
      event.actorId,
      event.tenantId,
      new Date(event.terminationDate),
    )

    // Reopen corresponding project roles
    const roleIds = [...new Set(activeAllocations.map((a) => a.projectRoleId))]
    for (const roleId of roleIds) {
      await this.roleRepo.updateStatus(roleId, event.tenantId, 'open')
    }
  }
}
```

- [ ] **Step 5: Run tests**

Run: `cd apps/api && bun run test -- --testPathPattern "on-(offboarding-started|employee-terminated)"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
rm apps/api/src/modules/projects/application/event-handlers/.gitkeep
git add apps/api/src/modules/projects/application/event-handlers/
git commit -m "feat(projects): add event handlers for OffboardingStarted and EmployeeTerminated"
```

---

## Task 11: Query Handlers — GetAccount, ListAccounts, GetStaffingOverview, GetPersonAllocations, GetCapacityReport

**Files:**

- Create: 10 files (query + handler for each of the 5 queries)

- [ ] **Step 1: Create all query DTOs and handlers**

Key implementation details:

- `GetStaffingOverviewHandler` — queries all active employment profiles, joins with sum of confirmed allocation hours per actor, calculates utilization % assuming 8h standard day (or from `TimeQueryFacade` when available)
- `GetCapacityReportHandler` — identifies bench (utilization < 20%), over-allocated (utilization > 100%), and available capacity
- `GetPersonAllocationsHandler` — returns all active allocations for one actor across all projects
- `GetAccountHandler` — returns account + array of projects under it

- [ ] **Step 2: Remove .gitkeep from queries/**

```bash
rm apps/api/src/modules/projects/application/queries/.gitkeep
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/projects/application/queries/
git commit -m "feat(projects): add query handlers (account, staffing overview, capacity report, person allocations)"
```

---

## Task 12: ProjectsQueryFacade + Module Wiring

**Files:**

- Modify: `apps/api/src/modules/projects/application/facades/projects-query.facade.ts`
- Modify: `apps/api/src/modules/projects/projects.module.ts`

- [ ] **Step 1: Implement the facade**

```typescript
// projects-query.facade.ts
import { Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import type { Allocation } from '../../domain/entities/allocation.entity'
import { GetPersonAllocationsQuery } from '../queries/get-person-allocations.query'

@Injectable()
export class ProjectsQueryFacade {
  constructor(private readonly queryBus: QueryBus) {}

  getPersonAllocations(actorId: string, tenantId: string): Promise<Allocation[]> {
    return this.queryBus.execute(new GetPersonAllocationsQuery(actorId, tenantId))
  }
}
```

- [ ] **Step 2: Wire all providers into ProjectsModule**

Follow the same pattern as PeopleModule in Task 18 of the People plan: import CqrsModule, KernelModule, PeopleModule; bind all repository ports to Drizzle implementations; register all command handlers, query handlers, event handlers, and the facade.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/projects/
git commit -m "feat(projects): implement ProjectsQueryFacade and wire all providers into ProjectsModule"
```

---

## Task 13: tRPC Router — Projects Procedures

**Files:**

- Create: `apps/api/src/modules/projects/interface/trpc/projects.router.ts`

- [ ] **Step 1: Create the tRPC router**

Follow the same pattern as the People router: Zod input validation → dispatch to CommandBus/QueryBus. Include procedures for all routes in the spec:

- `listAccounts`, `getAccount`, `createAccount`, `updateAccount`
- `listProjects`, `getProject`, `createProject`, `updateProject`
- `listProjectRoles`, `createProjectRole`, `updateProjectRole`
- `createAllocation`, `confirmAllocation`, `updateAllocation`, `closeAllocation`
- `getStaffingOverview`, `getPersonAllocations`, `getCapacityReport`, `getAccountStaffing`

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/projects/interface/trpc/
git commit -m "feat(projects): add tRPC router with Zod input validation"
```

---

## Task 14: Final Validation — Typecheck + All Tests

- [ ] **Step 1: Run typecheck**

Run: `cd apps/api && bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 2: Run unit tests**

Run: `cd apps/api && bun run test`
Expected: all unit tests pass (People + Projects + Kernel)

- [ ] **Step 3: Run integration tests**

Run: `cd apps/api && bun run test:integration`
Expected: all integration tests pass

- [ ] **Step 4: Check coverage**

Run: `cd apps/api && bunx vitest run --coverage`
Expected: ≥70% on lines, functions, branches

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(projects): address typecheck and test issues from final validation"
```

---

**End of Projects Module Plan.** Both modules are now fully planned and ready for implementation.
