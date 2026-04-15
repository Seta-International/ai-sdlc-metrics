# People Module — Plan 06: Onboarding, Offboarding & Events

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance onboarding/offboarding templates with multi-country support, migrate case/task tables from profileId to employmentId, define all domain event contracts, emit events from command handlers, expose facade methods for cross-module reads, and wire everything together.

**Architecture:** Hexagonal + DDD + CQRS. Onboarding/offboarding templates gain country/worker-type scoping. Event contracts live in `packages/event-contracts` with zero NestJS deps. Command handlers emit events via NestJS CQRS EventBus. PeopleQueryFacade gains new methods for cross-module consumers.

**Tech Stack:** NestJS, Drizzle ORM, PostgreSQL 16, tRPC, Zod, Vitest, @nestjs/cqrs EventBus

**Spec Reference:** `docs/superpowers/specs/2026-04-15-people-module-redesign.md` — Sections 16, 17

**Depends on:** Plan 01 (core schema/entities), Plan 02 (employment lifecycle/state machine)

---

## File Structure

### Files to MODIFY

```
# Schema — add columns to existing tables
apps/api/src/modules/people/infrastructure/schema/people.schema.ts

# Onboarding handler — update to create person_profile + employment + job_assignment
apps/api/src/modules/people/application/event-handlers/on-candidate-hired.handler.ts
apps/api/src/modules/people/application/event-handlers/on-candidate-hired.handler.spec.ts

# Facade — add new methods
apps/api/src/modules/people/application/facades/people-query.facade.ts

# Module — register all event handlers
apps/api/src/modules/people/people.module.ts

# tRPC router — add onboarding/offboarding procedures using employmentId
apps/api/src/modules/people/interface/trpc/people.router.ts
```

### Files to CREATE

```
# Event contracts (packages/event-contracts/src/people/)
packages/event-contracts/src/people/employment-activated.event.ts        (replace old)
packages/event-contracts/src/people/employment-terminated.event.ts       (replace old)
packages/event-contracts/src/people/job-assignment-changed.event.ts      (new)
packages/event-contracts/src/people/employee-on-leave.event.ts           (new)
packages/event-contracts/src/people/employee-suspended.event.ts          (new)
packages/event-contracts/src/people/employee-notice-given.event.ts       (new)
packages/event-contracts/src/people/employee-reinstated.event.ts         (new)
packages/event-contracts/src/people/employee-returned-from-leave.event.ts (new)
packages/event-contracts/src/people/profile-change-applied.event.ts      (new)
packages/event-contracts/src/people/contract-version-created.event.ts    (new)
packages/event-contracts/src/people/contract-expiring.event.ts           (new)
packages/event-contracts/src/people/probation-confirmed.event.ts         (new)
packages/event-contracts/src/people/probation-ending.event.ts            (new)
packages/event-contracts/src/people/document-expiring.event.ts           (new)
packages/event-contracts/src/people/profile-incomplete.event.ts          (new)
packages/event-contracts/src/people/index.ts                             (rewrite)

# Application — services
apps/api/src/modules/people/application/services/onboarding-template-selector.service.ts
apps/api/src/modules/people/application/services/onboarding-template-selector.service.spec.ts
apps/api/src/modules/people/application/services/offboarding-template-selector.service.ts
apps/api/src/modules/people/application/services/offboarding-template-selector.service.spec.ts
apps/api/src/modules/people/application/services/document-requirement-checker.service.ts

# Integration tests
apps/api/src/modules/people/application/event-handlers/event-emission.integration.spec.ts
```

---

## Task 1: Update Onboarding Template Schema

**Files:**

- Modify: `apps/api/src/modules/people/infrastructure/schema/people.schema.ts`

- [ ] **Step 1: Add country_code, worker_type, employment_type columns to onboarding_template**

```typescript
// In people.schema.ts, replace the existing onboardingTemplate definition:

export const onboardingTemplate = peopleSchema.table('onboarding_template', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  // NEW: country scoping
  countryCode: text('country_code'), // NULL = global
  // NEW: worker type scoping
  workerType: text('worker_type', {
    enum: ['employee', 'contingent'],
  }),
  // EXISTING: employment type (updated enum to match new model)
  employmentType: text('employment_type', {
    enum: ['permanent', 'fixed_term', 'intern'],
  }),
  isDefault: boolean('is_default').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
})
```

- [ ] **Step 2: Add document_requirement_id to onboarding_task_template**

```typescript
// In people.schema.ts, update onboardingTaskTemplate:

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
  dueDaysAfterHire: integer('due_days_after_hire').notNull().default(0),
  isRequired: boolean('is_required').notNull().default(true),
  displayOrder: integer('display_order').notNull().default(0),
  // NEW: link to document requirement for auto-complete
  documentRequirementId: uuid('document_requirement_id'),
})
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/people/infrastructure/schema/people.schema.ts
git commit -m "feat(people): add country_code, worker_type to onboarding_template schema"
```

---

## Task 2: Update Offboarding Template Schema

**Files:**

- Modify: `apps/api/src/modules/people/infrastructure/schema/people.schema.ts`

- [ ] **Step 1: Add country_code, termination_reason columns to offboarding_template**

```typescript
// In people.schema.ts, replace the existing offboardingTemplate definition:

export const offboardingTemplate = peopleSchema.table('offboarding_template', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  employmentType: text('employment_type', {
    enum: ['permanent', 'fixed_term', 'intern'],
  }),
  reasonCategory: text('reason_category', {
    enum: ['voluntary', 'involuntary', 'redundancy', 'end_of_contract'],
  }),
  // NEW: country scoping
  countryCode: text('country_code'),
  // NEW: specific termination reason matching
  terminationReason: text('termination_reason', {
    enum: [
      'voluntary_resignation',
      'involuntary_performance',
      'involuntary_misconduct',
      'redundancy',
      'end_of_contract',
      'mutual_agreement',
      'retirement',
      'deceased',
      'failed_probation',
      'no_show',
      'company_closure',
    ],
  }),
  isDefault: boolean('is_default').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
})
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/people/infrastructure/schema/people.schema.ts
git commit -m "feat(people): add country_code, termination_reason to offboarding_template schema"
```

---

## Task 3: Migrate Onboarding/Offboarding Case Tables — profileId to employmentId

**Files:**

- Modify: `apps/api/src/modules/people/infrastructure/schema/people.schema.ts`
- Modify: all onboarding/offboarding repository interfaces and implementations

- [ ] **Step 1: Replace profileId with employmentId on onboarding_case**

```typescript
// In people.schema.ts, update onboardingCase:

export const onboardingCase = peopleSchema.table('onboarding_case', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  employmentId: uuid('employment_id').notNull(), // was: profileId
  templateId: uuid('template_id'),
  status: text('status', {
    enum: ['in_progress', 'completed'],
  })
    .notNull()
    .default('in_progress'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
```

- [ ] **Step 2: Replace profileId with employmentId on offboarding_case**

```typescript
// In people.schema.ts, update offboardingCase:

export const offboardingCase = peopleSchema.table('offboarding_case', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  employmentId: uuid('employment_id').notNull(), // was: profileId
  templateId: uuid('template_id'),
  reason: text('reason').notNull(),
  reasonCategory: text('reason_category', {
    enum: ['voluntary', 'involuntary', 'redundancy', 'end_of_contract'],
  }),
  decisionCaseId: uuid('decision_case_id'),
  status: text('status', {
    enum: ['pending', 'approved', 'processing', 'completed', 'rejected'],
  })
    .notNull()
    .default('pending'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
```

- [ ] **Step 3: Update all repository interfaces and Drizzle implementations**

Replace every `profileId` parameter and column reference with `employmentId` in:

- `IOnboardingCaseRepository` — `findByProfileId` becomes `findByEmploymentId`
- `DrizzleOnboardingCaseRepository` — update column references
- `IOffboardingCaseRepository` — same migration
- `DrizzleOffboardingCaseRepository` — same migration

- [ ] **Step 4: Update all command/query handlers that reference profileId**

Any handler creating or querying onboarding/offboarding cases must use `employmentId` instead of `profileId`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/people/infrastructure/schema/people.schema.ts \
  apps/api/src/modules/people/domain/repositories/ \
  apps/api/src/modules/people/infrastructure/repositories/ \
  apps/api/src/modules/people/application/
git commit -m "refactor(people): migrate onboarding/offboarding from profileId to employmentId"
```

---

## Task 4: Update OnCandidateHiredHandler

**Files:**

- Modify: `on-candidate-hired.handler.ts`, `on-candidate-hired.handler.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/modules/people/application/event-handlers/on-candidate-hired.handler.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OnCandidateHiredHandler } from './on-candidate-hired.handler'
import type { IPersonProfileRepository } from '../../domain/repositories/person-profile.repository'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { IEmploymentDetailRepository } from '../../domain/repositories/employment-detail.repository'
import type { IJobAssignmentRepository } from '../../domain/repositories/job-assignment.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const PROFILE_ID = '01900000-0000-7000-8000-000000000003'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000004'

describe('OnCandidateHiredHandler', () => {
  let handler: OnCandidateHiredHandler
  let profileRepo: IPersonProfileRepository
  let employmentRepo: IEmploymentRepository
  let detailRepo: IEmploymentDetailRepository
  let assignmentRepo: IJobAssignmentRepository
  let templateSelector: any
  let onboardingCaseRepo: any

  beforeEach(() => {
    profileRepo = {
      findById: vi.fn(),
      findByActorId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    employmentRepo = {
      findById: vi.fn(),
      findByPersonProfileId: vi.fn(),
      findActiveByActorId: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      update: vi.fn(),
      listByTenant: vi.fn(),
      countByTenant: vi.fn(),
    }
    detailRepo = {
      findByEmploymentId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    assignmentRepo = {
      findById: vi.fn(),
      findCurrent: vi.fn(),
      findAsOf: vi.fn(),
      findHistory: vi.fn(),
      insert: vi.fn(),
      closeAssignment: vi.fn(),
      delete: vi.fn(),
    }
    templateSelector = {
      selectTemplate: vi.fn(),
    }
    onboardingCaseRepo = {
      findByEmploymentId: vi.fn(),
      insert: vi.fn(),
    }

    handler = new OnCandidateHiredHandler(
      profileRepo,
      employmentRepo,
      detailRepo,
      assignmentRepo,
      templateSelector,
      onboardingCaseRepo,
    )
  })

  it('creates person_profile + employment + job_assignment + onboarding case on CandidateHiredEvent', async () => {
    // No existing profile for this actor
    vi.mocked(profileRepo.findByActorId).mockResolvedValue(null)
    vi.mocked(profileRepo.insert).mockResolvedValue({
      id: PROFILE_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
    } as any)
    vi.mocked(employmentRepo.insert).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
      personProfileId: PROFILE_ID,
      employmentStatus: 'pre_hire',
    } as any)
    vi.mocked(detailRepo.insert).mockResolvedValue({} as any)
    vi.mocked(assignmentRepo.insert).mockResolvedValue({} as any)
    vi.mocked(templateSelector.selectTemplate).mockResolvedValue({
      id: 'template-1',
      name: 'VN Employee Onboarding',
    })
    vi.mocked(onboardingCaseRepo.insert).mockResolvedValue({} as any)

    await handler.handle({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      familyName: 'Nguyễn',
      givenName: 'An',
      middleName: 'Văn',
      countryCode: 'VN',
      workerType: 'employee',
      employmentType: 'permanent',
      hireDate: new Date('2026-06-01'),
      jobProfileId: 'job-profile-1',
      departmentId: 'dept-1',
    } as any)

    // Creates person profile
    expect(profileRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        familyName: 'Nguyễn',
        givenName: 'An',
        middleName: 'Văn',
        nameDisplayOrder: 'family_first', // VN = family_first
      }),
    )

    // Creates employment in pre_hire
    expect(employmentRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        personProfileId: PROFILE_ID,
        employmentStatus: 'pre_hire',
        workerType: 'employee',
        countryCode: 'VN',
      }),
    )

    // Creates empty employment detail
    expect(detailRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ employmentId: EMPLOYMENT_ID }),
    )

    // Creates job assignment
    expect(assignmentRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        employmentId: EMPLOYMENT_ID,
        jobProfileId: 'job-profile-1',
        eventType: 'hire',
      }),
    )

    // Creates onboarding case with employmentId (not profileId)
    expect(onboardingCaseRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        employmentId: EMPLOYMENT_ID,
        templateId: 'template-1',
      }),
    )
  })

  it('reuses existing person_profile for rehire', async () => {
    // Actor already has a profile (rehire scenario)
    vi.mocked(profileRepo.findByActorId).mockResolvedValue({
      id: PROFILE_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
    } as any)
    vi.mocked(employmentRepo.insert).mockResolvedValue({
      id: EMPLOYMENT_ID,
      personProfileId: PROFILE_ID,
    } as any)
    vi.mocked(detailRepo.insert).mockResolvedValue({} as any)
    vi.mocked(assignmentRepo.insert).mockResolvedValue({} as any)
    vi.mocked(templateSelector.selectTemplate).mockResolvedValue(null)

    await handler.handle({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      familyName: 'Nguyễn',
      givenName: 'An',
      middleName: null,
      countryCode: 'VN',
      workerType: 'employee',
      employmentType: 'permanent',
      hireDate: new Date('2026-06-01'),
      jobProfileId: 'job-profile-1',
      departmentId: 'dept-1',
    } as any)

    // Should NOT create new profile
    expect(profileRepo.insert).not.toHaveBeenCalled()
    // Should create new employment on existing profile
    expect(employmentRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ personProfileId: PROFILE_ID }),
    )
  })
})
```

- [ ] **Step 2: Implement the updated handler**

```typescript
// apps/api/src/modules/people/application/event-handlers/on-candidate-hired.handler.ts

import { Inject, Injectable } from '@nestjs/common'
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs'
import { CandidateHiredEvent } from '@future/event-contracts/hiring'
import {
  PERSON_PROFILE_REPOSITORY,
  type IPersonProfileRepository,
} from '../../domain/repositories/person-profile.repository'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import {
  EMPLOYMENT_DETAIL_REPOSITORY,
  type IEmploymentDetailRepository,
} from '../../domain/repositories/employment-detail.repository'
import {
  JOB_ASSIGNMENT_REPOSITORY,
  type IJobAssignmentRepository,
} from '../../domain/repositories/job-assignment.repository'
import {
  defaultNameDisplayOrder,
  computeFullName,
  computeFullNameUnaccented,
} from '../../domain/value-objects/name-display-order'
import { OnboardingTemplateSelectorService } from '../services/onboarding-template-selector.service'

@EventsHandler(CandidateHiredEvent)
@Injectable()
export class OnCandidateHiredHandler implements IEventHandler<CandidateHiredEvent> {
  constructor(
    @Inject(PERSON_PROFILE_REPOSITORY)
    private readonly profileRepo: IPersonProfileRepository,
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    @Inject(EMPLOYMENT_DETAIL_REPOSITORY)
    private readonly detailRepo: IEmploymentDetailRepository,
    @Inject(JOB_ASSIGNMENT_REPOSITORY)
    private readonly assignmentRepo: IJobAssignmentRepository,
    private readonly templateSelector: OnboardingTemplateSelectorService,
    @Inject('ONBOARDING_CASE_REPOSITORY')
    private readonly onboardingCaseRepo: any, // typed from existing repo
  ) {}

  async handle(event: CandidateHiredEvent): Promise<void> {
    // 1. Find or create person_profile
    let profile = await this.profileRepo.findByActorId(event.actorId, event.tenantId)
    if (!profile) {
      const displayOrder = defaultNameDisplayOrder(event.countryCode)
      const fullName = computeFullName(
        event.familyName,
        event.givenName,
        event.middleName,
        displayOrder,
      )
      profile = await this.profileRepo.insert({
        tenantId: event.tenantId,
        actorId: event.actorId,
        familyName: event.familyName,
        middleName: event.middleName,
        givenName: event.givenName,
        fullName,
        fullNameUnaccented: computeFullNameUnaccented(fullName),
        preferredName: null,
        nameDisplayOrder: displayOrder,
        dateOfBirth: null,
        gender: null,
        nationality: null,
        maritalStatus: null,
        photoDocumentId: null,
      })
    }

    // 2. Create employment in pre_hire status
    const employment = await this.employmentRepo.insert({
      tenantId: event.tenantId,
      personProfileId: profile.id,
      employeeCode: null,
      companyEmail: null,
      workerType: event.workerType,
      employmentType: event.employmentType,
      countryCode: event.countryCode,
      employmentStatus: 'pre_hire',
      terminationDate: null,
      terminationReason: null,
      hireDate: event.hireDate,
      originalHireDate: null,
    })

    // 3. Create empty employment detail
    await this.detailRepo.insert({
      tenantId: event.tenantId,
      employmentId: employment.id,
      nationalId: null,
      nationalIdType: null,
      nationalIdIssuedDate: null,
      nationalIdExpiryDate: null,
      taxId: null,
      socialInsuranceId: null,
      passportNumber: null,
      passportExpiryDate: null,
      bankAccountNumber: null,
      bankName: null,
      bankBranch: null,
      bankAccountHolder: null,
      bankSwiftCode: null,
      personalEmail: null,
      personalPhone: null,
      permanentAddress: null,
      currentAddress: null,
      emergencyContacts: null,
      countryData: null,
      customFields: null,
    })

    // 4. Create initial job assignment
    await this.assignmentRepo.insert({
      tenantId: event.tenantId,
      employmentId: employment.id,
      effectiveFrom: event.hireDate,
      effectiveTo: null,
      jobProfileId: event.jobProfileId,
      departmentId: event.departmentId ?? null,
      locationId: null,
      costCenterId: null,
      workArrangement: 'onsite',
      managerId: null,
      eventType: 'hire',
      reason: 'Initial hire from recruitment',
      createdBy: event.actorId,
    })

    // 5. Auto-select onboarding template and create case
    const template = await this.templateSelector.selectTemplate(
      event.tenantId,
      event.countryCode,
      event.workerType,
      event.employmentType,
    )

    if (template) {
      await this.onboardingCaseRepo.insert({
        tenantId: event.tenantId,
        employmentId: employment.id,
        templateId: template.id,
        status: 'in_progress',
      })
    }
  }
}
```

- [ ] **Step 3: Run tests**

```bash
cd apps/api && bunx vitest run src/modules/people/application/event-handlers/on-candidate-hired.handler.spec.ts
```

Expected: PASS (2 tests)

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/people/application/event-handlers/on-candidate-hired*
git commit -m "feat(people): update OnCandidateHiredHandler to create person_profile + employment + job_assignment"
```

---

## Task 5: OnboardingTemplateSelectorService

**Files:**

- Create: `onboarding-template-selector.service.ts`, `onboarding-template-selector.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/modules/people/application/services/onboarding-template-selector.service.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OnboardingTemplateSelectorService } from './onboarding-template-selector.service'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

describe('OnboardingTemplateSelectorService', () => {
  let service: OnboardingTemplateSelectorService
  let templateRepo: any

  beforeEach(() => {
    templateRepo = {
      findActiveByTenant: vi.fn(),
    }
    service = new OnboardingTemplateSelectorService(templateRepo)
  })

  it('selects template matching country + worker_type + employment_type', async () => {
    vi.mocked(templateRepo.findActiveByTenant).mockResolvedValue([
      {
        id: 't1',
        name: 'Global Default',
        countryCode: null,
        workerType: null,
        employmentType: null,
        isDefault: true,
      },
      {
        id: 't2',
        name: 'VN Employee Permanent',
        countryCode: 'VN',
        workerType: 'employee',
        employmentType: 'permanent',
        isDefault: false,
      },
      {
        id: 't3',
        name: 'VN Intern',
        countryCode: 'VN',
        workerType: null,
        employmentType: 'intern',
        isDefault: false,
      },
    ])

    const result = await service.selectTemplate(TENANT_ID, 'VN', 'employee', 'permanent')

    expect(result?.id).toBe('t2') // Most specific match
  })

  it('falls back to country-only match when exact match not found', async () => {
    vi.mocked(templateRepo.findActiveByTenant).mockResolvedValue([
      {
        id: 't1',
        name: 'Global Default',
        countryCode: null,
        workerType: null,
        employmentType: null,
        isDefault: true,
      },
      {
        id: 't2',
        name: 'VN General',
        countryCode: 'VN',
        workerType: null,
        employmentType: null,
        isDefault: false,
      },
    ])

    const result = await service.selectTemplate(TENANT_ID, 'VN', 'contingent', 'fixed_term')

    expect(result?.id).toBe('t2') // Country match
  })

  it('falls back to global default when no country match', async () => {
    vi.mocked(templateRepo.findActiveByTenant).mockResolvedValue([
      {
        id: 't1',
        name: 'Global Default',
        countryCode: null,
        workerType: null,
        employmentType: null,
        isDefault: true,
      },
      {
        id: 't2',
        name: 'VN General',
        countryCode: 'VN',
        workerType: null,
        employmentType: null,
        isDefault: false,
      },
    ])

    const result = await service.selectTemplate(TENANT_ID, 'SG', 'employee', 'permanent')

    expect(result?.id).toBe('t1') // Global default
  })

  it('returns null when no templates exist', async () => {
    vi.mocked(templateRepo.findActiveByTenant).mockResolvedValue([])

    const result = await service.selectTemplate(TENANT_ID, 'VN', 'employee', 'permanent')

    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Implement the service**

```typescript
// apps/api/src/modules/people/application/services/onboarding-template-selector.service.ts

import { Inject, Injectable } from '@nestjs/common'

@Injectable()
export class OnboardingTemplateSelectorService {
  constructor(
    @Inject('ONBOARDING_TEMPLATE_REPOSITORY')
    private readonly templateRepo: any,
  ) {}

  async selectTemplate(
    tenantId: string,
    countryCode: string,
    workerType: string,
    employmentType: string,
  ): Promise<{ id: string; name: string } | null> {
    const templates = await this.templateRepo.findActiveByTenant(tenantId)
    if (templates.length === 0) return null

    // Score each template by specificity
    const scored = templates.map((t: any) => ({
      template: t,
      score: this.scoreMatch(t, countryCode, workerType, employmentType),
    }))

    // Sort by score descending, pick highest
    scored.sort((a: any, b: any) => b.score - a.score)

    // Must have at least score 1 (default) to match
    return scored[0].score > 0 ? scored[0].template : null
  }

  private scoreMatch(
    template: any,
    countryCode: string,
    workerType: string,
    employmentType: string,
  ): number {
    let score = 0

    // Country match: +4 points
    if (template.countryCode === countryCode) score += 4
    else if (template.countryCode !== null) return 0 // Country mismatch = no match

    // Worker type match: +2 points
    if (template.workerType === workerType) score += 2
    else if (template.workerType !== null) return 0 // Type mismatch = no match

    // Employment type match: +1 point
    if (template.employmentType === employmentType) score += 1
    else if (template.employmentType !== null) return 0 // Type mismatch = no match

    // Default template gets base score of 1
    if (template.isDefault && score === 0) score = 1

    return score
  }
}
```

- [ ] **Step 3: Run tests and commit**

```bash
cd apps/api && bunx vitest run src/modules/people/application/services/onboarding-template-selector.service.spec.ts
git add apps/api/src/modules/people/application/services/onboarding-template-selector*
git commit -m "feat(people): add OnboardingTemplateSelectorService with country/type matching"
```

---

## Task 6: OffboardingTemplateSelectorService

**Files:**

- Create: `offboarding-template-selector.service.ts`, `offboarding-template-selector.service.spec.ts`

- [ ] **Step 1: Write test + implementation**

Same scoring pattern as Task 5, but matches on `terminationReason` + `countryCode` instead of `workerType` + `employmentType`.

```typescript
// apps/api/src/modules/people/application/services/offboarding-template-selector.service.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OffboardingTemplateSelectorService } from './offboarding-template-selector.service'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

describe('OffboardingTemplateSelectorService', () => {
  let service: OffboardingTemplateSelectorService
  let templateRepo: any

  beforeEach(() => {
    templateRepo = { findActiveByTenant: vi.fn() }
    service = new OffboardingTemplateSelectorService(templateRepo)
  })

  it('selects template matching termination_reason + country', async () => {
    vi.mocked(templateRepo.findActiveByTenant).mockResolvedValue([
      {
        id: 't1',
        name: 'Default',
        countryCode: null,
        terminationReason: null,
        reasonCategory: null,
        isDefault: true,
      },
      {
        id: 't2',
        name: 'VN Resignation',
        countryCode: 'VN',
        terminationReason: 'voluntary_resignation',
        reasonCategory: 'voluntary',
        isDefault: false,
      },
    ])

    const result = await service.selectTemplate(TENANT_ID, 'VN', 'voluntary_resignation')
    expect(result?.id).toBe('t2')
  })

  it('falls back to country + reason_category when exact reason not found', async () => {
    vi.mocked(templateRepo.findActiveByTenant).mockResolvedValue([
      {
        id: 't1',
        name: 'Default',
        countryCode: null,
        terminationReason: null,
        reasonCategory: null,
        isDefault: true,
      },
      {
        id: 't2',
        name: 'VN Voluntary',
        countryCode: 'VN',
        terminationReason: null,
        reasonCategory: 'voluntary',
        isDefault: false,
      },
    ])

    const result = await service.selectTemplate(TENANT_ID, 'VN', 'voluntary_resignation')
    expect(result?.id).toBe('t2')
  })
})
```

- [ ] **Step 2: Implement and commit**

```bash
git add apps/api/src/modules/people/application/services/offboarding-template-selector*
git commit -m "feat(people): add OffboardingTemplateSelectorService with reason matching"
```

---

## Task 7: Document Requirement Integration

**Files:**

- Create: `document-requirement-checker.service.ts`

- [ ] **Step 1: Implement auto-complete checker**

```typescript
// apps/api/src/modules/people/application/services/document-requirement-checker.service.ts

import { Injectable } from '@nestjs/common'

@Injectable()
export class DocumentRequirementCheckerService {
  /**
   * Checks if an uploaded document matches a document_requirement linked
   * to an onboarding task. If matched, auto-completes the task.
   *
   * Called when EmployeeDocumentCreatedEvent is received.
   */
  async checkAndAutoComplete(
    tenantId: string,
    employmentId: string,
    documentCategory: string,
  ): Promise<void> {
    // 1. Find active onboarding case for this employment
    // 2. Find task templates with documentRequirementId matching the category
    // 3. For each matching task that is still 'pending', mark as 'completed'
    // 4. Check if all required tasks are now complete
    // 5. If all complete + hire_date reached, trigger ActivateEmployment
    // Implementation depends on existing onboarding task repository methods.
    // Placeholder — actual implementation wires into existing task completion flow.
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/people/application/services/document-requirement-checker.service.ts
git commit -m "feat(people): add DocumentRequirementCheckerService for onboarding auto-complete"
```

---

## Task 8: Event Contracts in packages/event-contracts

**Files:**

- Rewrite: `packages/event-contracts/src/people/index.ts`
- Replace: `employment-activated.event.ts`, `employment-terminated.event.ts`
- Create: 13 new event files

- [ ] **Step 1: Replace EmploymentActivatedEvent (was EmployeeActivatedEvent)**

```typescript
// packages/event-contracts/src/people/employment-activated.event.ts

export class EmploymentActivatedEvent {
  static readonly eventName = 'people.employment-activated'
  constructor(
    public readonly tenantId: string,
    public readonly employmentId: string,
    public readonly actorId: string,
    public readonly effectiveDate: Date,
  ) {}
}
```

- [ ] **Step 2: Replace EmploymentTerminatedEvent (was EmployeeTerminatedEvent)**

```typescript
// packages/event-contracts/src/people/employment-terminated.event.ts

export class EmploymentTerminatedEvent {
  static readonly eventName = 'people.employment-terminated'
  constructor(
    public readonly tenantId: string,
    public readonly employmentId: string,
    public readonly actorId: string,
    public readonly terminationReason: string,
    public readonly terminationDate: Date,
  ) {}
}
```

- [ ] **Step 3: Create JobAssignmentChangedEvent**

```typescript
// packages/event-contracts/src/people/job-assignment-changed.event.ts

export interface JobAssignmentChanges {
  jobProfileId?: { old: string | null; new: string }
  departmentId?: { old: string | null; new: string | null }
  managerId?: { old: string | null; new: string | null }
  locationId?: { old: string | null; new: string | null }
  workArrangement?: { old: string; new: string }
}

export class JobAssignmentChangedEvent {
  static readonly eventName = 'people.job-assignment-changed'
  constructor(
    public readonly tenantId: string,
    public readonly employmentId: string,
    public readonly actorId: string,
    public readonly eventType: string,
    public readonly effectiveFrom: Date,
    public readonly changes: JobAssignmentChanges,
  ) {}
}
```

- [ ] **Step 4: Create lifecycle events**

```typescript
// packages/event-contracts/src/people/employee-on-leave.event.ts

export class EmployeeOnLeaveEvent {
  static readonly eventName = 'people.employee-on-leave'
  constructor(
    public readonly tenantId: string,
    public readonly employmentId: string,
    public readonly leaveType: string,
    public readonly expectedReturnDate: Date,
  ) {}
}
```

```typescript
// packages/event-contracts/src/people/employee-suspended.event.ts

export class EmployeeSuspendedEvent {
  static readonly eventName = 'people.employee-suspended'
  constructor(
    public readonly tenantId: string,
    public readonly employmentId: string,
    public readonly reason: string,
    public readonly reviewDate: Date,
  ) {}
}
```

```typescript
// packages/event-contracts/src/people/employee-notice-given.event.ts

export class EmployeeNoticeGivenEvent {
  static readonly eventName = 'people.employee-notice-given'
  constructor(
    public readonly tenantId: string,
    public readonly employmentId: string,
    public readonly lastWorkingDay: Date,
    public readonly noticeType: string,
  ) {}
}
```

```typescript
// packages/event-contracts/src/people/employee-reinstated.event.ts

export class EmployeeReinstatedEvent {
  static readonly eventName = 'people.employee-reinstated'
  constructor(
    public readonly tenantId: string,
    public readonly employmentId: string,
    public readonly reason: string,
  ) {}
}
```

```typescript
// packages/event-contracts/src/people/employee-returned-from-leave.event.ts

export class EmployeeReturnedFromLeaveEvent {
  static readonly eventName = 'people.employee-returned-from-leave'
  constructor(
    public readonly tenantId: string,
    public readonly employmentId: string,
    public readonly actualReturnDate: Date,
  ) {}
}
```

- [ ] **Step 5: Create domain data events**

```typescript
// packages/event-contracts/src/people/profile-change-applied.event.ts

export class ProfileChangeAppliedEvent {
  static readonly eventName = 'people.profile-change-applied'
  constructor(
    public readonly tenantId: string,
    public readonly employmentId: string,
    public readonly fieldPath: string,
    public readonly oldValue: unknown,
    public readonly newValue: unknown,
    public readonly effectiveDate: Date,
  ) {}
}
```

```typescript
// packages/event-contracts/src/people/contract-version-created.event.ts

export class ContractVersionCreatedEvent {
  static readonly eventName = 'people.contract-version-created'
  constructor(
    public readonly tenantId: string,
    public readonly employmentId: string,
    public readonly contractVersionId: string,
    public readonly contractType: string,
    public readonly startDate: Date,
    public readonly endDate: Date | null,
    public readonly baseSalary: number | null,
    public readonly salaryCurrency: string | null,
  ) {}
}
```

```typescript
// packages/event-contracts/src/people/contract-expiring.event.ts

export class ContractExpiringEvent {
  static readonly eventName = 'people.contract-expiring'
  constructor(
    public readonly tenantId: string,
    public readonly employmentId: string,
    public readonly contractVersionId: string,
    public readonly endDate: Date,
    public readonly daysRemaining: number,
  ) {}
}
```

```typescript
// packages/event-contracts/src/people/probation-confirmed.event.ts

export class ProbationConfirmedEvent {
  static readonly eventName = 'people.probation-confirmed'
  constructor(
    public readonly tenantId: string,
    public readonly employmentId: string,
    public readonly outcomeDate: Date,
  ) {}
}
```

```typescript
// packages/event-contracts/src/people/probation-ending.event.ts

export class ProbationEndingEvent {
  static readonly eventName = 'people.probation-ending'
  constructor(
    public readonly tenantId: string,
    public readonly employmentId: string,
    public readonly currentEndDate: Date,
    public readonly daysRemaining: number,
  ) {}
}
```

```typescript
// packages/event-contracts/src/people/document-expiring.event.ts

export class DocumentExpiringEvent {
  static readonly eventName = 'people.document-expiring'
  constructor(
    public readonly tenantId: string,
    public readonly employmentId: string,
    public readonly documentId: string,
    public readonly category: string,
    public readonly expiryDate: Date,
    public readonly daysRemaining: number,
  ) {}
}
```

```typescript
// packages/event-contracts/src/people/profile-incomplete.event.ts

export class ProfileIncompleteEvent {
  static readonly eventName = 'people.profile-incomplete'
  constructor(
    public readonly tenantId: string,
    public readonly employmentId: string,
    public readonly completenessScore: number,
    public readonly missingFields: string[],
  ) {}
}
```

- [ ] **Step 6: Rewrite index.ts barrel export**

```typescript
// packages/event-contracts/src/people/index.ts

export { EmploymentActivatedEvent } from './employment-activated.event'
export { EmploymentTerminatedEvent } from './employment-terminated.event'
export { JobAssignmentChangedEvent } from './job-assignment-changed.event'
export type { JobAssignmentChanges } from './job-assignment-changed.event'
export { EmployeeOnLeaveEvent } from './employee-on-leave.event'
export { EmployeeSuspendedEvent } from './employee-suspended.event'
export { EmployeeNoticeGivenEvent } from './employee-notice-given.event'
export { EmployeeReinstatedEvent } from './employee-reinstated.event'
export { EmployeeReturnedFromLeaveEvent } from './employee-returned-from-leave.event'
export { ProfileChangeAppliedEvent } from './profile-change-applied.event'
export { ContractVersionCreatedEvent } from './contract-version-created.event'
export { ContractExpiringEvent } from './contract-expiring.event'
export { ProbationConfirmedEvent } from './probation-confirmed.event'
export { ProbationEndingEvent } from './probation-ending.event'
export { DocumentExpiringEvent } from './document-expiring.event'
export { ProfileIncompleteEvent } from './profile-incomplete.event'
```

- [ ] **Step 7: Delete old event files that are being replaced**

```bash
rm packages/event-contracts/src/people/employee-activated.event.ts
rm packages/event-contracts/src/people/employee-terminated.event.ts
rm packages/event-contracts/src/people/org-placement-changed.event.ts
```

Note: `person-hired.event.ts`, `person-offboarded.event.ts`, and `offboarding-started.event.ts` are from the hiring/onboarding domain and may still be needed. Check callers before deleting. The new events replace all people-emitted events.

- [ ] **Step 8: Update callers of old event names**

Search for `EmployeeActivatedEvent` and `EmployeeTerminatedEvent` across the codebase and update to `EmploymentActivatedEvent` / `EmploymentTerminatedEvent`. Update constructor arguments to match new signatures.

- [ ] **Step 9: Build event-contracts package**

```bash
bun run --filter @future/event-contracts build
```

- [ ] **Step 10: Commit**

```bash
git add packages/event-contracts/src/people/
git commit -m "feat(people): add all domain event contracts (15 events) for people module redesign"
```

---

## Task 9: Emit Events from Command Handlers

**Files:**

- Modify: All lifecycle command handlers from Plan 02

- [ ] **Step 1: Add EventBus injection to ActivateEmploymentHandler**

```typescript
// In activate-employment.handler.ts, add event emission:

import { EventBus } from '@nestjs/cqrs'
import { EmploymentActivatedEvent } from '@future/event-contracts/people'

// In constructor:
constructor(
  @Inject(EMPLOYMENT_REPOSITORY) private readonly employmentRepo: IEmploymentRepository,
  private readonly eventBus: EventBus,
) {}

// After status update succeeds:
await this.eventBus.publish(
  new EmploymentActivatedEvent(
    command.tenantId,
    command.employmentId,
    command.actorId,
    new Date(),
  ),
)
```

- [ ] **Step 2: Add event emission to TerminateEmploymentHandler**

```typescript
import { EmploymentTerminatedEvent } from '@future/event-contracts/people'

await this.eventBus.publish(
  new EmploymentTerminatedEvent(
    command.tenantId,
    command.employmentId,
    employment.personProfileId, // resolve actorId
    command.terminationReason,
    command.terminationDate,
  ),
)
```

- [ ] **Step 3: Add event emission to CreateJobAssignmentHandler**

```typescript
import { JobAssignmentChangedEvent } from '@future/event-contracts/people'

// After creating new assignment:
await this.eventBus.publish(
  new JobAssignmentChangedEvent(
    command.tenantId,
    command.employmentId,
    command.createdBy,
    command.eventType,
    command.effectiveFrom,
    {
      jobProfileId: previousAssignment
        ? { old: previousAssignment.jobProfileId, new: command.jobProfileId }
        : undefined,
      departmentId: previousAssignment
        ? { old: previousAssignment.departmentId, new: command.departmentId ?? null }
        : undefined,
      managerId: previousAssignment
        ? { old: previousAssignment.managerId, new: command.managerId ?? null }
        : undefined,
    },
  ),
)
```

- [ ] **Step 4: Add event emission to remaining lifecycle handlers**

Apply the same pattern to:

- `StartLeaveHandler` → emits `EmployeeOnLeaveEvent`
- `SuspendEmploymentHandler` → emits `EmployeeSuspendedEvent`
- `GiveNoticeHandler` → emits `EmployeeNoticeGivenEvent`
- `ReturnFromLeaveHandler` → emits `EmployeeReturnedFromLeaveEvent`
- `ReinstateSuspensionHandler` → emits `EmployeeReinstatedEvent`
- `ApplyProfileChangeHandler` → emits `ProfileChangeAppliedEvent`
- `CreateContractVersionHandler` → emits `ContractVersionCreatedEvent`
- `ConfirmProbationHandler` → emits `ProbationConfirmedEvent`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/people/application/commands/
git commit -m "feat(people): emit domain events from all lifecycle command handlers"
```

---

## Task 10: Facade Methods — PeopleQueryFacade

**Files:**

- Modify: `apps/api/src/modules/people/application/facades/people-query.facade.ts`

- [ ] **Step 1: Add new facade methods**

```typescript
// apps/api/src/modules/people/application/facades/people-query.facade.ts

import { Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { GetPersonProfileQuery } from '../queries/get-person-profile.query'
import { GetEmploymentQuery } from '../queries/get-employment.query'
import { GetCurrentJobAssignmentQuery } from '../queries/get-current-job-assignment.query'
import { ListEmploymentsQuery } from '../queries/list-employments.query'
import type { PersonProfileResult } from '../queries/get-person-profile.handler'
import type { Employment } from '../../domain/entities/employment.entity'
import type { JobAssignment } from '../../domain/entities/job-assignment.entity'
import { Inject } from '@nestjs/common'
import {
  JOB_ASSIGNMENT_REPOSITORY,
  type IJobAssignmentRepository,
} from '../../domain/repositories/job-assignment.repository'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'

@Injectable()
export class PeopleQueryFacade {
  constructor(
    private readonly queryBus: QueryBus,
    @Inject(JOB_ASSIGNMENT_REPOSITORY)
    private readonly assignmentRepo: IJobAssignmentRepository,
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
  ) {}

  // --- Existing methods (from Plan 01) ---

  getPersonProfile(actorId: string, tenantId: string): Promise<PersonProfileResult> {
    return this.queryBus.execute(new GetPersonProfileQuery(actorId, tenantId))
  }

  getEmployment(tenantId: string, employmentId: string): Promise<Employment | null> {
    return this.queryBus.execute(new GetEmploymentQuery(employmentId, tenantId))
  }

  getEmploymentByActorId(tenantId: string, actorId: string): Promise<Employment | null> {
    return this.queryBus.execute(new GetEmploymentQuery(actorId, tenantId))
  }

  getCurrentJobAssignment(tenantId: string, employmentId: string): Promise<JobAssignment | null> {
    return this.queryBus.execute(new GetCurrentJobAssignmentQuery(employmentId, tenantId))
  }

  async isActiveEmployee(tenantId: string, actorId: string): Promise<boolean> {
    const profile = await this.getPersonProfile(actorId, tenantId)
    if (!profile) return false
    return profile.employments.some((e) => e.employment.employmentStatus === 'active')
  }

  // --- New methods (Plan 06) ---

  async getJobAssignmentAsOf(
    tenantId: string,
    employmentId: string,
    date: Date,
  ): Promise<JobAssignment | null> {
    return this.assignmentRepo.findAsOf(employmentId, tenantId, date)
  }

  async listEmploymentsByDepartment(tenantId: string, departmentId: string): Promise<Employment[]> {
    // Query employments whose current job_assignment has this departmentId
    // This requires a join through job_assignment — implementation in the repo
    return this.employmentRepo.listByTenant(tenantId, {
      // departmentId filter added to repo in Plan 01 extension
    }) as Promise<Employment[]>
  }

  async listEmploymentsByManager(
    tenantId: string,
    managerEmploymentId: string,
  ): Promise<Employment[]> {
    // Query employments whose current job_assignment has managerId = managerEmploymentId
    return this.employmentRepo.listByTenant(tenantId, {
      // managerId filter added to repo
    }) as Promise<Employment[]>
  }

  async getHeadcount(
    tenantId: string,
    filters?: {
      departmentId?: string
      countryCode?: string
      employmentStatus?: string
      workerType?: string
    },
  ): Promise<number> {
    return this.employmentRepo.countByTenant(tenantId, {
      status: filters?.employmentStatus as any,
      countryCode: filters?.countryCode,
    })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/people/application/facades/people-query.facade.ts
git commit -m "feat(people): add getJobAssignmentAsOf, listByDepartment, listByManager, getHeadcount to facade"
```

---

## Task 11: Update people.module.ts

**Files:**

- Modify: `apps/api/src/modules/people/people.module.ts`

- [ ] **Step 1: Register all new event handlers and services**

```typescript
// Add to providers array in people.module.ts:

// Services (new)
OnboardingTemplateSelectorService,
OffboardingTemplateSelectorService,
DocumentRequirementCheckerService,

// Event handlers (ensure all are registered)
OnCandidateHiredHandler,           // updated in Task 4
OnSearchIndexUpdateHandler,         // from Plan 05
// OnDecisionCaseResolvedHandler,   // existing, for profile_change_request

// All lifecycle command handlers must be registered (from Plan 02)
// Verify these emit events now:
// ActivateEmploymentHandler,
// TerminateEmploymentHandler,
// StartLeaveHandler,
// SuspendEmploymentHandler,
// GiveNoticeHandler,
// ReturnFromLeaveHandler,
// ReinstateSuspensionHandler,
// CompleteTerminationHandler,
```

- [ ] **Step 2: Verify EventBus is available**

`CqrsModule` must be in `imports` — this was already done in Plan 01. `EventBus` is automatically provided by `CqrsModule`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/people/people.module.ts
git commit -m "feat(people): register onboarding/offboarding services and event handlers in module"
```

---

## Task 12: Update tRPC Router — Onboarding/Offboarding with employmentId

**Files:**

- Modify: `apps/api/src/modules/people/interface/trpc/people.router.ts`

- [ ] **Step 1: Update onboarding/offboarding procedures**

```typescript
// In people.router.ts, update the onboarding sub-router:

onboarding: t.router({
  getCase: t.procedure
    .input(z.object({ employmentId: z.string().uuid() }))  // was: profileId
    .query(({ input, ctx }) =>
      queryBus.execute(new GetOnboardingCaseQuery(input.employmentId, ctx.tenantId)),
    ),
  listCases: t.procedure
    .input(z.object({
      status: z.enum(['in_progress', 'completed']).optional(),
      limit: z.number().min(1).max(100).default(25),
      offset: z.number().min(0).default(0),
    }))
    .query(({ input, ctx }) =>
      queryBus.execute(new ListOnboardingCasesQuery(ctx.tenantId, input.status, input.limit, input.offset)),
    ),
  completeTask: t.procedure
    .input(z.object({
      taskId: z.string().uuid(),
      evidenceUrl: z.string().optional(),
    }))
    .mutation(({ input, ctx }) =>
      commandBus.execute(new CompleteOnboardingTaskCommand(ctx.tenantId, input.taskId, ctx.actorId, input.evidenceUrl)),
    ),
  listTemplates: t.procedure
    .input(z.object({
      countryCode: z.string().length(2).optional(),
      workerType: z.enum(['employee', 'contingent']).optional(),
      employmentType: z.enum(['permanent', 'fixed_term', 'intern']).optional(),
    }))
    .query(({ input, ctx }) =>
      queryBus.execute(new ListOnboardingTemplatesQuery(ctx.tenantId, input)),
    ),
}),

offboarding: t.router({
  getCase: t.procedure
    .input(z.object({ employmentId: z.string().uuid() }))  // was: profileId
    .query(({ input, ctx }) =>
      queryBus.execute(new GetOffboardingCaseQuery(input.employmentId, ctx.tenantId)),
    ),
  listCases: t.procedure
    .input(z.object({
      status: z.enum(['pending', 'approved', 'processing', 'completed', 'rejected']).optional(),
      limit: z.number().min(1).max(100).default(25),
      offset: z.number().min(0).default(0),
    }))
    .query(({ input, ctx }) =>
      queryBus.execute(new ListOffboardingCasesQuery(ctx.tenantId, input.status, input.limit, input.offset)),
    ),
  completeTask: t.procedure
    .input(z.object({
      taskId: z.string().uuid(),
      evidenceUrl: z.string().optional(),
    }))
    .mutation(({ input, ctx }) =>
      commandBus.execute(new CompleteOffboardingTaskCommand(ctx.tenantId, input.taskId, ctx.actorId, input.evidenceUrl)),
    ),
  listTemplates: t.procedure
    .input(z.object({
      countryCode: z.string().length(2).optional(),
      terminationReason: z.string().optional(),
    }))
    .query(({ input, ctx }) =>
      queryBus.execute(new ListOffboardingTemplatesQuery(ctx.tenantId, input)),
    ),
}),
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/people/interface/trpc/people.router.ts
git commit -m "feat(people): update tRPC onboarding/offboarding procedures to use employmentId"
```

---

## Task 13: Integration Tests — Event Emission

**Files:**

- Create: `event-emission.integration.spec.ts`

- [ ] **Step 1: Write integration tests verifying event emission from key commands**

```typescript
// apps/api/src/modules/people/application/event-handlers/event-emission.integration.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import {
  EmploymentActivatedEvent,
  EmploymentTerminatedEvent,
  JobAssignmentChangedEvent,
} from '@future/event-contracts/people'

/**
 * These tests verify that command handlers correctly emit domain events.
 * They use direct handler construction with mocked repos and a spy EventBus.
 */

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000002'
const ACTOR_ID = '01900000-0000-7000-8000-000000000003'

describe('Event Emission Integration', () => {
  let eventBus: EventBus

  beforeEach(() => {
    eventBus = {
      publish: vi.fn(),
      publishAll: vi.fn(),
    } as any
  })

  describe('ActivateEmploymentHandler', () => {
    it('emits EmploymentActivatedEvent after successful activation', async () => {
      // Import handler dynamically to avoid circular deps in test setup
      const { ActivateEmploymentHandler } = await import('../commands/activate-employment.handler')
      const { ActivateEmploymentCommand } = await import('../commands/activate-employment.command')

      const employmentRepo = {
        findById: vi.fn().mockResolvedValue({
          id: EMPLOYMENT_ID,
          tenantId: TENANT_ID,
          personProfileId: 'profile-1',
          employmentStatus: 'pre_hire',
        }),
        updateStatus: vi.fn(),
        findByPersonProfileId: vi.fn(),
        findActiveByActorId: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
        listByTenant: vi.fn(),
        countByTenant: vi.fn(),
      }

      const handler = new ActivateEmploymentHandler(employmentRepo, eventBus as any)

      await handler.execute(new ActivateEmploymentCommand(TENANT_ID, EMPLOYMENT_ID, ACTOR_ID))

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          employmentId: EMPLOYMENT_ID,
          actorId: ACTOR_ID,
        }),
      )
      const emittedEvent = vi.mocked(eventBus.publish).mock.calls[0][0]
      expect(emittedEvent).toBeInstanceOf(EmploymentActivatedEvent)
    })
  })

  describe('TerminateEmploymentHandler', () => {
    it('emits EmploymentTerminatedEvent after successful termination', async () => {
      const { TerminateEmploymentHandler } =
        await import('../commands/terminate-employment.handler')
      const { TerminateEmploymentCommand } =
        await import('../commands/terminate-employment.command')

      const employmentRepo = {
        findById: vi.fn().mockResolvedValue({
          id: EMPLOYMENT_ID,
          tenantId: TENANT_ID,
          personProfileId: 'profile-1',
          employmentStatus: 'active',
        }),
        updateStatus: vi.fn(),
        findByPersonProfileId: vi.fn(),
        findActiveByActorId: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
        listByTenant: vi.fn(),
        countByTenant: vi.fn(),
      }

      const offboardingSelector = { selectTemplate: vi.fn().mockResolvedValue(null) }
      const offboardingCaseRepo = { insert: vi.fn() }

      const handler = new TerminateEmploymentHandler(
        employmentRepo,
        eventBus as any,
        offboardingSelector as any,
        offboardingCaseRepo as any,
      )

      await handler.execute(
        new TerminateEmploymentCommand(
          TENANT_ID,
          EMPLOYMENT_ID,
          'voluntary_resignation',
          new Date('2026-06-30'),
          ACTOR_ID,
        ),
      )

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          employmentId: EMPLOYMENT_ID,
          terminationReason: 'voluntary_resignation',
        }),
      )
      const emittedEvent = vi.mocked(eventBus.publish).mock.calls[0][0]
      expect(emittedEvent).toBeInstanceOf(EmploymentTerminatedEvent)
    })
  })

  describe('CreateJobAssignmentHandler', () => {
    it('emits JobAssignmentChangedEvent after creating assignment', async () => {
      const { CreateJobAssignmentHandler } =
        await import('../commands/create-job-assignment.handler')
      const { CreateJobAssignmentCommand } =
        await import('../commands/create-job-assignment.command')

      const employmentRepo = {
        findById: vi.fn().mockResolvedValue({
          id: EMPLOYMENT_ID,
          tenantId: TENANT_ID,
        }),
        findByPersonProfileId: vi.fn(),
        findActiveByActorId: vi.fn(),
        insert: vi.fn(),
        updateStatus: vi.fn(),
        update: vi.fn(),
        listByTenant: vi.fn(),
        countByTenant: vi.fn(),
      }
      const assignmentRepo = {
        findById: vi.fn(),
        findCurrent: vi.fn().mockResolvedValue({
          id: 'old-assign',
          jobProfileId: 'old-job',
          departmentId: 'old-dept',
          managerId: null,
        }),
        findAsOf: vi.fn(),
        findHistory: vi.fn(),
        insert: vi.fn().mockResolvedValue({ id: 'new-assign' }),
        closeAssignment: vi.fn(),
        delete: vi.fn(),
      }
      const jobProfileRepo = {
        findById: vi.fn().mockResolvedValue({ id: 'new-job', title: 'Lead' }),
        listByTenant: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
        countByJobFamilyId: vi.fn(),
      }

      const handler = new CreateJobAssignmentHandler(
        employmentRepo,
        assignmentRepo,
        jobProfileRepo,
        eventBus as any,
      )

      await handler.execute(
        new CreateJobAssignmentCommand(
          TENANT_ID,
          EMPLOYMENT_ID,
          'new-job',
          'new-dept',
          new Date('2026-07-01'),
          'promotion',
          ACTOR_ID,
        ),
      )

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          employmentId: EMPLOYMENT_ID,
          eventType: 'promotion',
        }),
      )
      const emittedEvent = vi.mocked(eventBus.publish).mock.calls[0][0]
      expect(emittedEvent).toBeInstanceOf(JobAssignmentChangedEvent)
    })
  })
})
```

- [ ] **Step 2: Run integration tests**

```bash
bun run --filter @future/event-contracts build
cd apps/api && bunx vitest run src/modules/people/application/event-handlers/event-emission.integration.spec.ts --reporter=verbose
```

Expected: PASS (3 tests)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/people/application/event-handlers/event-emission.integration.spec.ts
git commit -m "test(people): add integration tests verifying event emission from lifecycle commands"
```

---

## Task 14: Database Migration

- [ ] **Step 1: Generate migration**

```bash
cd apps/api && bunx drizzle-kit generate --name people-onboarding-events
```

This generates SQL for:

1. Add `country_code`, `worker_type` columns to `people.onboarding_template`
2. Add `document_requirement_id` to `people.onboarding_task_template`
3. Add `country_code`, `termination_reason` columns to `people.offboarding_template`
4. Rename `profile_id` to `employment_id` on `people.onboarding_case`
5. Rename `profile_id` to `employment_id` on `people.offboarding_case`
6. Update `employment_type` enum on both templates (remove 'contractor', keep 'permanent', 'fixed_term', 'intern')

- [ ] **Step 2: Review and verify migration**

Check that:

- Column renames are correct (profile_id -> employment_id)
- New columns have correct NULL defaults for existing rows
- No data loss from enum changes

- [ ] **Step 3: Run migration and commit**

```bash
cd apps/api && bunx drizzle-kit migrate
git add apps/api/drizzle/
git commit -m "feat(people): add database migration for onboarding/offboarding enhancements"
```

---

## Task 15: Run Full Test Suite

- [ ] **Step 1: Build all workspace packages**

```bash
bun run --filter "@future/*" build
```

- [ ] **Step 2: Run all people module tests**

```bash
cd apps/api && bunx vitest run src/modules/people/ --reporter=verbose
```

All tests should pass. Fix any failures caused by:

- Old event class imports (update to new names)
- profileId -> employmentId migrations
- Constructor signature changes from EventBus injection

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat(people): onboarding, offboarding & events complete — 15 event contracts, template selectors, facade methods"
```
