# People Module — Plan 04: Change Requests & Documents

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the enhanced profile change request system (batched, effective-dated, with edit policy integration), employee document metadata management, profile completeness scoring, and duplicate validation. This plan bridges self-service and controlled HR workflows.

**Architecture:** Hexagonal + DDD + CQRS. Change requests integrate with EditPolicyService from Plan 03 to determine whether changes are self-service or require approval. Documents module boundary is respected — people stores metadata only, delegates file storage. Completeness scoring is computed on read, never stored.

**Tech Stack:** NestJS, Drizzle ORM, PostgreSQL 16, tRPC, Zod, Vitest, pg-boss

**Spec Reference:** `docs/superpowers/specs/2026-04-15-people-module-redesign.md` — Sections 6 (Change Requests), 8 (Documents), 14 (Completeness)

**Depends on:** Plan 01 (Foundation & Core Schema), Plan 03 (Multi-Country & Extensibility)

---

## File Structure

### Files to CREATE

```
# Domain entities
apps/api/src/modules/people/domain/entities/profile-change-request.entity.ts
apps/api/src/modules/people/domain/entities/employee-document.entity.ts
apps/api/src/modules/people/domain/entities/document-requirement.entity.ts
apps/api/src/modules/people/domain/entities/completeness-rule.entity.ts

# Domain repositories
apps/api/src/modules/people/domain/repositories/profile-change-request.repository.ts
apps/api/src/modules/people/domain/repositories/employee-document.repository.ts
apps/api/src/modules/people/domain/repositories/document-requirement.repository.ts
apps/api/src/modules/people/domain/repositories/completeness-rule.repository.ts

# Infrastructure — schema
apps/api/src/modules/people/infrastructure/schema/change-requests.schema.ts
apps/api/src/modules/people/infrastructure/schema/documents.schema.ts

# Infrastructure — repositories
apps/api/src/modules/people/infrastructure/repositories/drizzle-profile-change-request.repository.ts
apps/api/src/modules/people/infrastructure/repositories/drizzle-employee-document.repository.ts
apps/api/src/modules/people/infrastructure/repositories/drizzle-document-requirement.repository.ts
apps/api/src/modules/people/infrastructure/repositories/drizzle-completeness-rule.repository.ts

# Application — commands (change requests)
apps/api/src/modules/people/application/commands/request-profile-changes.command.ts
apps/api/src/modules/people/application/commands/request-profile-changes.handler.ts
apps/api/src/modules/people/application/commands/request-profile-changes.handler.spec.ts
apps/api/src/modules/people/application/commands/batch-approve-changes.command.ts
apps/api/src/modules/people/application/commands/batch-approve-changes.handler.ts
apps/api/src/modules/people/application/commands/batch-approve-changes.handler.spec.ts
apps/api/src/modules/people/application/commands/batch-reject-changes.command.ts
apps/api/src/modules/people/application/commands/batch-reject-changes.handler.ts
apps/api/src/modules/people/application/commands/batch-reject-changes.handler.spec.ts

# Application — commands (documents)
apps/api/src/modules/people/application/commands/upload-employee-document.command.ts
apps/api/src/modules/people/application/commands/upload-employee-document.handler.ts
apps/api/src/modules/people/application/commands/upload-employee-document.handler.spec.ts
apps/api/src/modules/people/application/commands/acknowledge-policy.command.ts
apps/api/src/modules/people/application/commands/acknowledge-policy.handler.ts
apps/api/src/modules/people/application/commands/acknowledge-policy.handler.spec.ts

# Application — queries
apps/api/src/modules/people/application/queries/list-expiring-documents.query.ts
apps/api/src/modules/people/application/queries/list-expiring-documents.handler.ts
apps/api/src/modules/people/application/queries/get-profile-completeness.query.ts
apps/api/src/modules/people/application/queries/get-profile-completeness.handler.ts
apps/api/src/modules/people/application/queries/get-profile-completeness.handler.spec.ts
apps/api/src/modules/people/application/queries/list-incomplete-profiles.query.ts
apps/api/src/modules/people/application/queries/list-incomplete-profiles.handler.ts

# Application — services
apps/api/src/modules/people/application/services/duplicate-validation.service.ts
apps/api/src/modules/people/application/services/duplicate-validation.service.spec.ts

# Infrastructure — jobs
apps/api/src/modules/people/infrastructure/jobs/apply-scheduled-changes.job.ts
apps/api/src/modules/people/infrastructure/jobs/check-document-expiry.job.ts
apps/api/src/modules/people/infrastructure/jobs/completeness-reminder.job.ts

# Infrastructure — seed
apps/api/src/modules/people/infrastructure/seed/vietnam-document-requirements.seed.ts

# Event contracts
packages/event-contracts/src/people/profile-change-applied.event.ts
packages/event-contracts/src/people/document-expiring.event.ts
packages/event-contracts/src/people/profile-incomplete.event.ts

# Tests (co-located — listed above)
```

---

## Task 1: Enhanced Profile Change Request Schema

**Files:**

- Create: `apps/api/src/modules/people/infrastructure/schema/change-requests.schema.ts`
- Create: entity + repository

- [ ] **Step 1: Create entity**

```typescript
// apps/api/src/modules/people/domain/entities/profile-change-request.entity.ts

export type ChangeRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'superseded'
  | 'scheduled'
  | 'applied'

export interface ProfileChangeRequest {
  id: string
  tenantId: string
  employmentId: string
  batchId: string | null
  fieldPath: string
  oldValue: unknown | null
  newValue: unknown
  effectiveDate: Date | null
  status: ChangeRequestStatus
  requestedBy: string
  reviewedBy: string | null
  reviewedAt: Date | null
  reviewNote: string | null
  decisionCaseId: string | null
  createdAt: Date
}
```

- [ ] **Step 2: Create repository interface**

```typescript
// apps/api/src/modules/people/domain/repositories/profile-change-request.repository.ts

import type {
  ChangeRequestStatus,
  ProfileChangeRequest,
} from '../entities/profile-change-request.entity'

export const PROFILE_CHANGE_REQUEST_REPOSITORY = Symbol('IProfileChangeRequestRepository')

export interface IProfileChangeRequestRepository {
  findById(id: string, tenantId: string): Promise<ProfileChangeRequest | null>
  findByBatchId(batchId: string, tenantId: string): Promise<ProfileChangeRequest[]>
  findByEmploymentId(
    employmentId: string,
    tenantId: string,
    status?: ChangeRequestStatus,
  ): Promise<ProfileChangeRequest[]>
  findPendingByFieldPath(
    employmentId: string,
    fieldPath: string,
    tenantId: string,
  ): Promise<ProfileChangeRequest | null>
  findScheduledBeforeDate(tenantId: string, beforeDate: Date): Promise<ProfileChangeRequest[]>
  insertMany(
    data: Omit<ProfileChangeRequest, 'id' | 'createdAt'>[],
  ): Promise<ProfileChangeRequest[]>
  updateStatus(
    id: string,
    tenantId: string,
    status: ChangeRequestStatus,
    reviewedBy?: string,
    reviewNote?: string,
  ): Promise<void>
  updateStatusByBatchId(
    batchId: string,
    tenantId: string,
    status: ChangeRequestStatus,
    reviewedBy: string,
    reviewNote?: string,
  ): Promise<void>
}
```

- [ ] **Step 3: Add Drizzle schema**

```typescript
// apps/api/src/modules/people/infrastructure/schema/change-requests.schema.ts

import { pgSchema, uuid, text, date, timestamp, jsonb, uniqueIndex } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'
import { peopleSchema } from './people.schema'

export const profileChangeRequest = peopleSchema.table('profile_change_request', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  employmentId: uuid('employment_id').notNull(),
  batchId: uuid('batch_id'),
  fieldPath: text('field_path').notNull(),
  oldValue: jsonb('old_value'),
  newValue: jsonb('new_value').notNull(),
  effectiveDate: date('effective_date', { mode: 'date' }),
  status: text('status', {
    enum: ['pending', 'approved', 'rejected', 'superseded', 'scheduled', 'applied'],
  }).notNull(),
  requestedBy: uuid('requested_by').notNull(),
  reviewedBy: uuid('reviewed_by'),
  reviewedAt: timestamp('reviewed_at'),
  reviewNote: text('review_note'),
  decisionCaseId: uuid('decision_case_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

- [ ] **Step 4: Implement Drizzle repo**

```typescript
// apps/api/src/modules/people/infrastructure/repositories/drizzle-profile-change-request.repository.ts

import { Inject, Injectable } from '@nestjs/common'
import { and, eq, lte, isNull } from 'drizzle-orm'
import { DB_TOKEN, type Db } from '@future/db'
import type {
  ChangeRequestStatus,
  ProfileChangeRequest,
} from '../../domain/entities/profile-change-request.entity'
import type { IProfileChangeRequestRepository } from '../../domain/repositories/profile-change-request.repository'
import { profileChangeRequest } from '../schema/change-requests.schema'

@Injectable()
export class DrizzleProfileChangeRequestRepository implements IProfileChangeRequestRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<ProfileChangeRequest | null> {
    const rows = await this.db
      .select()
      .from(profileChangeRequest)
      .where(and(eq(profileChangeRequest.id, id), eq(profileChangeRequest.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as ProfileChangeRequest | undefined) ?? null
  }

  async findByBatchId(batchId: string, tenantId: string): Promise<ProfileChangeRequest[]> {
    return (await this.db
      .select()
      .from(profileChangeRequest)
      .where(
        and(eq(profileChangeRequest.batchId, batchId), eq(profileChangeRequest.tenantId, tenantId)),
      )) as ProfileChangeRequest[]
  }

  async findByEmploymentId(
    employmentId: string,
    tenantId: string,
    status?: ChangeRequestStatus,
  ): Promise<ProfileChangeRequest[]> {
    const conditions = [
      eq(profileChangeRequest.employmentId, employmentId),
      eq(profileChangeRequest.tenantId, tenantId),
    ]
    if (status) {
      conditions.push(eq(profileChangeRequest.status, status))
    }
    return (await this.db
      .select()
      .from(profileChangeRequest)
      .where(and(...conditions))) as ProfileChangeRequest[]
  }

  async findPendingByFieldPath(
    employmentId: string,
    fieldPath: string,
    tenantId: string,
  ): Promise<ProfileChangeRequest | null> {
    const rows = await this.db
      .select()
      .from(profileChangeRequest)
      .where(
        and(
          eq(profileChangeRequest.employmentId, employmentId),
          eq(profileChangeRequest.fieldPath, fieldPath),
          eq(profileChangeRequest.tenantId, tenantId),
          eq(profileChangeRequest.status, 'pending'),
        ),
      )
      .limit(1)
    return (rows[0] as ProfileChangeRequest | undefined) ?? null
  }

  async findScheduledBeforeDate(
    tenantId: string,
    beforeDate: Date,
  ): Promise<ProfileChangeRequest[]> {
    return (await this.db
      .select()
      .from(profileChangeRequest)
      .where(
        and(
          eq(profileChangeRequest.tenantId, tenantId),
          eq(profileChangeRequest.status, 'scheduled'),
          lte(profileChangeRequest.effectiveDate, beforeDate),
        ),
      )) as ProfileChangeRequest[]
  }

  async insertMany(
    data: Omit<ProfileChangeRequest, 'id' | 'createdAt'>[],
  ): Promise<ProfileChangeRequest[]> {
    return (await this.db
      .insert(profileChangeRequest)
      .values(data as Record<string, unknown>[])
      .returning()) as ProfileChangeRequest[]
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: ChangeRequestStatus,
    reviewedBy?: string,
    reviewNote?: string,
  ): Promise<void> {
    await this.db
      .update(profileChangeRequest)
      .set({
        status,
        reviewedBy: reviewedBy ?? null,
        reviewedAt: reviewedBy ? new Date() : null,
        reviewNote: reviewNote ?? null,
      } as Record<string, unknown>)
      .where(and(eq(profileChangeRequest.id, id), eq(profileChangeRequest.tenantId, tenantId)))
  }

  async updateStatusByBatchId(
    batchId: string,
    tenantId: string,
    status: ChangeRequestStatus,
    reviewedBy: string,
    reviewNote?: string,
  ): Promise<void> {
    await this.db
      .update(profileChangeRequest)
      .set({
        status,
        reviewedBy,
        reviewedAt: new Date(),
        reviewNote: reviewNote ?? null,
      } as Record<string, unknown>)
      .where(
        and(
          eq(profileChangeRequest.batchId, batchId),
          eq(profileChangeRequest.tenantId, tenantId),
          eq(profileChangeRequest.status, 'pending'),
        ),
      )
  }
}
```

- [ ] **Step 5: Run build and commit**

```bash
bun run --filter @future/db build
git add apps/api/src/modules/people/domain/entities/profile-change-request* \
  apps/api/src/modules/people/domain/repositories/profile-change-request* \
  apps/api/src/modules/people/infrastructure/schema/change-requests.schema.ts \
  apps/api/src/modules/people/infrastructure/repositories/drizzle-profile-change-request*
git commit -m "feat(people): add enhanced profile change request schema with batch + effective dating"
```

---

## Task 2: RequestProfileChanges Command + Handler + Test

**Files:**

- Create: command, handler, spec

- [ ] **Step 1: Write command class**

```typescript
// apps/api/src/modules/people/application/commands/request-profile-changes.command.ts

export interface ProfileChangeItem {
  fieldPath: string
  oldValue: unknown | null
  newValue: unknown
  effectiveDate?: Date | null
}

export class RequestProfileChangesCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly changes: ProfileChangeItem[],
    readonly requestedBy: string,
  ) {}
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// apps/api/src/modules/people/application/commands/request-profile-changes.handler.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RequestProfileChangesCommand } from './request-profile-changes.command'
import { RequestProfileChangesHandler } from './request-profile-changes.handler'
import type { IProfileChangeRequestRepository } from '../../domain/repositories/profile-change-request.repository'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { EditPolicyService } from '../services/edit-policy.service'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000002'
const ACTOR_ID = '01900000-0000-7000-8000-000000000003'

describe('RequestProfileChangesHandler', () => {
  let handler: RequestProfileChangesHandler
  let changeRepo: IProfileChangeRequestRepository
  let employmentRepo: IEmploymentRepository
  let editPolicyService: EditPolicyService

  beforeEach(() => {
    changeRepo = {
      findById: vi.fn(),
      findByBatchId: vi.fn(),
      findByEmploymentId: vi.fn(),
      findPendingByFieldPath: vi.fn(),
      findScheduledBeforeDate: vi.fn(),
      insertMany: vi.fn(),
      updateStatus: vi.fn(),
      updateStatusByBatchId: vi.fn(),
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
    editPolicyService = {
      resolveEditMode: vi.fn(),
    } as any
    handler = new RequestProfileChangesHandler(changeRepo, employmentRepo, editPolicyService)
  })

  it('creates self-service changes as immediately applied', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
    } as any)
    vi.mocked(editPolicyService.resolveEditMode).mockResolvedValue({
      editMode: 'self_service',
      requiresApproval: false,
      canEdit: true,
    })
    vi.mocked(changeRepo.findPendingByFieldPath).mockResolvedValue(null)
    vi.mocked(changeRepo.insertMany).mockResolvedValue([
      {
        id: 'cr-1',
        tenantId: TENANT_ID,
        employmentId: EMPLOYMENT_ID,
        batchId: expect.any(String),
        fieldPath: 'person_profile.preferred_name',
        oldValue: 'Tom',
        newValue: 'Tommy',
        effectiveDate: null,
        status: 'applied',
        requestedBy: ACTOR_ID,
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
        decisionCaseId: null,
        createdAt: new Date(),
      },
    ])

    const result = await handler.execute(
      new RequestProfileChangesCommand(
        TENANT_ID,
        EMPLOYMENT_ID,
        [{ fieldPath: 'person_profile.preferred_name', oldValue: 'Tom', newValue: 'Tommy' }],
        ACTOR_ID,
      ),
    )

    expect(changeRepo.insertMany).toHaveBeenCalledWith([
      expect.objectContaining({
        status: 'applied',
        fieldPath: 'person_profile.preferred_name',
      }),
    ])
  })

  it('creates approval-required changes as pending', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
    } as any)
    vi.mocked(editPolicyService.resolveEditMode).mockResolvedValue({
      editMode: 'hr_approval',
      requiresApproval: true,
      canEdit: true,
    })
    vi.mocked(changeRepo.findPendingByFieldPath).mockResolvedValue(null)
    vi.mocked(changeRepo.insertMany).mockResolvedValue([
      {
        id: 'cr-1',
        status: 'pending',
      } as any,
    ])

    await handler.execute(
      new RequestProfileChangesCommand(
        TENANT_ID,
        EMPLOYMENT_ID,
        [
          {
            fieldPath: 'employment_detail.bank_account_number',
            oldValue: '1234',
            newValue: '5678',
          },
        ],
        ACTOR_ID,
      ),
    )

    expect(changeRepo.insertMany).toHaveBeenCalledWith([
      expect.objectContaining({ status: 'pending' }),
    ])
  })

  it('supersedes existing pending request for same field', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
    } as any)
    vi.mocked(editPolicyService.resolveEditMode).mockResolvedValue({
      editMode: 'hr_approval',
      requiresApproval: true,
      canEdit: true,
    })
    vi.mocked(changeRepo.findPendingByFieldPath).mockResolvedValue({
      id: 'old-cr',
      status: 'pending',
    } as any)
    vi.mocked(changeRepo.insertMany).mockResolvedValue([{ id: 'new-cr' } as any])

    await handler.execute(
      new RequestProfileChangesCommand(
        TENANT_ID,
        EMPLOYMENT_ID,
        [
          {
            fieldPath: 'employment_detail.bank_account_number',
            oldValue: '1234',
            newValue: '9999',
          },
        ],
        ACTOR_ID,
      ),
    )

    expect(changeRepo.updateStatus).toHaveBeenCalledWith('old-cr', TENANT_ID, 'superseded')
  })

  it('throws when field edit policy blocks non-HR', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
    } as any)
    vi.mocked(editPolicyService.resolveEditMode).mockResolvedValue({
      editMode: 'hr_only',
      requiresApproval: false,
      canEdit: false,
    })

    await expect(
      handler.execute(
        new RequestProfileChangesCommand(
          TENANT_ID,
          EMPLOYMENT_ID,
          [{ fieldPath: 'employment.employment_type', oldValue: 'permanent', newValue: 'intern' }],
          ACTOR_ID,
        ),
      ),
    ).rejects.toThrow()
  })

  it('creates future-dated changes as scheduled after approval', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
    } as any)
    vi.mocked(editPolicyService.resolveEditMode).mockResolvedValue({
      editMode: 'self_service',
      requiresApproval: false,
      canEdit: true,
    })
    vi.mocked(changeRepo.findPendingByFieldPath).mockResolvedValue(null)
    vi.mocked(changeRepo.insertMany).mockResolvedValue([
      {
        id: 'cr-1',
        status: 'scheduled',
      } as any,
    ])

    await handler.execute(
      new RequestProfileChangesCommand(
        TENANT_ID,
        EMPLOYMENT_ID,
        [
          {
            fieldPath: 'person_profile.preferred_name',
            oldValue: 'Tom',
            newValue: 'Tommy',
            effectiveDate: new Date('2026-07-01'),
          },
        ],
        ACTOR_ID,
      ),
    )

    expect(changeRepo.insertMany).toHaveBeenCalledWith([
      expect.objectContaining({
        status: 'scheduled',
        effectiveDate: new Date('2026-07-01'),
      }),
    ])
  })
})
```

- [ ] **Step 3: Implement handler**

```typescript
// apps/api/src/modules/people/application/commands/request-profile-changes.handler.ts

import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { randomUUID } from 'crypto'
import { EmploymentNotFoundException } from '../../domain/exceptions/people.exceptions'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import {
  PROFILE_CHANGE_REQUEST_REPOSITORY,
  type IProfileChangeRequestRepository,
} from '../../domain/repositories/profile-change-request.repository'
import type { ChangeRequestStatus } from '../../domain/entities/profile-change-request.entity'
import { EditPolicyService } from '../services/edit-policy.service'
import {
  RequestProfileChangesCommand,
  type ProfileChangeItem,
} from './request-profile-changes.command'

@CommandHandler(RequestProfileChangesCommand)
export class RequestProfileChangesHandler implements ICommandHandler<RequestProfileChangesCommand> {
  constructor(
    @Inject(PROFILE_CHANGE_REQUEST_REPOSITORY)
    private readonly changeRepo: IProfileChangeRequestRepository,
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    private readonly editPolicyService: EditPolicyService,
  ) {}

  async execute(command: RequestProfileChangesCommand): Promise<void> {
    const employment = await this.employmentRepo.findById(command.employmentId, command.tenantId)
    if (!employment) {
      throw new EmploymentNotFoundException(command.employmentId)
    }

    const batchId = randomUUID()
    const rows: Array<{
      tenantId: string
      employmentId: string
      batchId: string
      fieldPath: string
      oldValue: unknown
      newValue: unknown
      effectiveDate: Date | null
      status: ChangeRequestStatus
      requestedBy: string
      reviewedBy: string | null
      reviewedAt: Date | null
      reviewNote: string | null
      decisionCaseId: string | null
    }> = []

    for (const change of command.changes) {
      // Resolve edit policy for this field
      const policy = await this.editPolicyService.resolveEditMode(
        command.tenantId,
        change.fieldPath,
        false, // caller is not HR — HR bypasses via separate endpoint
      )

      if (!policy.canEdit) {
        throw new Error(
          `Field ${change.fieldPath} is ${policy.editMode} — cannot be edited by this user`,
        )
      }

      // Supersede existing pending request for same field
      const existing = await this.changeRepo.findPendingByFieldPath(
        command.employmentId,
        change.fieldPath,
        command.tenantId,
      )
      if (existing) {
        await this.changeRepo.updateStatus(existing.id, command.tenantId, 'superseded')
      }

      // Determine initial status
      let status: ChangeRequestStatus
      if (change.effectiveDate && change.effectiveDate > new Date()) {
        status = 'scheduled'
      } else if (policy.requiresApproval) {
        status = 'pending'
      } else {
        status = 'applied'
      }

      rows.push({
        tenantId: command.tenantId,
        employmentId: command.employmentId,
        batchId,
        fieldPath: change.fieldPath,
        oldValue: change.oldValue,
        newValue: change.newValue,
        effectiveDate: change.effectiveDate ?? null,
        status,
        requestedBy: command.requestedBy,
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
        decisionCaseId: null,
      })
    }

    await this.changeRepo.insertMany(rows)
  }
}
```

- [ ] **Step 4: Run tests and commit**

```bash
cd apps/api && bunx vitest run src/modules/people/application/commands/request-profile-changes.handler.spec.ts
git add apps/api/src/modules/people/application/commands/request-profile-changes*
git commit -m "feat(people): add RequestProfileChanges command with edit policy integration"
```

---

## Task 3: BatchApproveChanges Command + Handler + Test

**Files:**

- Create: command, handler, spec

- [ ] **Step 1: Write command class**

```typescript
// apps/api/src/modules/people/application/commands/batch-approve-changes.command.ts

export class BatchApproveChangesCommand {
  constructor(
    readonly tenantId: string,
    readonly batchId: string,
    readonly approvedBy: string,
    readonly note?: string | null,
  ) {}
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// apps/api/src/modules/people/application/commands/batch-approve-changes.handler.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BatchApproveChangesCommand } from './batch-approve-changes.command'
import { BatchApproveChangesHandler } from './batch-approve-changes.handler'
import type { IProfileChangeRequestRepository } from '../../domain/repositories/profile-change-request.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const BATCH_ID = '01900000-0000-7000-8000-000000000002'
const ACTOR_ID = '01900000-0000-7000-8000-000000000003'

describe('BatchApproveChangesHandler', () => {
  let handler: BatchApproveChangesHandler
  let changeRepo: IProfileChangeRequestRepository
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    changeRepo = {
      findById: vi.fn(),
      findByBatchId: vi.fn(),
      findByEmploymentId: vi.fn(),
      findPendingByFieldPath: vi.fn(),
      findScheduledBeforeDate: vi.fn(),
      insertMany: vi.fn(),
      updateStatus: vi.fn(),
      updateStatusByBatchId: vi.fn(),
    }
    eventBus = { publish: vi.fn() }
    handler = new BatchApproveChangesHandler(changeRepo, eventBus as any)
  })

  it('approves all pending changes in batch atomically', async () => {
    vi.mocked(changeRepo.findByBatchId).mockResolvedValue([
      {
        id: 'cr-1',
        status: 'pending',
        fieldPath: 'person_profile.family_name',
        effectiveDate: null,
        employmentId: 'emp-1',
        oldValue: 'Old',
        newValue: 'New',
      } as any,
      {
        id: 'cr-2',
        status: 'pending',
        fieldPath: 'person_profile.given_name',
        effectiveDate: null,
        employmentId: 'emp-1',
        oldValue: 'OldGiven',
        newValue: 'NewGiven',
      } as any,
    ])

    await handler.execute(
      new BatchApproveChangesCommand(TENANT_ID, BATCH_ID, ACTOR_ID, 'Looks good'),
    )

    expect(changeRepo.updateStatusByBatchId).toHaveBeenCalledWith(
      BATCH_ID,
      TENANT_ID,
      'approved',
      ACTOR_ID,
      'Looks good',
    )
    expect(eventBus.publish).toHaveBeenCalled()
  })

  it('throws when batch has no pending changes', async () => {
    vi.mocked(changeRepo.findByBatchId).mockResolvedValue([
      { id: 'cr-1', status: 'applied' } as any,
    ])

    await expect(
      handler.execute(new BatchApproveChangesCommand(TENANT_ID, BATCH_ID, ACTOR_ID)),
    ).rejects.toThrow()
  })

  it('sets future-dated changes to scheduled instead of applied', async () => {
    vi.mocked(changeRepo.findByBatchId).mockResolvedValue([
      {
        id: 'cr-1',
        status: 'pending',
        fieldPath: 'person_profile.preferred_name',
        effectiveDate: new Date('2026-07-01'),
        employmentId: 'emp-1',
        oldValue: 'A',
        newValue: 'B',
      } as any,
    ])

    await handler.execute(new BatchApproveChangesCommand(TENANT_ID, BATCH_ID, ACTOR_ID))

    // Future-dated: approved then scheduled
    expect(changeRepo.updateStatusByBatchId).toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Implement handler** — fetches batch, validates all pending, approves atomically, emits `ProfileChangeAppliedEvent` for immediate changes, sets `scheduled` for future-dated.

- [ ] **Step 4: Run tests and commit**

```bash
cd apps/api && bunx vitest run src/modules/people/application/commands/batch-approve-changes.handler.spec.ts
git add apps/api/src/modules/people/application/commands/batch-approve-changes*
git commit -m "feat(people): add BatchApproveChanges command — atomic batch approval"
```

---

## Task 4: BatchRejectChanges Command + Handler + Test

**Files:**

- Create: command, handler, spec

- [ ] **Step 1: Write command class**

```typescript
// apps/api/src/modules/people/application/commands/batch-reject-changes.command.ts

export class BatchRejectChangesCommand {
  constructor(
    readonly tenantId: string,
    readonly batchId: string,
    readonly rejectedBy: string,
    readonly note?: string | null,
  ) {}
}
```

- [ ] **Step 2: Write test** — validates batch has pending changes, rejects all atomically.

- [ ] **Step 3: Implement handler**

- [ ] **Step 4: Run tests and commit**

```bash
cd apps/api && bunx vitest run src/modules/people/application/commands/batch-reject-changes.handler.spec.ts
git add apps/api/src/modules/people/application/commands/batch-reject-changes*
git commit -m "feat(people): add BatchRejectChanges command"
```

---

## Task 5: pg-boss Job — Apply Scheduled Changes

**Files:**

- Create: `apps/api/src/modules/people/infrastructure/jobs/apply-scheduled-changes.job.ts`

- [ ] **Step 1: Implement the job**

```typescript
// apps/api/src/modules/people/infrastructure/jobs/apply-scheduled-changes.job.ts

import { Inject, Injectable } from '@nestjs/common'
import { EventBus } from '@nestjs/cqrs'
import {
  PROFILE_CHANGE_REQUEST_REPOSITORY,
  type IProfileChangeRequestRepository,
} from '../../domain/repositories/profile-change-request.repository'

@Injectable()
export class ApplyScheduledChangesJob {
  constructor(
    @Inject(PROFILE_CHANGE_REQUEST_REPOSITORY)
    private readonly changeRepo: IProfileChangeRequestRepository,
    private readonly eventBus: EventBus,
  ) {}

  /**
   * Runs daily. Finds all scheduled changes with effective_date <= today,
   * applies them, and emits ProfileChangeAppliedEvent.
   */
  async handle(tenantId: string): Promise<void> {
    const today = new Date()
    const scheduled = await this.changeRepo.findScheduledBeforeDate(tenantId, today)

    for (const change of scheduled) {
      // Apply the change — actual field update happens via event handler
      await this.changeRepo.updateStatus(
        change.id,
        tenantId,
        'applied',
        undefined,
        'Auto-applied by scheduled job',
      )

      this.eventBus.publish({
        type: 'ProfileChangeAppliedEvent',
        tenantId,
        employmentId: change.employmentId,
        fieldPath: change.fieldPath,
        oldValue: change.oldValue,
        newValue: change.newValue,
        effectiveDate: change.effectiveDate,
      })
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/people/infrastructure/jobs/apply-scheduled-changes.job.ts
git commit -m "feat(people): add apply-scheduled-changes pg-boss job"
```

---

## Task 6: Employee Document Schema + Entity + Repository + Drizzle Repo

**Files:**

- Create: entity, repository, schema, Drizzle repo

- [ ] **Step 1: Create entity**

```typescript
// apps/api/src/modules/people/domain/entities/employee-document.entity.ts

export type DocumentCategory =
  | 'identity'
  | 'contract'
  | 'tax'
  | 'insurance'
  | 'certificate'
  | 'visa'
  | 'policy_ack'
  | 'health_check'
  | 'background_check'
  | 'other'

export type DocumentStatus = 'active' | 'archived' | 'pending_deletion'

export interface EmployeeDocument {
  id: string
  tenantId: string
  employmentId: string
  documentId: string
  category: DocumentCategory
  subcategory: string | null
  title: string
  expiryDate: Date | null
  isConfidential: boolean
  requiresAcknowledgment: boolean
  acknowledgedAt: Date | null
  acknowledgedBy: string | null
  version: number
  parentDocumentId: string | null
  status: DocumentStatus
  uploadedBy: string
  createdAt: Date
}
```

- [ ] **Step 2: Create repository interface**

```typescript
// apps/api/src/modules/people/domain/repositories/employee-document.repository.ts

import type { DocumentStatus, EmployeeDocument } from '../entities/employee-document.entity'

export const EMPLOYEE_DOCUMENT_REPOSITORY = Symbol('IEmployeeDocumentRepository')

export interface IEmployeeDocumentRepository {
  findById(id: string, tenantId: string): Promise<EmployeeDocument | null>
  findByEmploymentId(
    employmentId: string,
    tenantId: string,
    status?: DocumentStatus,
  ): Promise<EmployeeDocument[]>
  findExpiringBefore(tenantId: string, beforeDate: Date): Promise<EmployeeDocument[]>
  findByCategory(
    employmentId: string,
    category: string,
    tenantId: string,
  ): Promise<EmployeeDocument[]>
  insert(data: Omit<EmployeeDocument, 'id' | 'createdAt'>): Promise<EmployeeDocument>
  update(
    id: string,
    tenantId: string,
    data: Partial<Omit<EmployeeDocument, 'id' | 'tenantId' | 'employmentId' | 'createdAt'>>,
  ): Promise<EmployeeDocument>
}
```

- [ ] **Step 3: Add Drizzle schema**

```typescript
// apps/api/src/modules/people/infrastructure/schema/documents.schema.ts

import {
  pgSchema,
  uuid,
  text,
  date,
  timestamp,
  boolean,
  integer,
  jsonb,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'
import { peopleSchema } from './people.schema'

export const employeeDocument = peopleSchema.table('employee_document', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  employmentId: uuid('employment_id').notNull(),
  documentId: uuid('document_id').notNull(),
  category: text('category', {
    enum: [
      'identity',
      'contract',
      'tax',
      'insurance',
      'certificate',
      'visa',
      'policy_ack',
      'health_check',
      'background_check',
      'other',
    ],
  }).notNull(),
  subcategory: text('subcategory'),
  title: text('title').notNull(),
  expiryDate: date('expiry_date', { mode: 'date' }),
  isConfidential: boolean('is_confidential').notNull(),
  requiresAcknowledgment: boolean('requires_acknowledgment').notNull(),
  acknowledgedAt: timestamp('acknowledged_at'),
  acknowledgedBy: uuid('acknowledged_by'),
  version: integer('version').notNull(),
  parentDocumentId: uuid('parent_document_id'),
  status: text('status', { enum: ['active', 'archived', 'pending_deletion'] }).notNull(),
  uploadedBy: uuid('uploaded_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const documentRequirement = peopleSchema.table('document_requirement', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  countryCode: text('country_code').notNull(),
  employmentType: text('employment_type'),
  category: text('category').notNull(),
  title: text('title').notNull(),
  isRequired: boolean('is_required').notNull(),
  deadlineDays: integer('deadline_days'),
  sortOrder: integer('sort_order').notNull(),
})

export const completenessRule = peopleSchema.table('completeness_rule', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  fieldPath: text('field_path').notNull(),
  weight: integer('weight').notNull(),
  isRequired: boolean('is_required').notNull(),
  countryCode: text('country_code'),
  employmentType: text('employment_type'),
  deadlineDays: integer('deadline_days'),
  label: text('label').notNull(),
  section: text('section').notNull(),
  sortOrder: integer('sort_order').notNull(),
})
```

- [ ] **Step 4: Implement Drizzle repo and commit**

```bash
bun run --filter @future/db build
git add apps/api/src/modules/people/domain/entities/employee-document* \
  apps/api/src/modules/people/domain/repositories/employee-document* \
  apps/api/src/modules/people/infrastructure/schema/documents.schema.ts \
  apps/api/src/modules/people/infrastructure/repositories/drizzle-employee-document*
git commit -m "feat(people): add employee document schema, entity, repository"
```

---

## Task 7: Document Requirement Schema + Entity + Repository + Drizzle Repo

**Files:**

- Create: entity, repository, Drizzle repo (schema already in Task 6)

- [ ] **Step 1: Create entity**

```typescript
// apps/api/src/modules/people/domain/entities/document-requirement.entity.ts

export interface DocumentRequirement {
  id: string
  tenantId: string
  countryCode: string
  employmentType: string | null
  category: string
  title: string
  isRequired: boolean
  deadlineDays: number | null
  sortOrder: number
}
```

- [ ] **Step 2: Create repository interface**

```typescript
// apps/api/src/modules/people/domain/repositories/document-requirement.repository.ts

import type { DocumentRequirement } from '../entities/document-requirement.entity'

export const DOCUMENT_REQUIREMENT_REPOSITORY = Symbol('IDocumentRequirementRepository')

export interface IDocumentRequirementRepository {
  findByCountryAndType(
    countryCode: string,
    employmentType: string | null,
    tenantId: string,
  ): Promise<DocumentRequirement[]>
  listByTenant(tenantId: string): Promise<DocumentRequirement[]>
  insertMany(data: Omit<DocumentRequirement, 'id'>[]): Promise<DocumentRequirement[]>
  update(
    id: string,
    tenantId: string,
    data: Partial<Omit<DocumentRequirement, 'id' | 'tenantId'>>,
  ): Promise<DocumentRequirement>
}
```

- [ ] **Step 3: Implement Drizzle repo and commit**

```bash
git add apps/api/src/modules/people/domain/entities/document-requirement* \
  apps/api/src/modules/people/domain/repositories/document-requirement* \
  apps/api/src/modules/people/infrastructure/repositories/drizzle-document-requirement*
git commit -m "feat(people): add document requirement entity and repository"
```

---

## Task 8: UploadEmployeeDocument Command + Handler + Test

**Files:**

- Create: command, handler, spec

- [ ] **Step 1: Write command class**

```typescript
// apps/api/src/modules/people/application/commands/upload-employee-document.command.ts

import type { DocumentCategory } from '../../domain/entities/employee-document.entity'

export class UploadEmployeeDocumentCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly documentId: string,
    readonly category: DocumentCategory,
    readonly title: string,
    readonly uploadedBy: string,
    readonly subcategory?: string | null,
    readonly expiryDate?: Date | null,
    readonly isConfidential?: boolean,
    readonly requiresAcknowledgment?: boolean,
    readonly parentDocumentId?: string | null,
  ) {}
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// apps/api/src/modules/people/application/commands/upload-employee-document.handler.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UploadEmployeeDocumentCommand } from './upload-employee-document.command'
import { UploadEmployeeDocumentHandler } from './upload-employee-document.handler'
import type { IEmployeeDocumentRepository } from '../../domain/repositories/employee-document.repository'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000002'
const DOCUMENT_ID = '01900000-0000-7000-8000-000000000003'
const ACTOR_ID = '01900000-0000-7000-8000-000000000004'
const EMPLOYEE_DOC_ID = '01900000-0000-7000-8000-000000000005'

describe('UploadEmployeeDocumentHandler', () => {
  let handler: UploadEmployeeDocumentHandler
  let docRepo: IEmployeeDocumentRepository
  let employmentRepo: IEmploymentRepository

  beforeEach(() => {
    docRepo = {
      findById: vi.fn(),
      findByEmploymentId: vi.fn(),
      findExpiringBefore: vi.fn(),
      findByCategory: vi.fn(),
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
    handler = new UploadEmployeeDocumentHandler(docRepo, employmentRepo)
  })

  it('creates document metadata for employment', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
    } as any)
    vi.mocked(docRepo.insert).mockResolvedValue({
      id: EMPLOYEE_DOC_ID,
      tenantId: TENANT_ID,
      employmentId: EMPLOYMENT_ID,
      documentId: DOCUMENT_ID,
      category: 'identity',
      title: 'Citizen ID',
      version: 1,
      status: 'active',
    } as any)

    const result = await handler.execute(
      new UploadEmployeeDocumentCommand(
        TENANT_ID,
        EMPLOYMENT_ID,
        DOCUMENT_ID,
        'identity',
        'Citizen ID',
        ACTOR_ID,
      ),
    )

    expect(result.id).toBe(EMPLOYEE_DOC_ID)
    expect(docRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        employmentId: EMPLOYMENT_ID,
        documentId: DOCUMENT_ID,
        category: 'identity',
        version: 1,
        status: 'active',
      }),
    )
  })

  it('increments version when parent document provided', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({ id: EMPLOYMENT_ID } as any)
    vi.mocked(docRepo.findById).mockResolvedValue({
      id: 'parent-doc',
      version: 2,
    } as any)
    vi.mocked(docRepo.update).mockResolvedValue({} as any)
    vi.mocked(docRepo.insert).mockResolvedValue({ id: EMPLOYEE_DOC_ID, version: 3 } as any)

    await handler.execute(
      new UploadEmployeeDocumentCommand(
        TENANT_ID,
        EMPLOYMENT_ID,
        DOCUMENT_ID,
        'identity',
        'Updated ID',
        ACTOR_ID,
        null,
        null,
        false,
        false,
        'parent-doc',
      ),
    )

    expect(docRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ version: 3, parentDocumentId: 'parent-doc' }),
    )
    expect(docRepo.update).toHaveBeenCalledWith(
      'parent-doc',
      TENANT_ID,
      expect.objectContaining({ status: 'archived' }),
    )
  })
})
```

- [ ] **Step 3: Implement handler** — validates employment exists, handles versioning with parent archival, creates metadata.

- [ ] **Step 4: Run tests and commit**

```bash
cd apps/api && bunx vitest run src/modules/people/application/commands/upload-employee-document.handler.spec.ts
git add apps/api/src/modules/people/application/commands/upload-employee-document*
git commit -m "feat(people): add UploadEmployeeDocument command with versioning"
```

---

## Task 9: ListExpiringDocuments Query + Handler

**Files:**

- Create: query + handler

- [ ] **Step 1: Write query and handler**

```typescript
// apps/api/src/modules/people/application/queries/list-expiring-documents.query.ts

export class ListExpiringDocumentsQuery {
  constructor(
    readonly tenantId: string,
    readonly daysAhead: number,
  ) {}
}
```

```typescript
// apps/api/src/modules/people/application/queries/list-expiring-documents.handler.ts

import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  EMPLOYEE_DOCUMENT_REPOSITORY,
  type IEmployeeDocumentRepository,
} from '../../domain/repositories/employee-document.repository'
import type { EmployeeDocument } from '../../domain/entities/employee-document.entity'
import { ListExpiringDocumentsQuery } from './list-expiring-documents.query'

@QueryHandler(ListExpiringDocumentsQuery)
export class ListExpiringDocumentsHandler implements IQueryHandler<
  ListExpiringDocumentsQuery,
  EmployeeDocument[]
> {
  constructor(
    @Inject(EMPLOYEE_DOCUMENT_REPOSITORY)
    private readonly docRepo: IEmployeeDocumentRepository,
  ) {}

  async execute(query: ListExpiringDocumentsQuery): Promise<EmployeeDocument[]> {
    const beforeDate = new Date()
    beforeDate.setDate(beforeDate.getDate() + query.daysAhead)
    return this.docRepo.findExpiringBefore(query.tenantId, beforeDate)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/people/application/queries/list-expiring-documents*
git commit -m "feat(people): add ListExpiringDocuments query"
```

---

## Task 10: AcknowledgePolicy Command + Handler + Test

**Files:**

- Create: command, handler, spec

- [ ] **Step 1: Write command class**

```typescript
// apps/api/src/modules/people/application/commands/acknowledge-policy.command.ts

export class AcknowledgePolicyCommand {
  constructor(
    readonly tenantId: string,
    readonly employeeDocumentId: string,
    readonly acknowledgedBy: string,
  ) {}
}
```

- [ ] **Step 2: Write test** — validates document exists, requires_acknowledgment is true, not already acknowledged (immutable). Sets acknowledgedAt/acknowledgedBy.

- [ ] **Step 3: Implement handler**

- [ ] **Step 4: Run tests and commit**

```bash
cd apps/api && bunx vitest run src/modules/people/application/commands/acknowledge-policy.handler.spec.ts
git add apps/api/src/modules/people/application/commands/acknowledge-policy*
git commit -m "feat(people): add AcknowledgePolicy command — immutable acknowledgment"
```

---

## Task 11: pg-boss Job — Check Document Expiry

**Files:**

- Create: `apps/api/src/modules/people/infrastructure/jobs/check-document-expiry.job.ts`

- [ ] **Step 1: Implement the job**

```typescript
// apps/api/src/modules/people/infrastructure/jobs/check-document-expiry.job.ts

import { Inject, Injectable } from '@nestjs/common'
import { EventBus } from '@nestjs/cqrs'
import {
  EMPLOYEE_DOCUMENT_REPOSITORY,
  type IEmployeeDocumentRepository,
} from '../../domain/repositories/employee-document.repository'

@Injectable()
export class CheckDocumentExpiryJob {
  constructor(
    @Inject(EMPLOYEE_DOCUMENT_REPOSITORY)
    private readonly docRepo: IEmployeeDocumentRepository,
    private readonly eventBus: EventBus,
  ) {}

  /**
   * Runs weekly. Emits DocumentExpiringEvent at 30/14/7 day marks.
   */
  async handle(tenantId: string): Promise<void> {
    const today = new Date()
    const thirtyDaysOut = new Date(today)
    thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30)

    const documents = await this.docRepo.findExpiringBefore(tenantId, thirtyDaysOut)

    for (const doc of documents) {
      if (!doc.expiryDate || doc.status !== 'active') continue

      const daysUntilExpiry = Math.ceil(
        (doc.expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      )

      if ([30, 14, 7].includes(daysUntilExpiry) || daysUntilExpiry <= 0) {
        this.eventBus.publish({
          type: 'DocumentExpiringEvent',
          tenantId,
          employmentId: doc.employmentId,
          employeeDocumentId: doc.id,
          title: doc.title,
          category: doc.category,
          expiryDate: doc.expiryDate,
          daysRemaining: Math.max(0, daysUntilExpiry),
        })
      }
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/people/infrastructure/jobs/check-document-expiry.job.ts
git commit -m "feat(people): add check-document-expiry pg-boss job (weekly)"
```

---

## Task 12: Completeness Rule Schema + Entity + Repository

**Files:**

- Create: entity, repository, Drizzle repo (schema already in Task 6)

- [ ] **Step 1: Create entity**

```typescript
// apps/api/src/modules/people/domain/entities/completeness-rule.entity.ts

export interface CompletenessRule {
  id: string
  tenantId: string
  fieldPath: string
  weight: number
  isRequired: boolean
  countryCode: string | null
  employmentType: string | null
  deadlineDays: number | null
  label: string
  section: string
  sortOrder: number
}
```

- [ ] **Step 2: Create repository interface**

```typescript
// apps/api/src/modules/people/domain/repositories/completeness-rule.repository.ts

import type { CompletenessRule } from '../entities/completeness-rule.entity'

export const COMPLETENESS_RULE_REPOSITORY = Symbol('ICompletenessRuleRepository')

export interface ICompletenessRuleRepository {
  findApplicable(
    tenantId: string,
    countryCode: string,
    employmentType: string,
  ): Promise<CompletenessRule[]>
  listByTenant(tenantId: string): Promise<CompletenessRule[]>
  insertMany(data: Omit<CompletenessRule, 'id'>[]): Promise<CompletenessRule[]>
  update(
    id: string,
    tenantId: string,
    data: Partial<Omit<CompletenessRule, 'id' | 'tenantId'>>,
  ): Promise<CompletenessRule>
}
```

- [ ] **Step 3: Implement Drizzle repo** — `findApplicable` returns rules where `countryCode IS NULL OR countryCode = :cc` AND `employmentType IS NULL OR employmentType = :et`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/people/domain/entities/completeness-rule* \
  apps/api/src/modules/people/domain/repositories/completeness-rule* \
  apps/api/src/modules/people/infrastructure/repositories/drizzle-completeness-rule*
git commit -m "feat(people): add completeness rule entity and repository"
```

---

## Task 13: GetProfileCompleteness Query + Handler + Test

**Files:**

- Create: query, handler, spec

- [ ] **Step 1: Write query class**

```typescript
// apps/api/src/modules/people/application/queries/get-profile-completeness.query.ts

export class GetProfileCompletenessQuery {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
  ) {}
}

export interface CompletenessResult {
  score: number
  filled: number
  total: number
  missing: Array<{
    fieldPath: string
    label: string
    section: string
    isRequired: boolean
    deadlineDays: number | null
  }>
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// apps/api/src/modules/people/application/queries/get-profile-completeness.handler.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetProfileCompletenessQuery } from './get-profile-completeness.query'
import { GetProfileCompletenessHandler } from './get-profile-completeness.handler'
import type { ICompletenessRuleRepository } from '../../domain/repositories/completeness-rule.repository'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { IPersonProfileRepository } from '../../domain/repositories/person-profile.repository'
import type { IEmploymentDetailRepository } from '../../domain/repositories/employment-detail.repository'
import type { IEmployeeDocumentRepository } from '../../domain/repositories/employee-document.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000002'
const PROFILE_ID = '01900000-0000-7000-8000-000000000003'

describe('GetProfileCompletenessHandler', () => {
  let handler: GetProfileCompletenessHandler
  let ruleRepo: ICompletenessRuleRepository
  let employmentRepo: IEmploymentRepository
  let profileRepo: IPersonProfileRepository
  let detailRepo: IEmploymentDetailRepository
  let docRepo: IEmployeeDocumentRepository

  beforeEach(() => {
    ruleRepo = {
      findApplicable: vi.fn(),
      listByTenant: vi.fn(),
      insertMany: vi.fn(),
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
    profileRepo = {
      findById: vi.fn(),
      findByActorId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    detailRepo = {
      findByEmploymentId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    docRepo = {
      findById: vi.fn(),
      findByEmploymentId: vi.fn(),
      findExpiringBefore: vi.fn(),
      findByCategory: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    handler = new GetProfileCompletenessHandler(
      ruleRepo,
      employmentRepo,
      profileRepo,
      detailRepo,
      docRepo,
    )
  })

  it('computes 100% score when all fields filled', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      personProfileId: PROFILE_ID,
      countryCode: 'VN',
      employmentType: 'permanent',
    } as any)
    vi.mocked(profileRepo.findById).mockResolvedValue({
      id: PROFILE_ID,
      dateOfBirth: new Date('1990-01-01'),
    } as any)
    vi.mocked(detailRepo.findByEmploymentId).mockResolvedValue({
      nationalId: '012345678901',
    } as any)
    vi.mocked(docRepo.findByCategory).mockResolvedValue([{ id: 'doc-1' } as any])
    vi.mocked(ruleRepo.findApplicable).mockResolvedValue([
      {
        id: 'r1',
        tenantId: TENANT_ID,
        fieldPath: 'person_profile.date_of_birth',
        weight: 10,
        isRequired: true,
        countryCode: null,
        employmentType: null,
        deadlineDays: null,
        label: 'Date of Birth',
        section: 'personal',
        sortOrder: 1,
      },
      {
        id: 'r2',
        tenantId: TENANT_ID,
        fieldPath: 'employment_detail.national_id',
        weight: 10,
        isRequired: true,
        countryCode: 'VN',
        employmentType: null,
        deadlineDays: 30,
        label: 'National ID',
        section: 'identity',
        sortOrder: 2,
      },
    ])

    const result = await handler.execute(new GetProfileCompletenessQuery(TENANT_ID, EMPLOYMENT_ID))

    expect(result.score).toBe(100)
    expect(result.filled).toBe(2)
    expect(result.total).toBe(2)
    expect(result.missing).toEqual([])
  })

  it('computes 50% score with one field missing', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      personProfileId: PROFILE_ID,
      countryCode: 'VN',
      employmentType: 'permanent',
    } as any)
    vi.mocked(profileRepo.findById).mockResolvedValue({
      id: PROFILE_ID,
      dateOfBirth: new Date('1990-01-01'),
    } as any)
    vi.mocked(detailRepo.findByEmploymentId).mockResolvedValue({
      nationalId: null,
    } as any)
    vi.mocked(docRepo.findByCategory).mockResolvedValue([])
    vi.mocked(ruleRepo.findApplicable).mockResolvedValue([
      {
        id: 'r1',
        tenantId: TENANT_ID,
        fieldPath: 'person_profile.date_of_birth',
        weight: 10,
        isRequired: true,
        countryCode: null,
        employmentType: null,
        deadlineDays: null,
        label: 'Date of Birth',
        section: 'personal',
        sortOrder: 1,
      },
      {
        id: 'r2',
        tenantId: TENANT_ID,
        fieldPath: 'employment_detail.national_id',
        weight: 10,
        isRequired: true,
        countryCode: 'VN',
        employmentType: null,
        deadlineDays: 30,
        label: 'National ID',
        section: 'identity',
        sortOrder: 2,
      },
    ])

    const result = await handler.execute(new GetProfileCompletenessQuery(TENANT_ID, EMPLOYMENT_ID))

    expect(result.score).toBe(50)
    expect(result.missing).toHaveLength(1)
    expect(result.missing[0].fieldPath).toBe('employment_detail.national_id')
  })
})
```

- [ ] **Step 3: Implement handler** — loads employment, profile, detail, applicable rules. For each rule, resolves field path to check if populated. Computes weighted score.

- [ ] **Step 4: Run tests and commit**

```bash
cd apps/api && bunx vitest run src/modules/people/application/queries/get-profile-completeness.handler.spec.ts
git add apps/api/src/modules/people/application/queries/get-profile-completeness*
git commit -m "feat(people): add GetProfileCompleteness query with weighted scoring"
```

---

## Task 14: ListIncompleteProfiles Query + Handler

**Files:**

- Create: query + handler

- [ ] **Step 1: Implement** — iterates active employments, computes completeness for each, returns profiles below a threshold (default 80%). Used for HR dashboard.

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/people/application/queries/list-incomplete-profiles*
git commit -m "feat(people): add ListIncompleteProfiles query for HR dashboard"
```

---

## Task 15: DuplicateValidationService

**Files:**

- Create: service + spec

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/modules/people/application/services/duplicate-validation.service.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DuplicateValidationService } from './duplicate-validation.service'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { IEmploymentDetailRepository } from '../../domain/repositories/employment-detail.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000002'

describe('DuplicateValidationService', () => {
  let service: DuplicateValidationService
  let employmentRepo: IEmploymentRepository
  let detailRepo: IEmploymentDetailRepository

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
    detailRepo = {
      findByEmploymentId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    service = new DuplicateValidationService(employmentRepo, detailRepo)
  })

  it('returns no warnings when no duplicates', async () => {
    vi.mocked(employmentRepo.listByTenant).mockResolvedValue([])

    const warnings = await service.checkDuplicates(TENANT_ID, EMPLOYMENT_ID, {
      companyEmail: 'unique@test.com',
      nationalId: '012345678901',
    })

    expect(warnings).toEqual([])
  })

  it('returns hard block for duplicate company email', async () => {
    vi.mocked(employmentRepo.listByTenant).mockResolvedValue([
      {
        id: 'other-emp',
        companyEmail: 'john@company.com',
        employmentStatus: 'active',
      } as any,
    ])

    const warnings = await service.checkDuplicates(TENANT_ID, EMPLOYMENT_ID, {
      companyEmail: 'john@company.com',
    })

    expect(warnings).toEqual([
      expect.objectContaining({
        field: 'companyEmail',
        severity: 'error',
        conflictEmploymentId: 'other-emp',
      }),
    ])
  })

  it('returns warning for duplicate national ID (acknowledgeable)', async () => {
    vi.mocked(employmentRepo.listByTenant).mockResolvedValue([
      { id: 'other-emp', employmentStatus: 'active' } as any,
    ])
    vi.mocked(detailRepo.findByEmploymentId).mockResolvedValue({
      nationalId: '012345678901',
    } as any)

    const warnings = await service.checkDuplicates(TENANT_ID, EMPLOYMENT_ID, {
      nationalId: '012345678901',
    })

    expect(warnings).toEqual([
      expect.objectContaining({
        field: 'nationalId',
        severity: 'warning',
      }),
    ])
  })
})
```

- [ ] **Step 2: Implement service** — checks company_email (hard block), national_id, tax_id, social_insurance_id, passport_number, bank_account_number, personal_email, personal_phone (warnings).

- [ ] **Step 3: Run tests and commit**

```bash
cd apps/api && bunx vitest run src/modules/people/application/services/duplicate-validation.service.spec.ts
git add apps/api/src/modules/people/application/services/duplicate-validation*
git commit -m "feat(people): add DuplicateValidationService for employment uniqueness checks"
```

---

## Task 16: pg-boss Job — Completeness Reminder

**Files:**

- Create: `apps/api/src/modules/people/infrastructure/jobs/completeness-reminder.job.ts`

- [ ] **Step 1: Implement the job** — runs weekly, queries active employments, computes completeness for each, emits `ProfileIncompleteEvent` for profiles below threshold and past deadline.

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/people/infrastructure/jobs/completeness-reminder.job.ts
git commit -m "feat(people): add completeness-reminder pg-boss job (weekly)"
```

---

## Task 17: Wire All into people.module.ts + tRPC Procedures

**Files:**

- Modify: `apps/api/src/modules/people/people.module.ts`
- Modify: `apps/api/src/modules/people/interface/trpc/people.router.ts`

- [ ] **Step 1: Add all new providers**

```typescript
// Add to providers array in people.module.ts:

// Change request
{ provide: PROFILE_CHANGE_REQUEST_REPOSITORY, useClass: DrizzleProfileChangeRequestRepository },
RequestProfileChangesHandler,
BatchApproveChangesHandler,
BatchRejectChangesHandler,
ApplyScheduledChangesJob,

// Documents
{ provide: EMPLOYEE_DOCUMENT_REPOSITORY, useClass: DrizzleEmployeeDocumentRepository },
{ provide: DOCUMENT_REQUIREMENT_REPOSITORY, useClass: DrizzleDocumentRequirementRepository },
UploadEmployeeDocumentHandler,
AcknowledgePolicyHandler,
ListExpiringDocumentsHandler,
CheckDocumentExpiryJob,

// Completeness
{ provide: COMPLETENESS_RULE_REPOSITORY, useClass: DrizzleCompletenessRuleRepository },
GetProfileCompletenessHandler,
ListIncompleteProfilesHandler,
CompletenessReminderJob,

// Services
DuplicateValidationService,
```

- [ ] **Step 2: Add tRPC procedures**

```typescript
// Add to people.router.ts:

// Change requests
requestProfileChanges: protectedProcedure
  .input(z.object({
    employmentId: z.string().uuid(),
    changes: z.array(z.object({
      fieldPath: z.string(),
      oldValue: z.unknown().nullable(),
      newValue: z.unknown(),
      effectiveDate: z.date().optional(),
    })),
  }))
  .mutation(({ ctx, input }) =>
    commandBus.execute(new RequestProfileChangesCommand(
      ctx.tenantId, input.employmentId, input.changes, ctx.actorId,
    )),
  ),

batchApproveChanges: protectedProcedure
  .input(z.object({
    batchId: z.string().uuid(),
    note: z.string().optional(),
  }))
  .mutation(({ ctx, input }) =>
    commandBus.execute(new BatchApproveChangesCommand(ctx.tenantId, input.batchId, ctx.actorId, input.note)),
  ),

batchRejectChanges: protectedProcedure
  .input(z.object({
    batchId: z.string().uuid(),
    note: z.string().optional(),
  }))
  .mutation(({ ctx, input }) =>
    commandBus.execute(new BatchRejectChangesCommand(ctx.tenantId, input.batchId, ctx.actorId, input.note)),
  ),

listPendingChanges: protectedProcedure
  .input(z.object({ employmentId: z.string().uuid() }))
  .query(({ ctx, input }) =>
    changeRequestRepo.findByEmploymentId(input.employmentId, ctx.tenantId, 'pending'),
  ),

// Documents
uploadEmployeeDocument: protectedProcedure
  .input(z.object({
    employmentId: z.string().uuid(),
    documentId: z.string().uuid(),
    category: z.enum([
      'identity', 'contract', 'tax', 'insurance', 'certificate',
      'visa', 'policy_ack', 'health_check', 'background_check', 'other',
    ]),
    title: z.string().min(1),
    subcategory: z.string().optional(),
    expiryDate: z.date().optional(),
    isConfidential: z.boolean().default(false),
    requiresAcknowledgment: z.boolean().default(false),
    parentDocumentId: z.string().uuid().optional(),
  }))
  .mutation(({ ctx, input }) =>
    commandBus.execute(new UploadEmployeeDocumentCommand(
      ctx.tenantId, input.employmentId, input.documentId, input.category,
      input.title, ctx.actorId, input.subcategory, input.expiryDate,
      input.isConfidential, input.requiresAcknowledgment, input.parentDocumentId,
    )),
  ),

acknowledgePolicy: protectedProcedure
  .input(z.object({ employeeDocumentId: z.string().uuid() }))
  .mutation(({ ctx, input }) =>
    commandBus.execute(new AcknowledgePolicyCommand(ctx.tenantId, input.employeeDocumentId, ctx.actorId)),
  ),

listExpiringDocuments: protectedProcedure
  .input(z.object({ daysAhead: z.number().int().default(30) }))
  .query(({ ctx, input }) =>
    queryBus.execute(new ListExpiringDocumentsQuery(ctx.tenantId, input.daysAhead)),
  ),

// Completeness
getProfileCompleteness: protectedProcedure
  .input(z.object({ employmentId: z.string().uuid() }))
  .query(({ ctx, input }) =>
    queryBus.execute(new GetProfileCompletenessQuery(ctx.tenantId, input.employmentId)),
  ),

listIncompleteProfiles: protectedProcedure
  .input(z.object({ threshold: z.number().default(80) }))
  .query(({ ctx, input }) =>
    queryBus.execute(new ListIncompleteProfilesQuery(ctx.tenantId, input.threshold)),
  ),
```

- [ ] **Step 3: Run build and verify**

```bash
bun run --filter @future/db build
cd apps/api && bunx vitest run src/modules/people/ --reporter=verbose
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/people/people.module.ts \
  apps/api/src/modules/people/interface/trpc/people.router.ts
git commit -m "feat(people): wire change requests, documents, completeness into module + tRPC"
```

---

## Task 18: Vietnam Seed — Document Requirements

**Files:**

- Create: `apps/api/src/modules/people/infrastructure/seed/vietnam-document-requirements.seed.ts`

- [ ] **Step 1: Create seed data**

```typescript
// apps/api/src/modules/people/infrastructure/seed/vietnam-document-requirements.seed.ts

import type { DocumentRequirement } from '../../domain/entities/document-requirement.entity'

export const VIETNAM_DOCUMENT_REQUIREMENTS: Omit<DocumentRequirement, 'id' | 'tenantId'>[] = [
  {
    countryCode: 'VN',
    employmentType: null,
    category: 'identity',
    title: 'Citizen ID Card (CCCD)',
    isRequired: true,
    deadlineDays: 7,
    sortOrder: 1,
  },
  {
    countryCode: 'VN',
    employmentType: null,
    category: 'identity',
    title: 'Household Registration (Ho Khau)',
    isRequired: false,
    deadlineDays: 30,
    sortOrder: 2,
  },
  {
    countryCode: 'VN',
    employmentType: null,
    category: 'tax',
    title: 'Tax Code Certificate',
    isRequired: true,
    deadlineDays: 30,
    sortOrder: 3,
  },
  {
    countryCode: 'VN',
    employmentType: null,
    category: 'insurance',
    title: 'Social Insurance Book',
    isRequired: true,
    deadlineDays: 30,
    sortOrder: 4,
  },
  {
    countryCode: 'VN',
    employmentType: null,
    category: 'health_check',
    title: 'Health Check Certificate',
    isRequired: true,
    deadlineDays: 14,
    sortOrder: 5,
  },
  {
    countryCode: 'VN',
    employmentType: null,
    category: 'certificate',
    title: 'Degree / Diploma',
    isRequired: false,
    deadlineDays: 30,
    sortOrder: 6,
  },
  {
    countryCode: 'VN',
    employmentType: null,
    category: 'identity',
    title: 'Portrait Photos (4x6)',
    isRequired: true,
    deadlineDays: 7,
    sortOrder: 7,
  },
  {
    countryCode: 'VN',
    employmentType: 'permanent',
    category: 'contract',
    title: 'Probation Contract',
    isRequired: true,
    deadlineDays: 3,
    sortOrder: 8,
  },
  {
    countryCode: 'VN',
    employmentType: 'permanent',
    category: 'contract',
    title: 'Labor Contract',
    isRequired: true,
    deadlineDays: null,
    sortOrder: 9,
  },
]
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/people/infrastructure/seed/vietnam-document-requirements.seed.ts
git commit -m "feat(people): add Vietnam document requirement seed data"
```
