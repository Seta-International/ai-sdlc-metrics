# People Module — Part 1: Schema, Migration, Domain Layer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Define the Drizzle schema, generate the DB migration with RLS, create all domain entities, exceptions, and repository ports.

**Prerequisite:** Part 0 (kernel prerequisites) must be completed first.

**Spec:** `docs/superpowers/specs/2026-04-11-people-projects-design.md`

---

## Task 1: Drizzle Schema — All People Tables

**Files:**

- Modify: `apps/api/src/modules/people/infrastructure/schema/people.schema.ts`
- Create: `apps/api/src/modules/people/infrastructure/schema/index.ts`

- [ ] **Step 1: Write the schema**

Same as the original plan Task 1, with these fixes:

**Fix C4:** `employment_profile_detail` uses `profileId` as the primary key (1:1 relationship). No separate `id` column:

```typescript
export const employmentProfileDetail = peopleSchema.table('employment_profile_detail', {
  profileId: uuid('profile_id').primaryKey(), // PK, 1:1 with employment_profile
  tenantId: uuid('tenant_id').notNull(),
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
```

**Fix minor:** Add `updatedAt` to `offboardingCase` and `onboardingCase`:

```typescript
export const onboardingCase = peopleSchema.table('onboarding_case', {
  // ... existing fields ...
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const offboardingCase = peopleSchema.table('offboarding_case', {
  // ... existing fields ...
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
```

**Fix minor:** Remove unused `numeric` import — no People table uses it.

All other tables remain unchanged from the original plan Task 1. See the original plan for the complete schema code for: `employmentProfile`, `profileSection`, `profileChangeRequest`, `periodicProfileReview`, `onboardingTemplate`, `onboardingTaskTemplate`, `onboardingCase`, `onboardingTask`, `offboardingTemplate`, `offboardingTaskTemplate`, `offboardingCase`, `offboardingTask`, `accountMembership`, `contractVersion`.

- [ ] **Step 2: Create schema index.ts**

Same as original plan — export all 16 table symbols.

- [ ] **Step 3: Run typecheck**

Run: `cd apps/api && bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/people/infrastructure/schema/
git commit -m "feat(people): add all Drizzle table definitions for people schema"
```

---

## Task 2: Database Migration + RLS

Same as original plan Task 2. No changes needed — the approach of `drizzle-kit generate` + manual RLS append is correct for this codebase.

- [ ] **Step 1: Generate migration**
- [ ] **Step 2: Add RLS policies for all 16 tables**
- [ ] **Step 3: Run migration against test DB**
- [ ] **Step 4: Commit**

---

## Task 3: Test Helpers

Same as original plan Task 3. Add `truncatePeopleSchema` and `seedEmploymentProfile` to `packages/db/src/test-helpers/index.ts`.

- [ ] **Step 1: Add helpers**
- [ ] **Step 2: Commit**

---

## Task 4: Domain Entities

Same as original plan Tasks 4-5, with one fix:

**Fix C4:** `EmploymentProfileDetail` entity uses `profileId` as the identity field (no separate `id`):

```typescript
// employment-profile-detail.entity.ts
export interface EmploymentProfileDetail {
  profileId: string // PK — 1:1 with EmploymentProfile
  tenantId: string
  nationalId: string | null
  // ... all other fields unchanged from original plan
}
```

All other entities unchanged from original plan.

- [ ] **Step 1: Create all entity files**
- [ ] **Step 2: Commit**

---

## Task 5: Domain Exceptions

Same as original plan, plus one addition:

```typescript
export class OffboardingNotInProcessingException extends DomainException {
  readonly code = 'OFFBOARDING_NOT_IN_PROCESSING'
  constructor(id: string) {
    super(`Offboarding case is not in processing state: ${id}`)
  }
}
```

Note: The `DomainException` import from `kernel/domain/exceptions/domain.exception` is an intentional cross-module import for the shared base class. This is consistent with the kernel's own pattern.

- [ ] **Step 1: Create exceptions file**
- [ ] **Step 2: Commit**

---

## Task 6: Repository Ports

Same as original plan Task 6, with these fixes:

**Fix C4:** `IEmploymentProfileDetailRepository` uses `profileId` as the key:

```typescript
export interface IEmploymentProfileDetailRepository {
  findByProfileId(profileId: string, tenantId: string): Promise<EmploymentProfileDetail | null>
  upsert(
    profileId: string,
    tenantId: string,
    data: Partial<Omit<EmploymentProfileDetail, 'profileId' | 'tenantId'>>,
  ): Promise<EmploymentProfileDetail>
  updateField(profileId: string, tenantId: string, fieldName: string, value: unknown): Promise<void>
}
```

**Addition:** `IPeriodicProfileReviewRepository`:

```typescript
export const PERIODIC_PROFILE_REVIEW_REPOSITORY = Symbol('IPeriodicProfileReviewRepository')

export interface IPeriodicProfileReviewRepository {
  findById(id: string, tenantId: string): Promise<PeriodicProfileReview | null>
  findPendingByProfileId(profileId: string, tenantId: string): Promise<PeriodicProfileReview[]>
  insert(data: {
    tenantId: string
    profileId: string
    dueDate: Date
  }): Promise<PeriodicProfileReview>
  updateStatus(id: string, tenantId: string, status: string, completedAt?: Date): Promise<void>
}
```

All other ports unchanged from original plan.

- [ ] **Step 1: Create all port files**
- [ ] **Step 2: Remove .gitkeep files**
- [ ] **Step 3: Commit**

---

## Task 7: Event Contracts

Same as original plan Task 7. Create `EmployeeActivatedEvent`, `OffboardingStartedEvent`, `EmployeeTerminatedEvent` in `packages/event-contracts/src/people/`. Add exports to index.ts.

- [ ] **Step 1: Create event files**
- [ ] **Step 2: Update index.ts**
- [ ] **Step 3: Commit**

---

## Task 8: Update Kernel RoleKeyValue Type

Same as original plan Task 8. Add `'project_manager'` to the `RoleKeyValue` type in `role-grant.entity.ts`.

- [ ] **Step 1: Update type**
- [ ] **Step 2: Run kernel tests**
- [ ] **Step 3: Commit**

---

**End of Part 1.** Proceed to Part 2 (core commands).
