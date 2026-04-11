# People Module — Part 2: Core Commands (Profile CRUD + Changes)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the profile lifecycle commands: create, direct update, request/approve/reject sensitive field changes. All TDD.

**Prerequisite:** Part 0 (kernel prerequisites) and Part 1 (schema + domain) must be completed.

**Spec:** `docs/superpowers/specs/2026-04-11-people-projects-design.md`

---

## Task 1: Drizzle Repository — Employment Profile + Detail + Profile Section

**Files:**

- Create: `apps/api/src/modules/people/infrastructure/repositories/drizzle-employment-profile.repository.ts`
- Create: `apps/api/src/modules/people/infrastructure/repositories/drizzle-employment-profile.repository.integration.spec.ts`
- Create: `apps/api/src/modules/people/infrastructure/repositories/drizzle-employment-profile-detail.repository.ts`
- Create: `apps/api/src/modules/people/infrastructure/repositories/drizzle-profile-section.repository.ts`
- Create: `apps/api/src/modules/people/infrastructure/repositories/drizzle-profile-change-request.repository.ts`

Same as original plan Task 9 for employment profile repository. Detail repository uses `profileId` as PK (no separate id). The `upsert` method uses Drizzle's `onConflictDoUpdate` on `profileId`.

- [ ] **Step 1: Write integration test for employment profile (same as original plan Task 9)**
- [ ] **Step 2: Run to verify failure**
- [ ] **Step 3: Implement DrizzleEmploymentProfileRepository**
- [ ] **Step 4: Run to verify pass**
- [ ] **Step 5: Implement detail, section, and change-request repositories**
- [ ] **Step 6: Remove .gitkeep and commit**

---

## Task 2: CreateEmploymentProfile (TDD)

Same as original plan Task 10 — no changes needed. The handler uses real `CreateDecisionCaseCommand` from the kernel (Part 0 ensures it exists).

- [ ] **Step 1: Create command DTO**
- [ ] **Step 2: Write failing test (same as original plan)**
- [ ] **Step 3: Run to verify failure**
- [ ] **Step 4: Write handler**
- [ ] **Step 5: Run to verify pass**
- [ ] **Step 6: Commit**

---

## Task 3: RequestProfileChange (TDD)

Same as original plan Task 11, with one fix:

**Fix C2:** The handler dispatches `CreateDecisionCaseCommand` (which now exists in the kernel from Part 0). Remove the local class redeclaration. Import the real command:

```typescript
import { CreateDecisionCaseCommand } from '../../../kernel/application/commands/create-decision-case.command'
```

- [ ] **Step 1: Create command DTO**
- [ ] **Step 2: Write failing test**
- [ ] **Step 3: Run to verify failure**
- [ ] **Step 4: Write handler (importing real kernel command)**
- [ ] **Step 5: Run to verify pass**
- [ ] **Step 6: Commit**

---

## Task 4: ApproveProfileChange (TDD)

**Files:**

- Create: `apps/api/src/modules/people/application/commands/approve-profile-change.command.ts`
- Create: `apps/api/src/modules/people/application/commands/approve-profile-change.handler.spec.ts`
- Create: `apps/api/src/modules/people/application/commands/approve-profile-change.handler.ts`

- [ ] **Step 1: Create command DTO**

```typescript
export class ApproveProfileChangeCommand {
  constructor(
    readonly tenantId: string,
    readonly changeRequestId: string,
    readonly approvedBy: string,
  ) {}
}
```

- [ ] **Step 2: Write failing test**

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandBus } from '@nestjs/cqrs'
import { ApproveProfileChangeCommand } from './approve-profile-change.command'
import { ApproveProfileChangeHandler } from './approve-profile-change.handler'
import { ChangeRequestNotFoundException } from '../../domain/exceptions/people.exceptions'
import type { IProfileChangeRequestRepository } from '../../domain/repositories/profile-change-request.repository.port'
import type { IEmploymentProfileDetailRepository } from '../../domain/repositories/employment-profile-detail.repository.port'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const REQUEST_ID = '01900000-0000-7000-8000-000000000010'
const PROFILE_ID = '01900000-0000-7000-8000-000000000003'
const APPROVER_ID = '01900000-0000-7000-8000-000000000005'
const CASE_ID = '01900000-0000-7000-8000-000000000020'

describe('ApproveProfileChangeHandler', () => {
  let handler: ApproveProfileChangeHandler
  let changeRequestRepo: IProfileChangeRequestRepository
  let detailRepo: IEmploymentProfileDetailRepository
  let auditRepo: IAuditEventRepository
  let commandBus: CommandBus

  beforeEach(() => {
    changeRequestRepo = {
      findById: vi.fn(),
      findPendingByField: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      listPending: vi.fn(),
    }
    detailRepo = {
      findByProfileId: vi.fn(),
      upsert: vi.fn(),
      updateField: vi.fn(),
    }
    auditRepo = { insert: vi.fn() }
    commandBus = { execute: vi.fn() } as unknown as CommandBus
    handler = new ApproveProfileChangeHandler(changeRequestRepo, detailRepo, auditRepo, commandBus)
  })

  it('applies the change and resolves the decision case', async () => {
    vi.mocked(changeRequestRepo.findById).mockResolvedValue({
      id: REQUEST_ID,
      tenantId: TENANT_ID,
      profileId: PROFILE_ID,
      fieldPath: 'detail.bankAccountNumber',
      oldValue: '1234',
      newValue: '5678',
      status: 'pending',
      decisionCaseId: CASE_ID,
      requestedBy: 'req-actor',
      reviewedBy: null,
      createdAt: new Date(),
    })

    await handler.execute(new ApproveProfileChangeCommand(TENANT_ID, REQUEST_ID, APPROVER_ID))

    expect(detailRepo.updateField).toHaveBeenCalledWith(
      PROFILE_ID,
      TENANT_ID,
      'bankAccountNumber',
      '5678',
    )
    expect(changeRequestRepo.updateStatus).toHaveBeenCalledWith(
      REQUEST_ID,
      TENANT_ID,
      'approved',
      APPROVER_ID,
    )
    expect(commandBus.execute).toHaveBeenCalled() // ResolveDecisionCaseCommand
    expect(auditRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'profile_change_approved',
        module: 'people',
      }),
    )
  })

  it('throws ChangeRequestNotFoundException when not found', async () => {
    vi.mocked(changeRequestRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new ApproveProfileChangeCommand(TENANT_ID, REQUEST_ID, APPROVER_ID)),
    ).rejects.toThrow(ChangeRequestNotFoundException)
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `cd apps/api && bunx vitest run src/modules/people/application/commands/approve-profile-change.handler.spec.ts --project unit`

- [ ] **Step 4: Write handler**

```typescript
import { Inject } from '@nestjs/common'
import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { ChangeRequestNotFoundException } from '../../domain/exceptions/people.exceptions'
import {
  PROFILE_CHANGE_REQUEST_REPOSITORY,
  type IProfileChangeRequestRepository,
} from '../../domain/repositories/profile-change-request.repository.port'
import {
  EMPLOYMENT_PROFILE_DETAIL_REPOSITORY,
  type IEmploymentProfileDetailRepository,
} from '../../domain/repositories/employment-profile-detail.repository.port'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'
import { ResolveDecisionCaseCommand } from '../../../kernel/application/commands/resolve-decision-case.command'
import { ApproveProfileChangeCommand } from './approve-profile-change.command'

@CommandHandler(ApproveProfileChangeCommand)
export class ApproveProfileChangeHandler implements ICommandHandler<
  ApproveProfileChangeCommand,
  void
> {
  constructor(
    @Inject(PROFILE_CHANGE_REQUEST_REPOSITORY)
    private readonly changeRequestRepo: IProfileChangeRequestRepository,
    @Inject(EMPLOYMENT_PROFILE_DETAIL_REPOSITORY)
    private readonly detailRepo: IEmploymentProfileDetailRepository,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
    private readonly commandBus: CommandBus,
  ) {}

  async execute(command: ApproveProfileChangeCommand): Promise<void> {
    const request = await this.changeRequestRepo.findById(command.changeRequestId, command.tenantId)
    if (!request) throw new ChangeRequestNotFoundException(command.changeRequestId)

    // Extract field name from path (e.g. "detail.bankAccountNumber" → "bankAccountNumber")
    const fieldName = request.fieldPath.replace('detail.', '')

    // Apply the change
    await this.detailRepo.updateField(
      request.profileId,
      command.tenantId,
      fieldName,
      request.newValue,
    )

    // Mark request as approved
    await this.changeRequestRepo.updateStatus(
      command.changeRequestId,
      command.tenantId,
      'approved',
      command.approvedBy,
    )

    // Resolve the decision case in kernel
    if (request.decisionCaseId) {
      await this.commandBus.execute(
        new ResolveDecisionCaseCommand(
          command.tenantId,
          request.decisionCaseId,
          'approved',
          command.approvedBy,
          null,
        ),
      )
    }

    // Audit log
    await this.auditRepo.insert({
      tenantId: command.tenantId,
      actorId: command.approvedBy,
      eventType: 'profile_change_approved',
      module: 'people',
      subjectId: request.profileId,
      payload: { changeRequestId: request.id, fieldPath: request.fieldPath },
    })
  }
}
```

- [ ] **Step 5: Run to verify pass**
- [ ] **Step 6: Commit**

---

## Task 5: RejectProfileChange (TDD)

**Files:**

- Create: `apps/api/src/modules/people/application/commands/reject-profile-change.command.ts`
- Create: `apps/api/src/modules/people/application/commands/reject-profile-change.handler.spec.ts`
- Create: `apps/api/src/modules/people/application/commands/reject-profile-change.handler.ts`

- [ ] **Step 1: Create command DTO**

```typescript
export class RejectProfileChangeCommand {
  constructor(
    readonly tenantId: string,
    readonly changeRequestId: string,
    readonly rejectedBy: string,
    readonly comment: string,
  ) {}
}
```

- [ ] **Step 2: Write failing test**

Tests: (a) rejects and writes decision_outcome with comment, (b) throws ChangeRequestNotFoundException.

- [ ] **Step 3: Write handler**

Same pattern as approve: finds request, sets status to `rejected`, resolves decision case with `'rejected'` + comment, writes audit_event.

- [ ] **Step 4: Run to verify pass**
- [ ] **Step 5: Commit**

---

## Task 6: UpdateProfileDirect (TDD)

**Files:**

- Create: `apps/api/src/modules/people/application/commands/update-profile-direct.command.ts`
- Create: `apps/api/src/modules/people/application/commands/update-profile-direct.handler.spec.ts`
- Create: `apps/api/src/modules/people/application/commands/update-profile-direct.handler.ts`

- [ ] **Step 1: Create command DTO**

```typescript
export class UpdateProfileDirectCommand {
  constructor(
    readonly tenantId: string,
    readonly profileId: string,
    readonly updatedBy: string,
    readonly fields: Record<string, unknown>,
  ) {}
}
```

- [ ] **Step 2: Write failing test**

Tests:

- (a) Updates non-sensitive employment_profile fields (jobTitle, jobLevel, workArrangement, costCenter) directly
- (b) Updates non-sensitive detail fields (currentAddress, emergencyContactName, emergencyContactPhone) directly
- (c) Throws ProfileNotFoundException when profile not found

```typescript
it('updates non-sensitive profile fields directly', async () => {
  vi.mocked(profileRepo.findById).mockResolvedValue(fakeProfile)

  await handler.execute(
    new UpdateProfileDirectCommand(TENANT_ID, PROFILE_ID, ACTOR_ID, {
      jobTitle: 'Senior Engineer',
      currentAddress: '123 Main St',
    }),
  )

  expect(profileRepo.updateFields).toHaveBeenCalledWith(PROFILE_ID, TENANT_ID, {
    jobTitle: 'Senior Engineer',
  })
  expect(detailRepo.updateField).toHaveBeenCalledWith(
    PROFILE_ID,
    TENANT_ID,
    'currentAddress',
    '123 Main St',
  )
})
```

- [ ] **Step 3: Write handler**

The handler classifies each field as profile-level or detail-level, then writes directly. No `decision_case` created. Writes `audit_event`.

Non-sensitive profile fields: `jobTitle`, `jobLevel`, `workArrangement`, `costCenter`
Non-sensitive detail fields: `currentAddress`, `permanentAddress`, `emergencyContactName`, `emergencyContactPhone`, `personalPhone`, `personalEmail`

- [ ] **Step 4: Run to verify pass**
- [ ] **Step 5: Commit**

---

**End of Part 2.** Proceed to Part 3 (onboarding/offboarding).
