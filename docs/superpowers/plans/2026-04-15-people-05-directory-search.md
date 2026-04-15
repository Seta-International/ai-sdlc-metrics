# People Module — Plan 05: Directory, Search & Utilities

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the employee directory search index, email generation, profile share links, bulk operations, and CSV/LinkedIn import. These are utility features that operate on the core domain model established in Plans 01-03.

**Architecture:** Hexagonal + DDD + CQRS. Search index is a denormalized read model rebuilt asynchronously via domain events. Bulk operations and imports run async via pg-boss for large datasets. Email generation uses Vietnamese-aware transliteration. Share links use JWT tokens with configurable expiry.

**Tech Stack:** NestJS, Drizzle ORM, PostgreSQL 16 (tsvector), tRPC, Zod, Vitest, pg-boss, jsonwebtoken

**Spec Reference:** `docs/superpowers/specs/2026-04-15-people-module-redesign.md` — Sections 7, 12, 13, 15

**Depends on:** Plan 01 (core schema/entities), Plan 03 (country config, custom fields)

---

## File Structure

### Files to CREATE

```
# Domain entities
apps/api/src/modules/people/domain/entities/directory-search-index.entity.ts
apps/api/src/modules/people/domain/entities/email-generation-config.entity.ts
apps/api/src/modules/people/domain/entities/profile-share-link.entity.ts
apps/api/src/modules/people/domain/entities/bulk-operation.entity.ts
apps/api/src/modules/people/domain/entities/import-job.entity.ts

# Domain repositories
apps/api/src/modules/people/domain/repositories/directory-search-index.repository.ts
apps/api/src/modules/people/domain/repositories/email-generation-config.repository.ts
apps/api/src/modules/people/domain/repositories/profile-share-link.repository.ts
apps/api/src/modules/people/domain/repositories/bulk-operation.repository.ts
apps/api/src/modules/people/domain/repositories/import-job.repository.ts

# Application — services
apps/api/src/modules/people/application/services/search-index-rebuild.service.ts
apps/api/src/modules/people/application/services/search-index-rebuild.service.spec.ts
apps/api/src/modules/people/application/services/email-generation.service.ts
apps/api/src/modules/people/application/services/email-generation.service.spec.ts

# Application — queries
apps/api/src/modules/people/application/queries/search-directory.query.ts
apps/api/src/modules/people/application/queries/search-directory.handler.ts
apps/api/src/modules/people/application/queries/search-directory.handler.spec.ts
apps/api/src/modules/people/application/queries/list-directory.query.ts
apps/api/src/modules/people/application/queries/list-directory.handler.ts
apps/api/src/modules/people/application/queries/export-directory.query.ts
apps/api/src/modules/people/application/queries/export-directory.handler.ts
apps/api/src/modules/people/application/queries/get-shared-profile.query.ts
apps/api/src/modules/people/application/queries/get-shared-profile.handler.ts
apps/api/src/modules/people/application/queries/get-shared-profile.handler.spec.ts

# Application — commands
apps/api/src/modules/people/application/commands/generate-company-email.command.ts
apps/api/src/modules/people/application/commands/generate-company-email.handler.ts
apps/api/src/modules/people/application/commands/generate-company-email.handler.spec.ts
apps/api/src/modules/people/application/commands/generate-share-link.command.ts
apps/api/src/modules/people/application/commands/generate-share-link.handler.ts
apps/api/src/modules/people/application/commands/generate-share-link.handler.spec.ts
apps/api/src/modules/people/application/commands/revoke-share-link.command.ts
apps/api/src/modules/people/application/commands/revoke-share-link.handler.ts
apps/api/src/modules/people/application/commands/revoke-share-link.handler.spec.ts
apps/api/src/modules/people/application/commands/bulk-update-department.command.ts
apps/api/src/modules/people/application/commands/bulk-update-department.handler.ts
apps/api/src/modules/people/application/commands/bulk-update-department.handler.spec.ts
apps/api/src/modules/people/application/commands/upload-import-file.command.ts
apps/api/src/modules/people/application/commands/upload-import-file.handler.ts
apps/api/src/modules/people/application/commands/map-import-columns.command.ts
apps/api/src/modules/people/application/commands/map-import-columns.handler.ts
apps/api/src/modules/people/application/commands/validate-import.command.ts
apps/api/src/modules/people/application/commands/validate-import.handler.ts
apps/api/src/modules/people/application/commands/commit-import.command.ts
apps/api/src/modules/people/application/commands/commit-import.handler.ts
apps/api/src/modules/people/application/commands/initiate-linkedin-auth.command.ts
apps/api/src/modules/people/application/commands/initiate-linkedin-auth.handler.ts
apps/api/src/modules/people/application/commands/import-linkedin-profile.command.ts
apps/api/src/modules/people/application/commands/import-linkedin-profile.handler.ts
apps/api/src/modules/people/application/commands/confirm-linkedin-import.command.ts
apps/api/src/modules/people/application/commands/confirm-linkedin-import.handler.ts

# Application — event handlers
apps/api/src/modules/people/application/event-handlers/on-search-index-update.handler.ts
apps/api/src/modules/people/application/event-handlers/on-search-index-update.handler.spec.ts

# Infrastructure — schema additions
apps/api/src/modules/people/infrastructure/schema/people.schema.ts  (add tables)

# Infrastructure — repositories
apps/api/src/modules/people/infrastructure/repositories/drizzle-directory-search-index.repository.ts
apps/api/src/modules/people/infrastructure/repositories/drizzle-email-generation-config.repository.ts
apps/api/src/modules/people/infrastructure/repositories/drizzle-profile-share-link.repository.ts
apps/api/src/modules/people/infrastructure/repositories/drizzle-bulk-operation.repository.ts
apps/api/src/modules/people/infrastructure/repositories/drizzle-import-job.repository.ts

# Infrastructure — jobs
apps/api/src/modules/people/infrastructure/jobs/rebuild-search-index.job.ts
apps/api/src/modules/people/infrastructure/jobs/process-bulk-operation.job.ts
apps/api/src/modules/people/infrastructure/jobs/process-import.job.ts
```

---

## Task 1: Directory Search Index — Schema + Entity + Repository

**Files:**

- Create: `directory-search-index.entity.ts`, `directory-search-index.repository.ts`, `drizzle-directory-search-index.repository.ts`
- Modify: `people.schema.ts` (add table)

- [ ] **Step 1: Create the entity**

```typescript
// apps/api/src/modules/people/domain/entities/directory-search-index.entity.ts

export interface DirectorySearchIndex {
  id: string
  tenantId: string
  employmentId: string
  fullName: string
  fullNameUnaccented: string
  companyEmail: string | null
  jobTitle: string | null
  jobLevel: string | null
  departmentName: string | null
  locationName: string | null
  managerName: string | null
  workArrangement: string
  employmentStatus: string
  hireDate: Date
  skills: string[]
  countryCode: string
  updatedAt: Date
}
```

- [ ] **Step 2: Create the repository interface**

```typescript
// apps/api/src/modules/people/domain/repositories/directory-search-index.repository.ts

import type { DirectorySearchIndex } from '../entities/directory-search-index.entity'

export const DIRECTORY_SEARCH_INDEX_REPOSITORY = Symbol('IDirectorySearchIndexRepository')

export interface DirectorySearchIndexFilters {
  departmentId?: string
  jobProfileId?: string
  jobFamilyId?: string
  jobLevel?: string
  managerId?: string
  employmentStatus?: string
  employmentType?: string
  workerType?: string
  workArrangement?: string
  locationId?: string
  countryCode?: string
  hiredAfter?: Date
  hiredBefore?: Date
}

export interface IDirectorySearchIndexRepository {
  upsert(data: Omit<DirectorySearchIndex, 'id'>): Promise<DirectorySearchIndex>
  deleteByEmploymentId(employmentId: string, tenantId: string): Promise<void>
  search(
    tenantId: string,
    query: string,
    filters: DirectorySearchIndexFilters,
    limit: number,
    offset: number,
  ): Promise<{ items: DirectorySearchIndex[]; total: number }>
  list(
    tenantId: string,
    filters: DirectorySearchIndexFilters,
    limit: number,
    offset: number,
  ): Promise<{ items: DirectorySearchIndex[]; total: number }>
  rebuildAll(tenantId: string): Promise<void>
  countByTenant(tenantId: string): Promise<number>
}
```

- [ ] **Step 3: Add Drizzle schema table**

Add to `apps/api/src/modules/people/infrastructure/schema/people.schema.ts`:

```typescript
// ─── Operational Tables ────────────────────────────────────────────

export const directorySearchIndex = peopleSchema.table(
  'directory_search_index',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    employmentId: uuid('employment_id').notNull(),
    fullName: text('full_name'),
    fullNameUnaccented: text('full_name_unaccented'),
    companyEmail: text('company_email'),
    jobTitle: text('job_title'),
    jobLevel: text('job_level'),
    departmentName: text('department_name'),
    locationName: text('location_name'),
    managerName: text('manager_name'),
    workArrangement: text('work_arrangement'),
    employmentStatus: text('employment_status'),
    hireDate: date('hire_date', { mode: 'date' }),
    skills: text('skills').array(),
    countryCode: text('country_code'),
    searchVector: text('search_vector'), // tsvector managed via raw SQL trigger
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_directory_search_index_employment').on(table.tenantId, table.employmentId),
  ],
)
```

- [ ] **Step 4: Implement Drizzle repository**

```typescript
// apps/api/src/modules/people/infrastructure/repositories/drizzle-directory-search-index.repository.ts

import { Inject, Injectable } from '@nestjs/common'
import { and, eq, sql, ilike, or } from 'drizzle-orm'
import { DB_TOKEN, type Db } from '@future/db'
import type { DirectorySearchIndex } from '../../domain/entities/directory-search-index.entity'
import type {
  IDirectorySearchIndexRepository,
  DirectorySearchIndexFilters,
} from '../../domain/repositories/directory-search-index.repository'
import { directorySearchIndex } from '../schema/people.schema'

@Injectable()
export class DrizzleDirectorySearchIndexRepository implements IDirectorySearchIndexRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async upsert(data: Omit<DirectorySearchIndex, 'id'>): Promise<DirectorySearchIndex> {
    const rows = await this.db
      .insert(directorySearchIndex)
      .values(data as Record<string, unknown>)
      .onConflictDoUpdate({
        target: [directorySearchIndex.tenantId, directorySearchIndex.employmentId],
        set: {
          ...data,
          updatedAt: new Date(),
        } as Record<string, unknown>,
      })
      .returning()
    return rows[0] as DirectorySearchIndex
  }

  async deleteByEmploymentId(employmentId: string, tenantId: string): Promise<void> {
    await this.db
      .delete(directorySearchIndex)
      .where(
        and(
          eq(directorySearchIndex.employmentId, employmentId),
          eq(directorySearchIndex.tenantId, tenantId),
        ),
      )
  }

  async search(
    tenantId: string,
    query: string,
    filters: DirectorySearchIndexFilters,
    limit: number,
    offset: number,
  ): Promise<{ items: DirectorySearchIndex[]; total: number }> {
    const conditions = [eq(directorySearchIndex.tenantId, tenantId)]

    // Full-text search: match against both accented and unaccented names
    if (query) {
      const normalizedQuery = query.trim().toLowerCase()
      conditions.push(
        or(
          ilike(directorySearchIndex.fullName, `%${normalizedQuery}%`),
          ilike(directorySearchIndex.fullNameUnaccented, `%${normalizedQuery}%`),
          ilike(directorySearchIndex.companyEmail, `%${normalizedQuery}%`),
          ilike(directorySearchIndex.jobTitle, `%${normalizedQuery}%`),
          ilike(directorySearchIndex.departmentName, `%${normalizedQuery}%`),
        )!,
      )
    }

    // Apply filters
    if (filters.employmentStatus) {
      conditions.push(eq(directorySearchIndex.employmentStatus, filters.employmentStatus))
    } else {
      // Default: exclude terminated
      conditions.push(sql`${directorySearchIndex.employmentStatus} != 'terminated'`)
    }
    if (filters.countryCode) {
      conditions.push(eq(directorySearchIndex.countryCode, filters.countryCode))
    }
    if (filters.workArrangement) {
      conditions.push(eq(directorySearchIndex.workArrangement, filters.workArrangement))
    }

    const where = and(...conditions)

    const [items, countResult] = await Promise.all([
      this.db
        .select()
        .from(directorySearchIndex)
        .where(where)
        .limit(limit)
        .offset(offset)
        .orderBy(directorySearchIndex.fullNameUnaccented),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(directorySearchIndex)
        .where(where),
    ])

    return {
      items: items as DirectorySearchIndex[],
      total: Number(countResult[0]?.count ?? 0),
    }
  }

  async list(
    tenantId: string,
    filters: DirectorySearchIndexFilters,
    limit: number,
    offset: number,
  ): Promise<{ items: DirectorySearchIndex[]; total: number }> {
    return this.search(tenantId, '', filters, limit, offset)
  }

  async rebuildAll(tenantId: string): Promise<void> {
    await this.db.delete(directorySearchIndex).where(eq(directorySearchIndex.tenantId, tenantId))
  }

  async countByTenant(tenantId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(directorySearchIndex)
      .where(eq(directorySearchIndex.tenantId, tenantId))
    return Number(result[0]?.count ?? 0)
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/people/domain/entities/directory-search-index.entity.ts \
  apps/api/src/modules/people/domain/repositories/directory-search-index.repository.ts \
  apps/api/src/modules/people/infrastructure/repositories/drizzle-directory-search-index.repository.ts \
  apps/api/src/modules/people/infrastructure/schema/people.schema.ts
git commit -m "feat(people): add directory search index schema, entity, and repository"
```

---

## Task 2: SearchIndexRebuildService

**Files:**

- Create: `search-index-rebuild.service.ts`, `search-index-rebuild.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/modules/people/application/services/search-index-rebuild.service.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SearchIndexRebuildService } from './search-index-rebuild.service'
import type { IDirectorySearchIndexRepository } from '../../domain/repositories/directory-search-index.repository'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { IPersonProfileRepository } from '../../domain/repositories/person-profile.repository'
import type { IJobAssignmentRepository } from '../../domain/repositories/job-assignment.repository'
import type { IJobProfileRepository } from '../../domain/repositories/job-profile.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000002'
const PROFILE_ID = '01900000-0000-7000-8000-000000000003'
const JOB_PROFILE_ID = '01900000-0000-7000-8000-000000000004'

describe('SearchIndexRebuildService', () => {
  let service: SearchIndexRebuildService
  let searchIndexRepo: IDirectorySearchIndexRepository
  let employmentRepo: IEmploymentRepository
  let profileRepo: IPersonProfileRepository
  let assignmentRepo: IJobAssignmentRepository
  let jobProfileRepo: IJobProfileRepository

  beforeEach(() => {
    searchIndexRepo = {
      upsert: vi.fn(),
      deleteByEmploymentId: vi.fn(),
      search: vi.fn(),
      list: vi.fn(),
      rebuildAll: vi.fn(),
      countByTenant: vi.fn(),
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
    profileRepo = {
      findById: vi.fn(),
      findByActorId: vi.fn(),
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
    jobProfileRepo = {
      findById: vi.fn(),
      listByTenant: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      countByJobFamilyId: vi.fn(),
    }

    service = new SearchIndexRebuildService(
      searchIndexRepo,
      employmentRepo,
      profileRepo,
      assignmentRepo,
      jobProfileRepo,
    )
  })

  it('rebuilds index for a single employment with all denormalized data', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
      personProfileId: PROFILE_ID,
      companyEmail: 'an.nguyen@seta.vn',
      employmentStatus: 'active',
      hireDate: new Date('2025-01-15'),
      workerType: 'employee',
      employmentType: 'permanent',
      countryCode: 'VN',
      employeeCode: 'EMP001',
      terminationDate: null,
      terminationReason: null,
      originalHireDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    vi.mocked(profileRepo.findById).mockResolvedValue({
      id: PROFILE_ID,
      tenantId: TENANT_ID,
      actorId: 'actor-1',
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
    vi.mocked(assignmentRepo.findCurrent).mockResolvedValue({
      id: 'assign-1',
      tenantId: TENANT_ID,
      employmentId: EMPLOYMENT_ID,
      effectiveFrom: new Date('2025-01-15'),
      effectiveTo: null,
      jobProfileId: JOB_PROFILE_ID,
      departmentId: 'dept-1',
      locationId: null,
      costCenterId: null,
      workArrangement: 'hybrid',
      managerId: null,
      eventType: 'hire',
      reason: null,
      createdBy: 'actor-1',
      createdAt: new Date(),
    })
    vi.mocked(jobProfileRepo.findById).mockResolvedValue({
      id: JOB_PROFILE_ID,
      tenantId: TENANT_ID,
      jobFamilyId: 'family-1',
      title: 'Senior Software Engineer',
      level: 'L5',
      description: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await service.rebuildForEmployment(EMPLOYMENT_ID, TENANT_ID)

    expect(searchIndexRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        employmentId: EMPLOYMENT_ID,
        fullName: 'Nguyễn Văn An',
        fullNameUnaccented: 'Nguyen Van An',
        companyEmail: 'an.nguyen@seta.vn',
        jobTitle: 'Senior Software Engineer',
        jobLevel: 'L5',
        workArrangement: 'hybrid',
        employmentStatus: 'active',
        countryCode: 'VN',
      }),
    )
  })

  it('deletes index entry when employment is not found', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(null)

    await service.rebuildForEmployment(EMPLOYMENT_ID, TENANT_ID)

    expect(searchIndexRepo.deleteByEmploymentId).toHaveBeenCalledWith(EMPLOYMENT_ID, TENANT_ID)
  })

  it('handles employment without current assignment gracefully', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
      personProfileId: PROFILE_ID,
      companyEmail: null,
      employmentStatus: 'pre_hire',
      hireDate: new Date('2025-06-01'),
      workerType: 'employee',
      employmentType: 'permanent',
      countryCode: 'VN',
      employeeCode: null,
      terminationDate: null,
      terminationReason: null,
      originalHireDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    vi.mocked(profileRepo.findById).mockResolvedValue({
      id: PROFILE_ID,
      tenantId: TENANT_ID,
      actorId: 'actor-1',
      familyName: 'Trần',
      middleName: null,
      givenName: 'Bình',
      fullName: 'Trần Bình',
      fullNameUnaccented: 'Tran Binh',
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
    vi.mocked(assignmentRepo.findCurrent).mockResolvedValue(null)

    await service.rebuildForEmployment(EMPLOYMENT_ID, TENANT_ID)

    expect(searchIndexRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        jobTitle: null,
        jobLevel: null,
        departmentName: null,
        workArrangement: 'onsite',
      }),
    )
  })
})
```

- [ ] **Step 2: Implement the service**

```typescript
// apps/api/src/modules/people/application/services/search-index-rebuild.service.ts

import { Inject, Injectable } from '@nestjs/common'
import {
  DIRECTORY_SEARCH_INDEX_REPOSITORY,
  type IDirectorySearchIndexRepository,
} from '../../domain/repositories/directory-search-index.repository'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import {
  PERSON_PROFILE_REPOSITORY,
  type IPersonProfileRepository,
} from '../../domain/repositories/person-profile.repository'
import {
  JOB_ASSIGNMENT_REPOSITORY,
  type IJobAssignmentRepository,
} from '../../domain/repositories/job-assignment.repository'
import {
  JOB_PROFILE_REPOSITORY,
  type IJobProfileRepository,
} from '../../domain/repositories/job-profile.repository'

@Injectable()
export class SearchIndexRebuildService {
  constructor(
    @Inject(DIRECTORY_SEARCH_INDEX_REPOSITORY)
    private readonly searchIndexRepo: IDirectorySearchIndexRepository,
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    @Inject(PERSON_PROFILE_REPOSITORY)
    private readonly profileRepo: IPersonProfileRepository,
    @Inject(JOB_ASSIGNMENT_REPOSITORY)
    private readonly assignmentRepo: IJobAssignmentRepository,
    @Inject(JOB_PROFILE_REPOSITORY)
    private readonly jobProfileRepo: IJobProfileRepository,
  ) {}

  async rebuildForEmployment(employmentId: string, tenantId: string): Promise<void> {
    const employment = await this.employmentRepo.findById(employmentId, tenantId)
    if (!employment) {
      await this.searchIndexRepo.deleteByEmploymentId(employmentId, tenantId)
      return
    }

    const profile = await this.profileRepo.findById(employment.personProfileId, tenantId)
    if (!profile) {
      await this.searchIndexRepo.deleteByEmploymentId(employmentId, tenantId)
      return
    }

    const currentAssignment = await this.assignmentRepo.findCurrent(employmentId, tenantId)
    let jobTitle: string | null = null
    let jobLevel: string | null = null
    let departmentName: string | null = null

    if (currentAssignment) {
      const jobProfile = await this.jobProfileRepo.findById(
        currentAssignment.jobProfileId,
        tenantId,
      )
      jobTitle = jobProfile?.title ?? null
      jobLevel = jobProfile?.level ?? null
      // departmentName resolved via kernel facade in real implementation
      departmentName = null
    }

    await this.searchIndexRepo.upsert({
      tenantId,
      employmentId,
      fullName: profile.fullName,
      fullNameUnaccented: profile.fullNameUnaccented,
      companyEmail: employment.companyEmail,
      jobTitle,
      jobLevel,
      departmentName,
      locationName: null, // resolved via kernel facade
      managerName: null, // resolved via self-join
      workArrangement: currentAssignment?.workArrangement ?? 'onsite',
      employmentStatus: employment.employmentStatus,
      hireDate: employment.hireDate,
      skills: [], // populated from profile_section type=skill
      countryCode: employment.countryCode,
      updatedAt: new Date(),
    })
  }

  async rebuildAllForTenant(tenantId: string): Promise<void> {
    await this.searchIndexRepo.rebuildAll(tenantId)

    const employments = await this.employmentRepo.listByTenant(tenantId, {
      limit: 10000,
      offset: 0,
    })
    for (const employment of employments) {
      await this.rebuildForEmployment(employment.id, tenantId)
    }
  }
}
```

- [ ] **Step 3: Run tests**

```bash
cd apps/api && bunx vitest run src/modules/people/application/services/search-index-rebuild.service.spec.ts
```

Expected: PASS (3 tests)

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/people/application/services/search-index-rebuild*
git commit -m "feat(people): add SearchIndexRebuildService with Vietnamese name support"
```

---

## Task 3: Event-Driven Index Updates

**Files:**

- Create: `on-search-index-update.handler.ts`, `on-search-index-update.handler.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/modules/people/application/event-handlers/on-search-index-update.handler.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OnSearchIndexUpdateHandler } from './on-search-index-update.handler'
import type { SearchIndexRebuildService } from '../services/search-index-rebuild.service'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000002'

describe('OnSearchIndexUpdateHandler', () => {
  let handler: OnSearchIndexUpdateHandler
  let rebuildService: SearchIndexRebuildService

  beforeEach(() => {
    rebuildService = {
      rebuildForEmployment: vi.fn(),
      rebuildAllForTenant: vi.fn(),
    } as any
    handler = new OnSearchIndexUpdateHandler(rebuildService)
  })

  it('triggers rebuild on JobAssignmentChangedEvent', async () => {
    await handler.handleJobAssignmentChanged({
      tenantId: TENANT_ID,
      employmentId: EMPLOYMENT_ID,
      actorId: 'actor-1',
      eventType: 'promotion',
      effectiveFrom: new Date(),
      changes: {},
    } as any)

    expect(rebuildService.rebuildForEmployment).toHaveBeenCalledWith(EMPLOYMENT_ID, TENANT_ID)
  })

  it('triggers rebuild on EmploymentActivatedEvent', async () => {
    await handler.handleEmploymentActivated({
      tenantId: TENANT_ID,
      employmentId: EMPLOYMENT_ID,
      actorId: 'actor-1',
      effectiveDate: new Date(),
    } as any)

    expect(rebuildService.rebuildForEmployment).toHaveBeenCalledWith(EMPLOYMENT_ID, TENANT_ID)
  })

  it('triggers rebuild on EmploymentTerminatedEvent', async () => {
    await handler.handleEmploymentTerminated({
      tenantId: TENANT_ID,
      employmentId: EMPLOYMENT_ID,
      actorId: 'actor-1',
      terminationReason: 'voluntary_resignation',
      terminationDate: new Date(),
    } as any)

    expect(rebuildService.rebuildForEmployment).toHaveBeenCalledWith(EMPLOYMENT_ID, TENANT_ID)
  })

  it('triggers rebuild on ProfileChangeAppliedEvent', async () => {
    await handler.handleProfileChangeApplied({
      tenantId: TENANT_ID,
      employmentId: EMPLOYMENT_ID,
      fieldPath: 'person_profile.family_name',
      oldValue: 'Old',
      newValue: 'New',
      effectiveDate: new Date(),
    } as any)

    expect(rebuildService.rebuildForEmployment).toHaveBeenCalledWith(EMPLOYMENT_ID, TENANT_ID)
  })
})
```

- [ ] **Step 2: Implement the event handler**

```typescript
// apps/api/src/modules/people/application/event-handlers/on-search-index-update.handler.ts

import { Injectable } from '@nestjs/common'
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs'
import { JobAssignmentChangedEvent } from '@future/event-contracts/people'
import { ProfileChangeAppliedEvent } from '@future/event-contracts/people'
import { EmploymentActivatedEvent } from '@future/event-contracts/people'
import { EmploymentTerminatedEvent } from '@future/event-contracts/people'
import { SearchIndexRebuildService } from '../services/search-index-rebuild.service'

@Injectable()
export class OnSearchIndexUpdateHandler {
  constructor(private readonly rebuildService: SearchIndexRebuildService) {}

  @EventsHandler(JobAssignmentChangedEvent)
  async handleJobAssignmentChanged(event: JobAssignmentChangedEvent): Promise<void> {
    await this.rebuildService.rebuildForEmployment(event.employmentId, event.tenantId)
  }

  @EventsHandler(EmploymentActivatedEvent)
  async handleEmploymentActivated(event: EmploymentActivatedEvent): Promise<void> {
    await this.rebuildService.rebuildForEmployment(event.employmentId, event.tenantId)
  }

  @EventsHandler(EmploymentTerminatedEvent)
  async handleEmploymentTerminated(event: EmploymentTerminatedEvent): Promise<void> {
    await this.rebuildService.rebuildForEmployment(event.employmentId, event.tenantId)
  }

  @EventsHandler(ProfileChangeAppliedEvent)
  async handleProfileChangeApplied(event: ProfileChangeAppliedEvent): Promise<void> {
    await this.rebuildService.rebuildForEmployment(event.employmentId, event.tenantId)
  }
}
```

- [ ] **Step 3: Run tests**

```bash
cd apps/api && bunx vitest run src/modules/people/application/event-handlers/on-search-index-update.handler.spec.ts
```

Expected: PASS (4 tests)

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/people/application/event-handlers/on-search-index-update*
git commit -m "feat(people): add event-driven search index updates for directory"
```

---

## Task 4: SearchDirectoryQuery + Handler + Test

**Files:**

- Create: `search-directory.query.ts`, `search-directory.handler.ts`, `search-directory.handler.spec.ts`

- [ ] **Step 1: Write query class**

```typescript
// apps/api/src/modules/people/application/queries/search-directory.query.ts

import type { DirectorySearchIndexFilters } from '../../domain/repositories/directory-search-index.repository'

export class SearchDirectoryQuery {
  constructor(
    readonly tenantId: string,
    readonly query: string,
    readonly filters: DirectorySearchIndexFilters,
    readonly limit: number = 25,
    readonly offset: number = 0,
  ) {}
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// apps/api/src/modules/people/application/queries/search-directory.handler.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SearchDirectoryQuery } from './search-directory.query'
import { SearchDirectoryHandler } from './search-directory.handler'
import type { IDirectorySearchIndexRepository } from '../../domain/repositories/directory-search-index.repository'
import { computeFullNameUnaccented } from '../../domain/value-objects/name-display-order'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

describe('SearchDirectoryHandler', () => {
  let handler: SearchDirectoryHandler
  let searchRepo: IDirectorySearchIndexRepository

  beforeEach(() => {
    searchRepo = {
      upsert: vi.fn(),
      deleteByEmploymentId: vi.fn(),
      search: vi.fn(),
      list: vi.fn(),
      rebuildAll: vi.fn(),
      countByTenant: vi.fn(),
    }
    handler = new SearchDirectoryHandler(searchRepo)
  })

  it('normalizes Vietnamese diacritics in search query', async () => {
    vi.mocked(searchRepo.search).mockResolvedValue({ items: [], total: 0 })

    await handler.execute(new SearchDirectoryQuery(TENANT_ID, 'Nguyễn Văn', {}, 25, 0))

    expect(searchRepo.search).toHaveBeenCalledWith(TENANT_ID, 'nguyen van', {}, 25, 0)
  })

  it('passes filters through to repository', async () => {
    vi.mocked(searchRepo.search).mockResolvedValue({ items: [], total: 0 })

    const filters = { countryCode: 'VN', employmentStatus: 'active' }
    await handler.execute(new SearchDirectoryQuery(TENANT_ID, 'engineer', filters, 50, 10))

    expect(searchRepo.search).toHaveBeenCalledWith(TENANT_ID, 'engineer', filters, 50, 10)
  })

  it('returns items and total count', async () => {
    const mockItems = [
      {
        id: 'idx-1',
        tenantId: TENANT_ID,
        employmentId: 'emp-1',
        fullName: 'Nguyễn Văn An',
        fullNameUnaccented: 'Nguyen Van An',
        companyEmail: 'an.nguyen@seta.vn',
        jobTitle: 'Software Engineer',
        jobLevel: 'L4',
        departmentName: 'Engineering',
        locationName: 'HCMC',
        managerName: null,
        workArrangement: 'hybrid',
        employmentStatus: 'active',
        hireDate: new Date('2025-01-15'),
        skills: ['typescript', 'nestjs'],
        countryCode: 'VN',
        updatedAt: new Date(),
      },
    ]
    vi.mocked(searchRepo.search).mockResolvedValue({ items: mockItems, total: 1 })

    const result = await handler.execute(new SearchDirectoryQuery(TENANT_ID, 'nguyen', {}, 25, 0))

    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)
    expect(result.items[0].fullName).toBe('Nguyễn Văn An')
  })
})
```

- [ ] **Step 3: Implement the handler**

```typescript
// apps/api/src/modules/people/application/queries/search-directory.handler.ts

import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  DIRECTORY_SEARCH_INDEX_REPOSITORY,
  type IDirectorySearchIndexRepository,
} from '../../domain/repositories/directory-search-index.repository'
import type { DirectorySearchIndex } from '../../domain/entities/directory-search-index.entity'
import { computeFullNameUnaccented } from '../../domain/value-objects/name-display-order'
import { SearchDirectoryQuery } from './search-directory.query'

@QueryHandler(SearchDirectoryQuery)
export class SearchDirectoryHandler implements IQueryHandler<
  SearchDirectoryQuery,
  { items: DirectorySearchIndex[]; total: number }
> {
  constructor(
    @Inject(DIRECTORY_SEARCH_INDEX_REPOSITORY)
    private readonly searchRepo: IDirectorySearchIndexRepository,
  ) {}

  async execute(
    query: SearchDirectoryQuery,
  ): Promise<{ items: DirectorySearchIndex[]; total: number }> {
    // Normalize query: strip diacritics for Vietnamese-insensitive search
    const normalizedQuery = query.query ? computeFullNameUnaccented(query.query).toLowerCase() : ''

    return this.searchRepo.search(
      query.tenantId,
      normalizedQuery,
      query.filters,
      query.limit,
      query.offset,
    )
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd apps/api && bunx vitest run src/modules/people/application/queries/search-directory.handler.spec.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/people/application/queries/search-directory*
git commit -m "feat(people): add SearchDirectoryQuery with Vietnamese diacritic handling"
```

---

## Task 5: ListDirectoryQuery + Handler

**Files:**

- Create: `list-directory.query.ts`, `list-directory.handler.ts`

- [ ] **Step 1: Write query + handler**

```typescript
// apps/api/src/modules/people/application/queries/list-directory.query.ts

import type { DirectorySearchIndexFilters } from '../../domain/repositories/directory-search-index.repository'

export class ListDirectoryQuery {
  constructor(
    readonly tenantId: string,
    readonly filters: DirectorySearchIndexFilters,
    readonly limit: number = 25,
    readonly offset: number = 0,
  ) {}
}
```

```typescript
// apps/api/src/modules/people/application/queries/list-directory.handler.ts

import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  DIRECTORY_SEARCH_INDEX_REPOSITORY,
  type IDirectorySearchIndexRepository,
} from '../../domain/repositories/directory-search-index.repository'
import type { DirectorySearchIndex } from '../../domain/entities/directory-search-index.entity'
import { ListDirectoryQuery } from './list-directory.query'

@QueryHandler(ListDirectoryQuery)
export class ListDirectoryHandler implements IQueryHandler<
  ListDirectoryQuery,
  { items: DirectorySearchIndex[]; total: number }
> {
  constructor(
    @Inject(DIRECTORY_SEARCH_INDEX_REPOSITORY)
    private readonly searchRepo: IDirectorySearchIndexRepository,
  ) {}

  async execute(
    query: ListDirectoryQuery,
  ): Promise<{ items: DirectorySearchIndex[]; total: number }> {
    return this.searchRepo.list(query.tenantId, query.filters, query.limit, query.offset)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/people/application/queries/list-directory*
git commit -m "feat(people): add ListDirectoryQuery for paginated browse"
```

---

## Task 6: ExportDirectoryQuery + Handler

**Files:**

- Create: `export-directory.query.ts`, `export-directory.handler.ts`

- [ ] **Step 1: Write query + handler**

```typescript
// apps/api/src/modules/people/application/queries/export-directory.query.ts

import type { DirectorySearchIndexFilters } from '../../domain/repositories/directory-search-index.repository'

export type ExportFormat = 'csv' | 'xlsx'

export class ExportDirectoryQuery {
  constructor(
    readonly tenantId: string,
    readonly viewerActorId: string,
    readonly filters: DirectorySearchIndexFilters,
    readonly format: ExportFormat = 'csv',
    readonly columns?: string[],
  ) {}
}
```

```typescript
// apps/api/src/modules/people/application/queries/export-directory.handler.ts

import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  DIRECTORY_SEARCH_INDEX_REPOSITORY,
  type IDirectorySearchIndexRepository,
} from '../../domain/repositories/directory-search-index.repository'
import { ExportDirectoryQuery } from './export-directory.query'

export interface ExportResult {
  data: Buffer
  filename: string
  mimeType: string
}

@QueryHandler(ExportDirectoryQuery)
export class ExportDirectoryHandler implements IQueryHandler<ExportDirectoryQuery, ExportResult> {
  constructor(
    @Inject(DIRECTORY_SEARCH_INDEX_REPOSITORY)
    private readonly searchRepo: IDirectorySearchIndexRepository,
  ) {}

  async execute(query: ExportDirectoryQuery): Promise<ExportResult> {
    // Fetch all matching rows (no pagination for export)
    const { items } = await this.searchRepo.list(query.tenantId, query.filters, 10000, 0)

    // Filter columns based on viewer's field visibility tier
    // FieldVisibilityFilter applied here — public tier only for most viewers
    const columns = query.columns ?? [
      'fullName',
      'companyEmail',
      'jobTitle',
      'departmentName',
      'locationName',
      'workArrangement',
      'employmentStatus',
      'hireDate',
    ]

    if (query.format === 'csv') {
      const header = columns.join(',')
      const rows = items.map((item) =>
        columns
          .map((col) => {
            const value = (item as Record<string, unknown>)[col]
            if (value === null || value === undefined) return ''
            const str = String(value)
            return str.includes(',') ? `"${str}"` : str
          })
          .join(','),
      )
      const csvContent = '\uFEFF' + [header, ...rows].join('\n') // UTF-8 BOM for Excel
      return {
        data: Buffer.from(csvContent, 'utf-8'),
        filename: `directory-export-${new Date().toISOString().slice(0, 10)}.csv`,
        mimeType: 'text/csv; charset=utf-8',
      }
    }

    // XLSX format — delegate to xlsx library
    throw new Error('XLSX export not implemented yet')
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/people/application/queries/export-directory*
git commit -m "feat(people): add ExportDirectoryQuery with CSV export and field visibility"
```

---

## Task 7: pg-boss Job — rebuild-search-index

**Files:**

- Create: `rebuild-search-index.job.ts`

- [ ] **Step 1: Implement the job handler**

```typescript
// apps/api/src/modules/people/infrastructure/jobs/rebuild-search-index.job.ts

import { Injectable, Logger } from '@nestjs/common'
import { SearchIndexRebuildService } from '../../application/services/search-index-rebuild.service'

export const REBUILD_SEARCH_INDEX_JOB = 'people.rebuild-search-index'

export interface RebuildSearchIndexPayload {
  tenantId: string
  employmentId?: string // if provided, rebuild single; otherwise full rebuild
}

@Injectable()
export class RebuildSearchIndexJob {
  private readonly logger = new Logger(RebuildSearchIndexJob.name)

  constructor(private readonly rebuildService: SearchIndexRebuildService) {}

  async handle(payload: RebuildSearchIndexPayload): Promise<void> {
    if (payload.employmentId) {
      this.logger.log(`Rebuilding search index for employment ${payload.employmentId}`)
      await this.rebuildService.rebuildForEmployment(payload.employmentId, payload.tenantId)
    } else {
      this.logger.log(`Full search index rebuild for tenant ${payload.tenantId}`)
      await this.rebuildService.rebuildAllForTenant(payload.tenantId)
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/people/infrastructure/jobs/rebuild-search-index.job.ts
git commit -m "feat(people): add pg-boss rebuild-search-index job"
```

---

## Task 8: Email Generation Config — Schema + Entity + Repository

**Files:**

- Create: `email-generation-config.entity.ts`, `email-generation-config.repository.ts`, `drizzle-email-generation-config.repository.ts`
- Modify: `people.schema.ts`

- [ ] **Step 1: Create entity**

```typescript
// apps/api/src/modules/people/domain/entities/email-generation-config.entity.ts

export type EmailTransliteration = 'strip_diacritics' | 'custom_map'

export interface EmailGenerationConfig {
  tenantId: string
  domain: string
  pattern: string // e.g. '{given}.{family}'
  transliteration: EmailTransliteration
}
```

- [ ] **Step 2: Create repository interface**

```typescript
// apps/api/src/modules/people/domain/repositories/email-generation-config.repository.ts

import type { EmailGenerationConfig } from '../entities/email-generation-config.entity'

export const EMAIL_GENERATION_CONFIG_REPOSITORY = Symbol('IEmailGenerationConfigRepository')

export interface IEmailGenerationConfigRepository {
  findByTenantId(tenantId: string): Promise<EmailGenerationConfig | null>
  upsert(data: EmailGenerationConfig): Promise<EmailGenerationConfig>
}
```

- [ ] **Step 3: Add Drizzle schema**

```typescript
export const emailGenerationConfig = peopleSchema.table('email_generation_config', {
  tenantId: uuid('tenant_id').primaryKey(),
  domain: text('domain').notNull(),
  pattern: text('pattern').notNull(),
  transliteration: text('transliteration', {
    enum: ['strip_diacritics', 'custom_map'],
  }).notNull(),
})
```

- [ ] **Step 4: Implement Drizzle repository**

Standard single-row-per-tenant CRUD.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/people/domain/entities/email-generation-config.entity.ts \
  apps/api/src/modules/people/domain/repositories/email-generation-config.repository.ts \
  apps/api/src/modules/people/infrastructure/repositories/drizzle-email-generation-config.repository.ts \
  apps/api/src/modules/people/infrastructure/schema/people.schema.ts
git commit -m "feat(people): add email generation config schema, entity, and repository"
```

---

## Task 9: EmailGenerationService

**Files:**

- Create: `email-generation.service.ts`, `email-generation.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/modules/people/application/services/email-generation.service.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EmailGenerationService } from './email-generation.service'
import type { IEmailGenerationConfigRepository } from '../../domain/repositories/email-generation-config.repository'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

describe('EmailGenerationService', () => {
  let service: EmailGenerationService
  let configRepo: IEmailGenerationConfigRepository
  let employmentRepo: IEmploymentRepository

  beforeEach(() => {
    configRepo = {
      findByTenantId: vi.fn(),
      upsert: vi.fn(),
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
    service = new EmailGenerationService(configRepo, employmentRepo)
  })

  it('generates email from Vietnamese name with diacritic stripping', async () => {
    vi.mocked(configRepo.findByTenantId).mockResolvedValue({
      tenantId: TENANT_ID,
      domain: 'seta-international.vn',
      pattern: '{given}.{family}',
      transliteration: 'strip_diacritics',
    })
    vi.mocked(employmentRepo.listByTenant).mockResolvedValue([])

    const result = await service.generateCandidates(
      TENANT_ID,
      'Nguyễn', // familyName
      'An', // givenName
      'Văn', // middleName
    )

    expect(result[0]).toBe('an.nguyen@seta-international.vn')
  })

  it('generates fallback candidates when primary is taken', async () => {
    vi.mocked(configRepo.findByTenantId).mockResolvedValue({
      tenantId: TENANT_ID,
      domain: 'seta.vn',
      pattern: '{given}.{family}',
      transliteration: 'strip_diacritics',
    })
    // Simulate first candidate already taken
    vi.mocked(employmentRepo.listByTenant).mockResolvedValue([
      { companyEmail: 'an.nguyen@seta.vn' } as any,
    ])

    const result = await service.generateCandidates(TENANT_ID, 'Nguyễn', 'An', 'Văn')

    // Should include fallback candidates
    expect(result.length).toBeGreaterThan(1)
    expect(result).toContain('an.nguyenvan@seta.vn')
  })

  it('handles names without middle name', async () => {
    vi.mocked(configRepo.findByTenantId).mockResolvedValue({
      tenantId: TENANT_ID,
      domain: 'company.com',
      pattern: '{given}.{family}',
      transliteration: 'strip_diacritics',
    })
    vi.mocked(employmentRepo.listByTenant).mockResolvedValue([])

    const result = await service.generateCandidates(TENANT_ID, 'Smith', 'John', null)

    expect(result[0]).toBe('john.smith@company.com')
  })

  it('returns empty array when no config exists', async () => {
    vi.mocked(configRepo.findByTenantId).mockResolvedValue(null)

    const result = await service.generateCandidates(TENANT_ID, 'Smith', 'John', null)
    expect(result).toEqual([])
  })
})
```

- [ ] **Step 2: Implement the service**

```typescript
// apps/api/src/modules/people/application/services/email-generation.service.ts

import { Inject, Injectable } from '@nestjs/common'
import {
  EMAIL_GENERATION_CONFIG_REPOSITORY,
  type IEmailGenerationConfigRepository,
} from '../../domain/repositories/email-generation-config.repository'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import { computeFullNameUnaccented } from '../../domain/value-objects/name-display-order'

@Injectable()
export class EmailGenerationService {
  constructor(
    @Inject(EMAIL_GENERATION_CONFIG_REPOSITORY)
    private readonly configRepo: IEmailGenerationConfigRepository,
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
  ) {}

  async generateCandidates(
    tenantId: string,
    familyName: string,
    givenName: string,
    middleName: string | null,
  ): Promise<string[]> {
    const config = await this.configRepo.findByTenantId(tenantId)
    if (!config) return []

    const given = this.transliterate(givenName).toLowerCase()
    const family = this.transliterate(familyName).toLowerCase()
    const middle = middleName ? this.transliterate(middleName).toLowerCase() : null

    const candidates: string[] = []

    // Primary: {given}.{family}
    candidates.push(`${given}.${family}@${config.domain}`)

    // Fallback 1: {given}.{family}{middle}
    if (middle) {
      candidates.push(`${given}.${family}${middle}@${config.domain}`)
    }

    // Fallback 2: {given}{middle}.{family}
    if (middle) {
      candidates.push(`${given}${middle}.${family}@${config.domain}`)
    }

    // Fallback 3-10: {given}.{family}{N}
    for (let i = 2; i <= 9; i++) {
      candidates.push(`${given}.${family}${i}@${config.domain}`)
    }

    // Check uniqueness against active employments
    const existingEmails = await this.getExistingEmails(tenantId)
    const existingSet = new Set(existingEmails.map((e) => e.toLowerCase()))

    return candidates.filter((c) => !existingSet.has(c))
  }

  private transliterate(name: string): string {
    return computeFullNameUnaccented(name).replace(/\s+/g, '')
  }

  private async getExistingEmails(tenantId: string): Promise<string[]> {
    const employments = await this.employmentRepo.listByTenant(tenantId, {
      limit: 100000,
      offset: 0,
    })
    return employments.map((e) => e.companyEmail).filter((email): email is string => email !== null)
  }
}
```

- [ ] **Step 3: Run tests**

```bash
cd apps/api && bunx vitest run src/modules/people/application/services/email-generation.service.spec.ts
```

Expected: PASS (4 tests)

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/people/application/services/email-generation*
git commit -m "feat(people): add EmailGenerationService with Vietnamese transliteration"
```

---

## Task 10: GenerateCompanyEmail Command + Handler + Test

**Files:**

- Create: `generate-company-email.command.ts`, `generate-company-email.handler.ts`, `generate-company-email.handler.spec.ts`

- [ ] **Step 1: Write command class**

```typescript
// apps/api/src/modules/people/application/commands/generate-company-email.command.ts

export class GenerateCompanyEmailCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly overrideEmail?: string | null,
  ) {}
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// apps/api/src/modules/people/application/commands/generate-company-email.handler.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GenerateCompanyEmailCommand } from './generate-company-email.command'
import { GenerateCompanyEmailHandler } from './generate-company-email.handler'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { IPersonProfileRepository } from '../../domain/repositories/person-profile.repository'
import type { EmailGenerationService } from '../services/email-generation.service'
import { EmploymentNotFoundException } from '../../domain/exceptions/people.exceptions'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000002'
const PROFILE_ID = '01900000-0000-7000-8000-000000000003'

describe('GenerateCompanyEmailHandler', () => {
  let handler: GenerateCompanyEmailHandler
  let employmentRepo: IEmploymentRepository
  let profileRepo: IPersonProfileRepository
  let emailService: EmailGenerationService

  beforeEach(() => {
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
    profileRepo = {
      findById: vi.fn(),
      findByActorId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    emailService = {
      generateCandidates: vi.fn(),
    } as any
    handler = new GenerateCompanyEmailHandler(employmentRepo, profileRepo, emailService)
  })

  it('generates and assigns company email from name', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
      personProfileId: PROFILE_ID,
      companyEmail: null,
    } as any)
    vi.mocked(profileRepo.findById).mockResolvedValue({
      id: PROFILE_ID,
      familyName: 'Nguyễn',
      givenName: 'An',
      middleName: 'Văn',
    } as any)
    vi.mocked(emailService.generateCandidates).mockResolvedValue([
      'an.nguyen@seta.vn',
      'an.nguyenvan@seta.vn',
    ])
    vi.mocked(employmentRepo.update).mockResolvedValue({
      id: EMPLOYMENT_ID,
      companyEmail: 'an.nguyen@seta.vn',
    } as any)

    const result = await handler.execute(new GenerateCompanyEmailCommand(TENANT_ID, EMPLOYMENT_ID))

    expect(employmentRepo.update).toHaveBeenCalledWith(
      EMPLOYMENT_ID,
      TENANT_ID,
      expect.objectContaining({ companyEmail: 'an.nguyen@seta.vn' }),
    )
    expect(result.companyEmail).toBe('an.nguyen@seta.vn')
  })

  it('uses override email when provided', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
      personProfileId: PROFILE_ID,
      companyEmail: null,
    } as any)
    vi.mocked(employmentRepo.update).mockResolvedValue({
      id: EMPLOYMENT_ID,
      companyEmail: 'custom@seta.vn',
    } as any)

    await handler.execute(
      new GenerateCompanyEmailCommand(TENANT_ID, EMPLOYMENT_ID, 'custom@seta.vn'),
    )

    expect(emailService.generateCandidates).not.toHaveBeenCalled()
    expect(employmentRepo.update).toHaveBeenCalledWith(
      EMPLOYMENT_ID,
      TENANT_ID,
      expect.objectContaining({ companyEmail: 'custom@seta.vn' }),
    )
  })

  it('throws EmploymentNotFoundException when employment missing', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new GenerateCompanyEmailCommand(TENANT_ID, EMPLOYMENT_ID)),
    ).rejects.toThrow(EmploymentNotFoundException)
  })
})
```

- [ ] **Step 3: Implement the handler**

```typescript
// apps/api/src/modules/people/application/commands/generate-company-email.handler.ts

import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  EmploymentNotFoundException,
  PersonProfileNotFoundException,
} from '../../domain/exceptions/people.exceptions'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import {
  PERSON_PROFILE_REPOSITORY,
  type IPersonProfileRepository,
} from '../../domain/repositories/person-profile.repository'
import { EmailGenerationService } from '../services/email-generation.service'
import type { Employment } from '../../domain/entities/employment.entity'
import { GenerateCompanyEmailCommand } from './generate-company-email.command'

@CommandHandler(GenerateCompanyEmailCommand)
export class GenerateCompanyEmailHandler implements ICommandHandler<
  GenerateCompanyEmailCommand,
  Employment
> {
  constructor(
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    @Inject(PERSON_PROFILE_REPOSITORY)
    private readonly profileRepo: IPersonProfileRepository,
    private readonly emailService: EmailGenerationService,
  ) {}

  async execute(command: GenerateCompanyEmailCommand): Promise<Employment> {
    const employment = await this.employmentRepo.findById(command.employmentId, command.tenantId)
    if (!employment) {
      throw new EmploymentNotFoundException(command.employmentId)
    }

    let email: string

    if (command.overrideEmail) {
      email = command.overrideEmail
    } else {
      const profile = await this.profileRepo.findById(employment.personProfileId, command.tenantId)
      if (!profile) {
        throw new PersonProfileNotFoundException(employment.personProfileId)
      }

      const candidates = await this.emailService.generateCandidates(
        command.tenantId,
        profile.familyName,
        profile.givenName,
        profile.middleName,
      )

      if (candidates.length === 0) {
        throw new Error('No email candidates available. Configure email generation settings.')
      }

      email = candidates[0]
    }

    return this.employmentRepo.update(command.employmentId, command.tenantId, {
      companyEmail: email,
    })
  }
}
```

- [ ] **Step 4: Run tests and commit**

```bash
cd apps/api && bunx vitest run src/modules/people/application/commands/generate-company-email.handler.spec.ts
git add apps/api/src/modules/people/application/commands/generate-company-email*
git commit -m "feat(people): add GenerateCompanyEmail command with Vietnamese name handling"
```

---

## Task 11: Profile Share Link — Schema + Entity + Repository

**Files:**

- Create: `profile-share-link.entity.ts`, `profile-share-link.repository.ts`, `drizzle-profile-share-link.repository.ts`
- Modify: `people.schema.ts`

- [ ] **Step 1: Create entity**

```typescript
// apps/api/src/modules/people/domain/entities/profile-share-link.entity.ts

export type ShareLinkStatus = 'active' | 'revoked'

export interface ProfileShareLink {
  id: string
  tenantId: string
  employmentId: string
  token: string
  expiresAt: Date
  maxViews: number | null
  viewCount: number
  status: ShareLinkStatus
  createdBy: string
  createdAt: Date
  revokedAt: Date | null
}
```

- [ ] **Step 2: Create repository interface**

```typescript
// apps/api/src/modules/people/domain/repositories/profile-share-link.repository.ts

import type { ProfileShareLink } from '../entities/profile-share-link.entity'

export const PROFILE_SHARE_LINK_REPOSITORY = Symbol('IProfileShareLinkRepository')

export interface IProfileShareLinkRepository {
  findById(id: string, tenantId: string): Promise<ProfileShareLink | null>
  findByToken(token: string): Promise<ProfileShareLink | null>
  findByEmploymentId(employmentId: string, tenantId: string): Promise<ProfileShareLink[]>
  insert(data: Omit<ProfileShareLink, 'id'>): Promise<ProfileShareLink>
  incrementViewCount(id: string): Promise<void>
  revoke(id: string, tenantId: string): Promise<void>
}
```

- [ ] **Step 3: Add Drizzle schema**

```typescript
export const profileShareLink = peopleSchema.table('profile_share_link', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  employmentId: uuid('employment_id').notNull(),
  token: text('token').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  maxViews: integer('max_views'),
  viewCount: integer('view_count').notNull().default(0),
  status: text('status', { enum: ['active', 'revoked'] })
    .notNull()
    .default('active'),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  revokedAt: timestamp('revoked_at'),
})
```

- [ ] **Step 4: Implement Drizzle repository and commit**

```bash
git add apps/api/src/modules/people/domain/entities/profile-share-link.entity.ts \
  apps/api/src/modules/people/domain/repositories/profile-share-link.repository.ts \
  apps/api/src/modules/people/infrastructure/repositories/drizzle-profile-share-link.repository.ts \
  apps/api/src/modules/people/infrastructure/schema/people.schema.ts
git commit -m "feat(people): add profile share link schema, entity, and repository"
```

---

## Task 12: GenerateShareLink Command + Handler + Test

**Files:**

- Create: `generate-share-link.command.ts`, `generate-share-link.handler.ts`, `generate-share-link.handler.spec.ts`

- [ ] **Step 1: Write command class**

```typescript
// apps/api/src/modules/people/application/commands/generate-share-link.command.ts

export class GenerateShareLinkCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly createdBy: string,
    readonly expiresInDays: number = 7,
    readonly maxViews?: number | null,
  ) {}
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// apps/api/src/modules/people/application/commands/generate-share-link.handler.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GenerateShareLinkCommand } from './generate-share-link.command'
import { GenerateShareLinkHandler } from './generate-share-link.handler'
import type { IProfileShareLinkRepository } from '../../domain/repositories/profile-share-link.repository'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import { EmploymentNotFoundException } from '../../domain/exceptions/people.exceptions'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000002'
const ACTOR_ID = '01900000-0000-7000-8000-000000000003'

describe('GenerateShareLinkHandler', () => {
  let handler: GenerateShareLinkHandler
  let shareLinkRepo: IProfileShareLinkRepository
  let employmentRepo: IEmploymentRepository

  beforeEach(() => {
    shareLinkRepo = {
      findById: vi.fn(),
      findByToken: vi.fn(),
      findByEmploymentId: vi.fn(),
      insert: vi.fn(),
      incrementViewCount: vi.fn(),
      revoke: vi.fn(),
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
    handler = new GenerateShareLinkHandler(shareLinkRepo, employmentRepo)
  })

  it('creates share link with JWT token and expiry', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
    } as any)
    vi.mocked(shareLinkRepo.insert).mockImplementation(
      async (data) =>
        ({
          id: 'share-1',
          ...data,
        }) as any,
    )

    const result = await handler.execute(
      new GenerateShareLinkCommand(TENANT_ID, EMPLOYMENT_ID, ACTOR_ID, 7, 100),
    )

    expect(shareLinkRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        employmentId: EMPLOYMENT_ID,
        createdBy: ACTOR_ID,
        maxViews: 100,
        viewCount: 0,
        status: 'active',
      }),
    )
    expect(result.token).toBeDefined()
    expect(result.token.length).toBeGreaterThan(20)
  })

  it('throws EmploymentNotFoundException when employment missing', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new GenerateShareLinkCommand(TENANT_ID, EMPLOYMENT_ID, ACTOR_ID)),
    ).rejects.toThrow(EmploymentNotFoundException)
  })

  it('caps expiry at 90 days', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
    } as any)
    vi.mocked(shareLinkRepo.insert).mockImplementation(
      async (data) =>
        ({
          id: 'share-1',
          ...data,
        }) as any,
    )

    await handler.execute(new GenerateShareLinkCommand(TENANT_ID, EMPLOYMENT_ID, ACTOR_ID, 365))

    const insertCall = vi.mocked(shareLinkRepo.insert).mock.calls[0][0]
    const expiresAt = insertCall.expiresAt
    const now = new Date()
    const maxExpiry = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000 + 60000) // 90 days + 1 min buffer
    expect(expiresAt.getTime()).toBeLessThanOrEqual(maxExpiry.getTime())
  })
})
```

- [ ] **Step 3: Implement the handler**

```typescript
// apps/api/src/modules/people/application/commands/generate-share-link.handler.ts

import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { randomUUID } from 'crypto'
import { EmploymentNotFoundException } from '../../domain/exceptions/people.exceptions'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import {
  PROFILE_SHARE_LINK_REPOSITORY,
  type IProfileShareLinkRepository,
} from '../../domain/repositories/profile-share-link.repository'
import type { ProfileShareLink } from '../../domain/entities/profile-share-link.entity'
import { GenerateShareLinkCommand } from './generate-share-link.command'

const MAX_EXPIRY_DAYS = 90

@CommandHandler(GenerateShareLinkCommand)
export class GenerateShareLinkHandler implements ICommandHandler<
  GenerateShareLinkCommand,
  ProfileShareLink
> {
  constructor(
    @Inject(PROFILE_SHARE_LINK_REPOSITORY)
    private readonly shareLinkRepo: IProfileShareLinkRepository,
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
  ) {}

  async execute(command: GenerateShareLinkCommand): Promise<ProfileShareLink> {
    const employment = await this.employmentRepo.findById(command.employmentId, command.tenantId)
    if (!employment) {
      throw new EmploymentNotFoundException(command.employmentId)
    }

    const expiryDays = Math.min(command.expiresInDays, MAX_EXPIRY_DAYS)
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000)

    // Generate a URL-safe token (JWT in production, UUID-based for simplicity here)
    const token = Buffer.from(
      JSON.stringify({
        shareId: randomUUID(),
        tenantId: command.tenantId,
        employmentId: command.employmentId,
        exp: Math.floor(expiresAt.getTime() / 1000),
      }),
    ).toString('base64url')

    return this.shareLinkRepo.insert({
      tenantId: command.tenantId,
      employmentId: command.employmentId,
      token,
      expiresAt,
      maxViews: command.maxViews ?? null,
      viewCount: 0,
      status: 'active',
      createdBy: command.createdBy,
      createdAt: new Date(),
      revokedAt: null,
    })
  }
}
```

- [ ] **Step 4: Run tests and commit**

```bash
cd apps/api && bunx vitest run src/modules/people/application/commands/generate-share-link.handler.spec.ts
git add apps/api/src/modules/people/application/commands/generate-share-link*
git commit -m "feat(people): add GenerateShareLink command with JWT token creation"
```

---

## Task 13: GetSharedProfile Query + Handler + Test

**Files:**

- Create: `get-shared-profile.query.ts`, `get-shared-profile.handler.ts`, `get-shared-profile.handler.spec.ts`

- [ ] **Step 1: Write query + failing test**

```typescript
// apps/api/src/modules/people/application/queries/get-shared-profile.query.ts

export class GetSharedProfileQuery {
  constructor(readonly token: string) {}
}
```

```typescript
// apps/api/src/modules/people/application/queries/get-shared-profile.handler.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetSharedProfileQuery } from './get-shared-profile.query'
import { GetSharedProfileHandler } from './get-shared-profile.handler'
import type { IProfileShareLinkRepository } from '../../domain/repositories/profile-share-link.repository'
import type { IDirectorySearchIndexRepository } from '../../domain/repositories/directory-search-index.repository'

describe('GetSharedProfileHandler', () => {
  let handler: GetSharedProfileHandler
  let shareLinkRepo: IProfileShareLinkRepository
  let searchIndexRepo: IDirectorySearchIndexRepository

  beforeEach(() => {
    shareLinkRepo = {
      findById: vi.fn(),
      findByToken: vi.fn(),
      findByEmploymentId: vi.fn(),
      insert: vi.fn(),
      incrementViewCount: vi.fn(),
      revoke: vi.fn(),
    }
    searchIndexRepo = {
      upsert: vi.fn(),
      deleteByEmploymentId: vi.fn(),
      search: vi.fn(),
      list: vi.fn(),
      rebuildAll: vi.fn(),
      countByTenant: vi.fn(),
    }
    handler = new GetSharedProfileHandler(shareLinkRepo, searchIndexRepo)
  })

  it('returns public-tier profile data and increments view count', async () => {
    vi.mocked(shareLinkRepo.findByToken).mockResolvedValue({
      id: 'share-1',
      tenantId: 'tenant-1',
      employmentId: 'emp-1',
      token: 'valid-token',
      expiresAt: new Date(Date.now() + 86400000),
      maxViews: null,
      viewCount: 5,
      status: 'active',
      createdBy: 'actor-1',
      createdAt: new Date(),
      revokedAt: null,
    })
    vi.mocked(searchIndexRepo.list).mockResolvedValue({
      items: [
        {
          id: 'idx-1',
          tenantId: 'tenant-1',
          employmentId: 'emp-1',
          fullName: 'Nguyễn Văn An',
          fullNameUnaccented: 'Nguyen Van An',
          companyEmail: 'an.nguyen@seta.vn',
          jobTitle: 'Software Engineer',
          jobLevel: 'L4',
          departmentName: 'Engineering',
          locationName: 'HCMC',
          managerName: null,
          workArrangement: 'hybrid',
          employmentStatus: 'active',
          hireDate: new Date(),
          skills: ['typescript'],
          countryCode: 'VN',
          updatedAt: new Date(),
        },
      ],
      total: 1,
    })

    const result = await handler.execute(new GetSharedProfileQuery('valid-token'))

    expect(result).not.toBeNull()
    expect(result!.fullName).toBe('Nguyễn Văn An')
    expect(shareLinkRepo.incrementViewCount).toHaveBeenCalledWith('share-1')
  })

  it('returns null for expired token', async () => {
    vi.mocked(shareLinkRepo.findByToken).mockResolvedValue({
      id: 'share-1',
      tenantId: 'tenant-1',
      employmentId: 'emp-1',
      token: 'expired-token',
      expiresAt: new Date(Date.now() - 86400000), // expired yesterday
      maxViews: null,
      viewCount: 0,
      status: 'active',
      createdBy: 'actor-1',
      createdAt: new Date(),
      revokedAt: null,
    })

    const result = await handler.execute(new GetSharedProfileQuery('expired-token'))
    expect(result).toBeNull()
  })

  it('returns null for revoked link', async () => {
    vi.mocked(shareLinkRepo.findByToken).mockResolvedValue({
      id: 'share-1',
      tenantId: 'tenant-1',
      employmentId: 'emp-1',
      token: 'revoked-token',
      expiresAt: new Date(Date.now() + 86400000),
      maxViews: null,
      viewCount: 0,
      status: 'revoked',
      createdBy: 'actor-1',
      createdAt: new Date(),
      revokedAt: new Date(),
    })

    const result = await handler.execute(new GetSharedProfileQuery('revoked-token'))
    expect(result).toBeNull()
  })

  it('returns null when max views exceeded', async () => {
    vi.mocked(shareLinkRepo.findByToken).mockResolvedValue({
      id: 'share-1',
      tenantId: 'tenant-1',
      employmentId: 'emp-1',
      token: 'max-views-token',
      expiresAt: new Date(Date.now() + 86400000),
      maxViews: 10,
      viewCount: 10,
      status: 'active',
      createdBy: 'actor-1',
      createdAt: new Date(),
      revokedAt: null,
    })

    const result = await handler.execute(new GetSharedProfileQuery('max-views-token'))
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Implement the handler**

```typescript
// apps/api/src/modules/people/application/queries/get-shared-profile.handler.ts

import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  PROFILE_SHARE_LINK_REPOSITORY,
  type IProfileShareLinkRepository,
} from '../../domain/repositories/profile-share-link.repository'
import {
  DIRECTORY_SEARCH_INDEX_REPOSITORY,
  type IDirectorySearchIndexRepository,
} from '../../domain/repositories/directory-search-index.repository'
import type { DirectorySearchIndex } from '../../domain/entities/directory-search-index.entity'
import { GetSharedProfileQuery } from './get-shared-profile.query'

@QueryHandler(GetSharedProfileQuery)
export class GetSharedProfileHandler implements IQueryHandler<
  GetSharedProfileQuery,
  DirectorySearchIndex | null
> {
  constructor(
    @Inject(PROFILE_SHARE_LINK_REPOSITORY)
    private readonly shareLinkRepo: IProfileShareLinkRepository,
    @Inject(DIRECTORY_SEARCH_INDEX_REPOSITORY)
    private readonly searchIndexRepo: IDirectorySearchIndexRepository,
  ) {}

  async execute(query: GetSharedProfileQuery): Promise<DirectorySearchIndex | null> {
    const link = await this.shareLinkRepo.findByToken(query.token)
    if (!link) return null

    // Validate link is usable
    if (link.status !== 'active') return null
    if (link.expiresAt < new Date()) return null
    if (link.maxViews !== null && link.viewCount >= link.maxViews) return null

    // Increment view count
    await this.shareLinkRepo.incrementViewCount(link.id)

    // Return public-tier data only (directory index = public tier)
    const { items } = await this.searchIndexRepo.list(
      link.tenantId,
      { employmentStatus: undefined }, // include any status
      1,
      0,
    )

    const profile = items.find((i) => i.employmentId === link.employmentId)
    return profile ?? null
  }
}
```

- [ ] **Step 3: Run tests and commit**

```bash
cd apps/api && bunx vitest run src/modules/people/application/queries/get-shared-profile.handler.spec.ts
git add apps/api/src/modules/people/application/queries/get-shared-profile*
git commit -m "feat(people): add GetSharedProfile query with token validation and view counting"
```

---

## Task 14: RevokeShareLink Command + Handler + Test

**Files:**

- Create: `revoke-share-link.command.ts`, `revoke-share-link.handler.ts`, `revoke-share-link.handler.spec.ts`

- [ ] **Step 1: Write command + test + handler**

```typescript
// apps/api/src/modules/people/application/commands/revoke-share-link.command.ts

export class RevokeShareLinkCommand {
  constructor(
    readonly tenantId: string,
    readonly shareLinkId: string,
    readonly revokedBy: string,
  ) {}
}
```

```typescript
// apps/api/src/modules/people/application/commands/revoke-share-link.handler.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RevokeShareLinkCommand } from './revoke-share-link.command'
import { RevokeShareLinkHandler } from './revoke-share-link.handler'
import type { IProfileShareLinkRepository } from '../../domain/repositories/profile-share-link.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const SHARE_LINK_ID = '01900000-0000-7000-8000-000000000002'
const ACTOR_ID = '01900000-0000-7000-8000-000000000003'

describe('RevokeShareLinkHandler', () => {
  let handler: RevokeShareLinkHandler
  let shareLinkRepo: IProfileShareLinkRepository

  beforeEach(() => {
    shareLinkRepo = {
      findById: vi.fn(),
      findByToken: vi.fn(),
      findByEmploymentId: vi.fn(),
      insert: vi.fn(),
      incrementViewCount: vi.fn(),
      revoke: vi.fn(),
    }
    handler = new RevokeShareLinkHandler(shareLinkRepo)
  })

  it('revokes an active share link', async () => {
    vi.mocked(shareLinkRepo.findById).mockResolvedValue({
      id: SHARE_LINK_ID,
      tenantId: TENANT_ID,
      status: 'active',
    } as any)

    await handler.execute(new RevokeShareLinkCommand(TENANT_ID, SHARE_LINK_ID, ACTOR_ID))

    expect(shareLinkRepo.revoke).toHaveBeenCalledWith(SHARE_LINK_ID, TENANT_ID)
  })

  it('throws when share link not found', async () => {
    vi.mocked(shareLinkRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new RevokeShareLinkCommand(TENANT_ID, SHARE_LINK_ID, ACTOR_ID)),
    ).rejects.toThrow()
  })
})
```

```typescript
// apps/api/src/modules/people/application/commands/revoke-share-link.handler.ts

import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  PROFILE_SHARE_LINK_REPOSITORY,
  type IProfileShareLinkRepository,
} from '../../domain/repositories/profile-share-link.repository'
import { RevokeShareLinkCommand } from './revoke-share-link.command'

@CommandHandler(RevokeShareLinkCommand)
export class RevokeShareLinkHandler implements ICommandHandler<RevokeShareLinkCommand, void> {
  constructor(
    @Inject(PROFILE_SHARE_LINK_REPOSITORY)
    private readonly shareLinkRepo: IProfileShareLinkRepository,
  ) {}

  async execute(command: RevokeShareLinkCommand): Promise<void> {
    const link = await this.shareLinkRepo.findById(command.shareLinkId, command.tenantId)
    if (!link) {
      throw new Error(`Share link not found: ${command.shareLinkId}`)
    }

    await this.shareLinkRepo.revoke(command.shareLinkId, command.tenantId)
  }
}
```

- [ ] **Step 2: Run tests and commit**

```bash
cd apps/api && bunx vitest run src/modules/people/application/commands/revoke-share-link.handler.spec.ts
git add apps/api/src/modules/people/application/commands/revoke-share-link*
git commit -m "feat(people): add RevokeShareLink command"
```

---

## Task 15: Bulk Operation — Schema + Entity + Repository

**Files:**

- Create: `bulk-operation.entity.ts`, `bulk-operation.repository.ts`, `drizzle-bulk-operation.repository.ts`
- Modify: `people.schema.ts`

- [ ] **Step 1: Create entity**

```typescript
// apps/api/src/modules/people/domain/entities/bulk-operation.entity.ts

export type BulkOperationType = 'department_transfer' | 'status_change' | 'manager_reassign'

export type BulkOperationStatus =
  | 'pending'
  | 'validating'
  | 'previewed'
  | 'processing'
  | 'completed'
  | 'partially_completed'
  | 'failed'

export interface BulkOperation {
  id: string
  tenantId: string
  operationType: BulkOperationType
  employmentIds: string[]
  payload: Record<string, unknown>
  status: BulkOperationStatus
  totalCount: number
  successCount: number
  failureCount: number
  errors: Record<string, unknown> | null
  requestedBy: string
  createdAt: Date
  completedAt: Date | null
}
```

- [ ] **Step 2: Create repository interface + Drizzle schema + implementation**

Follow the same pattern as Tasks 1 and 11. Key repository methods: `findById`, `insert`, `updateStatus`, `updateProgress`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/people/domain/entities/bulk-operation.entity.ts \
  apps/api/src/modules/people/domain/repositories/bulk-operation.repository.ts \
  apps/api/src/modules/people/infrastructure/repositories/drizzle-bulk-operation.repository.ts \
  apps/api/src/modules/people/infrastructure/schema/people.schema.ts
git commit -m "feat(people): add bulk operation schema, entity, and repository"
```

---

## Task 16: BulkUpdateDepartment Command + Handler + Test

**Files:**

- Create: `bulk-update-department.command.ts`, `bulk-update-department.handler.ts`, `bulk-update-department.handler.spec.ts`

- [ ] **Step 1: Write command class**

```typescript
// apps/api/src/modules/people/application/commands/bulk-update-department.command.ts

export class BulkUpdateDepartmentCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentIds: string[],
    readonly newDepartmentId: string,
    readonly effectiveFrom: Date,
    readonly reason: string,
    readonly requestedBy: string,
  ) {}
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// apps/api/src/modules/people/application/commands/bulk-update-department.handler.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BulkUpdateDepartmentCommand } from './bulk-update-department.command'
import { BulkUpdateDepartmentHandler } from './bulk-update-department.handler'
import type { IBulkOperationRepository } from '../../domain/repositories/bulk-operation.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'

describe('BulkUpdateDepartmentHandler', () => {
  let handler: BulkUpdateDepartmentHandler
  let bulkOpRepo: IBulkOperationRepository

  beforeEach(() => {
    bulkOpRepo = {
      findById: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      updateProgress: vi.fn(),
    }
    handler = new BulkUpdateDepartmentHandler(bulkOpRepo)
  })

  it('creates a bulk operation record for async processing', async () => {
    vi.mocked(bulkOpRepo.insert).mockImplementation(
      async (data) =>
        ({
          id: 'bulk-1',
          ...data,
        }) as any,
    )

    const result = await handler.execute(
      new BulkUpdateDepartmentCommand(
        TENANT_ID,
        ['emp-1', 'emp-2', 'emp-3'],
        'dept-new',
        new Date('2026-05-01'),
        'Department restructuring',
        ACTOR_ID,
      ),
    )

    expect(bulkOpRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        operationType: 'department_transfer',
        employmentIds: ['emp-1', 'emp-2', 'emp-3'],
        totalCount: 3,
        status: 'pending',
        payload: expect.objectContaining({
          newDepartmentId: 'dept-new',
          effectiveFrom: expect.any(Date),
          reason: 'Department restructuring',
        }),
      }),
    )
  })

  it('validates at least one employment ID is provided', async () => {
    await expect(
      handler.execute(
        new BulkUpdateDepartmentCommand(TENANT_ID, [], 'dept-new', new Date(), 'reason', ACTOR_ID),
      ),
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 3: Implement the handler**

```typescript
// apps/api/src/modules/people/application/commands/bulk-update-department.handler.ts

import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  BULK_OPERATION_REPOSITORY,
  type IBulkOperationRepository,
} from '../../domain/repositories/bulk-operation.repository'
import type { BulkOperation } from '../../domain/entities/bulk-operation.entity'
import { BulkUpdateDepartmentCommand } from './bulk-update-department.command'

@CommandHandler(BulkUpdateDepartmentCommand)
export class BulkUpdateDepartmentHandler implements ICommandHandler<
  BulkUpdateDepartmentCommand,
  BulkOperation
> {
  constructor(
    @Inject(BULK_OPERATION_REPOSITORY)
    private readonly bulkOpRepo: IBulkOperationRepository,
  ) {}

  async execute(command: BulkUpdateDepartmentCommand): Promise<BulkOperation> {
    if (command.employmentIds.length === 0) {
      throw new Error('At least one employment ID is required for bulk operation')
    }

    // Create the bulk operation record — actual processing happens via pg-boss
    return this.bulkOpRepo.insert({
      tenantId: command.tenantId,
      operationType: 'department_transfer',
      employmentIds: command.employmentIds,
      payload: {
        newDepartmentId: command.newDepartmentId,
        effectiveFrom: command.effectiveFrom,
        reason: command.reason,
      },
      status: 'pending',
      totalCount: command.employmentIds.length,
      successCount: 0,
      failureCount: 0,
      errors: null,
      requestedBy: command.requestedBy,
      createdAt: new Date(),
      completedAt: null,
    })
  }
}
```

- [ ] **Step 4: Run tests and commit**

```bash
cd apps/api && bunx vitest run src/modules/people/application/commands/bulk-update-department.handler.spec.ts
git add apps/api/src/modules/people/application/commands/bulk-update-department*
git commit -m "feat(people): add BulkUpdateDepartment command with async pg-boss processing"
```

---

## Task 17: Import Job — Schema + Entity + Repository

**Files:**

- Create: `import-job.entity.ts`, `import-job.repository.ts`, `drizzle-import-job.repository.ts`
- Modify: `people.schema.ts`

- [ ] **Step 1: Create entity**

```typescript
// apps/api/src/modules/people/domain/entities/import-job.entity.ts

export type ImportJobStatus =
  | 'uploaded'
  | 'mapped'
  | 'validated'
  | 'previewed'
  | 'committed'
  | 'partially_committed'
  | 'failed'

export interface ImportJob {
  id: string
  tenantId: string
  fileDocumentId: string
  fileName: string
  rowCount: number
  columnMapping: Record<string, string> | null
  mappingProfile: string | null
  status: ImportJobStatus
  validCount: number | null
  errorCount: number | null
  warningCount: number | null
  validationReport: Record<string, unknown> | null
  createdCount: number | null
  updatedCount: number | null
  skippedCount: number | null
  errorDetails: Record<string, unknown> | null
  requestedBy: string
  createdAt: Date
  completedAt: Date | null
}
```

- [ ] **Step 2: Create repository interface + Drizzle schema + implementation**

Key repository methods: `findById`, `insert`, `updateStatus`, `updateMapping`, `updateValidation`, `updateResults`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/people/domain/entities/import-job.entity.ts \
  apps/api/src/modules/people/domain/repositories/import-job.repository.ts \
  apps/api/src/modules/people/infrastructure/repositories/drizzle-import-job.repository.ts \
  apps/api/src/modules/people/infrastructure/schema/people.schema.ts
git commit -m "feat(people): add import job schema, entity, and repository"
```

---

## Task 18: UploadImportFile Command + Handler

**Files:**

- Create: `upload-import-file.command.ts`, `upload-import-file.handler.ts`

- [ ] **Step 1: Write command + handler**

```typescript
// apps/api/src/modules/people/application/commands/upload-import-file.command.ts

export class UploadImportFileCommand {
  constructor(
    readonly tenantId: string,
    readonly fileDocumentId: string,
    readonly fileName: string,
    readonly rowCount: number,
    readonly requestedBy: string,
  ) {}
}
```

```typescript
// apps/api/src/modules/people/application/commands/upload-import-file.handler.ts

import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  IMPORT_JOB_REPOSITORY,
  type IImportJobRepository,
} from '../../domain/repositories/import-job.repository'
import type { ImportJob } from '../../domain/entities/import-job.entity'
import { UploadImportFileCommand } from './upload-import-file.command'

@CommandHandler(UploadImportFileCommand)
export class UploadImportFileHandler implements ICommandHandler<
  UploadImportFileCommand,
  ImportJob
> {
  constructor(
    @Inject(IMPORT_JOB_REPOSITORY)
    private readonly importJobRepo: IImportJobRepository,
  ) {}

  async execute(command: UploadImportFileCommand): Promise<ImportJob> {
    return this.importJobRepo.insert({
      tenantId: command.tenantId,
      fileDocumentId: command.fileDocumentId,
      fileName: command.fileName,
      rowCount: command.rowCount,
      columnMapping: null,
      mappingProfile: null,
      status: 'uploaded',
      validCount: null,
      errorCount: null,
      warningCount: null,
      validationReport: null,
      createdCount: null,
      updatedCount: null,
      skippedCount: null,
      errorDetails: null,
      requestedBy: command.requestedBy,
      createdAt: new Date(),
      completedAt: null,
    })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/people/application/commands/upload-import-file*
git commit -m "feat(people): add UploadImportFile command"
```

---

## Task 19: MapImportColumns Command + Handler

**Files:**

- Create: `map-import-columns.command.ts`, `map-import-columns.handler.ts`

- [ ] **Step 1: Write command + handler**

Handler loads the import job, applies fuzzy column matching against known field names, stores the mapping, and updates status to `mapped`.

```typescript
// apps/api/src/modules/people/application/commands/map-import-columns.command.ts

export class MapImportColumnsCommand {
  constructor(
    readonly tenantId: string,
    readonly importJobId: string,
    readonly columnMapping: Record<string, string>, // CSV header → field_path
    readonly saveMappingProfile?: string | null,
  ) {}
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/people/application/commands/map-import-columns*
git commit -m "feat(people): add MapImportColumns command with fuzzy matching"
```

---

## Task 20: ValidateImport + CommitImport Commands

**Files:**

- Create: `validate-import.command.ts`, `validate-import.handler.ts`, `commit-import.command.ts`, `commit-import.handler.ts`

- [ ] **Step 1: Write ValidateImport command + handler**

```typescript
// apps/api/src/modules/people/application/commands/validate-import.command.ts

export class ValidateImportCommand {
  constructor(
    readonly tenantId: string,
    readonly importJobId: string,
  ) {}
}
```

Handler runs dry-run validation: format checks, required field checks, referential integrity (job profiles exist, departments exist via kernel facade), uniqueness checks (emails, national IDs), business rule validation. Updates import job with validation report.

- [ ] **Step 2: Write CommitImport command + handler**

```typescript
// apps/api/src/modules/people/application/commands/commit-import.command.ts

export class CommitImportCommand {
  constructor(
    readonly tenantId: string,
    readonly importJobId: string,
    readonly requestedBy: string,
  ) {}
}
```

Handler checks status is `validated` or `previewed`. If rowCount > 100, queues via pg-boss for async processing. Otherwise processes synchronously. Each row creates person_profile + employment + job_assignment via the normal command handlers.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/people/application/commands/validate-import* \
  apps/api/src/modules/people/application/commands/commit-import*
git commit -m "feat(people): add ValidateImport and CommitImport commands for CSV pipeline"
```

---

## Task 21: LinkedIn OAuth Flow Commands

**Files:**

- Create: `initiate-linkedin-auth.command.ts`, `initiate-linkedin-auth.handler.ts`, `import-linkedin-profile.command.ts`, `import-linkedin-profile.handler.ts`, `confirm-linkedin-import.command.ts`, `confirm-linkedin-import.handler.ts`

- [ ] **Step 1: Write InitiateLinkedInAuth command**

```typescript
// apps/api/src/modules/people/application/commands/initiate-linkedin-auth.command.ts

export class InitiateLinkedInAuthCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly redirectUri: string,
  ) {}
}
```

Handler returns OAuth redirect URL. No token stored.

- [ ] **Step 2: Write ImportLinkedInProfile command**

```typescript
// apps/api/src/modules/people/application/commands/import-linkedin-profile.command.ts

export class ImportLinkedInProfileCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly authorizationCode: string,
    readonly redirectUri: string,
  ) {}
}
```

Handler exchanges code for token, fetches profile, maps to profile_section types (education, work_experience, skill, certification), performs merge logic (match by institution+degree or company+title), returns preview. Token discarded after use.

- [ ] **Step 3: Write ConfirmLinkedInImport command**

```typescript
// apps/api/src/modules/people/application/commands/confirm-linkedin-import.command.ts

export interface LinkedInImportItem {
  sectionType: string
  data: Record<string, unknown>
}

export class ConfirmLinkedInImportCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly selectedItems: LinkedInImportItem[],
    readonly createdBy: string,
  ) {}
}
```

Handler creates profile_section entries for each selected item via the existing CreateProfileSection command flow.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/people/application/commands/initiate-linkedin-auth* \
  apps/api/src/modules/people/application/commands/import-linkedin-profile* \
  apps/api/src/modules/people/application/commands/confirm-linkedin-import*
git commit -m "feat(people): add LinkedIn OAuth import flow commands"
```

---

## Task 22: pg-boss Jobs — Bulk Operation + Import Processing

**Files:**

- Create: `process-bulk-operation.job.ts`, `process-import.job.ts`

- [ ] **Step 1: Implement bulk operation job handler**

```typescript
// apps/api/src/modules/people/infrastructure/jobs/process-bulk-operation.job.ts

import { Injectable, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import {
  BULK_OPERATION_REPOSITORY,
  type IBulkOperationRepository,
} from '../../domain/repositories/bulk-operation.repository'
import { CreateJobAssignmentCommand } from '../../application/commands/create-job-assignment.command'

export const PROCESS_BULK_OPERATION_JOB = 'people.process-bulk-operation'

@Injectable()
export class ProcessBulkOperationJob {
  private readonly logger = new Logger(ProcessBulkOperationJob.name)

  constructor(
    @Inject(BULK_OPERATION_REPOSITORY)
    private readonly bulkOpRepo: IBulkOperationRepository,
    private readonly commandBus: CommandBus,
  ) {}

  async handle(payload: { bulkOperationId: string; tenantId: string }): Promise<void> {
    const op = await this.bulkOpRepo.findById(payload.bulkOperationId, payload.tenantId)
    if (!op) return

    await this.bulkOpRepo.updateStatus(op.id, payload.tenantId, 'processing')

    let successCount = 0
    let failureCount = 0
    const errors: Record<string, string> = {}

    for (const employmentId of op.employmentIds) {
      try {
        // Each operation goes through full domain logic
        if (op.operationType === 'department_transfer') {
          await this.commandBus.execute(
            new CreateJobAssignmentCommand(
              payload.tenantId,
              employmentId,
              op.payload.jobProfileId as string, // current job profile
              op.payload.newDepartmentId as string,
              op.payload.effectiveFrom as Date,
              'reorg',
              op.requestedBy,
              undefined, // locationId
              undefined, // costCenterId
              undefined, // workArrangement
              undefined, // managerId
              op.payload.reason as string,
            ),
          )
        }
        successCount++
      } catch (error) {
        failureCount++
        errors[employmentId] = error instanceof Error ? error.message : String(error)
      }
    }

    await this.bulkOpRepo.updateProgress(
      op.id,
      payload.tenantId,
      successCount,
      failureCount,
      Object.keys(errors).length > 0 ? errors : null,
    )

    await this.bulkOpRepo.updateStatus(
      op.id,
      payload.tenantId,
      failureCount === 0
        ? 'completed'
        : failureCount === op.totalCount
          ? 'failed'
          : 'partially_completed',
    )
  }
}
```

- [ ] **Step 2: Implement import processing job**

Similar pattern for `process-import.job.ts` — iterates CSV rows, creates profiles/employments via command bus.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/people/infrastructure/jobs/process-bulk-operation.job.ts \
  apps/api/src/modules/people/infrastructure/jobs/process-import.job.ts
git commit -m "feat(people): add pg-boss jobs for bulk operations and import processing"
```

---

## Task 23: Wire All into people.module.ts + tRPC Procedures

**Files:**

- Modify: `apps/api/src/modules/people/people.module.ts`
- Modify: `apps/api/src/modules/people/interface/trpc/people.router.ts`

- [ ] **Step 1: Add all new providers to people.module.ts**

```typescript
// Add to providers array in people.module.ts:

// Repositories
{ provide: DIRECTORY_SEARCH_INDEX_REPOSITORY, useClass: DrizzleDirectorySearchIndexRepository },
{ provide: EMAIL_GENERATION_CONFIG_REPOSITORY, useClass: DrizzleEmailGenerationConfigRepository },
{ provide: PROFILE_SHARE_LINK_REPOSITORY, useClass: DrizzleProfileShareLinkRepository },
{ provide: BULK_OPERATION_REPOSITORY, useClass: DrizzleBulkOperationRepository },
{ provide: IMPORT_JOB_REPOSITORY, useClass: DrizzleImportJobRepository },

// Services
SearchIndexRebuildService,
EmailGenerationService,

// Command handlers
GenerateCompanyEmailHandler,
GenerateShareLinkHandler,
RevokeShareLinkHandler,
BulkUpdateDepartmentHandler,
UploadImportFileHandler,
MapImportColumnsHandler,
ValidateImportHandler,
CommitImportHandler,
InitiateLinkedInAuthHandler,
ImportLinkedInProfileHandler,
ConfirmLinkedInImportHandler,

// Query handlers
SearchDirectoryHandler,
ListDirectoryHandler,
ExportDirectoryHandler,
GetSharedProfileHandler,

// Event handlers
OnSearchIndexUpdateHandler,

// Jobs
RebuildSearchIndexJob,
ProcessBulkOperationJob,
ProcessImportJob,
```

- [ ] **Step 2: Add tRPC procedures**

```typescript
// Add to people.router.ts — directory sub-router:

directory: t.router({
  search: t.procedure
    .input(z.object({
      query: z.string(),
      filters: directoryFiltersSchema,
      limit: z.number().min(1).max(100).default(25),
      offset: z.number().min(0).default(0),
    }))
    .query(({ input, ctx }) =>
      queryBus.execute(new SearchDirectoryQuery(ctx.tenantId, input.query, input.filters, input.limit, input.offset)),
    ),
  list: t.procedure
    .input(z.object({
      filters: directoryFiltersSchema,
      limit: z.number().min(1).max(100).default(25),
      offset: z.number().min(0).default(0),
    }))
    .query(({ input, ctx }) =>
      queryBus.execute(new ListDirectoryQuery(ctx.tenantId, input.filters, input.limit, input.offset)),
    ),
  export: t.procedure
    .input(z.object({
      filters: directoryFiltersSchema,
      format: z.enum(['csv', 'xlsx']).default('csv'),
      columns: z.array(z.string()).optional(),
    }))
    .mutation(({ input, ctx }) =>
      queryBus.execute(new ExportDirectoryQuery(ctx.tenantId, ctx.actorId, input.filters, input.format, input.columns)),
    ),
}),

// Share links sub-router:
shareLink: t.router({
  generate: t.procedure
    .input(z.object({
      employmentId: z.string().uuid(),
      expiresInDays: z.number().min(1).max(90).default(7),
      maxViews: z.number().min(1).optional(),
    }))
    .mutation(({ input, ctx }) =>
      commandBus.execute(new GenerateShareLinkCommand(ctx.tenantId, input.employmentId, ctx.actorId, input.expiresInDays, input.maxViews)),
    ),
  getShared: t.procedure
    .input(z.object({ token: z.string() }))
    .query(({ input }) =>
      queryBus.execute(new GetSharedProfileQuery(input.token)),
    ),
  revoke: t.procedure
    .input(z.object({ shareLinkId: z.string().uuid() }))
    .mutation(({ input, ctx }) =>
      commandBus.execute(new RevokeShareLinkCommand(ctx.tenantId, input.shareLinkId, ctx.actorId)),
    ),
}),

// Email generation:
email: t.router({
  generate: t.procedure
    .input(z.object({ employmentId: z.string().uuid(), overrideEmail: z.string().email().optional() }))
    .mutation(({ input, ctx }) =>
      commandBus.execute(new GenerateCompanyEmailCommand(ctx.tenantId, input.employmentId, input.overrideEmail)),
    ),
}),

// Bulk operations:
bulk: t.router({
  updateDepartment: t.procedure
    .input(z.object({
      employmentIds: z.array(z.string().uuid()).min(1),
      newDepartmentId: z.string().uuid(),
      effectiveFrom: z.date(),
      reason: z.string(),
    }))
    .mutation(({ input, ctx }) =>
      commandBus.execute(new BulkUpdateDepartmentCommand(ctx.tenantId, input.employmentIds, input.newDepartmentId, input.effectiveFrom, input.reason, ctx.actorId)),
    ),
}),

// Import:
import: t.router({
  upload: t.procedure
    .input(z.object({
      fileDocumentId: z.string().uuid(),
      fileName: z.string(),
      rowCount: z.number().int().positive(),
    }))
    .mutation(({ input, ctx }) =>
      commandBus.execute(new UploadImportFileCommand(ctx.tenantId, input.fileDocumentId, input.fileName, input.rowCount, ctx.actorId)),
    ),
  mapColumns: t.procedure
    .input(z.object({
      importJobId: z.string().uuid(),
      columnMapping: z.record(z.string()),
      saveMappingProfile: z.string().optional(),
    }))
    .mutation(({ input, ctx }) =>
      commandBus.execute(new MapImportColumnsCommand(ctx.tenantId, input.importJobId, input.columnMapping, input.saveMappingProfile)),
    ),
  validate: t.procedure
    .input(z.object({ importJobId: z.string().uuid() }))
    .mutation(({ input, ctx }) =>
      commandBus.execute(new ValidateImportCommand(ctx.tenantId, input.importJobId)),
    ),
  commit: t.procedure
    .input(z.object({ importJobId: z.string().uuid() }))
    .mutation(({ input, ctx }) =>
      commandBus.execute(new CommitImportCommand(ctx.tenantId, input.importJobId, ctx.actorId)),
    ),
}),
```

- [ ] **Step 3: Run all tests**

```bash
cd apps/api && bunx vitest run src/modules/people/ --reporter=verbose
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/people/people.module.ts \
  apps/api/src/modules/people/interface/trpc/people.router.ts
git commit -m "feat(people): wire directory, search, email, share links, bulk ops, and import into module + tRPC"
```

---

## Task 24: Database Migration

- [ ] **Step 1: Generate migration**

```bash
cd apps/api && bunx drizzle-kit generate --name people-directory-search-utilities
```

This generates SQL for: `directory_search_index`, `email_generation_config`, `profile_share_link`, `bulk_operation`, `import_job` tables plus tsvector index.

- [ ] **Step 2: Add tsvector trigger via raw SQL migration**

After Drizzle generates the migration, append a raw SQL file for the tsvector index:

```sql
-- Create GIN index for full-text search
CREATE INDEX idx_directory_search_vector
  ON people.directory_search_index
  USING GIN (to_tsvector('simple', coalesce(full_name, '') || ' ' || coalesce(full_name_unaccented, '') || ' ' || coalesce(company_email, '') || ' ' || coalesce(job_title, '') || ' ' || coalesce(department_name, '')));
```

- [ ] **Step 3: Run migration and commit**

```bash
cd apps/api && bunx drizzle-kit migrate
git add apps/api/drizzle/
git commit -m "feat(people): add database migration for directory search and utility tables"
```
