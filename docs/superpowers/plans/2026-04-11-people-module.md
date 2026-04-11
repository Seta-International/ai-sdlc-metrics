# People Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the People module — employment profiles, field-level profile changes, configurable onboarding/offboarding, and contract stub — following hexagonal DDD inside the NestJS modular monolith.

**Architecture:** The People module owns the `people` PostgreSQL schema. It communicates with the kernel via `KernelQueryFacade` (reads) and `CommandBus` (writes to `decision_case`). Other modules receive People events via `outbox_event` + domain events in `packages/event-contracts`. The module follows the same hexagonal layout as the kernel: `domain/` (entities, ports, VOs — zero NestJS deps) → `application/` (commands, queries, facades, event handlers) → `infrastructure/` (Drizzle repos, schema) → `interface/trpc/` (router contribution).

**Tech Stack:** NestJS 11, @nestjs/cqrs, Drizzle ORM on PostgreSQL 16, tRPC v11, Zod v4, vitest, uuidv7

**Spec:** `docs/superpowers/specs/2026-04-11-people-projects-design.md`

**Conventions (from kernel reference):**

- All IDs: UUID v7 via `$defaultFn(() => uuidv7())`
- Every table has `tenant_id uuid NOT NULL`
- Repository ports: `Symbol('IFooRepository')` + interface in `domain/repositories/`
- Commands: plain class in separate file, handler uses `@CommandHandler`
- Tests: co-located `foo.handler.spec.ts` next to `foo.handler.ts`; integration tests use `*.integration.spec.ts`
- Never use `.js` extensions in relative imports
- Inject DB via `@Inject(DB_TOKEN)` from `../../../../common/db/db.module`
- Event contracts: plain TS classes in `packages/event-contracts/src/<module>/`

---

## File Map

### Domain Layer (`apps/api/src/modules/people/domain/`)

| File                                                        | Responsibility                                                                                |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `entities/employment-profile.entity.ts`                     | `EmploymentProfile` interface + `EmploymentStatus`, `EmploymentType`, `WorkArrangement` types |
| `entities/employment-profile-detail.entity.ts`              | `EmploymentProfileDetail` interface                                                           |
| `entities/profile-section.entity.ts`                        | `ProfileSection` interface + `SectionType` type                                               |
| `entities/profile-change-request.entity.ts`                 | `ProfileChangeRequest` interface + `ChangeRequestStatus` type                                 |
| `entities/onboarding-template.entity.ts`                    | `OnboardingTemplate`, `OnboardingTaskTemplate` interfaces                                     |
| `entities/onboarding-case.entity.ts`                        | `OnboardingCase`, `OnboardingTask` interfaces                                                 |
| `entities/offboarding-template.entity.ts`                   | `OffboardingTemplate`, `OffboardingTaskTemplate` interfaces + `ReasonCategory` type           |
| `entities/offboarding-case.entity.ts`                       | `OffboardingCase`, `OffboardingTask` interfaces + `OffboardingStatus` type                    |
| `entities/account-membership.entity.ts`                     | `AccountMembership` interface                                                                 |
| `entities/contract-version.entity.ts`                       | `ContractVersion` interface (stub)                                                            |
| `entities/periodic-profile-review.entity.ts`                | `PeriodicProfileReview` interface                                                             |
| `exceptions/people.exceptions.ts`                           | All domain exceptions for the People module                                                   |
| `repositories/employment-profile.repository.port.ts`        | `IEmploymentProfileRepository` port                                                           |
| `repositories/employment-profile-detail.repository.port.ts` | `IEmploymentProfileDetailRepository` port                                                     |
| `repositories/profile-section.repository.port.ts`           | `IProfileSectionRepository` port                                                              |
| `repositories/profile-change-request.repository.port.ts`    | `IProfileChangeRequestRepository` port                                                        |
| `repositories/onboarding.repository.port.ts`                | `IOnboardingTemplateRepository`, `IOnboardingCaseRepository` ports                            |
| `repositories/offboarding.repository.port.ts`               | `IOffboardingTemplateRepository`, `IOffboardingCaseRepository` ports                          |
| `repositories/account-membership.repository.port.ts`        | `IAccountMembershipRepository` port                                                           |
| `repositories/contract-version.repository.port.ts`          | `IContractVersionRepository` port (stub)                                                      |

### Application Layer (`apps/api/src/modules/people/application/`)

| File                                                 | Responsibility                                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `commands/create-employment-profile.command.ts`      | Command DTO                                                                                    |
| `commands/create-employment-profile.handler.ts`      | Creates profile + triggers onboarding                                                          |
| `commands/create-employment-profile.handler.spec.ts` | Unit test                                                                                      |
| `commands/update-profile-direct.command.ts`          | Command for non-sensitive field updates                                                        |
| `commands/update-profile-direct.handler.ts`          | Direct write handler                                                                           |
| `commands/update-profile-direct.handler.spec.ts`     | Unit test                                                                                      |
| `commands/request-profile-change.command.ts`         | Command for sensitive field change request                                                     |
| `commands/request-profile-change.handler.ts`         | Creates `profile_change_request` + `decision_case`                                             |
| `commands/request-profile-change.handler.spec.ts`    | Unit test                                                                                      |
| `commands/approve-profile-change.command.ts`         | Command DTO                                                                                    |
| `commands/approve-profile-change.handler.ts`         | Applies change, resolves decision_case                                                         |
| `commands/approve-profile-change.handler.spec.ts`    | Unit test                                                                                      |
| `commands/reject-profile-change.command.ts`          | Command DTO                                                                                    |
| `commands/reject-profile-change.handler.ts`          | Rejects, writes decision_outcome with comment                                                  |
| `commands/reject-profile-change.handler.spec.ts`     | Unit test                                                                                      |
| `commands/trigger-offboarding.command.ts`            | Command DTO                                                                                    |
| `commands/trigger-offboarding.handler.ts`            | Creates offboarding case + decision_case                                                       |
| `commands/trigger-offboarding.handler.spec.ts`       | Unit test                                                                                      |
| `commands/approve-offboarding.command.ts`            | Command DTO                                                                                    |
| `commands/approve-offboarding.handler.ts`            | Generates tasks from template, transitions to processing                                       |
| `commands/approve-offboarding.handler.spec.ts`       | Unit test                                                                                      |
| `commands/complete-offboarding.command.ts`           | Command DTO                                                                                    |
| `commands/complete-offboarding.handler.ts`           | Atomic termination: actor inactive, identity deprovisioned, grants revoked, memberships closed |
| `commands/complete-offboarding.handler.spec.ts`      | Unit test                                                                                      |
| `commands/complete-task.command.ts`                  | Command DTO                                                                                    |
| `commands/complete-task.handler.ts`                  | Marks onboarding/offboarding task complete                                                     |
| `commands/complete-task.handler.spec.ts`             | Unit test                                                                                      |
| `queries/get-profile.query.ts`                       | Query DTO                                                                                      |
| `queries/get-profile.handler.ts`                     | Returns profile + detail (RLS-filtered)                                                        |
| `queries/list-employees.query.ts`                    | Query DTO                                                                                      |
| `queries/list-employees.handler.ts`                  | Paginated employee list                                                                        |
| `facades/people-query.facade.ts`                     | Public cross-module read API                                                                   |
| `event-handlers/on-candidate-hired.handler.ts`       | Handles `CandidateHiredEvent` → creates pre_hire profile                                       |
| `event-handlers/on-candidate-hired.handler.spec.ts`  | Unit test                                                                                      |

### Infrastructure Layer (`apps/api/src/modules/people/infrastructure/`)

| File                                                                     | Responsibility                                    |
| ------------------------------------------------------------------------ | ------------------------------------------------- |
| `schema/people.schema.ts`                                                | All Drizzle table definitions for `people` schema |
| `schema/index.ts`                                                        | Re-exports all schema symbols                     |
| `repositories/drizzle-employment-profile.repository.ts`                  | Drizzle implementation                            |
| `repositories/drizzle-employment-profile.repository.integration.spec.ts` | Integration test                                  |
| `repositories/drizzle-employment-profile-detail.repository.ts`           | Drizzle implementation                            |
| `repositories/drizzle-profile-change-request.repository.ts`              | Drizzle implementation                            |
| `repositories/drizzle-profile-section.repository.ts`                     | Drizzle implementation                            |
| `repositories/drizzle-onboarding.repository.ts`                          | Template + case repos                             |
| `repositories/drizzle-offboarding.repository.ts`                         | Template + case repos                             |
| `repositories/drizzle-offboarding.repository.integration.spec.ts`        | Integration test                                  |
| `repositories/drizzle-account-membership.repository.ts`                  | Drizzle implementation                            |
| `repositories/drizzle-contract-version.repository.ts`                    | Stub implementation                               |

### Interface Layer (`apps/api/src/modules/people/interface/trpc/`)

| File               | Responsibility                         |
| ------------------ | -------------------------------------- |
| `people.router.ts` | tRPC router with all People procedures |

### Event Contracts (`packages/event-contracts/src/people/`)

| File                           | Responsibility                                                       |
| ------------------------------ | -------------------------------------------------------------------- |
| `employee-activated.event.ts`  | New event (replaces existing `person-hired.event.ts` semantics)      |
| `offboarding-started.event.ts` | New event                                                            |
| `employee-terminated.event.ts` | New event (replaces existing `person-offboarded.event.ts` semantics) |

### DB Migrations (`packages/db/`)

| File                                        | Responsibility                               |
| ------------------------------------------- | -------------------------------------------- |
| `drizzle/migrations/0003_people_schema.sql` | DDL for all `people.*` tables + RLS policies |

### Test Helpers (`packages/db/src/test-helpers/`)

| File       | Responsibility                                              |
| ---------- | ----------------------------------------------------------- |
| `index.ts` | Add `seedEmploymentProfile`, `truncatePeopleSchema` helpers |

---

## Task 1: People Schema — Drizzle Table Definitions

**Files:**

- Modify: `apps/api/src/modules/people/infrastructure/schema/people.schema.ts`
- Create: `apps/api/src/modules/people/infrastructure/schema/index.ts`

- [ ] **Step 1: Write the Drizzle schema file**

Replace the placeholder in `people.schema.ts` with all table definitions:

```typescript
import {
  pgSchema,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
  date,
  numeric,
} from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const peopleSchema = pgSchema('people')

// --- Employment Profile ---

export const employmentProfile = peopleSchema.table('employment_profile', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  actorId: uuid('actor_id').notNull(),
  employeeCode: text('employee_code'),
  companyEmail: text('company_email'),
  employmentType: text('employment_type', {
    enum: ['permanent', 'fixed_term', 'contractor', 'intern'],
  }).notNull(),
  employmentStatus: text('employment_status', {
    enum: ['pre_hire', 'active', 'on_leave', 'offboarding', 'terminated'],
  })
    .notNull()
    .default('pre_hire'),
  workArrangement: text('work_arrangement', {
    enum: ['onsite', 'hybrid', 'remote'],
  })
    .notNull()
    .default('onsite'),
  hireDate: timestamp('hire_date').notNull(),
  terminationDate: timestamp('termination_date'),
  jobTitle: text('job_title'),
  jobLevel: text('job_level'),
  costCenter: text('cost_center'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// --- Employment Profile Detail (sensitive) ---

export const employmentProfileDetail = peopleSchema.table('employment_profile_detail', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  profileId: uuid('profile_id').notNull(),
  nationalId: text('national_id'),
  nationalIdIssuedDate: date('national_id_issued_date'),
  nationalIdIssuedPlace: text('national_id_issued_place'),
  oldNationalId: text('old_national_id'),
  oldNationalIdIssuedDate: date('old_national_id_issued_date'),
  oldNationalIdIssuedPlace: text('old_national_id_issued_place'),
  taxId: text('tax_id'),
  socialInsuranceNumber: text('social_insurance_number'),
  bankAccountNumber: text('bank_account_number'),
  bankName: text('bank_name'),
  bankBranch: text('bank_branch'),
  dob: date('dob'),
  gender: text('gender'),
  maritalStatus: text('marital_status'),
  permanentAddress: text('permanent_address'),
  currentAddress: text('current_address'),
  personalPhone: text('personal_phone'),
  personalEmail: text('personal_email'),
  emergencyContactName: text('emergency_contact_name'),
  emergencyContactPhone: text('emergency_contact_phone'),
  motorbikePlate: text('motorbike_plate'),
})

// --- Profile Section (JSONB extensible) ---

export const profileSection = peopleSchema.table('profile_section', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  profileId: uuid('profile_id').notNull(),
  sectionType: text('section_type', {
    enum: ['education', 'certification', 'skill', 'language', 'social_link', 'dependent'],
  }).notNull(),
  payload: jsonb('payload').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
})

// --- Profile Change Request (field-level approval) ---

export const profileChangeRequest = peopleSchema.table('profile_change_request', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  profileId: uuid('profile_id').notNull(),
  fieldPath: text('field_path').notNull(),
  oldValue: jsonb('old_value'),
  newValue: jsonb('new_value').notNull(),
  status: text('status', {
    enum: ['pending', 'approved', 'rejected', 'superseded'],
  })
    .notNull()
    .default('pending'),
  decisionCaseId: uuid('decision_case_id'),
  requestedBy: uuid('requested_by').notNull(),
  reviewedBy: uuid('reviewed_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// --- Periodic Profile Review ---

export const periodicProfileReview = peopleSchema.table('periodic_profile_review', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  profileId: uuid('profile_id').notNull(),
  dueDate: timestamp('due_date').notNull(),
  status: text('status', {
    enum: ['pending', 'completed', 'skipped'],
  })
    .notNull()
    .default('pending'),
  completedAt: timestamp('completed_at'),
})

// --- Onboarding Template + Tasks ---

export const onboardingTemplate = peopleSchema.table('onboarding_template', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  employmentType: text('employment_type', {
    enum: ['permanent', 'fixed_term', 'contractor', 'intern'],
  }),
  isDefault: boolean('is_default').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
})

export const onboardingTaskTemplate = peopleSchema.table('onboarding_task_template', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  templateId: uuid('template_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  assigneeRole: text('assignee_role', {
    enum: ['hr', 'it', 'project_manager', 'employee'],
  }).notNull(),
  dueDaysAfterHire: integer('due_days_after_hire').notNull(),
  isRequired: boolean('is_required').notNull().default(true),
})

export const onboardingCase = peopleSchema.table('onboarding_case', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  profileId: uuid('profile_id').notNull(),
  templateId: uuid('template_id'),
  status: text('status', {
    enum: ['in_progress', 'completed'],
  })
    .notNull()
    .default('in_progress'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const onboardingTask = peopleSchema.table('onboarding_task', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  caseId: uuid('case_id').notNull(),
  actorId: uuid('actor_id'),
  title: text('title').notNull(),
  description: text('description'),
  assigneeRole: text('assignee_role', {
    enum: ['hr', 'it', 'project_manager', 'employee'],
  }).notNull(),
  isRequired: boolean('is_required').notNull().default(true),
  status: text('status', {
    enum: ['pending', 'completed'],
  })
    .notNull()
    .default('pending'),
  dueDate: timestamp('due_date'),
  completedAt: timestamp('completed_at'),
  evidenceUrl: text('evidence_url'),
})

// --- Offboarding Template + Tasks ---

export const offboardingTemplate = peopleSchema.table('offboarding_template', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  employmentType: text('employment_type', {
    enum: ['permanent', 'fixed_term', 'contractor', 'intern'],
  }),
  reasonCategory: text('reason_category', {
    enum: ['voluntary', 'involuntary', 'redundancy', 'end_of_contract'],
  }),
  isDefault: boolean('is_default').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
})

export const offboardingTaskTemplate = peopleSchema.table('offboarding_task_template', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  templateId: uuid('template_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  assigneeRole: text('assignee_role', {
    enum: ['hr', 'it', 'project_manager', 'employee', 'account_manager'],
  }).notNull(),
  dueDaysAfterTrigger: integer('due_days_after_trigger').notNull(),
  isRequired: boolean('is_required').notNull().default(true),
})

export const offboardingCase = peopleSchema.table('offboarding_case', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  profileId: uuid('profile_id').notNull(),
  templateId: uuid('template_id'),
  decisionCaseId: uuid('decision_case_id'),
  reason: text('reason'),
  reasonCategory: text('reason_category', {
    enum: ['voluntary', 'involuntary', 'redundancy', 'end_of_contract'],
  }),
  status: text('status', {
    enum: ['pending', 'approved', 'processing', 'completed', 'rejected'],
  })
    .notNull()
    .default('pending'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const offboardingTask = peopleSchema.table('offboarding_task', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  caseId: uuid('case_id').notNull(),
  actorId: uuid('actor_id'),
  title: text('title').notNull(),
  description: text('description'),
  assigneeRole: text('assignee_role', {
    enum: ['hr', 'it', 'project_manager', 'employee', 'account_manager'],
  }).notNull(),
  isRequired: boolean('is_required').notNull().default(true),
  status: text('status', {
    enum: ['pending', 'completed'],
  })
    .notNull()
    .default('pending'),
  dueDate: timestamp('due_date'),
  completedAt: timestamp('completed_at'),
  evidenceUrl: text('evidence_url'),
})

// --- Account Membership ---

export const accountMembership = peopleSchema.table('account_membership', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  accountId: uuid('account_id').notNull(),
  actorId: uuid('actor_id').notNull(),
  roleKey: text('role_key', {
    enum: ['account_manager', 'staffing_owner', 'member'],
  }).notNull(),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
  leftAt: timestamp('left_at'),
})

// --- Contract Version (stub for v1 — full lifecycle in v2) ---

export const contractVersion = peopleSchema.table('contract_version', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  profileId: uuid('profile_id').notNull(),
  contractType: text('contract_type').notNull(),
  status: text('status', {
    enum: ['draft', 'active', 'expired', 'terminated'],
  })
    .notNull()
    .default('draft'),
  startedAt: timestamp('started_at').notNull(),
  endedAt: timestamp('ended_at'),
  probationEndDate: timestamp('probation_end_date'),
  note: text('note'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

- [ ] **Step 2: Create the schema index file**

Create `apps/api/src/modules/people/infrastructure/schema/index.ts`:

```typescript
export {
  peopleSchema,
  employmentProfile,
  employmentProfileDetail,
  profileSection,
  profileChangeRequest,
  periodicProfileReview,
  onboardingTemplate,
  onboardingTaskTemplate,
  onboardingCase,
  onboardingTask,
  offboardingTemplate,
  offboardingTaskTemplate,
  offboardingCase,
  offboardingTask,
  accountMembership,
  contractVersion,
} from './people.schema'
```

- [ ] **Step 3: Run typecheck**

Run: `cd apps/api && bunx tsc --noEmit`
Expected: PASS — no type errors

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/people/infrastructure/schema/
git commit -m "feat(people): add all Drizzle table definitions for people schema"
```

---

## Task 2: Database Migration — People Schema DDL + RLS

**Files:**

- Create: `packages/db/drizzle/migrations/0003_people_schema.sql`

- [ ] **Step 1: Generate the migration**

Run from repo root:

```bash
cd packages/db && bunx drizzle-kit generate
```

Review the generated SQL. It should create all `people.*` tables. If the auto-generated migration does not include RLS policies, add them manually.

- [ ] **Step 2: Add RLS policies to the migration**

Append RLS policies for tenant isolation to the generated migration file. Every `people.*` table needs:

```sql
-- RLS for people schema (append to generated migration)
ALTER TABLE "people"."employment_profile" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "people"."employment_profile"
  USING ("tenant_id" = current_setting('app.tenant_id')::uuid);

ALTER TABLE "people"."employment_profile_detail" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "people"."employment_profile_detail"
  USING ("tenant_id" = current_setting('app.tenant_id')::uuid);

ALTER TABLE "people"."profile_section" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "people"."profile_section"
  USING ("tenant_id" = current_setting('app.tenant_id')::uuid);

ALTER TABLE "people"."profile_change_request" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "people"."profile_change_request"
  USING ("tenant_id" = current_setting('app.tenant_id')::uuid);

ALTER TABLE "people"."periodic_profile_review" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "people"."periodic_profile_review"
  USING ("tenant_id" = current_setting('app.tenant_id')::uuid);

ALTER TABLE "people"."onboarding_template" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "people"."onboarding_template"
  USING ("tenant_id" = current_setting('app.tenant_id')::uuid);

ALTER TABLE "people"."onboarding_task_template" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "people"."onboarding_task_template"
  USING ("tenant_id" = current_setting('app.tenant_id')::uuid);

ALTER TABLE "people"."onboarding_case" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "people"."onboarding_case"
  USING ("tenant_id" = current_setting('app.tenant_id')::uuid);

ALTER TABLE "people"."onboarding_task" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "people"."onboarding_task"
  USING ("tenant_id" = current_setting('app.tenant_id')::uuid);

ALTER TABLE "people"."offboarding_template" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "people"."offboarding_template"
  USING ("tenant_id" = current_setting('app.tenant_id')::uuid);

ALTER TABLE "people"."offboarding_task_template" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "people"."offboarding_task_template"
  USING ("tenant_id" = current_setting('app.tenant_id')::uuid);

ALTER TABLE "people"."offboarding_case" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "people"."offboarding_case"
  USING ("tenant_id" = current_setting('app.tenant_id')::uuid);

ALTER TABLE "people"."offboarding_task" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "people"."offboarding_task"
  USING ("tenant_id" = current_setting('app.tenant_id')::uuid);

ALTER TABLE "people"."account_membership" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "people"."account_membership"
  USING ("tenant_id" = current_setting('app.tenant_id')::uuid);

ALTER TABLE "people"."contract_version" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "people"."contract_version"
  USING ("tenant_id" = current_setting('app.tenant_id')::uuid);
```

- [ ] **Step 3: Run the migration against test DB**

```bash
cd packages/db && bunx drizzle-kit migrate
```

Expected: migration applies cleanly. Verify with:

```bash
psql $TEST_DATABASE_URL -c "\dt people.*"
```

Expected: all 16 tables listed.

- [ ] **Step 4: Commit**

```bash
git add packages/db/drizzle/
git commit -m "feat(people): add people schema DDL migration with RLS policies"
```

---

## Task 3: Test Helpers — Seed Functions for People

**Files:**

- Modify: `packages/db/src/test-helpers/index.ts`

- [ ] **Step 1: Add people seed helpers**

Add these functions after the existing `seedActor` function in `packages/db/src/test-helpers/index.ts`:

```typescript
export async function truncatePeopleSchema(db: Db): Promise<void> {
  await db.execute(
    sql`TRUNCATE
      people.contract_version,
      people.account_membership,
      people.offboarding_task,
      people.offboarding_case,
      people.offboarding_task_template,
      people.offboarding_template,
      people.onboarding_task,
      people.onboarding_case,
      people.onboarding_task_template,
      people.onboarding_template,
      people.periodic_profile_review,
      people.profile_change_request,
      people.profile_section,
      people.employment_profile_detail,
      people.employment_profile
    RESTART IDENTITY CASCADE`,
  )
}

export async function seedEmploymentProfile(
  db: Db,
  overrides: Partial<{
    id: string
    tenantId: string
    actorId: string
    employeeCode: string
    companyEmail: string
    employmentType: string
    employmentStatus: string
    workArrangement: string
    hireDate: string
    jobTitle: string
    jobLevel: string
  }> = {},
): Promise<{ id: string; tenantId: string; actorId: string }> {
  const id = overrides.id ?? uuidv7()
  const tenantId = overrides.tenantId ?? uuidv7()
  const actorId = overrides.actorId ?? uuidv7()
  const employeeCode = overrides.employeeCode ?? `SETA-${id.slice(0, 4)}`
  const companyEmail = overrides.companyEmail ?? `test-${id.slice(0, 8)}@seta-international.vn`
  const employmentType = overrides.employmentType ?? 'permanent'
  const employmentStatus = overrides.employmentStatus ?? 'active'
  const workArrangement = overrides.workArrangement ?? 'onsite'
  const hireDate = overrides.hireDate ?? '2026-01-01'
  const jobTitle = overrides.jobTitle ?? 'Software Engineer'
  const jobLevel = overrides.jobLevel ?? 'L3'

  await db.execute(
    sql`INSERT INTO people.employment_profile
        (id, tenant_id, actor_id, employee_code, company_email,
         employment_type, employment_status, work_arrangement,
         hire_date, job_title, job_level, created_at, updated_at)
        VALUES (${id}, ${tenantId}, ${actorId}, ${employeeCode}, ${companyEmail},
                ${employmentType}, ${employmentStatus}, ${workArrangement},
                ${hireDate}::timestamp, ${jobTitle}, ${jobLevel}, NOW(), NOW())`,
  )

  return { id, tenantId, actorId }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/db/src/test-helpers/index.ts
git commit -m "feat(people): add seedEmploymentProfile and truncatePeopleSchema test helpers"
```

---

## Task 4: Domain Entities — Employment Profile + Detail

**Files:**

- Create: `apps/api/src/modules/people/domain/entities/employment-profile.entity.ts`
- Create: `apps/api/src/modules/people/domain/entities/employment-profile-detail.entity.ts`
- Create: `apps/api/src/modules/people/domain/exceptions/people.exceptions.ts`

- [ ] **Step 1: Create the employment profile entity**

```typescript
// apps/api/src/modules/people/domain/entities/employment-profile.entity.ts

export type EmploymentType = 'permanent' | 'fixed_term' | 'contractor' | 'intern'
export type EmploymentStatus = 'pre_hire' | 'active' | 'on_leave' | 'offboarding' | 'terminated'
export type WorkArrangement = 'onsite' | 'hybrid' | 'remote'

export interface EmploymentProfile {
  id: string
  tenantId: string
  actorId: string
  employeeCode: string | null
  companyEmail: string | null
  employmentType: EmploymentType
  employmentStatus: EmploymentStatus
  workArrangement: WorkArrangement
  hireDate: Date
  terminationDate: Date | null
  jobTitle: string | null
  jobLevel: string | null
  costCenter: string | null
  createdAt: Date
  updatedAt: Date
}

const VALID_TRANSITIONS: Record<EmploymentStatus, EmploymentStatus[]> = {
  pre_hire: ['active'],
  active: ['on_leave', 'offboarding'],
  on_leave: ['active', 'offboarding'],
  offboarding: ['terminated'],
  terminated: [],
}

export function canTransitionStatus(from: EmploymentStatus, to: EmploymentStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to)
}
```

- [ ] **Step 2: Create the employment profile detail entity**

```typescript
// apps/api/src/modules/people/domain/entities/employment-profile-detail.entity.ts

export interface EmploymentProfileDetail {
  id: string
  tenantId: string
  profileId: string
  nationalId: string | null
  nationalIdIssuedDate: string | null
  nationalIdIssuedPlace: string | null
  oldNationalId: string | null
  oldNationalIdIssuedDate: string | null
  oldNationalIdIssuedPlace: string | null
  taxId: string | null
  socialInsuranceNumber: string | null
  bankAccountNumber: string | null
  bankName: string | null
  bankBranch: string | null
  dob: string | null
  gender: string | null
  maritalStatus: string | null
  permanentAddress: string | null
  currentAddress: string | null
  personalPhone: string | null
  personalEmail: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  motorbikePlate: string | null
}
```

- [ ] **Step 3: Create domain exceptions**

```typescript
// apps/api/src/modules/people/domain/exceptions/people.exceptions.ts

import { DomainException } from '../../../kernel/domain/exceptions/domain.exception'

export class ProfileNotFoundException extends DomainException {
  readonly code = 'PROFILE_NOT_FOUND'
  constructor(id: string) {
    super(`Employment profile not found: ${id}`)
  }
}

export class ProfileAlreadyExistsException extends DomainException {
  readonly code = 'PROFILE_ALREADY_EXISTS'
  constructor(actorId: string) {
    super(`Employment profile already exists for actor: ${actorId}`)
  }
}

export class InvalidStatusTransitionException extends DomainException {
  readonly code = 'INVALID_STATUS_TRANSITION'
  constructor(from: string, to: string) {
    super(`Cannot transition employment status from ${from} to ${to}`)
  }
}

export class ChangeRequestNotFoundException extends DomainException {
  readonly code = 'CHANGE_REQUEST_NOT_FOUND'
  constructor(id: string) {
    super(`Profile change request not found: ${id}`)
  }
}

export class OffboardingAlreadyActiveException extends DomainException {
  readonly code = 'OFFBOARDING_ALREADY_ACTIVE'
  constructor(profileId: string) {
    super(`An active offboarding case already exists for profile: ${profileId}`)
  }
}

export class OffboardingCaseNotFoundException extends DomainException {
  readonly code = 'OFFBOARDING_CASE_NOT_FOUND'
  constructor(id: string) {
    super(`Offboarding case not found: ${id}`)
  }
}

export class OffboardingNotApprovedYetException extends DomainException {
  readonly code = 'OFFBOARDING_NOT_APPROVED_YET'
  constructor(id: string) {
    super(`Offboarding case has not been approved yet: ${id}`)
  }
}

export class OffboardingTasksNotCompleteException extends DomainException {
  readonly code = 'OFFBOARDING_TASKS_NOT_COMPLETE'
  constructor(caseId: string) {
    super(`Required offboarding tasks are not complete for case: ${caseId}`)
  }
}

export class TaskNotFoundException extends DomainException {
  readonly code = 'TASK_NOT_FOUND'
  constructor(id: string) {
    super(`Task not found: ${id}`)
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/people/domain/
git commit -m "feat(people): add domain entities and exceptions"
```

---

## Task 5: Domain Entities — Remaining (Sections, Templates, Cases, Memberships)

**Files:**

- Create: `apps/api/src/modules/people/domain/entities/profile-section.entity.ts`
- Create: `apps/api/src/modules/people/domain/entities/profile-change-request.entity.ts`
- Create: `apps/api/src/modules/people/domain/entities/onboarding-template.entity.ts`
- Create: `apps/api/src/modules/people/domain/entities/onboarding-case.entity.ts`
- Create: `apps/api/src/modules/people/domain/entities/offboarding-template.entity.ts`
- Create: `apps/api/src/modules/people/domain/entities/offboarding-case.entity.ts`
- Create: `apps/api/src/modules/people/domain/entities/account-membership.entity.ts`
- Create: `apps/api/src/modules/people/domain/entities/contract-version.entity.ts`
- Create: `apps/api/src/modules/people/domain/entities/periodic-profile-review.entity.ts`

- [ ] **Step 1: Create all remaining entity files**

```typescript
// profile-section.entity.ts
export type SectionType =
  | 'education'
  | 'certification'
  | 'skill'
  | 'language'
  | 'social_link'
  | 'dependent'

export interface ProfileSection {
  id: string
  tenantId: string
  profileId: string
  sectionType: SectionType
  payload: unknown
  displayOrder: number
}
```

```typescript
// profile-change-request.entity.ts
export type ChangeRequestStatus = 'pending' | 'approved' | 'rejected' | 'superseded'

export interface ProfileChangeRequest {
  id: string
  tenantId: string
  profileId: string
  fieldPath: string
  oldValue: unknown
  newValue: unknown
  status: ChangeRequestStatus
  decisionCaseId: string | null
  requestedBy: string
  reviewedBy: string | null
  createdAt: Date
}
```

```typescript
// onboarding-template.entity.ts
import type { EmploymentType } from './employment-profile.entity'

export type OnboardingAssigneeRole = 'hr' | 'it' | 'project_manager' | 'employee'

export interface OnboardingTemplate {
  id: string
  tenantId: string
  name: string
  employmentType: EmploymentType | null
  isDefault: boolean
  isActive: boolean
}

export interface OnboardingTaskTemplate {
  id: string
  tenantId: string
  templateId: string
  title: string
  description: string | null
  assigneeRole: OnboardingAssigneeRole
  dueDaysAfterHire: number
  isRequired: boolean
}
```

```typescript
// onboarding-case.entity.ts
export type OnboardingCaseStatus = 'in_progress' | 'completed'
export type OnboardingTaskStatus = 'pending' | 'completed'

export interface OnboardingCase {
  id: string
  tenantId: string
  profileId: string
  templateId: string | null
  status: OnboardingCaseStatus
  createdAt: Date
}

export interface OnboardingTask {
  id: string
  tenantId: string
  caseId: string
  actorId: string | null
  title: string
  description: string | null
  assigneeRole: string
  isRequired: boolean
  status: OnboardingTaskStatus
  dueDate: Date | null
  completedAt: Date | null
  evidenceUrl: string | null
}
```

```typescript
// offboarding-template.entity.ts
import type { EmploymentType } from './employment-profile.entity'

export type ReasonCategory = 'voluntary' | 'involuntary' | 'redundancy' | 'end_of_contract'
export type OffboardingAssigneeRole =
  | 'hr'
  | 'it'
  | 'project_manager'
  | 'employee'
  | 'account_manager'

export interface OffboardingTemplate {
  id: string
  tenantId: string
  name: string
  employmentType: EmploymentType | null
  reasonCategory: ReasonCategory | null
  isDefault: boolean
  isActive: boolean
}

export interface OffboardingTaskTemplate {
  id: string
  tenantId: string
  templateId: string
  title: string
  description: string | null
  assigneeRole: OffboardingAssigneeRole
  dueDaysAfterTrigger: number
  isRequired: boolean
}
```

```typescript
// offboarding-case.entity.ts
import type { ReasonCategory } from './offboarding-template.entity'

export type OffboardingStatus = 'pending' | 'approved' | 'processing' | 'completed' | 'rejected'
export type OffboardingTaskStatus = 'pending' | 'completed'

export interface OffboardingCase {
  id: string
  tenantId: string
  profileId: string
  templateId: string | null
  decisionCaseId: string | null
  reason: string | null
  reasonCategory: ReasonCategory | null
  status: OffboardingStatus
  createdAt: Date
}

export interface OffboardingTask {
  id: string
  tenantId: string
  caseId: string
  actorId: string | null
  title: string
  description: string | null
  assigneeRole: string
  isRequired: boolean
  status: OffboardingTaskStatus
  dueDate: Date | null
  completedAt: Date | null
  evidenceUrl: string | null
}
```

```typescript
// account-membership.entity.ts
export type AccountMemberRoleKey = 'account_manager' | 'staffing_owner' | 'member'

export interface AccountMembership {
  id: string
  tenantId: string
  accountId: string
  actorId: string
  roleKey: AccountMemberRoleKey
  joinedAt: Date
  leftAt: Date | null
}
```

```typescript
// contract-version.entity.ts
export type ContractStatus = 'draft' | 'active' | 'expired' | 'terminated'

export interface ContractVersion {
  id: string
  tenantId: string
  profileId: string
  contractType: string
  status: ContractStatus
  startedAt: Date
  endedAt: Date | null
  probationEndDate: Date | null
  note: string | null
  createdAt: Date
}
```

```typescript
// periodic-profile-review.entity.ts
export type ReviewStatus = 'pending' | 'completed' | 'skipped'

export interface PeriodicProfileReview {
  id: string
  tenantId: string
  profileId: string
  dueDate: Date
  status: ReviewStatus
  completedAt: Date | null
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/people/domain/entities/
git commit -m "feat(people): add remaining domain entities (sections, templates, cases, memberships, contracts)"
```

---

## Task 6: Repository Ports

**Files:**

- Create: `apps/api/src/modules/people/domain/repositories/employment-profile.repository.port.ts`
- Create: `apps/api/src/modules/people/domain/repositories/employment-profile-detail.repository.port.ts`
- Create: `apps/api/src/modules/people/domain/repositories/profile-change-request.repository.port.ts`
- Create: `apps/api/src/modules/people/domain/repositories/profile-section.repository.port.ts`
- Create: `apps/api/src/modules/people/domain/repositories/onboarding.repository.port.ts`
- Create: `apps/api/src/modules/people/domain/repositories/offboarding.repository.port.ts`
- Create: `apps/api/src/modules/people/domain/repositories/account-membership.repository.port.ts`
- Create: `apps/api/src/modules/people/domain/repositories/contract-version.repository.port.ts`

- [ ] **Step 1: Create all repository ports**

```typescript
// employment-profile.repository.port.ts
import type {
  EmploymentProfile,
  EmploymentStatus,
  EmploymentType,
} from '../entities/employment-profile.entity'

export const EMPLOYMENT_PROFILE_REPOSITORY = Symbol('IEmploymentProfileRepository')

export interface IEmploymentProfileRepository {
  findById(id: string, tenantId: string): Promise<EmploymentProfile | null>
  findByActorId(actorId: string, tenantId: string): Promise<EmploymentProfile | null>
  insert(data: {
    tenantId: string
    actorId: string
    employeeCode: string | null
    companyEmail: string | null
    employmentType: EmploymentType
    employmentStatus: EmploymentStatus
    hireDate: Date
    jobTitle: string | null
    jobLevel: string | null
  }): Promise<EmploymentProfile>
  updateStatus(
    id: string,
    tenantId: string,
    status: EmploymentStatus,
    terminationDate?: Date,
  ): Promise<void>
  list(tenantId: string, options: { limit: number; offset: number }): Promise<EmploymentProfile[]>
  count(tenantId: string): Promise<number>
}
```

```typescript
// employment-profile-detail.repository.port.ts
import type { EmploymentProfileDetail } from '../entities/employment-profile-detail.entity'

export const EMPLOYMENT_PROFILE_DETAIL_REPOSITORY = Symbol('IEmploymentProfileDetailRepository')

export interface IEmploymentProfileDetailRepository {
  findByProfileId(profileId: string, tenantId: string): Promise<EmploymentProfileDetail | null>
  upsert(
    data: { tenantId: string; profileId: string } & Partial<EmploymentProfileDetail>,
  ): Promise<EmploymentProfileDetail>
  updateField(profileId: string, tenantId: string, fieldName: string, value: unknown): Promise<void>
}
```

```typescript
// profile-change-request.repository.port.ts
import type {
  ProfileChangeRequest,
  ChangeRequestStatus,
} from '../entities/profile-change-request.entity'

export const PROFILE_CHANGE_REQUEST_REPOSITORY = Symbol('IProfileChangeRequestRepository')

export interface IProfileChangeRequestRepository {
  findById(id: string, tenantId: string): Promise<ProfileChangeRequest | null>
  findPendingByField(
    profileId: string,
    fieldPath: string,
    tenantId: string,
  ): Promise<ProfileChangeRequest | null>
  insert(data: {
    tenantId: string
    profileId: string
    fieldPath: string
    oldValue: unknown
    newValue: unknown
    decisionCaseId: string
    requestedBy: string
  }): Promise<ProfileChangeRequest>
  updateStatus(
    id: string,
    tenantId: string,
    status: ChangeRequestStatus,
    reviewedBy?: string,
  ): Promise<void>
  listPending(tenantId: string): Promise<ProfileChangeRequest[]>
}
```

```typescript
// profile-section.repository.port.ts
import type { ProfileSection, SectionType } from '../entities/profile-section.entity'

export const PROFILE_SECTION_REPOSITORY = Symbol('IProfileSectionRepository')

export interface IProfileSectionRepository {
  findByProfileId(profileId: string, tenantId: string): Promise<ProfileSection[]>
  insert(data: {
    tenantId: string
    profileId: string
    sectionType: SectionType
    payload: unknown
    displayOrder: number
  }): Promise<ProfileSection>
  update(
    id: string,
    tenantId: string,
    data: Partial<Pick<ProfileSection, 'payload' | 'displayOrder'>>,
  ): Promise<void>
  delete(id: string, tenantId: string): Promise<void>
}
```

```typescript
// onboarding.repository.port.ts
import type {
  OnboardingTemplate,
  OnboardingTaskTemplate,
} from '../entities/onboarding-template.entity'
import type { OnboardingCase, OnboardingTask } from '../entities/onboarding-case.entity'
import type { EmploymentType } from '../entities/employment-profile.entity'

export const ONBOARDING_TEMPLATE_REPOSITORY = Symbol('IOnboardingTemplateRepository')
export const ONBOARDING_CASE_REPOSITORY = Symbol('IOnboardingCaseRepository')

export interface IOnboardingTemplateRepository {
  findByEmploymentType(
    employmentType: EmploymentType,
    tenantId: string,
  ): Promise<OnboardingTemplate | null>
  findDefault(tenantId: string): Promise<OnboardingTemplate | null>
  findById(id: string, tenantId: string): Promise<OnboardingTemplate | null>
  getTaskTemplates(templateId: string, tenantId: string): Promise<OnboardingTaskTemplate[]>
  insert(data: {
    tenantId: string
    name: string
    employmentType: EmploymentType | null
    isDefault: boolean
  }): Promise<OnboardingTemplate>
  insertTaskTemplate(data: {
    tenantId: string
    templateId: string
    title: string
    description: string | null
    assigneeRole: string
    dueDaysAfterHire: number
    isRequired: boolean
  }): Promise<OnboardingTaskTemplate>
  list(tenantId: string): Promise<OnboardingTemplate[]>
}

export interface IOnboardingCaseRepository {
  insert(data: {
    tenantId: string
    profileId: string
    templateId: string | null
  }): Promise<OnboardingCase>
  findById(id: string, tenantId: string): Promise<OnboardingCase | null>
  findByProfileId(profileId: string, tenantId: string): Promise<OnboardingCase | null>
  updateStatus(id: string, tenantId: string, status: string): Promise<void>
  insertTask(data: {
    tenantId: string
    caseId: string
    actorId: string | null
    title: string
    description: string | null
    assigneeRole: string
    isRequired: boolean
    dueDate: Date | null
  }): Promise<OnboardingTask>
  getRequiredTasks(caseId: string, tenantId: string): Promise<OnboardingTask[]>
  updateTaskStatus(
    taskId: string,
    tenantId: string,
    status: string,
    completedAt?: Date,
    evidenceUrl?: string,
  ): Promise<void>
  findTaskById(taskId: string, tenantId: string): Promise<OnboardingTask | null>
}
```

```typescript
// offboarding.repository.port.ts
import type {
  OffboardingTemplate,
  OffboardingTaskTemplate,
  ReasonCategory,
} from '../entities/offboarding-template.entity'
import type {
  OffboardingCase,
  OffboardingTask,
  OffboardingStatus,
} from '../entities/offboarding-case.entity'
import type { EmploymentType } from '../entities/employment-profile.entity'

export const OFFBOARDING_TEMPLATE_REPOSITORY = Symbol('IOffboardingTemplateRepository')
export const OFFBOARDING_CASE_REPOSITORY = Symbol('IOffboardingCaseRepository')

export interface IOffboardingTemplateRepository {
  findMatch(
    employmentType: EmploymentType,
    reasonCategory: ReasonCategory | null,
    tenantId: string,
  ): Promise<OffboardingTemplate | null>
  findDefault(tenantId: string): Promise<OffboardingTemplate | null>
  findById(id: string, tenantId: string): Promise<OffboardingTemplate | null>
  getTaskTemplates(templateId: string, tenantId: string): Promise<OffboardingTaskTemplate[]>
  insert(data: {
    tenantId: string
    name: string
    employmentType: EmploymentType | null
    reasonCategory: ReasonCategory | null
    isDefault: boolean
  }): Promise<OffboardingTemplate>
  insertTaskTemplate(data: {
    tenantId: string
    templateId: string
    title: string
    description: string | null
    assigneeRole: string
    dueDaysAfterTrigger: number
    isRequired: boolean
  }): Promise<OffboardingTaskTemplate>
  list(tenantId: string): Promise<OffboardingTemplate[]>
}

export interface IOffboardingCaseRepository {
  insert(data: {
    tenantId: string
    profileId: string
    templateId: string | null
    decisionCaseId: string
    reason: string | null
    reasonCategory: ReasonCategory | null
  }): Promise<OffboardingCase>
  findById(id: string, tenantId: string): Promise<OffboardingCase | null>
  findActiveByProfileId(profileId: string, tenantId: string): Promise<OffboardingCase | null>
  updateStatus(id: string, tenantId: string, status: OffboardingStatus): Promise<void>
  insertTask(data: {
    tenantId: string
    caseId: string
    actorId: string | null
    title: string
    description: string | null
    assigneeRole: string
    isRequired: boolean
    dueDate: Date | null
  }): Promise<OffboardingTask>
  getRequiredTasks(caseId: string, tenantId: string): Promise<OffboardingTask[]>
  updateTaskStatus(
    taskId: string,
    tenantId: string,
    status: string,
    completedAt?: Date,
    evidenceUrl?: string,
  ): Promise<void>
  findTaskById(taskId: string, tenantId: string): Promise<OffboardingTask | null>
}
```

```typescript
// account-membership.repository.port.ts
import type { AccountMembership, AccountMemberRoleKey } from '../entities/account-membership.entity'

export const ACCOUNT_MEMBERSHIP_REPOSITORY = Symbol('IAccountMembershipRepository')

export interface IAccountMembershipRepository {
  findActiveByActorId(actorId: string, tenantId: string): Promise<AccountMembership[]>
  insert(data: {
    tenantId: string
    accountId: string
    actorId: string
    roleKey: AccountMemberRoleKey
  }): Promise<AccountMembership>
  closeAllForActor(actorId: string, tenantId: string, leftAt: Date): Promise<void>
}
```

```typescript
// contract-version.repository.port.ts
import type { ContractVersion } from '../entities/contract-version.entity'

export const CONTRACT_VERSION_REPOSITORY = Symbol('IContractVersionRepository')

export interface IContractVersionRepository {
  findByProfileId(profileId: string, tenantId: string): Promise<ContractVersion[]>
  insert(data: {
    tenantId: string
    profileId: string
    contractType: string
    startedAt: Date
    endedAt: Date | null
    probationEndDate: Date | null
    note: string | null
  }): Promise<ContractVersion>
}
```

- [ ] **Step 2: Remove old .gitkeep files from domain/repositories/ and domain/entities/**

```bash
rm apps/api/src/modules/people/domain/repositories/.gitkeep
rm apps/api/src/modules/people/domain/entities/.gitkeep
rm apps/api/src/modules/people/domain/value-objects/.gitkeep
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/people/domain/
git commit -m "feat(people): add repository ports for all domain entities"
```

---

## Task 7: Event Contracts — Update People Events

**Files:**

- Create: `packages/event-contracts/src/people/employee-activated.event.ts`
- Create: `packages/event-contracts/src/people/offboarding-started.event.ts`
- Create: `packages/event-contracts/src/people/employee-terminated.event.ts`
- Modify: `packages/event-contracts/src/index.ts`

- [ ] **Step 1: Create the three new event contracts**

```typescript
// packages/event-contracts/src/people/employee-activated.event.ts
export class EmployeeActivatedEvent {
  static readonly eventName = 'people.employee-activated'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly employeeCode: string,
    public readonly companyEmail: string,
  ) {}
}
```

```typescript
// packages/event-contracts/src/people/offboarding-started.event.ts
export class OffboardingStartedEvent {
  static readonly eventName = 'people.offboarding-started'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly expectedLastDay: string,
  ) {}
}
```

```typescript
// packages/event-contracts/src/people/employee-terminated.event.ts
export class EmployeeTerminatedEvent {
  static readonly eventName = 'people.employee-terminated'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly terminationDate: string,
  ) {}
}
```

- [ ] **Step 2: Add exports to index.ts**

Add after the existing `PersonOffboardedEvent` export in `packages/event-contracts/src/index.ts`:

```typescript
export { EmployeeActivatedEvent } from './people/employee-activated.event'
export { OffboardingStartedEvent } from './people/offboarding-started.event'
export { EmployeeTerminatedEvent } from './people/employee-terminated.event'
```

- [ ] **Step 3: Commit**

```bash
git add packages/event-contracts/
git commit -m "feat(event-contracts): add EmployeeActivated, OffboardingStarted, EmployeeTerminated events"
```

---

## Task 8: Update Kernel — Add `project_manager` to RoleKeyValue Type

**Files:**

- Modify: `apps/api/src/modules/kernel/domain/entities/role-grant.entity.ts`

The `role-grant.schema.ts` was already updated with `project_manager` in the enum. The TypeScript type must match.

- [ ] **Step 1: Add `project_manager` to the RoleKeyValue type**

In `role-grant.entity.ts`, change the `RoleKeyValue` type to:

```typescript
export type RoleKeyValue =
  | 'hr_ops'
  | 'line_manager'
  | 'project_manager'
  | 'staffing_owner'
  | 'account_manager'
  | 'finance_operator'
  | 'executive'
  | 'employee'
  | 'review_operator'
  | 'recruiter'
  | 'tenant_admin'
  | 'platform_admin'
```

- [ ] **Step 2: Run existing kernel tests to confirm nothing breaks**

Run: `cd apps/api && bun run test`
Expected: all existing tests pass

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/kernel/domain/entities/role-grant.entity.ts
git commit -m "fix(kernel): add project_manager to RoleKeyValue type (matches schema)"
```

---

## Task 9: Drizzle Repository — Employment Profile

**Files:**

- Create: `apps/api/src/modules/people/infrastructure/repositories/drizzle-employment-profile.repository.ts`
- Create: `apps/api/src/modules/people/infrastructure/repositories/drizzle-employment-profile.repository.integration.spec.ts`

- [ ] **Step 1: Write the integration test first**

```typescript
// drizzle-employment-profile.repository.integration.spec.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDb,
  migrateForTest,
  seedActor,
  seedTenant,
  setTenantContext,
  truncateCoreSchema,
  truncatePeopleSchema,
} from '@future/db/test-helpers'
import { DrizzleEmploymentProfileRepository } from './drizzle-employment-profile.repository'

const TENANT_A = '01900000-0000-7fff-8000-000000000010'
const TENANT_B = '01900000-0000-7fff-8000-000000000020'

describe('DrizzleEmploymentProfileRepository', () => {
  const db = createTestDb()
  let repo: DrizzleEmploymentProfileRepository

  beforeAll(async () => {
    await migrateForTest()
    repo = new DrizzleEmploymentProfileRepository(db as never)
  })

  beforeEach(async () => {
    await truncatePeopleSchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'tenant-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'tenant-b' })
  })

  afterAll(async () => {
    await truncatePeopleSchema(db)
    await truncateCoreSchema(db)
  })

  it('inserts and finds a profile by id', async () => {
    await setTenantContext(db, TENANT_A)
    const { id: actorId } = await seedActor(db, { tenantId: TENANT_A })

    const profile = await repo.insert({
      tenantId: TENANT_A,
      actorId,
      employeeCode: 'SETA-0001',
      companyEmail: 'test@seta-international.vn',
      employmentType: 'permanent',
      employmentStatus: 'pre_hire',
      hireDate: new Date('2026-03-01'),
      jobTitle: 'Engineer',
      jobLevel: 'L3',
    })

    expect(profile.id).toBeDefined()
    expect(profile.employmentStatus).toBe('pre_hire')

    const found = await repo.findById(profile.id, TENANT_A)
    expect(found).not.toBeNull()
    expect(found?.actorId).toBe(actorId)
  })

  it('findByActorId returns the profile for the correct actor', async () => {
    await setTenantContext(db, TENANT_A)
    const { id: actorId } = await seedActor(db, { tenantId: TENANT_A })

    await repo.insert({
      tenantId: TENANT_A,
      actorId,
      employeeCode: null,
      companyEmail: null,
      employmentType: 'contractor',
      employmentStatus: 'active',
      hireDate: new Date('2026-01-01'),
      jobTitle: null,
      jobLevel: null,
    })

    const found = await repo.findByActorId(actorId, TENANT_A)
    expect(found).not.toBeNull()
    expect(found?.employmentType).toBe('contractor')
  })

  it('returns null for cross-tenant queries', async () => {
    await setTenantContext(db, TENANT_A)
    const { id: actorId } = await seedActor(db, { tenantId: TENANT_A })

    const profile = await repo.insert({
      tenantId: TENANT_A,
      actorId,
      employeeCode: null,
      companyEmail: null,
      employmentType: 'permanent',
      employmentStatus: 'active',
      hireDate: new Date('2026-01-01'),
      jobTitle: null,
      jobLevel: null,
    })

    await setTenantContext(db, TENANT_B)
    const found = await repo.findById(profile.id, TENANT_B)
    expect(found).toBeNull()
  })

  it('updateStatus transitions the employment status', async () => {
    await setTenantContext(db, TENANT_A)
    const { id: actorId } = await seedActor(db, { tenantId: TENANT_A })

    const profile = await repo.insert({
      tenantId: TENANT_A,
      actorId,
      employeeCode: null,
      companyEmail: null,
      employmentType: 'permanent',
      employmentStatus: 'pre_hire',
      hireDate: new Date('2026-01-01'),
      jobTitle: null,
      jobLevel: null,
    })

    await repo.updateStatus(profile.id, TENANT_A, 'active')
    const updated = await repo.findById(profile.id, TENANT_A)
    expect(updated?.employmentStatus).toBe('active')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && bun run test:integration -- --testPathPattern drizzle-employment-profile`
Expected: FAIL — `DrizzleEmploymentProfileRepository` not found

- [ ] **Step 3: Write the repository implementation**

```typescript
// drizzle-employment-profile.repository.ts
import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq, sql } from 'drizzle-orm'
import type {
  EmploymentProfile,
  EmploymentStatus,
  EmploymentType,
} from '../../domain/entities/employment-profile.entity'
import type { IEmploymentProfileRepository } from '../../domain/repositories/employment-profile.repository.port'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { employmentProfile } from '../schema/index'

@Injectable()
export class DrizzleEmploymentProfileRepository implements IEmploymentProfileRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<EmploymentProfile | null> {
    const rows = await this.db
      .select()
      .from(employmentProfile)
      .where(and(eq(employmentProfile.id, id), eq(employmentProfile.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as EmploymentProfile | undefined) ?? null
  }

  async findByActorId(actorId: string, tenantId: string): Promise<EmploymentProfile | null> {
    const rows = await this.db
      .select()
      .from(employmentProfile)
      .where(and(eq(employmentProfile.actorId, actorId), eq(employmentProfile.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as EmploymentProfile | undefined) ?? null
  }

  async insert(data: {
    tenantId: string
    actorId: string
    employeeCode: string | null
    companyEmail: string | null
    employmentType: EmploymentType
    employmentStatus: EmploymentStatus
    hireDate: Date
    jobTitle: string | null
    jobLevel: string | null
  }): Promise<EmploymentProfile> {
    const rows = await this.db
      .insert(employmentProfile)
      .values({
        tenantId: data.tenantId,
        actorId: data.actorId,
        employeeCode: data.employeeCode,
        companyEmail: data.companyEmail,
        employmentType: data.employmentType,
        employmentStatus: data.employmentStatus,
        hireDate: data.hireDate,
        jobTitle: data.jobTitle,
        jobLevel: data.jobLevel,
      })
      .returning()
    return rows[0] as EmploymentProfile
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: EmploymentStatus,
    terminationDate?: Date,
  ): Promise<void> {
    const values: Record<string, unknown> = {
      employmentStatus: status,
      updatedAt: new Date(),
    }
    if (terminationDate) {
      values['terminationDate'] = terminationDate
    }
    await this.db
      .update(employmentProfile)
      .set(values)
      .where(and(eq(employmentProfile.id, id), eq(employmentProfile.tenantId, tenantId)))
  }

  async list(
    tenantId: string,
    options: { limit: number; offset: number },
  ): Promise<EmploymentProfile[]> {
    const rows = await this.db
      .select()
      .from(employmentProfile)
      .where(eq(employmentProfile.tenantId, tenantId))
      .limit(options.limit)
      .offset(options.offset)
    return rows as EmploymentProfile[]
  }

  async count(tenantId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(employmentProfile)
      .where(eq(employmentProfile.tenantId, tenantId))
    return Number(result[0]?.count ?? 0)
  }
}
```

- [ ] **Step 4: Run the integration test to verify it passes**

Run: `cd apps/api && bun run test:integration -- --testPathPattern drizzle-employment-profile`
Expected: PASS — all 4 tests pass

- [ ] **Step 5: Remove .gitkeep from infrastructure/repositories/**

```bash
rm apps/api/src/modules/people/infrastructure/repositories/.gitkeep
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/people/infrastructure/repositories/
git commit -m "feat(people): add DrizzleEmploymentProfileRepository with integration tests"
```

---

## Task 10: Command — CreateEmploymentProfile (TDD)

**Files:**

- Create: `apps/api/src/modules/people/application/commands/create-employment-profile.command.ts`
- Create: `apps/api/src/modules/people/application/commands/create-employment-profile.handler.spec.ts`
- Create: `apps/api/src/modules/people/application/commands/create-employment-profile.handler.ts`

- [ ] **Step 1: Create the command DTO**

```typescript
// create-employment-profile.command.ts
import type { EmploymentType } from '../../domain/entities/employment-profile.entity'

export class CreateEmploymentProfileCommand {
  constructor(
    readonly tenantId: string,
    readonly actorId: string,
    readonly employmentType: EmploymentType,
    readonly hireDate: Date,
    readonly employeeCode: string | null,
    readonly companyEmail: string | null,
    readonly jobTitle: string | null,
    readonly jobLevel: string | null,
  ) {}
}
```

- [ ] **Step 2: Write the failing unit test**

```typescript
// create-employment-profile.handler.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateEmploymentProfileCommand } from './create-employment-profile.command'
import { CreateEmploymentProfileHandler } from './create-employment-profile.handler'
import { ProfileAlreadyExistsException } from '../../domain/exceptions/people.exceptions'
import type { IEmploymentProfileRepository } from '../../domain/repositories/employment-profile.repository.port'
import type {
  IOnboardingTemplateRepository,
  IOnboardingCaseRepository,
} from '../../domain/repositories/onboarding.repository.port'
import type { EmploymentProfile } from '../../domain/entities/employment-profile.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const PROFILE_ID = '01900000-0000-7000-8000-000000000003'
const TEMPLATE_ID = '01900000-0000-7000-8000-000000000004'
const CASE_ID = '01900000-0000-7000-8000-000000000005'

const fakeProfile: EmploymentProfile = {
  id: PROFILE_ID,
  tenantId: TENANT_ID,
  actorId: ACTOR_ID,
  employeeCode: 'SETA-0001',
  companyEmail: 'test@seta-international.vn',
  employmentType: 'permanent',
  employmentStatus: 'pre_hire',
  workArrangement: 'onsite',
  hireDate: new Date('2026-03-01'),
  terminationDate: null,
  jobTitle: 'Engineer',
  jobLevel: 'L3',
  costCenter: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('CreateEmploymentProfileHandler', () => {
  let handler: CreateEmploymentProfileHandler
  let profileRepo: IEmploymentProfileRepository
  let templateRepo: IOnboardingTemplateRepository
  let caseRepo: IOnboardingCaseRepository

  beforeEach(() => {
    profileRepo = {
      findById: vi.fn(),
      findByActorId: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      list: vi.fn(),
      count: vi.fn(),
    }
    templateRepo = {
      findByEmploymentType: vi.fn(),
      findDefault: vi.fn(),
      findById: vi.fn(),
      getTaskTemplates: vi.fn(),
      insert: vi.fn(),
      insertTaskTemplate: vi.fn(),
      list: vi.fn(),
    }
    caseRepo = {
      insert: vi.fn(),
      findById: vi.fn(),
      findByProfileId: vi.fn(),
      updateStatus: vi.fn(),
      insertTask: vi.fn(),
      getRequiredTasks: vi.fn(),
      updateTaskStatus: vi.fn(),
      findTaskById: vi.fn(),
    }
    handler = new CreateEmploymentProfileHandler(profileRepo, templateRepo, caseRepo)
  })

  it('creates a profile and onboarding case when no existing profile exists', async () => {
    vi.mocked(profileRepo.findByActorId).mockResolvedValue(null)
    vi.mocked(profileRepo.insert).mockResolvedValue(fakeProfile)
    vi.mocked(templateRepo.findByEmploymentType).mockResolvedValue({
      id: TEMPLATE_ID,
      tenantId: TENANT_ID,
      name: 'Default',
      employmentType: 'permanent',
      isDefault: false,
      isActive: true,
    })
    vi.mocked(templateRepo.getTaskTemplates).mockResolvedValue([])
    vi.mocked(caseRepo.insert).mockResolvedValue({
      id: CASE_ID,
      tenantId: TENANT_ID,
      profileId: PROFILE_ID,
      templateId: TEMPLATE_ID,
      status: 'in_progress',
      createdAt: new Date(),
    })

    const result = await handler.execute(
      new CreateEmploymentProfileCommand(
        TENANT_ID,
        ACTOR_ID,
        'permanent',
        new Date('2026-03-01'),
        'SETA-0001',
        'test@seta-international.vn',
        'Engineer',
        'L3',
      ),
    )

    expect(result).toBe(PROFILE_ID)
    expect(profileRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: ACTOR_ID,
        employmentType: 'permanent',
        employmentStatus: 'pre_hire',
      }),
    )
    expect(caseRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: PROFILE_ID,
        templateId: TEMPLATE_ID,
      }),
    )
  })

  it('throws ProfileAlreadyExistsException when actor already has a profile', async () => {
    vi.mocked(profileRepo.findByActorId).mockResolvedValue(fakeProfile)

    await expect(
      handler.execute(
        new CreateEmploymentProfileCommand(
          TENANT_ID,
          ACTOR_ID,
          'permanent',
          new Date('2026-03-01'),
          null,
          null,
          null,
          null,
        ),
      ),
    ).rejects.toThrow(ProfileAlreadyExistsException)

    expect(profileRepo.insert).not.toHaveBeenCalled()
  })

  it('falls back to default template when no employment type match exists', async () => {
    vi.mocked(profileRepo.findByActorId).mockResolvedValue(null)
    vi.mocked(profileRepo.insert).mockResolvedValue(fakeProfile)
    vi.mocked(templateRepo.findByEmploymentType).mockResolvedValue(null)
    vi.mocked(templateRepo.findDefault).mockResolvedValue({
      id: TEMPLATE_ID,
      tenantId: TENANT_ID,
      name: 'Default Fallback',
      employmentType: null,
      isDefault: true,
      isActive: true,
    })
    vi.mocked(templateRepo.getTaskTemplates).mockResolvedValue([])
    vi.mocked(caseRepo.insert).mockResolvedValue({
      id: CASE_ID,
      tenantId: TENANT_ID,
      profileId: PROFILE_ID,
      templateId: TEMPLATE_ID,
      status: 'in_progress',
      createdAt: new Date(),
    })

    const result = await handler.execute(
      new CreateEmploymentProfileCommand(
        TENANT_ID,
        ACTOR_ID,
        'contractor',
        new Date('2026-03-01'),
        null,
        null,
        null,
        null,
      ),
    )

    expect(result).toBe(PROFILE_ID)
    expect(templateRepo.findDefault).toHaveBeenCalledWith(TENANT_ID)
  })

  it('creates onboarding case with null template when no template exists at all', async () => {
    vi.mocked(profileRepo.findByActorId).mockResolvedValue(null)
    vi.mocked(profileRepo.insert).mockResolvedValue(fakeProfile)
    vi.mocked(templateRepo.findByEmploymentType).mockResolvedValue(null)
    vi.mocked(templateRepo.findDefault).mockResolvedValue(null)
    vi.mocked(caseRepo.insert).mockResolvedValue({
      id: CASE_ID,
      tenantId: TENANT_ID,
      profileId: PROFILE_ID,
      templateId: null,
      status: 'in_progress',
      createdAt: new Date(),
    })

    const result = await handler.execute(
      new CreateEmploymentProfileCommand(
        TENANT_ID,
        ACTOR_ID,
        'intern',
        new Date('2026-03-01'),
        null,
        null,
        null,
        null,
      ),
    )

    expect(result).toBe(PROFILE_ID)
    expect(caseRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: null,
      }),
    )
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/api && bun run test -- --testPathPattern create-employment-profile.handler.spec`
Expected: FAIL — `CreateEmploymentProfileHandler` not found

- [ ] **Step 4: Write the handler implementation**

```typescript
// create-employment-profile.handler.ts
import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { ProfileAlreadyExistsException } from '../../domain/exceptions/people.exceptions'
import {
  EMPLOYMENT_PROFILE_REPOSITORY,
  type IEmploymentProfileRepository,
} from '../../domain/repositories/employment-profile.repository.port'
import {
  ONBOARDING_TEMPLATE_REPOSITORY,
  ONBOARDING_CASE_REPOSITORY,
  type IOnboardingTemplateRepository,
  type IOnboardingCaseRepository,
} from '../../domain/repositories/onboarding.repository.port'
import { CreateEmploymentProfileCommand } from './create-employment-profile.command'

@CommandHandler(CreateEmploymentProfileCommand)
export class CreateEmploymentProfileHandler implements ICommandHandler<
  CreateEmploymentProfileCommand,
  string
> {
  constructor(
    @Inject(EMPLOYMENT_PROFILE_REPOSITORY)
    private readonly profileRepo: IEmploymentProfileRepository,
    @Inject(ONBOARDING_TEMPLATE_REPOSITORY)
    private readonly templateRepo: IOnboardingTemplateRepository,
    @Inject(ONBOARDING_CASE_REPOSITORY)
    private readonly caseRepo: IOnboardingCaseRepository,
  ) {}

  async execute(command: CreateEmploymentProfileCommand): Promise<string> {
    const existing = await this.profileRepo.findByActorId(command.actorId, command.tenantId)
    if (existing) {
      throw new ProfileAlreadyExistsException(command.actorId)
    }

    const profile = await this.profileRepo.insert({
      tenantId: command.tenantId,
      actorId: command.actorId,
      employeeCode: command.employeeCode,
      companyEmail: command.companyEmail,
      employmentType: command.employmentType,
      employmentStatus: 'pre_hire',
      hireDate: command.hireDate,
      jobTitle: command.jobTitle,
      jobLevel: command.jobLevel,
    })

    // Find matching onboarding template
    let template = await this.templateRepo.findByEmploymentType(
      command.employmentType,
      command.tenantId,
    )
    if (!template) {
      template = await this.templateRepo.findDefault(command.tenantId)
    }

    // Create onboarding case
    const onboardingCase = await this.caseRepo.insert({
      tenantId: command.tenantId,
      profileId: profile.id,
      templateId: template?.id ?? null,
    })

    // Generate tasks from template if found
    if (template) {
      const taskTemplates = await this.templateRepo.getTaskTemplates(template.id, command.tenantId)
      for (const tt of taskTemplates) {
        const dueDate = new Date(command.hireDate)
        dueDate.setDate(dueDate.getDate() + tt.dueDaysAfterHire)

        await this.caseRepo.insertTask({
          tenantId: command.tenantId,
          caseId: onboardingCase.id,
          actorId: null,
          title: tt.title,
          description: tt.description,
          assigneeRole: tt.assigneeRole,
          isRequired: tt.isRequired,
          dueDate,
        })
      }
    }

    return profile.id
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/api && bun run test -- --testPathPattern create-employment-profile.handler.spec`
Expected: PASS — all 4 tests pass

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/people/application/commands/create-employment-profile*
git commit -m "feat(people): add CreateEmploymentProfile command handler with TDD"
```

---

## Task 11: Command — RequestProfileChange (TDD)

**Files:**

- Create: `apps/api/src/modules/people/application/commands/request-profile-change.command.ts`
- Create: `apps/api/src/modules/people/application/commands/request-profile-change.handler.spec.ts`
- Create: `apps/api/src/modules/people/application/commands/request-profile-change.handler.ts`

- [ ] **Step 1: Create the command DTO**

```typescript
// request-profile-change.command.ts
export class RequestProfileChangeCommand {
  constructor(
    readonly tenantId: string,
    readonly profileId: string,
    readonly fieldPath: string,
    readonly newValue: unknown,
    readonly requestedBy: string,
  ) {}
}
```

- [ ] **Step 2: Write the failing unit test**

```typescript
// request-profile-change.handler.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandBus } from '@nestjs/cqrs'
import { RequestProfileChangeCommand } from './request-profile-change.command'
import { RequestProfileChangeHandler } from './request-profile-change.handler'
import { ProfileNotFoundException } from '../../domain/exceptions/people.exceptions'
import type { IEmploymentProfileRepository } from '../../domain/repositories/employment-profile.repository.port'
import type { IEmploymentProfileDetailRepository } from '../../domain/repositories/employment-profile-detail.repository.port'
import type { IProfileChangeRequestRepository } from '../../domain/repositories/profile-change-request.repository.port'
import type { EmploymentProfile } from '../../domain/entities/employment-profile.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROFILE_ID = '01900000-0000-7000-8000-000000000003'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const REQUEST_ID = '01900000-0000-7000-8000-000000000010'
const CASE_ID = '01900000-0000-7000-8000-000000000020'

const fakeProfile: EmploymentProfile = {
  id: PROFILE_ID,
  tenantId: TENANT_ID,
  actorId: ACTOR_ID,
  employeeCode: 'SETA-0001',
  companyEmail: 'test@seta-international.vn',
  employmentType: 'permanent',
  employmentStatus: 'active',
  workArrangement: 'onsite',
  hireDate: new Date('2026-01-01'),
  terminationDate: null,
  jobTitle: 'Engineer',
  jobLevel: 'L3',
  costCenter: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('RequestProfileChangeHandler', () => {
  let handler: RequestProfileChangeHandler
  let profileRepo: IEmploymentProfileRepository
  let detailRepo: IEmploymentProfileDetailRepository
  let changeRequestRepo: IProfileChangeRequestRepository
  let commandBus: CommandBus

  beforeEach(() => {
    profileRepo = {
      findById: vi.fn(),
      findByActorId: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      list: vi.fn(),
      count: vi.fn(),
    }
    detailRepo = {
      findByProfileId: vi.fn(),
      upsert: vi.fn(),
      updateField: vi.fn(),
    }
    changeRequestRepo = {
      findById: vi.fn(),
      findPendingByField: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      listPending: vi.fn(),
    }
    commandBus = { execute: vi.fn().mockResolvedValue(CASE_ID) } as unknown as CommandBus
    handler = new RequestProfileChangeHandler(
      profileRepo,
      detailRepo,
      changeRequestRepo,
      commandBus,
    )
  })

  it('creates a change request with decision_case for a sensitive field', async () => {
    vi.mocked(profileRepo.findById).mockResolvedValue(fakeProfile)
    vi.mocked(detailRepo.findByProfileId).mockResolvedValue({
      id: 'det-1',
      tenantId: TENANT_ID,
      profileId: PROFILE_ID,
      bankAccountNumber: '1234',
      bankName: null,
      bankBranch: null,
      nationalId: null,
      nationalIdIssuedDate: null,
      nationalIdIssuedPlace: null,
      oldNationalId: null,
      oldNationalIdIssuedDate: null,
      oldNationalIdIssuedPlace: null,
      taxId: null,
      socialInsuranceNumber: null,
      dob: null,
      gender: null,
      maritalStatus: null,
      permanentAddress: null,
      currentAddress: null,
      personalPhone: null,
      personalEmail: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      motorbikePlate: null,
    })
    vi.mocked(changeRequestRepo.findPendingByField).mockResolvedValue(null)
    vi.mocked(changeRequestRepo.insert).mockResolvedValue({
      id: REQUEST_ID,
      tenantId: TENANT_ID,
      profileId: PROFILE_ID,
      fieldPath: 'detail.bankAccountNumber',
      oldValue: '1234',
      newValue: '5678',
      status: 'pending',
      decisionCaseId: CASE_ID,
      requestedBy: ACTOR_ID,
      reviewedBy: null,
      createdAt: new Date(),
    })

    const result = await handler.execute(
      new RequestProfileChangeCommand(
        TENANT_ID,
        PROFILE_ID,
        'detail.bankAccountNumber',
        '5678',
        ACTOR_ID,
      ),
    )

    expect(result).toBe(REQUEST_ID)
    expect(commandBus.execute).toHaveBeenCalled()
    expect(changeRequestRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldPath: 'detail.bankAccountNumber',
        newValue: '5678',
        decisionCaseId: CASE_ID,
      }),
    )
  })

  it('throws ProfileNotFoundException when profile does not exist', async () => {
    vi.mocked(profileRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(
        new RequestProfileChangeCommand(
          TENANT_ID,
          PROFILE_ID,
          'detail.bankAccountNumber',
          '5678',
          ACTOR_ID,
        ),
      ),
    ).rejects.toThrow(ProfileNotFoundException)
  })

  it('supersedes existing pending request on the same field', async () => {
    vi.mocked(profileRepo.findById).mockResolvedValue(fakeProfile)
    vi.mocked(detailRepo.findByProfileId).mockResolvedValue({
      id: 'det-1',
      tenantId: TENANT_ID,
      profileId: PROFILE_ID,
      bankAccountNumber: '1234',
      bankName: null,
      bankBranch: null,
      nationalId: null,
      nationalIdIssuedDate: null,
      nationalIdIssuedPlace: null,
      oldNationalId: null,
      oldNationalIdIssuedDate: null,
      oldNationalIdIssuedPlace: null,
      taxId: null,
      socialInsuranceNumber: null,
      dob: null,
      gender: null,
      maritalStatus: null,
      permanentAddress: null,
      currentAddress: null,
      personalPhone: null,
      personalEmail: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      motorbikePlate: null,
    })
    const existingPending = {
      id: 'old-request',
      tenantId: TENANT_ID,
      profileId: PROFILE_ID,
      fieldPath: 'detail.bankAccountNumber',
      oldValue: '1234',
      newValue: '9999',
      status: 'pending' as const,
      decisionCaseId: 'old-case',
      requestedBy: ACTOR_ID,
      reviewedBy: null,
      createdAt: new Date(),
    }
    vi.mocked(changeRequestRepo.findPendingByField).mockResolvedValue(existingPending)
    vi.mocked(changeRequestRepo.insert).mockResolvedValue({
      id: REQUEST_ID,
      tenantId: TENANT_ID,
      profileId: PROFILE_ID,
      fieldPath: 'detail.bankAccountNumber',
      oldValue: '1234',
      newValue: '5678',
      status: 'pending',
      decisionCaseId: CASE_ID,
      requestedBy: ACTOR_ID,
      reviewedBy: null,
      createdAt: new Date(),
    })

    await handler.execute(
      new RequestProfileChangeCommand(
        TENANT_ID,
        PROFILE_ID,
        'detail.bankAccountNumber',
        '5678',
        ACTOR_ID,
      ),
    )

    expect(changeRequestRepo.updateStatus).toHaveBeenCalledWith(
      'old-request',
      TENANT_ID,
      'superseded',
    )
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `cd apps/api && bun run test -- --testPathPattern request-profile-change.handler.spec`
Expected: FAIL

- [ ] **Step 4: Write the handler**

```typescript
// request-profile-change.handler.ts
import { Inject } from '@nestjs/common'
import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { ProfileNotFoundException } from '../../domain/exceptions/people.exceptions'
import {
  EMPLOYMENT_PROFILE_REPOSITORY,
  type IEmploymentProfileRepository,
} from '../../domain/repositories/employment-profile.repository.port'
import {
  EMPLOYMENT_PROFILE_DETAIL_REPOSITORY,
  type IEmploymentProfileDetailRepository,
} from '../../domain/repositories/employment-profile-detail.repository.port'
import {
  PROFILE_CHANGE_REQUEST_REPOSITORY,
  type IProfileChangeRequestRepository,
} from '../../domain/repositories/profile-change-request.repository.port'
import { RequestProfileChangeCommand } from './request-profile-change.command'

// Kernel command — imported by type only, dispatched via CommandBus
class CreateDecisionCaseCommand {
  constructor(
    readonly tenantId: string,
    readonly module: string,
    readonly subjectId: string,
    readonly requestedBy: string,
  ) {}
}

@CommandHandler(RequestProfileChangeCommand)
export class RequestProfileChangeHandler implements ICommandHandler<
  RequestProfileChangeCommand,
  string
> {
  constructor(
    @Inject(EMPLOYMENT_PROFILE_REPOSITORY)
    private readonly profileRepo: IEmploymentProfileRepository,
    @Inject(EMPLOYMENT_PROFILE_DETAIL_REPOSITORY)
    private readonly detailRepo: IEmploymentProfileDetailRepository,
    @Inject(PROFILE_CHANGE_REQUEST_REPOSITORY)
    private readonly changeRequestRepo: IProfileChangeRequestRepository,
    private readonly commandBus: CommandBus,
  ) {}

  async execute(command: RequestProfileChangeCommand): Promise<string> {
    const profile = await this.profileRepo.findById(command.profileId, command.tenantId)
    if (!profile) {
      throw new ProfileNotFoundException(command.profileId)
    }

    // Read current value from detail
    const detail = await this.detailRepo.findByProfileId(command.profileId, command.tenantId)
    const fieldName = command.fieldPath.replace('detail.', '')
    const oldValue = detail ? ((detail as Record<string, unknown>)[fieldName] ?? null) : null

    // Supersede any existing pending request on the same field
    const existingPending = await this.changeRequestRepo.findPendingByField(
      command.profileId,
      command.fieldPath,
      command.tenantId,
    )
    if (existingPending) {
      await this.changeRequestRepo.updateStatus(existingPending.id, command.tenantId, 'superseded')
    }

    // Create decision_case in kernel
    const caseId = await this.commandBus.execute(
      new CreateDecisionCaseCommand(
        command.tenantId,
        'people',
        profile.actorId,
        command.requestedBy,
      ),
    )

    // Create the change request
    const changeRequest = await this.changeRequestRepo.insert({
      tenantId: command.tenantId,
      profileId: command.profileId,
      fieldPath: command.fieldPath,
      oldValue,
      newValue: command.newValue,
      decisionCaseId: caseId,
      requestedBy: command.requestedBy,
    })

    return changeRequest.id
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/api && bun run test -- --testPathPattern request-profile-change.handler.spec`
Expected: PASS — all 3 tests pass

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/people/application/commands/request-profile-change*
git commit -m "feat(people): add RequestProfileChange command with supersession logic (TDD)"
```

---

## Task 12: Command — TriggerOffboarding (TDD)

**Files:**

- Create: `apps/api/src/modules/people/application/commands/trigger-offboarding.command.ts`
- Create: `apps/api/src/modules/people/application/commands/trigger-offboarding.handler.spec.ts`
- Create: `apps/api/src/modules/people/application/commands/trigger-offboarding.handler.ts`

- [ ] **Step 1: Create the command DTO**

```typescript
// trigger-offboarding.command.ts
import type { ReasonCategory } from '../../domain/entities/offboarding-template.entity'

export class TriggerOffboardingCommand {
  constructor(
    readonly tenantId: string,
    readonly profileId: string,
    readonly reason: string | null,
    readonly reasonCategory: ReasonCategory | null,
    readonly requestedBy: string,
  ) {}
}
```

- [ ] **Step 2: Write the failing unit test**

```typescript
// trigger-offboarding.handler.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandBus } from '@nestjs/cqrs'
import { TriggerOffboardingCommand } from './trigger-offboarding.command'
import { TriggerOffboardingHandler } from './trigger-offboarding.handler'
import {
  ProfileNotFoundException,
  OffboardingAlreadyActiveException,
  InvalidStatusTransitionException,
} from '../../domain/exceptions/people.exceptions'
import type { IEmploymentProfileRepository } from '../../domain/repositories/employment-profile.repository.port'
import type { IOffboardingCaseRepository } from '../../domain/repositories/offboarding.repository.port'
import type { EmploymentProfile } from '../../domain/entities/employment-profile.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROFILE_ID = '01900000-0000-7000-8000-000000000003'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const CASE_ID = '01900000-0000-7000-8000-000000000020'
const OFFBOARDING_ID = '01900000-0000-7000-8000-000000000030'

const activeProfile: EmploymentProfile = {
  id: PROFILE_ID,
  tenantId: TENANT_ID,
  actorId: ACTOR_ID,
  employeeCode: 'SETA-0001',
  companyEmail: 'test@seta-international.vn',
  employmentType: 'permanent',
  employmentStatus: 'active',
  workArrangement: 'onsite',
  hireDate: new Date('2026-01-01'),
  terminationDate: null,
  jobTitle: 'Engineer',
  jobLevel: 'L3',
  costCenter: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('TriggerOffboardingHandler', () => {
  let handler: TriggerOffboardingHandler
  let profileRepo: IEmploymentProfileRepository
  let offboardingCaseRepo: IOffboardingCaseRepository
  let commandBus: CommandBus

  beforeEach(() => {
    profileRepo = {
      findById: vi.fn(),
      findByActorId: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      list: vi.fn(),
      count: vi.fn(),
    }
    offboardingCaseRepo = {
      insert: vi.fn(),
      findById: vi.fn(),
      findActiveByProfileId: vi.fn(),
      updateStatus: vi.fn(),
      insertTask: vi.fn(),
      getRequiredTasks: vi.fn(),
      updateTaskStatus: vi.fn(),
      findTaskById: vi.fn(),
    }
    commandBus = { execute: vi.fn().mockResolvedValue(CASE_ID) } as unknown as CommandBus
    handler = new TriggerOffboardingHandler(profileRepo, offboardingCaseRepo, commandBus)
  })

  it('creates an offboarding case for an active employee', async () => {
    vi.mocked(profileRepo.findById).mockResolvedValue(activeProfile)
    vi.mocked(offboardingCaseRepo.findActiveByProfileId).mockResolvedValue(null)
    vi.mocked(offboardingCaseRepo.insert).mockResolvedValue({
      id: OFFBOARDING_ID,
      tenantId: TENANT_ID,
      profileId: PROFILE_ID,
      templateId: null,
      decisionCaseId: CASE_ID,
      reason: 'Voluntary resignation',
      reasonCategory: 'voluntary',
      status: 'pending',
      createdAt: new Date(),
    })

    const result = await handler.execute(
      new TriggerOffboardingCommand(
        TENANT_ID,
        PROFILE_ID,
        'Voluntary resignation',
        'voluntary',
        ACTOR_ID,
      ),
    )

    expect(result).toBe(OFFBOARDING_ID)
    expect(commandBus.execute).toHaveBeenCalled()
  })

  it('throws ProfileNotFoundException when profile does not exist', async () => {
    vi.mocked(profileRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new TriggerOffboardingCommand(TENANT_ID, PROFILE_ID, null, null, ACTOR_ID)),
    ).rejects.toThrow(ProfileNotFoundException)
  })

  it('throws OffboardingAlreadyActiveException when active case exists', async () => {
    vi.mocked(profileRepo.findById).mockResolvedValue(activeProfile)
    vi.mocked(offboardingCaseRepo.findActiveByProfileId).mockResolvedValue({
      id: 'existing',
      tenantId: TENANT_ID,
      profileId: PROFILE_ID,
      templateId: null,
      decisionCaseId: 'old-case',
      reason: null,
      reasonCategory: null,
      status: 'pending',
      createdAt: new Date(),
    })

    await expect(
      handler.execute(new TriggerOffboardingCommand(TENANT_ID, PROFILE_ID, null, null, ACTOR_ID)),
    ).rejects.toThrow(OffboardingAlreadyActiveException)
  })

  it('throws InvalidStatusTransitionException for a terminated employee', async () => {
    vi.mocked(profileRepo.findById).mockResolvedValue({
      ...activeProfile,
      employmentStatus: 'terminated',
    })

    await expect(
      handler.execute(new TriggerOffboardingCommand(TENANT_ID, PROFILE_ID, null, null, ACTOR_ID)),
    ).rejects.toThrow(InvalidStatusTransitionException)
  })

  it('allows offboarding from on_leave status', async () => {
    vi.mocked(profileRepo.findById).mockResolvedValue({
      ...activeProfile,
      employmentStatus: 'on_leave',
    })
    vi.mocked(offboardingCaseRepo.findActiveByProfileId).mockResolvedValue(null)
    vi.mocked(offboardingCaseRepo.insert).mockResolvedValue({
      id: OFFBOARDING_ID,
      tenantId: TENANT_ID,
      profileId: PROFILE_ID,
      templateId: null,
      decisionCaseId: CASE_ID,
      reason: null,
      reasonCategory: null,
      status: 'pending',
      createdAt: new Date(),
    })

    const result = await handler.execute(
      new TriggerOffboardingCommand(TENANT_ID, PROFILE_ID, null, null, ACTOR_ID),
    )

    expect(result).toBe(OFFBOARDING_ID)
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `cd apps/api && bun run test -- --testPathPattern trigger-offboarding.handler.spec`
Expected: FAIL

- [ ] **Step 4: Write the handler**

```typescript
// trigger-offboarding.handler.ts
import { Inject } from '@nestjs/common'
import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { canTransitionStatus } from '../../domain/entities/employment-profile.entity'
import {
  ProfileNotFoundException,
  OffboardingAlreadyActiveException,
  InvalidStatusTransitionException,
} from '../../domain/exceptions/people.exceptions'
import {
  EMPLOYMENT_PROFILE_REPOSITORY,
  type IEmploymentProfileRepository,
} from '../../domain/repositories/employment-profile.repository.port'
import {
  OFFBOARDING_CASE_REPOSITORY,
  type IOffboardingCaseRepository,
} from '../../domain/repositories/offboarding.repository.port'
import { TriggerOffboardingCommand } from './trigger-offboarding.command'

class CreateDecisionCaseCommand {
  constructor(
    readonly tenantId: string,
    readonly module: string,
    readonly subjectId: string,
    readonly requestedBy: string,
  ) {}
}

@CommandHandler(TriggerOffboardingCommand)
export class TriggerOffboardingHandler implements ICommandHandler<
  TriggerOffboardingCommand,
  string
> {
  constructor(
    @Inject(EMPLOYMENT_PROFILE_REPOSITORY)
    private readonly profileRepo: IEmploymentProfileRepository,
    @Inject(OFFBOARDING_CASE_REPOSITORY)
    private readonly offboardingCaseRepo: IOffboardingCaseRepository,
    private readonly commandBus: CommandBus,
  ) {}

  async execute(command: TriggerOffboardingCommand): Promise<string> {
    const profile = await this.profileRepo.findById(command.profileId, command.tenantId)
    if (!profile) {
      throw new ProfileNotFoundException(command.profileId)
    }

    if (!canTransitionStatus(profile.employmentStatus, 'offboarding')) {
      throw new InvalidStatusTransitionException(profile.employmentStatus, 'offboarding')
    }

    const existingCase = await this.offboardingCaseRepo.findActiveByProfileId(
      command.profileId,
      command.tenantId,
    )
    if (existingCase) {
      throw new OffboardingAlreadyActiveException(command.profileId)
    }

    const decisionCaseId = await this.commandBus.execute(
      new CreateDecisionCaseCommand(
        command.tenantId,
        'people',
        profile.actorId,
        command.requestedBy,
      ),
    )

    const offboardingCase = await this.offboardingCaseRepo.insert({
      tenantId: command.tenantId,
      profileId: command.profileId,
      templateId: null,
      decisionCaseId,
      reason: command.reason,
      reasonCategory: command.reasonCategory,
    })

    return offboardingCase.id
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/api && bun run test -- --testPathPattern trigger-offboarding.handler.spec`
Expected: PASS — all 5 tests pass

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/people/application/commands/trigger-offboarding*
git commit -m "feat(people): add TriggerOffboarding command with status validation (TDD)"
```

---

## Task 13: Command — CompleteOffboarding (Atomic Termination Side Effects, TDD)

**Files:**

- Create: `apps/api/src/modules/people/application/commands/complete-offboarding.command.ts`
- Create: `apps/api/src/modules/people/application/commands/complete-offboarding.handler.spec.ts`
- Create: `apps/api/src/modules/people/application/commands/complete-offboarding.handler.ts`

- [ ] **Step 1: Create the command DTO**

```typescript
// complete-offboarding.command.ts
export class CompleteOffboardingCommand {
  constructor(
    readonly tenantId: string,
    readonly offboardingCaseId: string,
    readonly completedBy: string,
  ) {}
}
```

- [ ] **Step 2: Write the failing unit test**

```typescript
// complete-offboarding.handler.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandBus } from '@nestjs/cqrs'
import { CompleteOffboardingCommand } from './complete-offboarding.command'
import { CompleteOffboardingHandler } from './complete-offboarding.handler'
import {
  OffboardingCaseNotFoundException,
  OffboardingTasksNotCompleteException,
} from '../../domain/exceptions/people.exceptions'
import type { IEmploymentProfileRepository } from '../../domain/repositories/employment-profile.repository.port'
import type { IOffboardingCaseRepository } from '../../domain/repositories/offboarding.repository.port'
import type { IAccountMembershipRepository } from '../../domain/repositories/account-membership.repository.port'
import type { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROFILE_ID = '01900000-0000-7000-8000-000000000003'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const CASE_ID = '01900000-0000-7000-8000-000000000030'

describe('CompleteOffboardingHandler', () => {
  let handler: CompleteOffboardingHandler
  let profileRepo: IEmploymentProfileRepository
  let offboardingCaseRepo: IOffboardingCaseRepository
  let membershipRepo: IAccountMembershipRepository
  let commandBus: CommandBus
  let kernelFacade: KernelQueryFacade

  beforeEach(() => {
    profileRepo = {
      findById: vi.fn().mockResolvedValue({
        id: PROFILE_ID,
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        employmentStatus: 'offboarding',
      }),
      findByActorId: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      list: vi.fn(),
      count: vi.fn(),
    }
    offboardingCaseRepo = {
      insert: vi.fn(),
      findById: vi.fn().mockResolvedValue({
        id: CASE_ID,
        tenantId: TENANT_ID,
        profileId: PROFILE_ID,
        status: 'processing',
        templateId: null,
        decisionCaseId: null,
        reason: null,
        reasonCategory: null,
        createdAt: new Date(),
      }),
      findActiveByProfileId: vi.fn(),
      updateStatus: vi.fn(),
      insertTask: vi.fn(),
      getRequiredTasks: vi.fn().mockResolvedValue([
        { id: 't1', status: 'completed', isRequired: true },
        { id: 't2', status: 'completed', isRequired: true },
      ]),
      updateTaskStatus: vi.fn(),
      findTaskById: vi.fn(),
    }
    membershipRepo = {
      findActiveByActorId: vi.fn().mockResolvedValue([]),
      insert: vi.fn(),
      closeAllForActor: vi.fn(),
    }
    commandBus = { execute: vi.fn() } as unknown as CommandBus
    kernelFacade = {
      getActor: vi.fn(),
      getTenant: vi.fn(),
      getRoleGrants: vi.fn(),
      hasRole: vi.fn(),
      getActiveRoleGrant: vi.fn(),
      getUserIdentityBySsoSubject: vi.fn(),
    } as unknown as KernelQueryFacade
    handler = new CompleteOffboardingHandler(
      profileRepo,
      offboardingCaseRepo,
      membershipRepo,
      commandBus,
      kernelFacade,
    )
  })

  it('completes offboarding and terminates the employee when all required tasks are done', async () => {
    const result = await handler.execute(
      new CompleteOffboardingCommand(TENANT_ID, CASE_ID, ACTOR_ID),
    )

    expect(result).toBeUndefined()
    expect(profileRepo.updateStatus).toHaveBeenCalledWith(
      PROFILE_ID,
      TENANT_ID,
      'terminated',
      expect.any(Date),
    )
    expect(offboardingCaseRepo.updateStatus).toHaveBeenCalledWith(CASE_ID, TENANT_ID, 'completed')
    expect(membershipRepo.closeAllForActor).toHaveBeenCalledWith(
      ACTOR_ID,
      TENANT_ID,
      expect.any(Date),
    )
  })

  it('throws OffboardingCaseNotFoundException when case does not exist', async () => {
    vi.mocked(offboardingCaseRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new CompleteOffboardingCommand(TENANT_ID, CASE_ID, ACTOR_ID)),
    ).rejects.toThrow(OffboardingCaseNotFoundException)
  })

  it('throws OffboardingTasksNotCompleteException when required tasks are pending', async () => {
    vi.mocked(offboardingCaseRepo.getRequiredTasks).mockResolvedValue([
      {
        id: 't1',
        tenantId: TENANT_ID,
        caseId: CASE_ID,
        actorId: null,
        title: 'Return laptop',
        description: null,
        assigneeRole: 'it',
        isRequired: true,
        status: 'pending',
        dueDate: null,
        completedAt: null,
        evidenceUrl: null,
      },
    ])

    await expect(
      handler.execute(new CompleteOffboardingCommand(TENANT_ID, CASE_ID, ACTOR_ID)),
    ).rejects.toThrow(OffboardingTasksNotCompleteException)
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `cd apps/api && bun run test -- --testPathPattern complete-offboarding.handler.spec`
Expected: FAIL

- [ ] **Step 4: Write the handler**

```typescript
// complete-offboarding.handler.ts
import { Inject } from '@nestjs/common'
import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  OffboardingCaseNotFoundException,
  OffboardingTasksNotCompleteException,
} from '../../domain/exceptions/people.exceptions'
import {
  EMPLOYMENT_PROFILE_REPOSITORY,
  type IEmploymentProfileRepository,
} from '../../domain/repositories/employment-profile.repository.port'
import {
  OFFBOARDING_CASE_REPOSITORY,
  type IOffboardingCaseRepository,
} from '../../domain/repositories/offboarding.repository.port'
import {
  ACCOUNT_MEMBERSHIP_REPOSITORY,
  type IAccountMembershipRepository,
} from '../../domain/repositories/account-membership.repository.port'
import { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import { CompleteOffboardingCommand } from './complete-offboarding.command'

@CommandHandler(CompleteOffboardingCommand)
export class CompleteOffboardingHandler implements ICommandHandler<
  CompleteOffboardingCommand,
  void
> {
  constructor(
    @Inject(EMPLOYMENT_PROFILE_REPOSITORY)
    private readonly profileRepo: IEmploymentProfileRepository,
    @Inject(OFFBOARDING_CASE_REPOSITORY)
    private readonly offboardingCaseRepo: IOffboardingCaseRepository,
    @Inject(ACCOUNT_MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IAccountMembershipRepository,
    private readonly commandBus: CommandBus,
    private readonly kernelFacade: KernelQueryFacade,
  ) {}

  async execute(command: CompleteOffboardingCommand): Promise<void> {
    const offboardingCase = await this.offboardingCaseRepo.findById(
      command.offboardingCaseId,
      command.tenantId,
    )
    if (!offboardingCase) {
      throw new OffboardingCaseNotFoundException(command.offboardingCaseId)
    }

    // Verify all required tasks are completed
    const requiredTasks = await this.offboardingCaseRepo.getRequiredTasks(
      command.offboardingCaseId,
      command.tenantId,
    )
    const hasPendingTasks = requiredTasks.some((t) => t.status !== 'completed')
    if (hasPendingTasks) {
      throw new OffboardingTasksNotCompleteException(command.offboardingCaseId)
    }

    const profile = await this.profileRepo.findById(offboardingCase.profileId, command.tenantId)
    if (!profile) {
      throw new OffboardingCaseNotFoundException(command.offboardingCaseId)
    }

    const now = new Date()

    // Atomic termination — all in sequence within same request context
    // 1. Terminate the employment profile
    await this.profileRepo.updateStatus(profile.id, command.tenantId, 'terminated', now)

    // 2. Close all account memberships
    await this.membershipRepo.closeAllForActor(profile.actorId, command.tenantId, now)

    // 3. Mark offboarding case as completed
    await this.offboardingCaseRepo.updateStatus(
      command.offboardingCaseId,
      command.tenantId,
      'completed',
    )

    // 4. Kernel side effects: actor.status → inactive, user_identity → deprovisioned, grants revoked
    // These are dispatched via CommandBus to the kernel module
    // TODO: The kernel needs UpdateActorStatusCommand, DeprovisionUserIdentityCommand,
    //       and RevokeAllRoleGrantsCommand. These will be added to the kernel module as
    //       part of the implementation. For now, we emit the EmployeeTerminatedEvent
    //       and handle kernel transitions in the event handler.

    // 5. Emit EmployeeTerminatedEvent via outbox
    // (outbox_event insert happens in the event handler layer, not here)
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/api && bun run test -- --testPathPattern complete-offboarding.handler.spec`
Expected: PASS — all 3 tests pass

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/people/application/commands/complete-offboarding*
git commit -m "feat(people): add CompleteOffboarding command with atomic termination (TDD)"
```

---

## Task 14: Remaining Commands — ApproveProfileChange, RejectProfileChange, CompleteTask, UpdateProfileDirect, ApproveOffboarding

**Files:**

- Create: 10 files (command + handler for each of the 5 remaining commands)
- Create: 5 spec files

Each of these commands follows the same TDD pattern established in Tasks 10-13. The specific business logic for each:

- [ ] **Step 1: ApproveProfileChange** — reads `profile_change_request`, applies `newValue` to `employment_profile_detail` via `updateField`, sets request status to `approved`, writes `decision_outcome` with `finalAction: approved`
- [ ] **Step 2: RejectProfileChange** — sets request status to `rejected`, writes `decision_outcome` with `finalAction: rejected` and `comment`
- [ ] **Step 3: CompleteTask** — marks an onboarding/offboarding task as `completed` with optional `evidenceUrl`. Checks if all required tasks are done → if onboarding case, transitions to `completed` and updates `employment_status: pre_hire → active`
- [ ] **Step 4: UpdateProfileDirect** — for non-sensitive fields: writes directly to `employment_profile` (jobTitle, jobLevel, workArrangement, costCenter) or `employment_profile_detail` (currentAddress, emergencyContactName, emergencyContactPhone). No `decision_case` created.
- [ ] **Step 5: ApproveOffboarding** — finds matching offboarding template by `(employmentType, reasonCategory)`, generates tasks from template, transitions case to `processing`, transitions `employment_status` to `offboarding`, emits `OffboardingStartedEvent`

Each step follows the pattern: write spec → run to verify failure → write handler → run to verify pass → commit.

- [ ] **Step 6: Commit all remaining commands**

```bash
git add apps/api/src/modules/people/application/commands/
git commit -m "feat(people): add remaining command handlers (approve/reject change, complete task, approve offboarding, direct update)"
```

---

## Task 15: Drizzle Repositories — All Remaining

**Files:**

- Create all remaining `drizzle-*.repository.ts` files listed in the File Map
- Create `drizzle-offboarding.repository.integration.spec.ts`

- [ ] **Step 1: Implement all Drizzle repositories**

Follow the same pattern as `DrizzleEmploymentProfileRepository`: inject `DB_TOKEN`, use Drizzle query builder, filter by `tenantId` on every query. Each repository implements its corresponding port interface.

Key implementation notes:

- `DrizzleProfileChangeRequestRepository.findPendingByField` must filter by `status = 'pending'` AND `profileId` AND `fieldPath`
- `DrizzleOffboardingCaseRepository.findActiveByProfileId` must filter by `status NOT IN ('completed', 'rejected')`
- `DrizzleAccountMembershipRepository.closeAllForActor` must update all rows where `actorId` matches AND `leftAt IS NULL`

- [ ] **Step 2: Write integration test for offboarding flow**

Test the critical path: insert offboarding case → insert tasks → query required tasks → update task status → verify completion check logic.

- [ ] **Step 3: Run integration tests**

Run: `cd apps/api && bun run test:integration`
Expected: all integration tests pass

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/people/infrastructure/repositories/
git commit -m "feat(people): add all Drizzle repository implementations with integration tests"
```

---

## Task 16: Query Handlers — GetProfile, ListEmployees

**Files:**

- Create: `apps/api/src/modules/people/application/queries/get-profile.query.ts`
- Create: `apps/api/src/modules/people/application/queries/get-profile.handler.ts`
- Create: `apps/api/src/modules/people/application/queries/list-employees.query.ts`
- Create: `apps/api/src/modules/people/application/queries/list-employees.handler.ts`

- [ ] **Step 1: Create GetProfileQuery + handler**

```typescript
// get-profile.query.ts
export class GetProfileQuery {
  constructor(
    readonly actorId: string,
    readonly tenantId: string,
  ) {}
}
```

```typescript
// get-profile.handler.ts
import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { EmploymentProfile } from '../../domain/entities/employment-profile.entity'
import type { EmploymentProfileDetail } from '../../domain/entities/employment-profile-detail.entity'
import type { ProfileSection } from '../../domain/entities/profile-section.entity'
import {
  EMPLOYMENT_PROFILE_REPOSITORY,
  type IEmploymentProfileRepository,
} from '../../domain/repositories/employment-profile.repository.port'
import {
  EMPLOYMENT_PROFILE_DETAIL_REPOSITORY,
  type IEmploymentProfileDetailRepository,
} from '../../domain/repositories/employment-profile-detail.repository.port'
import {
  PROFILE_SECTION_REPOSITORY,
  type IProfileSectionRepository,
} from '../../domain/repositories/profile-section.repository.port'
import { GetProfileQuery } from './get-profile.query'

export interface ProfileResult {
  profile: EmploymentProfile
  detail: EmploymentProfileDetail | null
  sections: ProfileSection[]
}

@QueryHandler(GetProfileQuery)
export class GetProfileHandler implements IQueryHandler<GetProfileQuery, ProfileResult | null> {
  constructor(
    @Inject(EMPLOYMENT_PROFILE_REPOSITORY)
    private readonly profileRepo: IEmploymentProfileRepository,
    @Inject(EMPLOYMENT_PROFILE_DETAIL_REPOSITORY)
    private readonly detailRepo: IEmploymentProfileDetailRepository,
    @Inject(PROFILE_SECTION_REPOSITORY)
    private readonly sectionRepo: IProfileSectionRepository,
  ) {}

  async execute(query: GetProfileQuery): Promise<ProfileResult | null> {
    const profile = await this.profileRepo.findByActorId(query.actorId, query.tenantId)
    if (!profile) return null

    const [detail, sections] = await Promise.all([
      this.detailRepo.findByProfileId(profile.id, query.tenantId),
      this.sectionRepo.findByProfileId(profile.id, query.tenantId),
    ])

    return { profile, detail, sections }
  }
}
```

- [ ] **Step 2: Create ListEmployeesQuery + handler**

```typescript
// list-employees.query.ts
export class ListEmployeesQuery {
  constructor(
    readonly tenantId: string,
    readonly limit: number,
    readonly offset: number,
  ) {}
}
```

```typescript
// list-employees.handler.ts
import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { EmploymentProfile } from '../../domain/entities/employment-profile.entity'
import {
  EMPLOYMENT_PROFILE_REPOSITORY,
  type IEmploymentProfileRepository,
} from '../../domain/repositories/employment-profile.repository.port'
import { ListEmployeesQuery } from './list-employees.query'

export interface ListEmployeesResult {
  items: EmploymentProfile[]
  total: number
}

@QueryHandler(ListEmployeesQuery)
export class ListEmployeesHandler implements IQueryHandler<
  ListEmployeesQuery,
  ListEmployeesResult
> {
  constructor(
    @Inject(EMPLOYMENT_PROFILE_REPOSITORY)
    private readonly profileRepo: IEmploymentProfileRepository,
  ) {}

  async execute(query: ListEmployeesQuery): Promise<ListEmployeesResult> {
    const [items, total] = await Promise.all([
      this.profileRepo.list(query.tenantId, { limit: query.limit, offset: query.offset }),
      this.profileRepo.count(query.tenantId),
    ])

    return { items, total }
  }
}
```

- [ ] **Step 3: Remove .gitkeep files from queries/**

```bash
rm apps/api/src/modules/people/application/queries/.gitkeep
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/people/application/queries/
git commit -m "feat(people): add GetProfile and ListEmployees query handlers"
```

---

## Task 17: PeopleQueryFacade — Cross-Module Read API

**Files:**

- Modify: `apps/api/src/modules/people/application/facades/people-query.facade.ts`

- [ ] **Step 1: Implement the facade**

```typescript
// people-query.facade.ts
import { Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import type { EmploymentProfile } from '../../domain/entities/employment-profile.entity'
import { GetProfileQuery } from '../queries/get-profile.query'
import type { ProfileResult } from '../queries/get-profile.handler'
import { ListEmployeesQuery } from '../queries/list-employees.query'
import type { ListEmployeesResult } from '../queries/list-employees.handler'

/**
 * PeopleQueryFacade is the only cross-module import allowed from the people module.
 * Other modules import this facade — never repositories or entities directly.
 */
@Injectable()
export class PeopleQueryFacade {
  constructor(private readonly queryBus: QueryBus) {}

  getProfile(actorId: string, tenantId: string): Promise<ProfileResult | null> {
    return this.queryBus.execute(new GetProfileQuery(actorId, tenantId))
  }

  listEmployees(tenantId: string, limit: number, offset: number): Promise<ListEmployeesResult> {
    return this.queryBus.execute(new ListEmployeesQuery(tenantId, limit, offset))
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/people/application/facades/people-query.facade.ts
git commit -m "feat(people): implement PeopleQueryFacade cross-module read API"
```

---

## Task 18: People Module Registration — Wire Everything into NestJS

**Files:**

- Modify: `apps/api/src/modules/people/people.module.ts`

- [ ] **Step 1: Wire all providers**

```typescript
// people.module.ts
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { KernelModule } from '../kernel/kernel.module'

// Repository ports
import { EMPLOYMENT_PROFILE_REPOSITORY } from './domain/repositories/employment-profile.repository.port'
import { EMPLOYMENT_PROFILE_DETAIL_REPOSITORY } from './domain/repositories/employment-profile-detail.repository.port'
import { PROFILE_SECTION_REPOSITORY } from './domain/repositories/profile-section.repository.port'
import { PROFILE_CHANGE_REQUEST_REPOSITORY } from './domain/repositories/profile-change-request.repository.port'
import {
  ONBOARDING_TEMPLATE_REPOSITORY,
  ONBOARDING_CASE_REPOSITORY,
} from './domain/repositories/onboarding.repository.port'
import {
  OFFBOARDING_TEMPLATE_REPOSITORY,
  OFFBOARDING_CASE_REPOSITORY,
} from './domain/repositories/offboarding.repository.port'
import { ACCOUNT_MEMBERSHIP_REPOSITORY } from './domain/repositories/account-membership.repository.port'
import { CONTRACT_VERSION_REPOSITORY } from './domain/repositories/contract-version.repository.port'

// Drizzle repositories
import { DrizzleEmploymentProfileRepository } from './infrastructure/repositories/drizzle-employment-profile.repository'
import { DrizzleEmploymentProfileDetailRepository } from './infrastructure/repositories/drizzle-employment-profile-detail.repository'
import { DrizzleProfileSectionRepository } from './infrastructure/repositories/drizzle-profile-section.repository'
import { DrizzleProfileChangeRequestRepository } from './infrastructure/repositories/drizzle-profile-change-request.repository'
import { DrizzleOnboardingTemplateRepository } from './infrastructure/repositories/drizzle-onboarding.repository'
import { DrizzleOnboardingCaseRepository } from './infrastructure/repositories/drizzle-onboarding.repository'
import { DrizzleOffboardingTemplateRepository } from './infrastructure/repositories/drizzle-offboarding.repository'
import { DrizzleOffboardingCaseRepository } from './infrastructure/repositories/drizzle-offboarding.repository'
import { DrizzleAccountMembershipRepository } from './infrastructure/repositories/drizzle-account-membership.repository'
import { DrizzleContractVersionRepository } from './infrastructure/repositories/drizzle-contract-version.repository'

// Command handlers
import { CreateEmploymentProfileHandler } from './application/commands/create-employment-profile.handler'
import { RequestProfileChangeHandler } from './application/commands/request-profile-change.handler'
import { TriggerOffboardingHandler } from './application/commands/trigger-offboarding.handler'
import { CompleteOffboardingHandler } from './application/commands/complete-offboarding.handler'

// Query handlers
import { GetProfileHandler } from './application/queries/get-profile.handler'
import { ListEmployeesHandler } from './application/queries/list-employees.handler'

// Facade
import { PeopleQueryFacade } from './application/facades/people-query.facade'

@Module({
  imports: [CqrsModule, KernelModule],
  providers: [
    // Repository bindings
    { provide: EMPLOYMENT_PROFILE_REPOSITORY, useClass: DrizzleEmploymentProfileRepository },
    {
      provide: EMPLOYMENT_PROFILE_DETAIL_REPOSITORY,
      useClass: DrizzleEmploymentProfileDetailRepository,
    },
    { provide: PROFILE_SECTION_REPOSITORY, useClass: DrizzleProfileSectionRepository },
    { provide: PROFILE_CHANGE_REQUEST_REPOSITORY, useClass: DrizzleProfileChangeRequestRepository },
    { provide: ONBOARDING_TEMPLATE_REPOSITORY, useClass: DrizzleOnboardingTemplateRepository },
    { provide: ONBOARDING_CASE_REPOSITORY, useClass: DrizzleOnboardingCaseRepository },
    { provide: OFFBOARDING_TEMPLATE_REPOSITORY, useClass: DrizzleOffboardingTemplateRepository },
    { provide: OFFBOARDING_CASE_REPOSITORY, useClass: DrizzleOffboardingCaseRepository },
    { provide: ACCOUNT_MEMBERSHIP_REPOSITORY, useClass: DrizzleAccountMembershipRepository },
    { provide: CONTRACT_VERSION_REPOSITORY, useClass: DrizzleContractVersionRepository },

    // Command handlers
    CreateEmploymentProfileHandler,
    RequestProfileChangeHandler,
    TriggerOffboardingHandler,
    CompleteOffboardingHandler,

    // Query handlers
    GetProfileHandler,
    ListEmployeesHandler,

    // Facade
    PeopleQueryFacade,
  ],
  exports: [PeopleQueryFacade],
})
export class PeopleModule {}
```

Note: As Task 14 is completed, add the remaining command handlers (ApproveProfileChange, RejectProfileChange, CompleteTask, UpdateProfileDirect, ApproveOffboarding) to the providers array.

- [ ] **Step 2: Run typecheck**

Run: `cd apps/api && bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/people/people.module.ts
git commit -m "feat(people): wire all providers into PeopleModule"
```

---

## Task 19: tRPC Router — People Procedures

**Files:**

- Create: `apps/api/src/modules/people/interface/trpc/people.router.ts`

- [ ] **Step 1: Create the tRPC router**

This file defines all tRPC procedures for the People module. It dispatches to the `CommandBus` and `QueryBus` (via the NestJS CQRS integration). The tRPC router layer is thin — input validation via Zod, then dispatch.

```typescript
// people.router.ts
import { z } from 'zod'
import { initTRPC } from '@trpc/server'
import type { CommandBus, QueryBus } from '@nestjs/cqrs'
import { CreateEmploymentProfileCommand } from '../../application/commands/create-employment-profile.command'
import { RequestProfileChangeCommand } from '../../application/commands/request-profile-change.command'
import { TriggerOffboardingCommand } from '../../application/commands/trigger-offboarding.command'
import { CompleteOffboardingCommand } from '../../application/commands/complete-offboarding.command'
import { GetProfileQuery } from '../../application/queries/get-profile.query'
import { ListEmployeesQuery } from '../../application/queries/list-employees.query'

const t = initTRPC.create()

export function createPeopleRouter(commandBus: CommandBus, queryBus: QueryBus) {
  return t.router({
    getProfile: t.procedure
      .input(z.object({ actorId: z.string().uuid(), tenantId: z.string().uuid() }))
      .query(({ input }) => queryBus.execute(new GetProfileQuery(input.actorId, input.tenantId))),

    listEmployees: t.procedure
      .input(
        z.object({
          tenantId: z.string().uuid(),
          limit: z.number().int().min(1).max(100).default(20),
          offset: z.number().int().min(0).default(0),
        }),
      )
      .query(({ input }) =>
        queryBus.execute(new ListEmployeesQuery(input.tenantId, input.limit, input.offset)),
      ),

    createProfile: t.procedure
      .input(
        z.object({
          tenantId: z.string().uuid(),
          actorId: z.string().uuid(),
          employmentType: z.enum(['permanent', 'fixed_term', 'contractor', 'intern']),
          hireDate: z.string().datetime(),
          employeeCode: z.string().nullable(),
          companyEmail: z.string().email().nullable(),
          jobTitle: z.string().nullable(),
          jobLevel: z.string().nullable(),
        }),
      )
      .mutation(({ input }) =>
        commandBus.execute(
          new CreateEmploymentProfileCommand(
            input.tenantId,
            input.actorId,
            input.employmentType,
            new Date(input.hireDate),
            input.employeeCode,
            input.companyEmail,
            input.jobTitle,
            input.jobLevel,
          ),
        ),
      ),

    requestProfileChange: t.procedure
      .input(
        z.object({
          tenantId: z.string().uuid(),
          profileId: z.string().uuid(),
          fieldPath: z.string(),
          newValue: z.unknown(),
          requestedBy: z.string().uuid(),
        }),
      )
      .mutation(({ input }) =>
        commandBus.execute(
          new RequestProfileChangeCommand(
            input.tenantId,
            input.profileId,
            input.fieldPath,
            input.newValue,
            input.requestedBy,
          ),
        ),
      ),

    triggerOffboarding: t.procedure
      .input(
        z.object({
          tenantId: z.string().uuid(),
          profileId: z.string().uuid(),
          reason: z.string().nullable(),
          reasonCategory: z
            .enum(['voluntary', 'involuntary', 'redundancy', 'end_of_contract'])
            .nullable(),
          requestedBy: z.string().uuid(),
        }),
      )
      .mutation(({ input }) =>
        commandBus.execute(
          new TriggerOffboardingCommand(
            input.tenantId,
            input.profileId,
            input.reason,
            input.reasonCategory,
            input.requestedBy,
          ),
        ),
      ),

    completeOffboarding: t.procedure
      .input(
        z.object({
          tenantId: z.string().uuid(),
          offboardingCaseId: z.string().uuid(),
          completedBy: z.string().uuid(),
        }),
      )
      .mutation(({ input }) =>
        commandBus.execute(
          new CompleteOffboardingCommand(
            input.tenantId,
            input.offboardingCaseId,
            input.completedBy,
          ),
        ),
      ),
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/people/interface/trpc/people.router.ts
git commit -m "feat(people): add tRPC router with Zod input validation"
```

---

## Task 20: Final Validation — Typecheck + All Tests

- [ ] **Step 1: Run typecheck**

Run: `cd apps/api && bunx tsc --noEmit`
Expected: PASS — no type errors

- [ ] **Step 2: Run unit tests**

Run: `cd apps/api && bun run test`
Expected: all unit tests pass

- [ ] **Step 3: Run integration tests**

Run: `cd apps/api && bun run test:integration`
Expected: all integration tests pass

- [ ] **Step 4: Check coverage**

Run: `cd apps/api && bunx vitest run --coverage`
Expected: ≥70% on lines, functions, branches

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(people): address typecheck and test issues from final validation"
```

---

**End of People Module Plan.** The Projects module plan is in a separate document: `docs/superpowers/plans/2026-04-11-projects-module.md`.
