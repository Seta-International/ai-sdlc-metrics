# Profile Change Request — Plan 01: Backend API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the backend: add the `reason` field, implement `ListProfileChangeRequestsHandler` for both employee and HR-queue views, update `ProfileChangeAppliedEvent` to carry batch payload, update all tRPC routes, and remove the now-obsolete `updatePersonalProfile` path.

**Architecture:** The people module uses CQRS — commands live under `application/commands/`, queries under `application/queries/`. The Drizzle schema is the single source of truth; schema changes require a full migration rebuild (no numbered migrations). The `ProfileChangeAppliedEvent` is in `packages/event-contracts/` and is imported by any module that publishes or subscribes.

**Tech Stack:** NestJS CQRS, Drizzle ORM, Vitest, tRPC, pg-boss

---

## Task 1: Add `reason` column to schema, entity, command, and handler

**Files:**

- Modify: `apps/api/src/modules/people/infrastructure/schema/change-requests.schema.ts`
- Modify: `apps/api/src/modules/people/domain/entities/profile-change-request.entity.ts`
- Modify: `apps/api/src/modules/people/application/commands/request-profile-changes.command.ts`
- Modify: `apps/api/src/modules/people/application/commands/request-profile-changes.handler.ts`
- Test: `apps/api/src/modules/people/application/commands/request-profile-changes.handler.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/people/application/commands/request-profile-changes.handler.spec.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RequestProfileChangesCommand } from './request-profile-changes.command'
import { RequestProfileChangesHandler } from './request-profile-changes.handler'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { IProfileChangeRequestRepository } from '../../domain/repositories/profile-change-request.repository'
import type { Employment } from '../../domain/entities/employment.entity'
import { EditPolicyService } from '../services/edit-policy.service'
import type { IFieldEditPolicyRepository } from '../../domain/repositories/field-edit-policy.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000020'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'

function makeEmployment(): Employment {
  return {
    id: EMPLOYMENT_ID,
    tenantId: TENANT_ID,
    personProfileId: '01900000-0000-7000-8000-000000000010',
    employeeCode: 'EMP001',
    companyEmail: 'emp@seta.vn',
    workerType: 'employee',
    employmentType: 'permanent',
    countryCode: 'VN',
    employmentStatus: 'active',
    terminationDate: null,
    terminationReason: null,
    hireDate: new Date('2025-01-01'),
    originalHireDate: null,
    previousProfileId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

describe('RequestProfileChangesHandler', () => {
  let handler: RequestProfileChangesHandler
  let employmentRepo: IEmploymentRepository
  let changeRepo: IProfileChangeRequestRepository
  let policyRepo: IFieldEditPolicyRepository

  beforeEach(() => {
    employmentRepo = {
      findById: vi.fn().mockResolvedValue(makeEmployment()),
    } as unknown as IEmploymentRepository

    changeRepo = {
      findPendingByFieldPath: vi.fn().mockResolvedValue(null),
      insertMany: vi.fn().mockResolvedValue([]),
    } as unknown as IProfileChangeRequestRepository

    policyRepo = {
      findByFieldPath: vi.fn().mockResolvedValue(null),
    } as unknown as IFieldEditPolicyRepository

    const editPolicyService = new EditPolicyService(policyRepo)
    handler = new RequestProfileChangesHandler(changeRepo, employmentRepo, editPolicyService)
  })

  it('stores reason on inserted rows', async () => {
    const cmd = new RequestProfileChangesCommand(
      TENANT_ID,
      EMPLOYMENT_ID,
      [{ fieldPath: 'person_profile.preferred_name', oldValue: 'Old', newValue: 'New' }],
      ACTOR_ID,
      'Updating after name change',
    )

    await handler.execute(cmd)

    expect(changeRepo.insertMany).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ reason: 'Updating after name change' })]),
    )
  })

  it('stores null reason when not provided', async () => {
    const cmd = new RequestProfileChangesCommand(
      TENANT_ID,
      EMPLOYMENT_ID,
      [{ fieldPath: 'person_profile.preferred_name', oldValue: 'Old', newValue: 'New' }],
      ACTOR_ID,
    )

    await handler.execute(cmd)

    expect(changeRepo.insertMany).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ reason: null })]),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/vietanh/Future && bun run --filter @future/api test:unit -- --reporter=verbose 2>&1 | grep -A 5 "RequestProfileChangesHandler"
```

Expected: FAIL — `reason` parameter does not exist on `RequestProfileChangesCommand`.

- [ ] **Step 3: Add `reason` column to Drizzle schema**

In `apps/api/src/modules/people/infrastructure/schema/change-requests.schema.ts`, add `reason: text('reason'),` after `batchId`:

```typescript
import { uuid, text, date, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'
import { peopleSchema } from './people.schema'

export const profileChangeRequest = peopleSchema.table('profile_change_request', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  employmentId: uuid('employment_id').notNull(),
  batchId: uuid('batch_id'),
  reason: text('reason'),
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

- [ ] **Step 4: Add `reason` to entity interface**

Replace `apps/api/src/modules/people/domain/entities/profile-change-request.entity.ts`:

```typescript
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
  reason: string | null
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

- [ ] **Step 5: Add `reason` to `RequestProfileChangesCommand`**

Replace `apps/api/src/modules/people/application/commands/request-profile-changes.command.ts`:

```typescript
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
    readonly reason?: string | null,
  ) {}
}
```

- [ ] **Step 6: Update `RequestProfileChangesHandler` rows array to include `reason`**

In `apps/api/src/modules/people/application/commands/request-profile-changes.handler.ts`:

Update the `rows` type to add `reason: string | null` and include it in each `rows.push()` call:

```typescript
const rows: Array<{
  tenantId: string
  employmentId: string
  batchId: string
  reason: string | null
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
```

And in the `rows.push()` call inside the loop, add `reason: command.reason ?? null,` after `batchId`:

```typescript
rows.push({
  tenantId: command.tenantId,
  employmentId: command.employmentId,
  batchId,
  reason: command.reason ?? null,
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
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd /home/vietanh/Future && bun run --filter @future/api test:unit -- --reporter=verbose 2>&1 | grep -A 5 "RequestProfileChangesHandler"
```

Expected: PASS

- [ ] **Step 8: Rebuild the DB migration**

```bash
cd /home/vietanh/Future
find apps/api/src -name "*.sql" -delete
find apps/api/src -path "*/meta/*.json" -delete
bun run --filter @future/api db:generate -- --name initial
bun run --filter @future/api db:down -- -v
bun run --filter @future/api db:up
bun run --filter @future/api db:migrate
```

Expected: migration applies cleanly with the new `reason` column.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/people/infrastructure/schema/change-requests.schema.ts \
        apps/api/src/modules/people/domain/entities/profile-change-request.entity.ts \
        apps/api/src/modules/people/application/commands/request-profile-changes.command.ts \
        apps/api/src/modules/people/application/commands/request-profile-changes.handler.ts \
        apps/api/src/modules/people/application/commands/request-profile-changes.handler.spec.ts \
        apps/api/src/
git commit -m "feat(people): add reason field to profile change request batch"
```

---

## Task 2: Add `findByTenant` to repository interface and Drizzle implementation

**Files:**

- Modify: `apps/api/src/modules/people/domain/repositories/profile-change-request.repository.ts`
- Modify: `apps/api/src/modules/people/infrastructure/repositories/drizzle-profile-change-request.repository.ts`
- Test: (TypeScript compile check — structural)

This method is required by the `ListProfileChangeRequestsHandler` queue mode.

- [ ] **Step 1: Add `findByTenant` to the interface**

Replace `apps/api/src/modules/people/domain/repositories/profile-change-request.repository.ts`:

```typescript
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
  findByTenant(
    tenantId: string,
    status?: ChangeRequestStatus,
    limit?: number,
    offset?: number,
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

- [ ] **Step 2: Add `findByTenant` to the Drizzle implementation**

In `apps/api/src/modules/people/infrastructure/repositories/drizzle-profile-change-request.repository.ts`:

1. Update the import from `drizzle-orm` to add `desc`:

```typescript
import { and, desc, eq, lte } from 'drizzle-orm'
```

2. Add this method after `findByEmploymentId`:

```typescript
  async findByTenant(
    tenantId: string,
    status?: ChangeRequestStatus,
    limit = 20,
    offset = 0,
  ): Promise<ProfileChangeRequest[]> {
    const conditions = [eq(profileChangeRequest.tenantId, tenantId)]
    if (status) {
      conditions.push(eq(profileChangeRequest.status, status))
    }
    return (await this.db
      .select()
      .from(profileChangeRequest)
      .where(and(...conditions))
      .orderBy(desc(profileChangeRequest.createdAt))
      .limit(limit)
      .offset(offset)) as ProfileChangeRequest[]
  }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/vietanh/Future && bun run --filter @future/api typecheck 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/people/domain/repositories/profile-change-request.repository.ts \
        apps/api/src/modules/people/infrastructure/repositories/drizzle-profile-change-request.repository.ts
git commit -m "feat(people): add findByTenant to IProfileChangeRequestRepository"
```

---

## Task 3: Update `ProfileChangeAppliedEvent` to batch payload and fix callers

**Files:**

- Modify: `packages/event-contracts/src/people/profile-change-applied.event.ts`
- Modify: `apps/api/src/modules/people/application/commands/batch-approve-changes.handler.ts`
- Test: `apps/api/src/modules/people/application/commands/batch-approve-changes.handler.spec.ts`
- Modify: `apps/api/src/modules/people/infrastructure/jobs/apply-scheduled-changes.job.ts`

The current event carries one `fieldPath` + `newValue`. Replace with `appliedChanges: AppliedChange[]` so the MS sync handler receives all applied fields in one event per batch.

- [ ] **Step 1: Write the failing test for BatchApproveChangesHandler**

Create `apps/api/src/modules/people/application/commands/batch-approve-changes.handler.spec.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BatchApproveChangesCommand } from './batch-approve-changes.command'
import { BatchApproveChangesHandler } from './batch-approve-changes.handler'
import type { IProfileChangeRequestRepository } from '../../domain/repositories/profile-change-request.repository'
import type { ProfileChangeRequest } from '../../domain/entities/profile-change-request.entity'
import { ProfileChangeAppliedEvent } from '@future/event-contracts'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const BATCH_ID = '01900000-0000-7000-8000-000000000099'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000020'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'

function makePendingChange(overrides: Partial<ProfileChangeRequest> = {}): ProfileChangeRequest {
  return {
    id: '01900000-0000-7000-8000-000000000030',
    tenantId: TENANT_ID,
    employmentId: EMPLOYMENT_ID,
    batchId: BATCH_ID,
    reason: null,
    fieldPath: 'person_profile.preferred_name',
    oldValue: 'Old',
    newValue: 'New',
    effectiveDate: null,
    status: 'pending',
    requestedBy: ACTOR_ID,
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    decisionCaseId: null,
    createdAt: new Date(),
    ...overrides,
  }
}

describe('BatchApproveChangesHandler', () => {
  let changeRepo: IProfileChangeRequestRepository
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    changeRepo = {
      findByBatchId: vi.fn().mockResolvedValue([makePendingChange()]),
      updateStatusByBatchId: vi.fn().mockResolvedValue(undefined),
    } as unknown as IProfileChangeRequestRepository
    eventBus = { publish: vi.fn() }
  })

  it('publishes one ProfileChangeAppliedEvent with all applied changes', async () => {
    const handler = new BatchApproveChangesHandler(changeRepo, eventBus as any)
    await handler.execute(new BatchApproveChangesCommand(TENANT_ID, BATCH_ID, ACTOR_ID, 'LGTM'))

    expect(eventBus.publish).toHaveBeenCalledOnce()
    const event = eventBus.publish.mock.calls[0]![0] as ProfileChangeAppliedEvent
    expect(event).toBeInstanceOf(ProfileChangeAppliedEvent)
    expect(event.tenantId).toBe(TENANT_ID)
    expect(event.employmentId).toBe(EMPLOYMENT_ID)
    expect(event.appliedChanges).toEqual([
      { fieldPath: 'person_profile.preferred_name', oldValue: 'Old', newValue: 'New' },
    ])
  })

  it('does not publish when all changes have a future effective date', async () => {
    const future = new Date(Date.now() + 86_400_000)
    changeRepo = {
      findByBatchId: vi.fn().mockResolvedValue([makePendingChange({ effectiveDate: future })]),
      updateStatusByBatchId: vi.fn().mockResolvedValue(undefined),
    } as unknown as IProfileChangeRequestRepository

    const handler = new BatchApproveChangesHandler(changeRepo, eventBus as any)
    await handler.execute(new BatchApproveChangesCommand(TENANT_ID, BATCH_ID, ACTOR_ID))
    expect(eventBus.publish).not.toHaveBeenCalled()
  })

  it('throws when no pending changes exist', async () => {
    changeRepo = {
      findByBatchId: vi.fn().mockResolvedValue([]),
      updateStatusByBatchId: vi.fn(),
    } as unknown as IProfileChangeRequestRepository

    const handler = new BatchApproveChangesHandler(changeRepo, eventBus as any)
    await expect(
      handler.execute(new BatchApproveChangesCommand(TENANT_ID, BATCH_ID, ACTOR_ID)),
    ).rejects.toThrow(`No pending changes found in batch ${BATCH_ID}`)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/vietanh/Future && bun run --filter @future/api test:unit -- --reporter=verbose 2>&1 | grep -A 10 "BatchApproveChangesHandler"
```

Expected: FAIL — `ProfileChangeAppliedEvent` has no `appliedChanges` property.

- [ ] **Step 3: Update `ProfileChangeAppliedEvent`**

Replace `packages/event-contracts/src/people/profile-change-applied.event.ts`:

```typescript
export interface AppliedChange {
  fieldPath: string
  oldValue: unknown
  newValue: unknown
}

export class ProfileChangeAppliedEvent {
  static readonly eventName = 'people.profile-change-applied'
  constructor(
    public readonly tenantId: string,
    public readonly employmentId: string,
    public readonly appliedChanges: AppliedChange[],
  ) {}
}
```

- [ ] **Step 4: Rebuild `@future/event-contracts`**

```bash
cd /home/vietanh/Future && bun run --filter @future/event-contracts build
```

- [ ] **Step 5: Update `BatchApproveChangesHandler` to publish the new event shape**

Replace `apps/api/src/modules/people/application/commands/batch-approve-changes.handler.ts`:

```typescript
import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { ProfileChangeAppliedEvent } from '@future/event-contracts'
import {
  PROFILE_CHANGE_REQUEST_REPOSITORY,
  type IProfileChangeRequestRepository,
} from '../../domain/repositories/profile-change-request.repository'
import { BatchApproveChangesCommand } from './batch-approve-changes.command'

@CommandHandler(BatchApproveChangesCommand)
export class BatchApproveChangesHandler implements ICommandHandler<BatchApproveChangesCommand> {
  constructor(
    @Inject(PROFILE_CHANGE_REQUEST_REPOSITORY)
    private readonly changeRepo: IProfileChangeRequestRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: BatchApproveChangesCommand): Promise<void> {
    const changes = await this.changeRepo.findByBatchId(command.batchId, command.tenantId)
    const pending = changes.filter((c) => c.status === 'pending')

    if (pending.length === 0) {
      throw new Error(`No pending changes found in batch ${command.batchId}`)
    }

    await this.changeRepo.updateStatusByBatchId(
      command.batchId,
      command.tenantId,
      'approved',
      command.approvedBy,
      command.note ?? undefined,
    )

    const now = new Date()
    const immediateChanges = pending.filter((c) => !c.effectiveDate || c.effectiveDate <= now)

    if (immediateChanges.length > 0) {
      // All changes in a batch share one employmentId — group defensively
      const byEmployment = new Map<string, typeof immediateChanges>()
      for (const c of immediateChanges) {
        const arr = byEmployment.get(c.employmentId) ?? []
        arr.push(c)
        byEmployment.set(c.employmentId, arr)
      }

      for (const [employmentId, empChanges] of byEmployment) {
        this.eventBus.publish(
          new ProfileChangeAppliedEvent(
            command.tenantId,
            employmentId,
            empChanges.map((c) => ({
              fieldPath: c.fieldPath,
              oldValue: c.oldValue,
              newValue: c.newValue,
            })),
          ),
        )
      }
    }
  }
}
```

- [ ] **Step 6: Update `ApplyScheduledChangesJob` to use the new event shape**

Replace `apps/api/src/modules/people/infrastructure/jobs/apply-scheduled-changes.job.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common'
import { EventBus } from '@nestjs/cqrs'
import { ProfileChangeAppliedEvent } from '@future/event-contracts'
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

  async handle(tenantId: string): Promise<void> {
    const today = new Date()
    const scheduled = await this.changeRepo.findScheduledBeforeDate(tenantId, today)

    for (const change of scheduled) {
      await this.changeRepo.updateStatus(
        change.id,
        tenantId,
        'applied',
        undefined,
        'Auto-applied by scheduled job',
      )
    }

    // Group by employmentId and fire one event per employment
    const byEmployment = new Map<string, typeof scheduled>()
    for (const c of scheduled) {
      const arr = byEmployment.get(c.employmentId) ?? []
      arr.push(c)
      byEmployment.set(c.employmentId, arr)
    }

    for (const [employmentId, changes] of byEmployment) {
      this.eventBus.publish(
        new ProfileChangeAppliedEvent(
          tenantId,
          employmentId,
          changes.map((c) => ({
            fieldPath: c.fieldPath,
            oldValue: c.oldValue,
            newValue: c.newValue,
          })),
        ),
      )
    }
  }
}
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd /home/vietanh/Future && bun run --filter @future/api test:unit -- --reporter=verbose 2>&1 | grep -A 10 "BatchApproveChangesHandler"
```

Expected: PASS

- [ ] **Step 8: Verify TypeScript compiles**

```bash
cd /home/vietanh/Future && bun run --filter @future/api typecheck 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add packages/event-contracts/src/people/profile-change-applied.event.ts \
        apps/api/src/modules/people/application/commands/batch-approve-changes.handler.ts \
        apps/api/src/modules/people/application/commands/batch-approve-changes.handler.spec.ts \
        apps/api/src/modules/people/infrastructure/jobs/apply-scheduled-changes.job.ts
git commit -m "feat(people): update ProfileChangeAppliedEvent to batch payload"
```

---

## Task 4: Implement `ListProfileChangeRequestsHandler`

**Files:**

- Modify: `apps/api/src/modules/people/application/queries/list-profile-change-requests.query.ts`
- Modify: `apps/api/src/modules/people/application/queries/list-profile-change-requests.handler.ts`
- Test: `apps/api/src/modules/people/application/queries/list-profile-change-requests.handler.spec.ts`
- Modify: `apps/api/src/modules/people/people.module.ts`

The handler supports two modes:

- `byEmployment` — returns all change requests for one `employmentId`, optionally filtered by `status`. Does not enrich — the frontend already has the profile.
- `queue` — returns paginated change requests for the whole tenant for the HR view, enriched with `employeeName`. Uses sequential `await` per the no-`Promise.all`-for-DB rule.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/modules/people/application/queries/list-profile-change-requests.handler.spec.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListProfileChangeRequestsQuery } from './list-profile-change-requests.query'
import { ListProfileChangeRequestsHandler } from './list-profile-change-requests.handler'
import type { IProfileChangeRequestRepository } from '../../domain/repositories/profile-change-request.repository'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { IPersonProfileRepository } from '../../domain/repositories/person-profile.repository'
import type { ProfileChangeRequest } from '../../domain/entities/profile-change-request.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000020'
const PROFILE_ID = '01900000-0000-7000-8000-000000000010'

function makePendingChange(overrides: Partial<ProfileChangeRequest> = {}): ProfileChangeRequest {
  return {
    id: '01900000-0000-7000-8000-000000000030',
    tenantId: TENANT_ID,
    employmentId: EMPLOYMENT_ID,
    batchId: '01900000-0000-7000-8000-000000000099',
    reason: 'Post-promotion update',
    fieldPath: 'person_profile.preferred_name',
    oldValue: 'Old',
    newValue: 'New',
    effectiveDate: null,
    status: 'pending',
    requestedBy: '01900000-0000-7000-8000-000000000002',
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    decisionCaseId: null,
    createdAt: new Date('2026-05-01'),
    ...overrides,
  }
}

describe('ListProfileChangeRequestsHandler', () => {
  let changeRepo: IProfileChangeRequestRepository
  let employmentRepo: IEmploymentRepository
  let profileRepo: IPersonProfileRepository

  beforeEach(() => {
    changeRepo = {
      findByEmploymentId: vi.fn().mockResolvedValue([makePendingChange()]),
      findByTenant: vi.fn().mockResolvedValue([makePendingChange()]),
    } as unknown as IProfileChangeRequestRepository

    employmentRepo = {
      findById: vi.fn().mockResolvedValue({ personProfileId: PROFILE_ID }),
    } as unknown as IEmploymentRepository

    profileRepo = {
      findById: vi.fn().mockResolvedValue({ fullName: 'Nguyễn An' }),
    } as unknown as IPersonProfileRepository
  })

  it('byEmployment mode: calls findByEmploymentId without status filter', async () => {
    const handler = new ListProfileChangeRequestsHandler(changeRepo, employmentRepo, profileRepo)
    const result = await handler.execute(
      new ListProfileChangeRequestsQuery(TENANT_ID, 'byEmployment', EMPLOYMENT_ID, null, 20, 0),
    )
    expect(changeRepo.findByEmploymentId).toHaveBeenCalledWith(EMPLOYMENT_ID, TENANT_ID, undefined)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.reason).toBe('Post-promotion update')
    expect(result.items[0]!.employeeName).toBeNull()
  })

  it('byEmployment mode: passes status filter when provided', async () => {
    const handler = new ListProfileChangeRequestsHandler(changeRepo, employmentRepo, profileRepo)
    await handler.execute(
      new ListProfileChangeRequestsQuery(
        TENANT_ID,
        'byEmployment',
        EMPLOYMENT_ID,
        'pending',
        20,
        0,
      ),
    )
    expect(changeRepo.findByEmploymentId).toHaveBeenCalledWith(EMPLOYMENT_ID, TENANT_ID, 'pending')
  })

  it('queue mode: enriches results with employeeName', async () => {
    const handler = new ListProfileChangeRequestsHandler(changeRepo, employmentRepo, profileRepo)
    const result = await handler.execute(
      new ListProfileChangeRequestsQuery(TENANT_ID, 'queue', null, 'pending', 20, 0),
    )
    expect(changeRepo.findByTenant).toHaveBeenCalledWith(TENANT_ID, 'pending', 20, 0)
    expect(result.items[0]!.employeeName).toBe('Nguyễn An')
  })

  it('queue mode: employeeName is null when employment not found', async () => {
    employmentRepo = {
      findById: vi.fn().mockResolvedValue(null),
    } as unknown as IEmploymentRepository

    const handler = new ListProfileChangeRequestsHandler(changeRepo, employmentRepo, profileRepo)
    const result = await handler.execute(
      new ListProfileChangeRequestsQuery(TENANT_ID, 'queue', null, 'pending', 20, 0),
    )
    expect(result.items[0]!.employeeName).toBeNull()
  })

  it('queue mode: employeeName is null when profile not found', async () => {
    profileRepo = {
      findById: vi.fn().mockResolvedValue(null),
    } as unknown as IPersonProfileRepository

    const handler = new ListProfileChangeRequestsHandler(changeRepo, employmentRepo, profileRepo)
    const result = await handler.execute(
      new ListProfileChangeRequestsQuery(TENANT_ID, 'queue', null, 'pending', 20, 0),
    )
    expect(result.items[0]!.employeeName).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/vietanh/Future && bun run --filter @future/api test:unit -- --reporter=verbose 2>&1 | grep -A 10 "ListProfileChangeRequestsHandler"
```

Expected: FAIL — query class and handler don't have the new signature.

- [ ] **Step 3: Replace the query class**

Replace `apps/api/src/modules/people/application/queries/list-profile-change-requests.query.ts`:

```typescript
import type { ChangeRequestStatus } from '../../domain/entities/profile-change-request.entity'

export class ListProfileChangeRequestsQuery {
  constructor(
    readonly tenantId: string,
    readonly mode: 'byEmployment' | 'queue',
    readonly employmentId: string | null,
    readonly status: ChangeRequestStatus | null,
    readonly limit: number,
    readonly offset: number,
  ) {}
}
```

- [ ] **Step 4: Implement the handler**

Replace `apps/api/src/modules/people/application/queries/list-profile-change-requests.handler.ts`:

```typescript
import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { ProfileChangeRequest } from '../../domain/entities/profile-change-request.entity'
import {
  PROFILE_CHANGE_REQUEST_REPOSITORY,
  type IProfileChangeRequestRepository,
} from '../../domain/repositories/profile-change-request.repository'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import {
  PERSON_PROFILE_REPOSITORY,
  type IPersonProfileRepository,
} from '../../domain/repositories/person-profile.repository'
import { ListProfileChangeRequestsQuery } from './list-profile-change-requests.query'

export interface ChangeRequestListItem extends ProfileChangeRequest {
  employeeName: string | null
}

export interface ListProfileChangeRequestsResult {
  items: ChangeRequestListItem[]
  total: number
}

@QueryHandler(ListProfileChangeRequestsQuery)
export class ListProfileChangeRequestsHandler implements IQueryHandler<
  ListProfileChangeRequestsQuery,
  ListProfileChangeRequestsResult
> {
  constructor(
    @Inject(PROFILE_CHANGE_REQUEST_REPOSITORY)
    private readonly changeRepo: IProfileChangeRequestRepository,
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    @Inject(PERSON_PROFILE_REPOSITORY)
    private readonly profileRepo: IPersonProfileRepository,
  ) {}

  async execute(query: ListProfileChangeRequestsQuery): Promise<ListProfileChangeRequestsResult> {
    if (query.mode === 'byEmployment') {
      const items = await this.changeRepo.findByEmploymentId(
        query.employmentId!,
        query.tenantId,
        query.status ?? undefined,
      )
      return {
        items: items.map((r) => ({ ...r, employeeName: null })),
        total: items.length,
      }
    }

    // queue mode: paginated + enrich with employee name
    const raw = await this.changeRepo.findByTenant(
      query.tenantId,
      query.status ?? undefined,
      query.limit,
      query.offset,
    )

    const items: ChangeRequestListItem[] = []
    for (const change of raw) {
      const employment = await this.employmentRepo.findById(change.employmentId, query.tenantId)
      if (!employment) {
        items.push({ ...change, employeeName: null })
        continue
      }
      const profile = await this.profileRepo.findById(employment.personProfileId, query.tenantId)
      items.push({ ...change, employeeName: profile?.fullName ?? null })
    }

    return { items, total: items.length }
  }
}
```

- [ ] **Step 5: Register `ListProfileChangeRequestsHandler` in `people.module.ts`**

In `apps/api/src/modules/people/people.module.ts`:

1. Add the import near the other query handler imports:

```typescript
import { ListProfileChangeRequestsHandler } from './application/queries/list-profile-change-requests.handler'
```

2. Add `ListProfileChangeRequestsHandler` to the `providers` array (in the query handlers section).

3. Remove the comment that excluded `ListProfileChangeRequestsHandler`:

```
// NOTE: Handlers that reference EMPLOYMENT_PROFILE_REPOSITORY (deleted) are excluded:
//   - ListProfileChangeRequestsHandler (uses EMPLOYMENT_PROFILE_REPOSITORY)
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd /home/vietanh/Future && bun run --filter @future/api test:unit -- --reporter=verbose 2>&1 | grep -A 10 "ListProfileChangeRequestsHandler"
```

Expected: PASS (5 tests green)

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd /home/vietanh/Future && bun run --filter @future/api typecheck 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/people/application/queries/list-profile-change-requests.query.ts \
        apps/api/src/modules/people/application/queries/list-profile-change-requests.handler.ts \
        apps/api/src/modules/people/application/queries/list-profile-change-requests.handler.spec.ts \
        apps/api/src/modules/people/people.module.ts
git commit -m "feat(people): implement ListProfileChangeRequestsHandler — byEmployment and queue modes"
```

---

## Task 5: Update tRPC routes and remove `updatePersonalProfile`

**Files:**

- Modify: `apps/api/src/modules/people/interface/trpc/people.router.ts`
- Delete: `apps/api/src/modules/people/application/commands/update-personal-profile.command.ts`
- Delete: `apps/api/src/modules/people/application/commands/update-personal-profile.handler.ts`
- Delete: `apps/api/src/modules/people/application/commands/update-personal-profile.handler.spec.ts`
- Modify: `apps/api/src/modules/people/people.module.ts`

- [ ] **Step 1: Update `listProfileChangeRequests` tRPC route**

In `apps/api/src/modules/people/interface/trpc/people.router.ts`, find `listProfileChangeRequests` (line ~1592) and replace the entire route with:

```typescript
  listProfileChangeRequests: permissionProtectedProcedure
    .meta({ permission: 'people:profile:read' })
    .input(
      z.object({
        mode: z.enum(['byEmployment', 'queue']),
        employmentId: z.string().uuid().optional(),
        status: z
          .enum(['pending', 'approved', 'rejected', 'superseded', 'scheduled', 'applied'])
          .optional(),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(({ ctx, input }) =>
      svc().query(
        new ListProfileChangeRequestsQuery(
          ctx.tenantId,
          input.mode,
          input.employmentId ?? null,
          input.status ?? null,
          input.limit,
          input.offset,
        ),
      ),
    ),
```

- [ ] **Step 2: Update `requestProfileChanges` tRPC route to use auth context and accept `reason`**

Find `requestProfileChanges` (line ~2344). Replace with:

```typescript
  requestProfileChanges: permissionProtectedProcedure
    .meta({ permission: 'people:profile:self:update' })
    .input(
      z.object({
        employmentId: z.string().uuid(),
        changes: z.array(
          z.object({
            fieldPath: z.string(),
            oldValue: z.unknown().nullable(),
            newValue: z.unknown(),
            effectiveDate: z.coerce.date().optional(),
          }),
        ),
        reason: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      svc().command(
        new RequestProfileChangesCommand(
          ctx.tenantId,
          input.employmentId,
          input.changes,
          ctx.actorId,
          input.reason ?? null,
        ),
      ),
    ),
```

- [ ] **Step 3: Remove the `updatePersonalProfile` route**

Find `updatePersonalProfile: permissionProtectedProcedure` (line ~1367). Delete the entire route block through its closing `),`.

Also remove the `UpdatePersonalProfileCommand` import near the top of the router file.

- [ ] **Step 4: Delete the `updatePersonalProfile` files**

```bash
rm apps/api/src/modules/people/application/commands/update-personal-profile.command.ts
rm apps/api/src/modules/people/application/commands/update-personal-profile.handler.ts
rm -f apps/api/src/modules/people/application/commands/update-personal-profile.handler.spec.ts
```

- [ ] **Step 5: Remove `UpdatePersonalProfileHandler` from `people.module.ts`**

In `apps/api/src/modules/people/people.module.ts`:

1. Remove the import: `import { UpdatePersonalProfileHandler } from './application/commands/update-personal-profile.handler'`
2. Remove `UpdatePersonalProfileHandler` from the `providers` array.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd /home/vietanh/Future && bun run --filter @future/api typecheck 2>&1 | head -30
```

Expected: no errors. If any caller of the removed route surfaces, fix it.

- [ ] **Step 7: Run all unit tests**

```bash
cd /home/vietanh/Future && bun run --filter @future/api test:unit 2>&1 | tail -20
```

Expected: all pass, no regressions.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/people/interface/trpc/people.router.ts \
        apps/api/src/modules/people/people.module.ts
git commit -m "feat(people): update tRPC routes — listProfileChangeRequests, requestProfileChanges with reason; remove updatePersonalProfile"
```
