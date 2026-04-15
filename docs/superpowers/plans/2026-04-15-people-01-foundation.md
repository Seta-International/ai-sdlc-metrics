# People Module — Plan 01: Foundation & Core Schema

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tear down the current people module's domain model and rebuild the foundation — new core tables, domain entities, repositories, and basic CRUD — that all subsequent plans depend on.

**Architecture:** Hexagonal + DDD + CQRS. Domain layer has zero NestJS/Drizzle deps. Application layer has commands/queries/handlers. Infrastructure has Drizzle repos and schema. Interface has tRPC router. All existing entity references (EmploymentProfile, EmploymentProfileDetail, etc.) are replaced wholesale — no backward compatibility.

**Tech Stack:** NestJS, Drizzle ORM, PostgreSQL 16, tRPC, Zod, Vitest

**Spec Reference:** `docs/superpowers/specs/2026-04-15-people-module-redesign.md` — Sections 3.1–3.6

---

## File Structure

### Files to DELETE (old domain model)

```
apps/api/src/modules/people/domain/entities/employment-profile.entity.ts
apps/api/src/modules/people/domain/entities/employment-profile-detail.entity.ts
apps/api/src/modules/people/domain/entities/account-membership.entity.ts
apps/api/src/modules/people/domain/entities/periodic-profile-review.entity.ts
apps/api/src/modules/people/domain/repositories/employment-profile.repository.ts
apps/api/src/modules/people/domain/repositories/employment-profile-detail.repository.ts
apps/api/src/modules/people/domain/repositories/account-membership.repository.ts
apps/api/src/modules/people/domain/repositories/periodic-profile-review.repository.ts
apps/api/src/modules/people/infrastructure/repositories/drizzle-employment-profile.repository.ts
apps/api/src/modules/people/infrastructure/repositories/drizzle-employment-profile-detail.repository.ts
apps/api/src/modules/people/infrastructure/repositories/drizzle-account-membership.repository.ts
apps/api/src/modules/people/infrastructure/repositories/drizzle-periodic-profile-review.repository.ts
apps/api/src/modules/people/application/commands/create-employment-profile.command.ts
apps/api/src/modules/people/application/commands/create-employment-profile.handler.ts
apps/api/src/modules/people/application/commands/update-profile-direct.command.ts
apps/api/src/modules/people/application/commands/update-profile-direct.handler.ts
apps/api/src/modules/people/application/queries/get-profile.query.ts
apps/api/src/modules/people/application/queries/get-profile.handler.ts
apps/api/src/modules/people/application/queries/list-employees.query.ts
apps/api/src/modules/people/application/queries/list-employees.handler.ts
```

### Files to CREATE

```
# Domain entities
apps/api/src/modules/people/domain/entities/person-profile.entity.ts
apps/api/src/modules/people/domain/entities/employment.entity.ts
apps/api/src/modules/people/domain/entities/employment-detail.entity.ts
apps/api/src/modules/people/domain/entities/job-assignment.entity.ts
apps/api/src/modules/people/domain/entities/job-profile.entity.ts
apps/api/src/modules/people/domain/entities/job-family.entity.ts

# Domain repositories
apps/api/src/modules/people/domain/repositories/person-profile.repository.ts
apps/api/src/modules/people/domain/repositories/employment.repository.ts
apps/api/src/modules/people/domain/repositories/employment-detail.repository.ts
apps/api/src/modules/people/domain/repositories/job-assignment.repository.ts
apps/api/src/modules/people/domain/repositories/job-profile.repository.ts
apps/api/src/modules/people/domain/repositories/job-family.repository.ts

# Value objects
apps/api/src/modules/people/domain/value-objects/employment-status.ts
apps/api/src/modules/people/domain/value-objects/name-display-order.ts

# Infrastructure — schema (replace old)
apps/api/src/modules/people/infrastructure/schema/people.schema.ts  (rewrite)

# Infrastructure — repositories
apps/api/src/modules/people/infrastructure/repositories/drizzle-person-profile.repository.ts
apps/api/src/modules/people/infrastructure/repositories/drizzle-employment.repository.ts
apps/api/src/modules/people/infrastructure/repositories/drizzle-employment-detail.repository.ts
apps/api/src/modules/people/infrastructure/repositories/drizzle-job-assignment.repository.ts
apps/api/src/modules/people/infrastructure/repositories/drizzle-job-profile.repository.ts
apps/api/src/modules/people/infrastructure/repositories/drizzle-job-family.repository.ts

# Application — commands
apps/api/src/modules/people/application/commands/create-person-profile.command.ts
apps/api/src/modules/people/application/commands/create-person-profile.handler.ts
apps/api/src/modules/people/application/commands/create-employment.command.ts
apps/api/src/modules/people/application/commands/create-employment.handler.ts
apps/api/src/modules/people/application/commands/create-job-assignment.command.ts
apps/api/src/modules/people/application/commands/create-job-assignment.handler.ts
apps/api/src/modules/people/application/commands/create-job-profile.command.ts
apps/api/src/modules/people/application/commands/create-job-profile.handler.ts
apps/api/src/modules/people/application/commands/create-job-family.command.ts
apps/api/src/modules/people/application/commands/create-job-family.handler.ts
apps/api/src/modules/people/application/commands/update-employment-detail.command.ts
apps/api/src/modules/people/application/commands/update-employment-detail.handler.ts

# Application — queries
apps/api/src/modules/people/application/queries/get-person-profile.query.ts
apps/api/src/modules/people/application/queries/get-person-profile.handler.ts
apps/api/src/modules/people/application/queries/get-employment.query.ts
apps/api/src/modules/people/application/queries/get-employment.handler.ts
apps/api/src/modules/people/application/queries/list-employments.query.ts
apps/api/src/modules/people/application/queries/list-employments.handler.ts
apps/api/src/modules/people/application/queries/get-current-job-assignment.query.ts
apps/api/src/modules/people/application/queries/get-current-job-assignment.handler.ts
apps/api/src/modules/people/application/queries/list-job-profiles.query.ts
apps/api/src/modules/people/application/queries/list-job-profiles.handler.ts

# Application — facade (rewrite)
apps/api/src/modules/people/application/facades/people-query.facade.ts  (rewrite)

# Interface — tRPC (rewrite)
apps/api/src/modules/people/interface/trpc/people.router.ts  (rewrite)
apps/api/src/modules/people/interface/trpc/people-trpc.service.ts  (keep, minor updates)

# Module (rewrite)
apps/api/src/modules/people/people.module.ts  (rewrite)

# Tests (co-located)
apps/api/src/modules/people/application/commands/create-person-profile.handler.spec.ts
apps/api/src/modules/people/application/commands/create-employment.handler.spec.ts
apps/api/src/modules/people/application/commands/create-job-assignment.handler.spec.ts
apps/api/src/modules/people/application/queries/get-person-profile.handler.spec.ts
apps/api/src/modules/people/application/queries/get-employment.handler.spec.ts
apps/api/src/modules/people/application/queries/get-current-job-assignment.handler.spec.ts
```

---

## Task 1: Delete Old Domain Model

**Files:**

- Delete: all files listed in "Files to DELETE" above
- Modify: `apps/api/src/modules/people/people.module.ts` (strip old providers)

- [ ] **Step 1: List all files to be deleted**

```bash
ls apps/api/src/modules/people/domain/entities/employment-profile*.ts \
   apps/api/src/modules/people/domain/entities/account-membership.entity.ts \
   apps/api/src/modules/people/domain/entities/periodic-profile-review.entity.ts \
   apps/api/src/modules/people/domain/repositories/employment-profile*.ts \
   apps/api/src/modules/people/domain/repositories/account-membership.repository.ts \
   apps/api/src/modules/people/domain/repositories/periodic-profile-review.repository.ts \
   apps/api/src/modules/people/infrastructure/repositories/drizzle-employment-profile*.ts \
   apps/api/src/modules/people/infrastructure/repositories/drizzle-account-membership.repository.ts \
   apps/api/src/modules/people/infrastructure/repositories/drizzle-periodic-profile-review.repository.ts
```

Verify these files exist before deleting.

- [ ] **Step 2: Delete old entity files**

```bash
rm apps/api/src/modules/people/domain/entities/employment-profile.entity.ts
rm apps/api/src/modules/people/domain/entities/employment-profile-detail.entity.ts
rm apps/api/src/modules/people/domain/entities/account-membership.entity.ts
rm apps/api/src/modules/people/domain/entities/periodic-profile-review.entity.ts
```

- [ ] **Step 3: Delete old repository interfaces**

```bash
rm apps/api/src/modules/people/domain/repositories/employment-profile.repository.ts
rm apps/api/src/modules/people/domain/repositories/employment-profile-detail.repository.ts
rm apps/api/src/modules/people/domain/repositories/account-membership.repository.ts
rm apps/api/src/modules/people/domain/repositories/periodic-profile-review.repository.ts
```

- [ ] **Step 4: Delete old Drizzle repositories**

```bash
rm apps/api/src/modules/people/infrastructure/repositories/drizzle-employment-profile.repository.ts
rm apps/api/src/modules/people/infrastructure/repositories/drizzle-employment-profile-detail.repository.ts
rm apps/api/src/modules/people/infrastructure/repositories/drizzle-account-membership.repository.ts
rm apps/api/src/modules/people/infrastructure/repositories/drizzle-periodic-profile-review.repository.ts
```

- [ ] **Step 5: Delete old command/query files**

```bash
rm apps/api/src/modules/people/application/commands/create-employment-profile.command.ts
rm apps/api/src/modules/people/application/commands/create-employment-profile.handler.ts
rm apps/api/src/modules/people/application/commands/create-employment-profile.handler.spec.ts
rm apps/api/src/modules/people/application/commands/update-profile-direct.command.ts
rm apps/api/src/modules/people/application/commands/update-profile-direct.handler.ts
rm apps/api/src/modules/people/application/commands/update-profile-direct.handler.spec.ts
rm apps/api/src/modules/people/application/queries/get-profile.query.ts
rm apps/api/src/modules/people/application/queries/get-profile.handler.ts
rm apps/api/src/modules/people/application/queries/get-profile.handler.spec.ts
rm apps/api/src/modules/people/application/queries/list-employees.query.ts
rm apps/api/src/modules/people/application/queries/list-employees.handler.ts
rm apps/api/src/modules/people/application/queries/list-employees.handler.spec.ts
```

- [ ] **Step 6: Commit the teardown**

```bash
git add -A
git commit -m "refactor(people): remove old domain model (employment-profile, account-membership, periodic-review)"
```

---

## Task 2: Domain Value Objects

**Files:**

- Create: `apps/api/src/modules/people/domain/value-objects/employment-status.ts`
- Create: `apps/api/src/modules/people/domain/value-objects/name-display-order.ts`

- [ ] **Step 1: Create employment-status value object**

```typescript
// apps/api/src/modules/people/domain/value-objects/employment-status.ts

export type EmploymentStatus =
  | 'pre_hire'
  | 'active'
  | 'on_leave'
  | 'suspended'
  | 'notice_period'
  | 'terminated'

export type TerminationReason =
  | 'voluntary_resignation'
  | 'involuntary_performance'
  | 'involuntary_misconduct'
  | 'redundancy'
  | 'end_of_contract'
  | 'mutual_agreement'
  | 'retirement'
  | 'deceased'
  | 'failed_probation'
  | 'no_show'
  | 'company_closure'

export type WorkerType = 'employee' | 'contingent'

export type EmploymentType = 'permanent' | 'fixed_term' | 'intern'

export type WorkArrangement = 'onsite' | 'hybrid' | 'remote'

export type JobAssignmentEventType =
  | 'hire'
  | 'promotion'
  | 'lateral_transfer'
  | 'demotion'
  | 'reorg'
  | 'location_change'
  | 'correction'

export const EMPLOYMENT_STATUS_VALUES: EmploymentStatus[] = [
  'pre_hire',
  'active',
  'on_leave',
  'suspended',
  'notice_period',
  'terminated',
]

export const TERMINATION_REASON_VALUES: TerminationReason[] = [
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
]

export const WORKER_TYPE_VALUES: WorkerType[] = ['employee', 'contingent']
export const EMPLOYMENT_TYPE_VALUES: EmploymentType[] = ['permanent', 'fixed_term', 'intern']
export const WORK_ARRANGEMENT_VALUES: WorkArrangement[] = ['onsite', 'hybrid', 'remote']
export const JOB_ASSIGNMENT_EVENT_TYPE_VALUES: JobAssignmentEventType[] = [
  'hire',
  'promotion',
  'lateral_transfer',
  'demotion',
  'reorg',
  'location_change',
  'correction',
]
```

- [ ] **Step 2: Create name-display-order value object**

```typescript
// apps/api/src/modules/people/domain/value-objects/name-display-order.ts

export type NameDisplayOrder = 'family_first' | 'given_first'

export const NAME_DISPLAY_ORDER_VALUES: NameDisplayOrder[] = ['family_first', 'given_first']

export const FAMILY_FIRST_COUNTRIES = new Set(['VN', 'JP', 'KR', 'CN', 'TW', 'HK', 'MO', 'HU'])

export function defaultNameDisplayOrder(countryCode: string): NameDisplayOrder {
  return FAMILY_FIRST_COUNTRIES.has(countryCode) ? 'family_first' : 'given_first'
}

export function computeFullName(
  familyName: string,
  givenName: string,
  middleName: string | null,
  displayOrder: NameDisplayOrder,
): string {
  const middle = middleName ? ` ${middleName}` : ''
  return displayOrder === 'family_first'
    ? `${familyName}${middle} ${givenName}`
    : `${givenName}${middle} ${familyName}`
}

export function computeFullNameUnaccented(fullName: string): string {
  return fullName
    .normalize('NFC')
    .replace(/Đ/g, 'D')
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC')
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/people/domain/value-objects/
git commit -m "feat(people): add employment-status and name-display-order value objects"
```

---

## Task 3: Domain Entities

**Files:**

- Create: 6 entity files in `apps/api/src/modules/people/domain/entities/`

- [ ] **Step 1: Create person-profile entity**

```typescript
// apps/api/src/modules/people/domain/entities/person-profile.entity.ts

import type { NameDisplayOrder } from '../value-objects/name-display-order'

export interface PersonProfile {
  id: string
  tenantId: string
  actorId: string
  familyName: string
  middleName: string | null
  givenName: string
  fullName: string
  fullNameUnaccented: string
  preferredName: string | null
  nameDisplayOrder: NameDisplayOrder
  dateOfBirth: Date | null
  gender: 'male' | 'female' | 'other' | 'undisclosed' | null
  nationality: string | null
  maritalStatus: 'single' | 'married' | 'divorced' | 'widowed' | 'undisclosed' | null
  photoDocumentId: string | null
  createdAt: Date
  updatedAt: Date
}
```

- [ ] **Step 2: Create employment entity**

```typescript
// apps/api/src/modules/people/domain/entities/employment.entity.ts

import type {
  EmploymentStatus,
  EmploymentType,
  TerminationReason,
  WorkerType,
} from '../value-objects/employment-status'

export interface Employment {
  id: string
  tenantId: string
  personProfileId: string
  employeeCode: string | null
  companyEmail: string | null
  workerType: WorkerType
  employmentType: EmploymentType
  countryCode: string
  employmentStatus: EmploymentStatus
  terminationDate: Date | null
  terminationReason: TerminationReason | null
  hireDate: Date
  originalHireDate: Date | null
  createdAt: Date
  updatedAt: Date
}
```

- [ ] **Step 3: Create employment-detail entity**

```typescript
// apps/api/src/modules/people/domain/entities/employment-detail.entity.ts

export interface EmploymentDetail {
  id: string
  tenantId: string
  employmentId: string
  nationalId: string | null
  nationalIdType: string | null
  nationalIdIssuedDate: Date | null
  nationalIdExpiryDate: Date | null
  taxId: string | null
  socialInsuranceId: string | null
  passportNumber: string | null
  passportExpiryDate: Date | null
  bankAccountNumber: string | null
  bankName: string | null
  bankBranch: string | null
  bankAccountHolder: string | null
  bankSwiftCode: string | null
  personalEmail: string | null
  personalPhone: string | null
  permanentAddress: Record<string, unknown> | null
  currentAddress: Record<string, unknown> | null
  emergencyContacts: Array<Record<string, unknown>> | null
  countryData: Record<string, unknown> | null
  customFields: Record<string, unknown> | null
}
```

- [ ] **Step 4: Create job-assignment entity**

```typescript
// apps/api/src/modules/people/domain/entities/job-assignment.entity.ts

import type { JobAssignmentEventType, WorkArrangement } from '../value-objects/employment-status'

export interface JobAssignment {
  id: string
  tenantId: string
  employmentId: string
  effectiveFrom: Date
  effectiveTo: Date | null
  jobProfileId: string
  departmentId: string | null
  locationId: string | null
  costCenterId: string | null
  workArrangement: WorkArrangement
  managerId: string | null
  eventType: JobAssignmentEventType
  reason: string | null
  createdBy: string
  createdAt: Date
}
```

- [ ] **Step 5: Create job-profile and job-family entities**

```typescript
// apps/api/src/modules/people/domain/entities/job-family.entity.ts

export interface JobFamily {
  id: string
  tenantId: string
  name: string
  description: string | null
  parentId: string | null
  isActive: boolean
  createdAt: Date
}
```

```typescript
// apps/api/src/modules/people/domain/entities/job-profile.entity.ts

export interface JobProfile {
  id: string
  tenantId: string
  jobFamilyId: string
  title: string
  level: string | null
  description: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/people/domain/entities/
git commit -m "feat(people): add new domain entities (person-profile, employment, job-assignment, job-profile)"
```

---

## Task 4: Domain Repository Interfaces

**Files:**

- Create: 6 repository files in `apps/api/src/modules/people/domain/repositories/`

- [ ] **Step 1: Create person-profile repository interface**

```typescript
// apps/api/src/modules/people/domain/repositories/person-profile.repository.ts

import type { PersonProfile } from '../entities/person-profile.entity'

export const PERSON_PROFILE_REPOSITORY = Symbol('IPersonProfileRepository')

export interface IPersonProfileRepository {
  findById(id: string, tenantId: string): Promise<PersonProfile | null>
  findByActorId(actorId: string, tenantId: string): Promise<PersonProfile | null>
  insert(data: Omit<PersonProfile, 'id' | 'createdAt' | 'updatedAt'>): Promise<PersonProfile>
  update(
    id: string,
    tenantId: string,
    data: Partial<Omit<PersonProfile, 'id' | 'tenantId' | 'actorId' | 'createdAt'>>,
  ): Promise<PersonProfile>
}
```

- [ ] **Step 2: Create employment repository interface**

```typescript
// apps/api/src/modules/people/domain/repositories/employment.repository.ts

import type { Employment } from '../entities/employment.entity'
import type { EmploymentStatus } from '../value-objects/employment-status'

export const EMPLOYMENT_REPOSITORY = Symbol('IEmploymentRepository')

export interface IEmploymentRepository {
  findById(id: string, tenantId: string): Promise<Employment | null>
  findByPersonProfileId(personProfileId: string, tenantId: string): Promise<Employment[]>
  findActiveByActorId(actorId: string, tenantId: string): Promise<Employment | null>
  insert(data: Omit<Employment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Employment>
  updateStatus(
    id: string,
    tenantId: string,
    status: EmploymentStatus,
    terminationDate?: Date | null,
    terminationReason?: string | null,
  ): Promise<void>
  update(
    id: string,
    tenantId: string,
    data: Partial<Omit<Employment, 'id' | 'tenantId' | 'personProfileId' | 'createdAt'>>,
  ): Promise<Employment>
  listByTenant(
    tenantId: string,
    filters?: {
      status?: EmploymentStatus
      countryCode?: string
      limit?: number
      offset?: number
    },
  ): Promise<Employment[]>
  countByTenant(
    tenantId: string,
    filters?: { status?: EmploymentStatus; countryCode?: string },
  ): Promise<number>
}
```

- [ ] **Step 3: Create employment-detail repository interface**

```typescript
// apps/api/src/modules/people/domain/repositories/employment-detail.repository.ts

import type { EmploymentDetail } from '../entities/employment-detail.entity'

export const EMPLOYMENT_DETAIL_REPOSITORY = Symbol('IEmploymentDetailRepository')

export interface IEmploymentDetailRepository {
  findByEmploymentId(employmentId: string, tenantId: string): Promise<EmploymentDetail | null>
  insert(data: Omit<EmploymentDetail, 'id'>): Promise<EmploymentDetail>
  update(
    employmentId: string,
    tenantId: string,
    data: Partial<Omit<EmploymentDetail, 'id' | 'tenantId' | 'employmentId'>>,
  ): Promise<EmploymentDetail>
}
```

- [ ] **Step 4: Create job-assignment repository interface**

```typescript
// apps/api/src/modules/people/domain/repositories/job-assignment.repository.ts

import type { JobAssignment } from '../entities/job-assignment.entity'

export const JOB_ASSIGNMENT_REPOSITORY = Symbol('IJobAssignmentRepository')

export interface IJobAssignmentRepository {
  findById(id: string, tenantId: string): Promise<JobAssignment | null>
  findCurrent(employmentId: string, tenantId: string): Promise<JobAssignment | null>
  findAsOf(employmentId: string, tenantId: string, asOfDate: Date): Promise<JobAssignment | null>
  findHistory(employmentId: string, tenantId: string): Promise<JobAssignment[]>
  insert(data: Omit<JobAssignment, 'id' | 'createdAt'>): Promise<JobAssignment>
  closeAssignment(id: string, tenantId: string, effectiveTo: Date): Promise<void>
  delete(id: string, tenantId: string): Promise<void>
}
```

- [ ] **Step 5: Create job-profile and job-family repository interfaces**

```typescript
// apps/api/src/modules/people/domain/repositories/job-family.repository.ts

import type { JobFamily } from '../entities/job-family.entity'

export const JOB_FAMILY_REPOSITORY = Symbol('IJobFamilyRepository')

export interface IJobFamilyRepository {
  findById(id: string, tenantId: string): Promise<JobFamily | null>
  listByTenant(tenantId: string): Promise<JobFamily[]>
  insert(data: Omit<JobFamily, 'id' | 'createdAt'>): Promise<JobFamily>
  update(
    id: string,
    tenantId: string,
    data: Partial<Pick<JobFamily, 'name' | 'description' | 'parentId' | 'isActive'>>,
  ): Promise<JobFamily>
}
```

```typescript
// apps/api/src/modules/people/domain/repositories/job-profile.repository.ts

import type { JobProfile } from '../entities/job-profile.entity'

export const JOB_PROFILE_REPOSITORY = Symbol('IJobProfileRepository')

export interface IJobProfileRepository {
  findById(id: string, tenantId: string): Promise<JobProfile | null>
  listByTenant(
    tenantId: string,
    filters?: { familyId?: string; isActive?: boolean },
  ): Promise<JobProfile[]>
  insert(data: Omit<JobProfile, 'id' | 'createdAt' | 'updatedAt'>): Promise<JobProfile>
  update(
    id: string,
    tenantId: string,
    data: Partial<Pick<JobProfile, 'title' | 'level' | 'description' | 'isActive'>>,
  ): Promise<JobProfile>
  countByJobFamilyId(jobFamilyId: string, tenantId: string): Promise<number>
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/people/domain/repositories/
git commit -m "feat(people): add new repository interfaces (person-profile, employment, job-assignment, job-profile)"
```

---

## Task 5: Update Domain Exceptions

**Files:**

- Modify: `apps/api/src/modules/people/domain/exceptions/people.exceptions.ts`

- [ ] **Step 1: Rewrite exceptions file**

Replace the entire file content with exceptions matching the new domain model:

```typescript
// apps/api/src/modules/people/domain/exceptions/people.exceptions.ts

import { DomainException } from '@future/core'

export class PersonProfileNotFoundException extends DomainException {
  readonly code = 'PERSON_PROFILE_NOT_FOUND'
  constructor(id: string) {
    super(`Person profile not found: ${id}`)
  }
}

export class PersonProfileAlreadyExistsException extends DomainException {
  readonly code = 'PERSON_PROFILE_ALREADY_EXISTS'
  constructor(actorId: string) {
    super(`Person profile already exists for actor: ${actorId}`)
  }
}

export class EmploymentNotFoundException extends DomainException {
  readonly code = 'EMPLOYMENT_NOT_FOUND'
  constructor(id: string) {
    super(`Employment not found: ${id}`)
  }
}

export class InvalidEmploymentStatusTransitionException extends DomainException {
  readonly code = 'INVALID_EMPLOYMENT_STATUS_TRANSITION'
  constructor(from: string, to: string) {
    super(`Invalid employment status transition: ${from} → ${to}`)
  }
}

export class JobAssignmentNotFoundException extends DomainException {
  readonly code = 'JOB_ASSIGNMENT_NOT_FOUND'
  constructor(id: string) {
    super(`Job assignment not found: ${id}`)
  }
}

export class JobProfileNotFoundException extends DomainException {
  readonly code = 'JOB_PROFILE_NOT_FOUND'
  constructor(id: string) {
    super(`Job profile not found: ${id}`)
  }
}

export class JobFamilyNotFoundException extends DomainException {
  readonly code = 'JOB_FAMILY_NOT_FOUND'
  constructor(id: string) {
    super(`Job family not found: ${id}`)
  }
}

export class DuplicateCompanyEmailException extends DomainException {
  readonly code = 'DUPLICATE_COMPANY_EMAIL'
  constructor(email: string) {
    super(`Company email already in use: ${email}`)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/people/domain/exceptions/
git commit -m "feat(people): rewrite domain exceptions for new entity model"
```

---

## Task 6: Drizzle Schema — Core Tables

**Files:**

- Rewrite: `apps/api/src/modules/people/infrastructure/schema/people.schema.ts`

- [ ] **Step 1: Rewrite the schema file with new core tables**

This is the largest single file. Replace the entire content. Keep the schema prefix `people`. Keep existing onboarding/offboarding/profile_section/profile_change_request/contract_version table definitions (they will be enhanced in later plans).

```typescript
// apps/api/src/modules/people/infrastructure/schema/people.schema.ts

import {
  pgSchema,
  uuid,
  text,
  date,
  timestamp,
  boolean,
  integer,
  jsonb,
  numeric,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const peopleSchema = pgSchema('people')

// ─── Reference Tables ───────────────────────────────────────────────

export const jobFamily = peopleSchema.table('job_family', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  parentId: uuid('parent_id'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const jobProfile = peopleSchema.table('job_profile', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  jobFamilyId: uuid('job_family_id').notNull(),
  title: text('title').notNull(),
  level: text('level'),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ─── Core Tables ────────────────────────────────────────────────────

export const personProfile = peopleSchema.table(
  'person_profile',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    actorId: uuid('actor_id').notNull(),
    familyName: text('family_name').notNull(),
    middleName: text('middle_name'),
    givenName: text('given_name').notNull(),
    fullName: text('full_name').notNull(),
    fullNameUnaccented: text('full_name_unaccented').notNull(),
    preferredName: text('preferred_name'),
    nameDisplayOrder: text('name_display_order', {
      enum: ['family_first', 'given_first'],
    }).notNull(),
    dateOfBirth: date('date_of_birth', { mode: 'date' }),
    gender: text('gender', { enum: ['male', 'female', 'other', 'undisclosed'] }),
    nationality: text('nationality'),
    maritalStatus: text('marital_status', {
      enum: ['single', 'married', 'divorced', 'widowed', 'undisclosed'],
    }),
    photoDocumentId: uuid('photo_document_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('uq_person_profile_actor').on(table.tenantId, table.actorId)],
)

export const employment = peopleSchema.table('employment', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  personProfileId: uuid('person_profile_id').notNull(),
  employeeCode: text('employee_code'),
  companyEmail: text('company_email'),
  workerType: text('worker_type', { enum: ['employee', 'contingent'] }).notNull(),
  employmentType: text('employment_type', {
    enum: ['permanent', 'fixed_term', 'intern'],
  }).notNull(),
  countryCode: text('country_code').notNull(),
  employmentStatus: text('employment_status', {
    enum: ['pre_hire', 'active', 'on_leave', 'suspended', 'notice_period', 'terminated'],
  }).notNull(),
  terminationDate: date('termination_date', { mode: 'date' }),
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
  hireDate: date('hire_date', { mode: 'date' }).notNull(),
  originalHireDate: date('original_hire_date', { mode: 'date' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const jobAssignment = peopleSchema.table('job_assignment', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  employmentId: uuid('employment_id').notNull(),
  effectiveFrom: date('effective_from', { mode: 'date' }).notNull(),
  effectiveTo: date('effective_to', { mode: 'date' }),
  jobProfileId: uuid('job_profile_id').notNull(),
  departmentId: uuid('department_id'),
  locationId: uuid('location_id'),
  costCenterId: uuid('cost_center_id'),
  workArrangement: text('work_arrangement', { enum: ['onsite', 'hybrid', 'remote'] }).notNull(),
  managerId: uuid('manager_id'),
  eventType: text('event_type', {
    enum: [
      'hire',
      'promotion',
      'lateral_transfer',
      'demotion',
      'reorg',
      'location_change',
      'correction',
    ],
  }).notNull(),
  reason: text('reason'),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const employmentDetail = peopleSchema.table(
  'employment_detail',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    employmentId: uuid('employment_id').notNull(),
    nationalId: text('national_id'),
    nationalIdType: text('national_id_type'),
    nationalIdIssuedDate: date('national_id_issued_date', { mode: 'date' }),
    nationalIdExpiryDate: date('national_id_expiry_date', { mode: 'date' }),
    taxId: text('tax_id'),
    socialInsuranceId: text('social_insurance_id'),
    passportNumber: text('passport_number'),
    passportExpiryDate: date('passport_expiry_date', { mode: 'date' }),
    bankAccountNumber: text('bank_account_number'),
    bankName: text('bank_name'),
    bankBranch: text('bank_branch'),
    bankAccountHolder: text('bank_account_holder'),
    bankSwiftCode: text('bank_swift_code'),
    personalEmail: text('personal_email'),
    personalPhone: text('personal_phone'),
    permanentAddress: jsonb('permanent_address'),
    currentAddress: jsonb('current_address'),
    emergencyContacts: jsonb('emergency_contacts'),
    countryData: jsonb('country_data'),
    customFields: jsonb('custom_fields'),
  },
  (table) => [
    uniqueIndex('uq_employment_detail_employment').on(table.tenantId, table.employmentId),
  ],
)

// ─── Retained Tables (from current schema, kept as-is for now) ──────
// profileSection, profileChangeRequest, contractVersion,
// onboardingTemplate, onboardingTaskTemplate, onboardingCase, onboardingTask,
// offboardingTemplate, offboardingTaskTemplate, offboardingCase, offboardingTask
// These tables are retained but will have column references updated from
// profileId → employmentId in Plan 06 (Onboarding & Events).
// For now, keep the existing table definitions below this line.

// NOTE TO IMPLEMENTER: Copy the existing profileSection, profileChangeRequest,
// contractVersion, onboarding_*, offboarding_* table definitions from the
// current file BEFORE deleting it. They stay unchanged in this task.
// Plans 02, 04, and 06 will modify them.
```

- [ ] **Step 2: Run build to verify schema compiles**

```bash
bun run --filter @future/db build
```

Expected: Build succeeds. If there are import errors from other modules referencing old table names, note them but don't fix yet — those modules will be updated in Plan 06.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/people/infrastructure/schema/
git commit -m "feat(people): rewrite Drizzle schema with new core tables (person_profile, employment, job_assignment)"
```

---

## Task 7: Drizzle Repository — PersonProfile

**Files:**

- Create: `apps/api/src/modules/people/infrastructure/repositories/drizzle-person-profile.repository.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/modules/people/infrastructure/repositories/drizzle-person-profile.repository.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DrizzlePersonProfileRepository } from './drizzle-person-profile.repository'
import type { Db } from '@future/db'

// Integration tests against real DB would go here in a separate file.
// This spec validates the repository class can be instantiated.

describe('DrizzlePersonProfileRepository', () => {
  it('can be instantiated with a db instance', () => {
    const mockDb = {} as Db
    const repo = new DrizzlePersonProfileRepository(mockDb)
    expect(repo).toBeDefined()
  })
})
```

- [ ] **Step 2: Implement the repository**

```typescript
// apps/api/src/modules/people/infrastructure/repositories/drizzle-person-profile.repository.ts

import { Inject, Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { DB_TOKEN, type Db } from '@future/db'
import type { PersonProfile } from '../../domain/entities/person-profile.entity'
import type { IPersonProfileRepository } from '../../domain/repositories/person-profile.repository'
import { personProfile } from '../schema/people.schema'

@Injectable()
export class DrizzlePersonProfileRepository implements IPersonProfileRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<PersonProfile | null> {
    const rows = await this.db
      .select()
      .from(personProfile)
      .where(and(eq(personProfile.id, id), eq(personProfile.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as PersonProfile | undefined) ?? null
  }

  async findByActorId(actorId: string, tenantId: string): Promise<PersonProfile | null> {
    const rows = await this.db
      .select()
      .from(personProfile)
      .where(and(eq(personProfile.actorId, actorId), eq(personProfile.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as PersonProfile | undefined) ?? null
  }

  async insert(
    data: Omit<PersonProfile, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<PersonProfile> {
    const rows = await this.db
      .insert(personProfile)
      .values(data as Record<string, unknown>)
      .returning()
    return rows[0] as PersonProfile
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<Omit<PersonProfile, 'id' | 'tenantId' | 'actorId' | 'createdAt'>>,
  ): Promise<PersonProfile> {
    const rows = await this.db
      .update(personProfile)
      .set({ ...data, updatedAt: new Date() } as Record<string, unknown>)
      .where(and(eq(personProfile.id, id), eq(personProfile.tenantId, tenantId)))
      .returning()
    return rows[0] as PersonProfile
  }
}
```

- [ ] **Step 3: Run test**

```bash
bun run --filter @future/db build && cd apps/api && bunx vitest run src/modules/people/infrastructure/repositories/drizzle-person-profile.repository.spec.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/people/infrastructure/repositories/drizzle-person-profile.repository*
git commit -m "feat(people): add DrizzlePersonProfileRepository"
```

---

## Task 8: Drizzle Repositories — Employment, EmploymentDetail, JobAssignment

**Files:**

- Create: `drizzle-employment.repository.ts`, `drizzle-employment-detail.repository.ts`, `drizzle-job-assignment.repository.ts`

Follow the exact same pattern as Task 7 for each repository. Key differences:

- [ ] **Step 1: Create DrizzleEmploymentRepository**

Same pattern as PersonProfile. Key methods: `findById`, `findByPersonProfileId`, `findActiveByActorId` (joins personProfile to resolve actorId → personProfileId → employment), `insert`, `updateStatus`, `update`, `listByTenant`, `countByTenant`.

For `findActiveByActorId`, join through personProfile:

```typescript
async findActiveByActorId(actorId: string, tenantId: string): Promise<Employment | null> {
  const rows = await this.db
    .select({ employment: employment })
    .from(employment)
    .innerJoin(personProfile, eq(employment.personProfileId, personProfile.id))
    .where(
      and(
        eq(personProfile.actorId, actorId),
        eq(employment.tenantId, tenantId),
        ne(employment.employmentStatus, 'terminated'),
      ),
    )
    .limit(1)
  return (rows[0]?.employment as Employment | undefined) ?? null
}
```

- [ ] **Step 2: Create DrizzleEmploymentDetailRepository**

Simple 1:1 CRUD. `findByEmploymentId`, `insert`, `update`.

- [ ] **Step 3: Create DrizzleJobAssignmentRepository**

Key methods with temporal queries:

```typescript
async findCurrent(employmentId: string, tenantId: string): Promise<JobAssignment | null> {
  const rows = await this.db
    .select()
    .from(jobAssignment)
    .where(
      and(
        eq(jobAssignment.employmentId, employmentId),
        eq(jobAssignment.tenantId, tenantId),
        isNull(jobAssignment.effectiveTo),
      ),
    )
    .limit(1)
  return (rows[0] as JobAssignment | undefined) ?? null
}

async findAsOf(
  employmentId: string,
  tenantId: string,
  asOfDate: Date,
): Promise<JobAssignment | null> {
  const rows = await this.db
    .select()
    .from(jobAssignment)
    .where(
      and(
        eq(jobAssignment.employmentId, employmentId),
        eq(jobAssignment.tenantId, tenantId),
        lte(jobAssignment.effectiveFrom, asOfDate),
        or(isNull(jobAssignment.effectiveTo), gt(jobAssignment.effectiveTo, asOfDate)),
      ),
    )
    .limit(1)
  return (rows[0] as JobAssignment | undefined) ?? null
}

async findHistory(employmentId: string, tenantId: string): Promise<JobAssignment[]> {
  const rows = await this.db
    .select()
    .from(jobAssignment)
    .where(
      and(
        eq(jobAssignment.employmentId, employmentId),
        eq(jobAssignment.tenantId, tenantId),
      ),
    )
    .orderBy(desc(jobAssignment.effectiveFrom))
  return rows as JobAssignment[]
}

async closeAssignment(id: string, tenantId: string, effectiveTo: Date): Promise<void> {
  await this.db
    .update(jobAssignment)
    .set({ effectiveTo } as Record<string, unknown>)
    .where(and(eq(jobAssignment.id, id), eq(jobAssignment.tenantId, tenantId)))
}
```

- [ ] **Step 4: Run tests for all three repos**

```bash
cd apps/api && bunx vitest run src/modules/people/infrastructure/repositories/drizzle-employment --reporter=verbose
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/people/infrastructure/repositories/drizzle-employment* apps/api/src/modules/people/infrastructure/repositories/drizzle-job-assignment*
git commit -m "feat(people): add Employment, EmploymentDetail, JobAssignment repositories"
```

---

## Task 9: Drizzle Repositories — JobProfile, JobFamily

**Files:**

- Create: `drizzle-job-profile.repository.ts`, `drizzle-job-family.repository.ts`

- [ ] **Step 1: Implement both repositories**

Standard CRUD pattern. JobProfile adds `countByJobFamilyId` for checking if a family can be deleted.

- [ ] **Step 2: Run tests and commit**

```bash
git add apps/api/src/modules/people/infrastructure/repositories/drizzle-job-*
git commit -m "feat(people): add JobProfile, JobFamily repositories"
```

---

## Task 10: Command — CreatePersonProfile

**Files:**

- Create: `create-person-profile.command.ts`, `create-person-profile.handler.ts`, `create-person-profile.handler.spec.ts`

- [ ] **Step 1: Write the command class**

```typescript
// apps/api/src/modules/people/application/commands/create-person-profile.command.ts

import type { NameDisplayOrder } from '../../domain/value-objects/name-display-order'

export class CreatePersonProfileCommand {
  constructor(
    readonly tenantId: string,
    readonly actorId: string,
    readonly familyName: string,
    readonly givenName: string,
    readonly middleName: string | null,
    readonly nameDisplayOrder: NameDisplayOrder,
    readonly createdBy: string,
    readonly dateOfBirth?: Date | null,
    readonly gender?: 'male' | 'female' | 'other' | 'undisclosed' | null,
    readonly nationality?: string | null,
    readonly preferredName?: string | null,
  ) {}
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// apps/api/src/modules/people/application/commands/create-person-profile.handler.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreatePersonProfileCommand } from './create-person-profile.command'
import { CreatePersonProfileHandler } from './create-person-profile.handler'
import type { IPersonProfileRepository } from '../../domain/repositories/person-profile.repository'
import { PersonProfileAlreadyExistsException } from '../../domain/exceptions/people.exceptions'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const PROFILE_ID = '01900000-0000-7000-8000-000000000003'

describe('CreatePersonProfileHandler', () => {
  let handler: CreatePersonProfileHandler
  let profileRepo: IPersonProfileRepository

  beforeEach(() => {
    profileRepo = {
      findById: vi.fn(),
      findByActorId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    handler = new CreatePersonProfileHandler(profileRepo)
  })

  it('creates a person profile with computed full name (family_first)', async () => {
    vi.mocked(profileRepo.findByActorId).mockResolvedValue(null)
    vi.mocked(profileRepo.insert).mockResolvedValue({
      id: PROFILE_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      familyName: 'Nguyễn',
      middleName: 'Văn',
      givenName: 'An',
      fullName: 'Nguyễn Văn An',
      fullNameUnaccented: 'Nguyen Van An',
      preferredName: null,
      nameDisplayOrder: 'family_first',
      dateOfBirth: null,
      gender: null,
      nationality: null,
      maritalStatus: null,
      photoDocumentId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const result = await handler.execute(
      new CreatePersonProfileCommand(
        TENANT_ID,
        ACTOR_ID,
        'Nguyễn',
        'An',
        'Văn',
        'family_first',
        ACTOR_ID,
      ),
    )

    expect(profileRepo.findByActorId).toHaveBeenCalledWith(ACTOR_ID, TENANT_ID)
    expect(profileRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        familyName: 'Nguyễn',
        givenName: 'An',
        middleName: 'Văn',
        fullName: 'Nguyễn Văn An',
        fullNameUnaccented: 'Nguyen Van An',
        nameDisplayOrder: 'family_first',
      }),
    )
    expect(result.id).toBe(PROFILE_ID)
  })

  it('throws PersonProfileAlreadyExistsException when actor already has profile', async () => {
    vi.mocked(profileRepo.findByActorId).mockResolvedValue({
      id: PROFILE_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
    } as any)

    await expect(
      handler.execute(
        new CreatePersonProfileCommand(
          TENANT_ID,
          ACTOR_ID,
          'Nguyen',
          'An',
          null,
          'family_first',
          ACTOR_ID,
        ),
      ),
    ).rejects.toThrow(PersonProfileAlreadyExistsException)
  })

  it('computes full name with given_first order', async () => {
    vi.mocked(profileRepo.findByActorId).mockResolvedValue(null)
    vi.mocked(profileRepo.insert).mockImplementation(
      async (data) =>
        ({
          id: PROFILE_ID,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        }) as any,
    )

    await handler.execute(
      new CreatePersonProfileCommand(
        TENANT_ID,
        ACTOR_ID,
        'Smith',
        'John',
        'Michael',
        'given_first',
        ACTOR_ID,
      ),
    )

    expect(profileRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: 'John Michael Smith',
        fullNameUnaccented: 'John Michael Smith',
      }),
    )
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd apps/api && bunx vitest run src/modules/people/application/commands/create-person-profile.handler.spec.ts
```

Expected: FAIL — handler file doesn't exist yet.

- [ ] **Step 4: Implement the handler**

```typescript
// apps/api/src/modules/people/application/commands/create-person-profile.handler.ts

import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { PersonProfileAlreadyExistsException } from '../../domain/exceptions/people.exceptions'
import {
  PERSON_PROFILE_REPOSITORY,
  type IPersonProfileRepository,
} from '../../domain/repositories/person-profile.repository'
import type { PersonProfile } from '../../domain/entities/person-profile.entity'
import {
  computeFullName,
  computeFullNameUnaccented,
} from '../../domain/value-objects/name-display-order'
import { CreatePersonProfileCommand } from './create-person-profile.command'

@CommandHandler(CreatePersonProfileCommand)
export class CreatePersonProfileHandler implements ICommandHandler<
  CreatePersonProfileCommand,
  PersonProfile
> {
  constructor(
    @Inject(PERSON_PROFILE_REPOSITORY)
    private readonly profileRepo: IPersonProfileRepository,
  ) {}

  async execute(command: CreatePersonProfileCommand): Promise<PersonProfile> {
    const existing = await this.profileRepo.findByActorId(command.actorId, command.tenantId)
    if (existing) {
      throw new PersonProfileAlreadyExistsException(command.actorId)
    }

    const fullName = computeFullName(
      command.familyName,
      command.givenName,
      command.middleName,
      command.nameDisplayOrder,
    )
    const fullNameUnaccented = computeFullNameUnaccented(fullName)

    return this.profileRepo.insert({
      tenantId: command.tenantId,
      actorId: command.actorId,
      familyName: command.familyName,
      middleName: command.middleName,
      givenName: command.givenName,
      fullName,
      fullNameUnaccented,
      preferredName: command.preferredName ?? null,
      nameDisplayOrder: command.nameDisplayOrder,
      dateOfBirth: command.dateOfBirth ?? null,
      gender: command.gender ?? null,
      nationality: command.nationality ?? null,
      maritalStatus: null,
      photoDocumentId: null,
    })
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd apps/api && bunx vitest run src/modules/people/application/commands/create-person-profile.handler.spec.ts
```

Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/people/application/commands/create-person-profile*
git commit -m "feat(people): add CreatePersonProfile command with name computation"
```

---

## Task 11: Command — CreateEmployment

**Files:**

- Create: `create-employment.command.ts`, `create-employment.handler.ts`, `create-employment.handler.spec.ts`

- [ ] **Step 1: Write command class**

```typescript
// apps/api/src/modules/people/application/commands/create-employment.command.ts

import type { EmploymentType, WorkerType } from '../../domain/value-objects/employment-status'

export class CreateEmploymentCommand {
  constructor(
    readonly tenantId: string,
    readonly personProfileId: string,
    readonly workerType: WorkerType,
    readonly employmentType: EmploymentType,
    readonly countryCode: string,
    readonly hireDate: Date,
    readonly createdBy: string,
    readonly employeeCode?: string | null,
    readonly companyEmail?: string | null,
    readonly originalHireDate?: Date | null,
  ) {}
}
```

- [ ] **Step 2: Write the failing test**

Test cases:

1. Creates employment with `pre_hire` status
2. Creates employment_detail (empty) alongside
3. Validates personProfileId exists (throws PersonProfileNotFoundException)

```typescript
// apps/api/src/modules/people/application/commands/create-employment.handler.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateEmploymentCommand } from './create-employment.command'
import { CreateEmploymentHandler } from './create-employment.handler'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { IEmploymentDetailRepository } from '../../domain/repositories/employment-detail.repository'
import type { IPersonProfileRepository } from '../../domain/repositories/person-profile.repository'
import { PersonProfileNotFoundException } from '../../domain/exceptions/people.exceptions'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROFILE_ID = '01900000-0000-7000-8000-000000000002'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000003'

describe('CreateEmploymentHandler', () => {
  let handler: CreateEmploymentHandler
  let employmentRepo: IEmploymentRepository
  let detailRepo: IEmploymentDetailRepository
  let profileRepo: IPersonProfileRepository

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
    handler = new CreateEmploymentHandler(profileRepo, employmentRepo, detailRepo)
  })

  it('creates employment in pre_hire status with empty detail', async () => {
    vi.mocked(profileRepo.findById).mockResolvedValue({ id: PROFILE_ID } as any)
    vi.mocked(employmentRepo.insert).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
      personProfileId: PROFILE_ID,
      employmentStatus: 'pre_hire',
      workerType: 'employee',
      employmentType: 'permanent',
      countryCode: 'VN',
      hireDate: new Date('2026-05-01'),
      employeeCode: null,
      companyEmail: null,
      terminationDate: null,
      terminationReason: null,
      originalHireDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    vi.mocked(detailRepo.insert).mockResolvedValue({} as any)

    const result = await handler.execute(
      new CreateEmploymentCommand(
        TENANT_ID,
        PROFILE_ID,
        'employee',
        'permanent',
        'VN',
        new Date('2026-05-01'),
        PROFILE_ID,
      ),
    )

    expect(result.employmentStatus).toBe('pre_hire')
    expect(detailRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ employmentId: EMPLOYMENT_ID, tenantId: TENANT_ID }),
    )
  })

  it('throws PersonProfileNotFoundException when profile does not exist', async () => {
    vi.mocked(profileRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(
        new CreateEmploymentCommand(
          TENANT_ID,
          PROFILE_ID,
          'employee',
          'permanent',
          'VN',
          new Date(),
          PROFILE_ID,
        ),
      ),
    ).rejects.toThrow(PersonProfileNotFoundException)
  })
})
```

- [ ] **Step 3: Implement the handler**

```typescript
// apps/api/src/modules/people/application/commands/create-employment.handler.ts

import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { PersonProfileNotFoundException } from '../../domain/exceptions/people.exceptions'
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
import type { Employment } from '../../domain/entities/employment.entity'
import { CreateEmploymentCommand } from './create-employment.command'

@CommandHandler(CreateEmploymentCommand)
export class CreateEmploymentHandler implements ICommandHandler<
  CreateEmploymentCommand,
  Employment
> {
  constructor(
    @Inject(PERSON_PROFILE_REPOSITORY)
    private readonly profileRepo: IPersonProfileRepository,
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    @Inject(EMPLOYMENT_DETAIL_REPOSITORY)
    private readonly detailRepo: IEmploymentDetailRepository,
  ) {}

  async execute(command: CreateEmploymentCommand): Promise<Employment> {
    const profile = await this.profileRepo.findById(command.personProfileId, command.tenantId)
    if (!profile) {
      throw new PersonProfileNotFoundException(command.personProfileId)
    }

    const employment = await this.employmentRepo.insert({
      tenantId: command.tenantId,
      personProfileId: command.personProfileId,
      employeeCode: command.employeeCode ?? null,
      companyEmail: command.companyEmail ?? null,
      workerType: command.workerType,
      employmentType: command.employmentType,
      countryCode: command.countryCode,
      employmentStatus: 'pre_hire',
      terminationDate: null,
      terminationReason: null,
      hireDate: command.hireDate,
      originalHireDate: command.originalHireDate ?? null,
    })

    await this.detailRepo.insert({
      tenantId: command.tenantId,
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

    return employment
  }
}
```

- [ ] **Step 4: Run tests and commit**

```bash
cd apps/api && bunx vitest run src/modules/people/application/commands/create-employment.handler.spec.ts
git add apps/api/src/modules/people/application/commands/create-employment*
git commit -m "feat(people): add CreateEmployment command with auto-created detail"
```

---

## Task 12: Command — CreateJobAssignment

**Files:**

- Create: `create-job-assignment.command.ts`, `create-job-assignment.handler.ts`, `create-job-assignment.handler.spec.ts`

- [ ] **Step 1: Write command class**

```typescript
// apps/api/src/modules/people/application/commands/create-job-assignment.command.ts

import type {
  JobAssignmentEventType,
  WorkArrangement,
} from '../../domain/value-objects/employment-status'

export class CreateJobAssignmentCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly jobProfileId: string,
    readonly effectiveFrom: Date,
    readonly eventType: JobAssignmentEventType,
    readonly createdBy: string,
    readonly departmentId?: string | null,
    readonly locationId?: string | null,
    readonly costCenterId?: string | null,
    readonly workArrangement?: WorkArrangement,
    readonly managerId?: string | null,
    readonly reason?: string | null,
  ) {}
}
```

- [ ] **Step 2: Write the failing test**

Test cases:

1. Creates first assignment (hire event) — no previous to close
2. Creates subsequent assignment (promotion) — closes previous assignment's effectiveTo
3. Throws EmploymentNotFoundException when employment doesn't exist
4. Throws JobProfileNotFoundException when job profile doesn't exist

```typescript
// apps/api/src/modules/people/application/commands/create-job-assignment.handler.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateJobAssignmentCommand } from './create-job-assignment.command'
import { CreateJobAssignmentHandler } from './create-job-assignment.handler'
import type { IJobAssignmentRepository } from '../../domain/repositories/job-assignment.repository'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { IJobProfileRepository } from '../../domain/repositories/job-profile.repository'
import {
  EmploymentNotFoundException,
  JobProfileNotFoundException,
} from '../../domain/exceptions/people.exceptions'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000002'
const JOB_PROFILE_ID = '01900000-0000-7000-8000-000000000003'
const ASSIGNMENT_ID = '01900000-0000-7000-8000-000000000004'
const OLD_ASSIGNMENT_ID = '01900000-0000-7000-8000-000000000005'

describe('CreateJobAssignmentHandler', () => {
  let handler: CreateJobAssignmentHandler
  let assignmentRepo: IJobAssignmentRepository
  let employmentRepo: IEmploymentRepository
  let jobProfileRepo: IJobProfileRepository

  beforeEach(() => {
    assignmentRepo = {
      findById: vi.fn(),
      findCurrent: vi.fn(),
      findAsOf: vi.fn(),
      findHistory: vi.fn(),
      insert: vi.fn(),
      closeAssignment: vi.fn(),
      delete: vi.fn(),
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
    jobProfileRepo = {
      findById: vi.fn(),
      listByTenant: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      countByJobFamilyId: vi.fn(),
    }
    handler = new CreateJobAssignmentHandler(assignmentRepo, employmentRepo, jobProfileRepo)
  })

  it('creates first assignment without closing previous', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({ id: EMPLOYMENT_ID } as any)
    vi.mocked(jobProfileRepo.findById).mockResolvedValue({ id: JOB_PROFILE_ID } as any)
    vi.mocked(assignmentRepo.findCurrent).mockResolvedValue(null)
    vi.mocked(assignmentRepo.insert).mockResolvedValue({
      id: ASSIGNMENT_ID,
      tenantId: TENANT_ID,
      employmentId: EMPLOYMENT_ID,
      jobProfileId: JOB_PROFILE_ID,
      effectiveFrom: new Date('2026-05-01'),
      effectiveTo: null,
      eventType: 'hire',
      workArrangement: 'onsite',
      departmentId: null,
      locationId: null,
      costCenterId: null,
      managerId: null,
      reason: null,
      createdBy: TENANT_ID,
      createdAt: new Date(),
    })

    const result = await handler.execute(
      new CreateJobAssignmentCommand(
        TENANT_ID,
        EMPLOYMENT_ID,
        JOB_PROFILE_ID,
        new Date('2026-05-01'),
        'hire',
        TENANT_ID,
      ),
    )

    expect(assignmentRepo.closeAssignment).not.toHaveBeenCalled()
    expect(result.eventType).toBe('hire')
  })

  it('closes previous assignment on promotion', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({ id: EMPLOYMENT_ID } as any)
    vi.mocked(jobProfileRepo.findById).mockResolvedValue({ id: JOB_PROFILE_ID } as any)
    vi.mocked(assignmentRepo.findCurrent).mockResolvedValue({
      id: OLD_ASSIGNMENT_ID,
      effectiveTo: null,
    } as any)
    vi.mocked(assignmentRepo.insert).mockResolvedValue({ id: ASSIGNMENT_ID } as any)

    await handler.execute(
      new CreateJobAssignmentCommand(
        TENANT_ID,
        EMPLOYMENT_ID,
        JOB_PROFILE_ID,
        new Date('2026-07-01'),
        'promotion',
        TENANT_ID,
      ),
    )

    expect(assignmentRepo.closeAssignment).toHaveBeenCalledWith(
      OLD_ASSIGNMENT_ID,
      TENANT_ID,
      new Date('2026-06-30'),
    )
  })

  it('throws EmploymentNotFoundException', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(
        new CreateJobAssignmentCommand(
          TENANT_ID,
          EMPLOYMENT_ID,
          JOB_PROFILE_ID,
          new Date(),
          'hire',
          TENANT_ID,
        ),
      ),
    ).rejects.toThrow(EmploymentNotFoundException)
  })

  it('throws JobProfileNotFoundException', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({ id: EMPLOYMENT_ID } as any)
    vi.mocked(jobProfileRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(
        new CreateJobAssignmentCommand(
          TENANT_ID,
          EMPLOYMENT_ID,
          JOB_PROFILE_ID,
          new Date(),
          'hire',
          TENANT_ID,
        ),
      ),
    ).rejects.toThrow(JobProfileNotFoundException)
  })
})
```

- [ ] **Step 3: Implement the handler**

```typescript
// apps/api/src/modules/people/application/commands/create-job-assignment.handler.ts

import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  EmploymentNotFoundException,
  JobProfileNotFoundException,
} from '../../domain/exceptions/people.exceptions'
import {
  JOB_ASSIGNMENT_REPOSITORY,
  type IJobAssignmentRepository,
} from '../../domain/repositories/job-assignment.repository'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import {
  JOB_PROFILE_REPOSITORY,
  type IJobProfileRepository,
} from '../../domain/repositories/job-profile.repository'
import type { JobAssignment } from '../../domain/entities/job-assignment.entity'
import { CreateJobAssignmentCommand } from './create-job-assignment.command'

@CommandHandler(CreateJobAssignmentCommand)
export class CreateJobAssignmentHandler implements ICommandHandler<
  CreateJobAssignmentCommand,
  JobAssignment
> {
  constructor(
    @Inject(JOB_ASSIGNMENT_REPOSITORY)
    private readonly assignmentRepo: IJobAssignmentRepository,
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    @Inject(JOB_PROFILE_REPOSITORY)
    private readonly jobProfileRepo: IJobProfileRepository,
  ) {}

  async execute(command: CreateJobAssignmentCommand): Promise<JobAssignment> {
    const employment = await this.employmentRepo.findById(command.employmentId, command.tenantId)
    if (!employment) {
      throw new EmploymentNotFoundException(command.employmentId)
    }

    const jobProfile = await this.jobProfileRepo.findById(command.jobProfileId, command.tenantId)
    if (!jobProfile) {
      throw new JobProfileNotFoundException(command.jobProfileId)
    }

    const current = await this.assignmentRepo.findCurrent(command.employmentId, command.tenantId)
    if (current) {
      const dayBefore = new Date(command.effectiveFrom)
      dayBefore.setDate(dayBefore.getDate() - 1)
      await this.assignmentRepo.closeAssignment(current.id, command.tenantId, dayBefore)
    }

    return this.assignmentRepo.insert({
      tenantId: command.tenantId,
      employmentId: command.employmentId,
      effectiveFrom: command.effectiveFrom,
      effectiveTo: null,
      jobProfileId: command.jobProfileId,
      departmentId: command.departmentId ?? null,
      locationId: command.locationId ?? null,
      costCenterId: command.costCenterId ?? null,
      workArrangement: command.workArrangement ?? 'onsite',
      managerId: command.managerId ?? null,
      eventType: command.eventType,
      reason: command.reason ?? null,
      createdBy: command.createdBy,
    })
  }
}
```

- [ ] **Step 4: Run tests and commit**

```bash
cd apps/api && bunx vitest run src/modules/people/application/commands/create-job-assignment.handler.spec.ts
git add apps/api/src/modules/people/application/commands/create-job-assignment*
git commit -m "feat(people): add CreateJobAssignment command with temporal closing logic"
```

---

## Task 13: Commands — CreateJobFamily, CreateJobProfile

**Files:**

- Create: command + handler + spec for each

- [ ] **Step 1: CreateJobFamily — simple CRUD**

Command: `tenantId, name, description, parentId`
Handler: Validate parentId exists if provided, insert.
Test: happy path + parent not found.

- [ ] **Step 2: CreateJobProfile — simple CRUD**

Command: `tenantId, jobFamilyId, title, level, description`
Handler: Validate jobFamilyId exists, insert.
Test: happy path + family not found.

- [ ] **Step 3: Commit both**

```bash
git add apps/api/src/modules/people/application/commands/create-job-family* apps/api/src/modules/people/application/commands/create-job-profile*
git commit -m "feat(people): add CreateJobFamily, CreateJobProfile commands"
```

---

## Task 14: Command — UpdateEmploymentDetail

**Files:**

- Create: `update-employment-detail.command.ts`, `update-employment-detail.handler.ts`, `update-employment-detail.handler.spec.ts`

- [ ] **Step 1: Write command, test, and handler**

Command accepts `employmentId` + partial detail fields. Handler validates employment exists, updates detail.

Test: happy path update, employment not found error.

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/people/application/commands/update-employment-detail*
git commit -m "feat(people): add UpdateEmploymentDetail command"
```

---

## Task 15: Queries — GetPersonProfile, GetEmployment, GetCurrentJobAssignment, ListEmployments, ListJobProfiles

**Files:**

- Create: query + handler + spec for each

- [ ] **Step 1: GetPersonProfile query + handler**

Query: `actorId, tenantId`
Handler: Find person_profile by actorId. Return with employments list and current job assignment for each.

```typescript
export type PersonProfileResult = {
  profile: PersonProfile
  employments: Array<{
    employment: Employment
    currentAssignment: JobAssignment | null
    detail: EmploymentDetail | null
  }>
} | null
```

- [ ] **Step 2: GetEmployment query + handler**

Query: `employmentId, tenantId`
Handler: Find employment by id. Join with person_profile, current job_assignment, employment_detail, profile_sections.

- [ ] **Step 3: GetCurrentJobAssignment query + handler**

Query: `employmentId, tenantId`
Handler: `assignmentRepo.findCurrent()`

- [ ] **Step 4: ListEmployments query + handler**

Query: `tenantId, filters (status, countryCode, limit, offset)`
Handler: `employmentRepo.listByTenant()` + count for pagination.

- [ ] **Step 5: ListJobProfiles query + handler**

Query: `tenantId, filters (familyId, isActive)`
Handler: `jobProfileRepo.listByTenant()`

- [ ] **Step 6: Run all tests and commit**

```bash
cd apps/api && bunx vitest run src/modules/people/application/queries/ --reporter=verbose
git add apps/api/src/modules/people/application/queries/
git commit -m "feat(people): add core queries (GetPersonProfile, GetEmployment, ListEmployments, ListJobProfiles)"
```

---

## Task 16: Rewrite PeopleQueryFacade

**Files:**

- Rewrite: `apps/api/src/modules/people/application/facades/people-query.facade.ts`

- [ ] **Step 1: Rewrite facade with new methods**

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

@Injectable()
export class PeopleQueryFacade {
  constructor(private readonly queryBus: QueryBus) {}

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
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/people/application/facades/people-query.facade.ts
git commit -m "feat(people): rewrite PeopleQueryFacade with new domain model"
```

---

## Task 17: Rewrite tRPC Router

**Files:**

- Rewrite: `apps/api/src/modules/people/interface/trpc/people.router.ts`

- [ ] **Step 1: Rewrite router with new procedures**

Replace old procedures with new ones matching the new commands/queries. Keep `directory` sub-router for later (Plan 05). Key procedures:

```typescript
// Core procedures:
getPersonProfile // input: { actorId } → PersonProfileResult
getEmployment // input: { employmentId } → EmploymentResult
listEmployments // input: { tenantId, limit, offset, status?, countryCode? }
getCurrentAssignment // input: { employmentId }

// Job catalog:
listJobFamilies // input: { tenantId }
listJobProfiles // input: { tenantId, familyId? }
createJobFamily // mutation: { name, description?, parentId? }
createJobProfile // mutation: { jobFamilyId, title, level?, description? }

// Core mutations:
createPersonProfile // mutation: { familyName, givenName, middleName?, ... }
createEmployment // mutation: { personProfileId, workerType, employmentType, countryCode, hireDate }
createJobAssignment // mutation: { employmentId, jobProfileId, effectiveFrom, eventType, ... }
updateEmploymentDetail // mutation: { employmentId, ...fields }
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/people/interface/trpc/
git commit -m "feat(people): rewrite tRPC router with new domain model procedures"
```

---

## Task 18: Rewrite People Module

**Files:**

- Rewrite: `apps/api/src/modules/people/people.module.ts`

- [ ] **Step 1: Rewire all providers**

```typescript
@Module({
  imports: [CqrsModule, KernelModule],
  providers: [
    // Repositories
    { provide: PERSON_PROFILE_REPOSITORY, useClass: DrizzlePersonProfileRepository },
    { provide: EMPLOYMENT_REPOSITORY, useClass: DrizzleEmploymentRepository },
    { provide: EMPLOYMENT_DETAIL_REPOSITORY, useClass: DrizzleEmploymentDetailRepository },
    { provide: JOB_ASSIGNMENT_REPOSITORY, useClass: DrizzleJobAssignmentRepository },
    { provide: JOB_PROFILE_REPOSITORY, useClass: DrizzleJobProfileRepository },
    { provide: JOB_FAMILY_REPOSITORY, useClass: DrizzleJobFamilyRepository },
    // Keep existing repos that weren't replaced yet:
    { provide: PROFILE_SECTION_REPOSITORY, useClass: DrizzleProfileSectionRepository },
    { provide: PROFILE_CHANGE_REQUEST_REPOSITORY, useClass: DrizzleProfileChangeRequestRepository },
    { provide: ONBOARDING_CASE_REPOSITORY, useClass: DrizzleOnboardingCaseRepository },
    // ... other retained repos
    // Command handlers
    CreatePersonProfileHandler,
    CreateEmploymentHandler,
    CreateJobAssignmentHandler,
    CreateJobFamilyHandler,
    CreateJobProfileHandler,
    UpdateEmploymentDetailHandler,
    // Keep existing handlers that weren't replaced yet:
    // ... onboarding, offboarding, change request handlers
    // Query handlers
    GetPersonProfileHandler,
    GetEmploymentHandler,
    GetCurrentJobAssignmentHandler,
    ListEmploymentsHandler,
    ListJobProfilesHandler,
    // Event handlers
    OnCandidateHiredHandler, // Will be updated in Plan 06
    // Facades & services
    PeopleQueryFacade,
    PeopleTrpcService,
  ],
  exports: [PeopleQueryFacade],
})
export class PeopleModule {}
```

- [ ] **Step 2: Verify the module compiles**

```bash
cd apps/api && bunx tsc --noEmit
```

Fix any import errors. Some retained handlers may reference old entity types — add `// @ts-expect-error — will be fixed in Plan 06` comments for now if needed, but prefer updating imports.

- [ ] **Step 3: Run all people module tests**

```bash
cd apps/api && bunx vitest run src/modules/people/ --reporter=verbose
```

All new tests should pass. Some old tests (onboarding, offboarding) may fail due to removed entities — that's expected. They'll be fixed in Plans 02 and 06.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/people/people.module.ts
git commit -m "feat(people): rewire people.module.ts with new domain model providers"
```

---

## Task 19: Database Migration

**Files:**

- Create: Drizzle migration file

- [ ] **Step 1: Generate the migration**

```bash
cd apps/api && bunx drizzle-kit generate --name people-redesign-foundation
```

This generates a SQL migration that:

1. Creates `people.person_profile` table
2. Creates `people.employment` table (replaces employment_profile)
3. Creates `people.job_assignment` table
4. Creates `people.employment_detail` table (replaces employment_profile_detail)
5. Creates `people.job_family` table
6. Creates `people.job_profile` table
7. Drops `people.account_membership` table
8. Drops `people.periodic_profile_review` table

- [ ] **Step 2: Review the generated migration**

Verify the SQL is correct. Check for:

- All new tables have `tenant_id` columns
- Unique indexes are created
- No FK constraints across schema boundaries (kernel.department is not FK'd)
- Old tables being dropped are correct

- [ ] **Step 3: Run the migration locally**

```bash
cd apps/api && bunx drizzle-kit migrate
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/drizzle/
git commit -m "feat(people): add database migration for foundation schema (person_profile, employment, job_assignment)"
```

---

## Task 20: Smoke Test — End-to-End

- [ ] **Step 1: Start the API server**

```bash
cd apps/api && bun run dev
```

- [ ] **Step 2: Test via tRPC client or curl**

Verify these operations work:

1. Create a job family
2. Create a job profile in that family
3. Create a person profile
4. Create an employment
5. Create a job assignment
6. Query the person profile (should return employment + assignment)

- [ ] **Step 3: Run the full test suite**

```bash
cd apps/api && bunx vitest run src/modules/people/ --reporter=verbose
```

Expected: All new tests pass. Note any old tests that need updating in later plans.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(people): foundation complete — core schema, entities, repos, commands, queries, tRPC"
```
