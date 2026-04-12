# People Module — Part 3: Onboarding & Offboarding Commands

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Status:** implemented

**Goal:** Implement the full onboarding/offboarding lifecycle: trigger, approve, reject, complete offboarding (with atomic kernel side effects), complete task, and the CandidateHired event handler.

**Prerequisite:** Parts 0-2 must be completed.

**Spec:** `docs/superpowers/specs/2026-04-11-people-projects-design.md` (Workflows 1, 3, 4)

---

## Task 1: Drizzle Repositories — Onboarding + Offboarding + Account Membership

**Files:**

- Create: `apps/api/src/modules/people/infrastructure/repositories/drizzle-onboarding.repository.ts`
- Create: `apps/api/src/modules/people/infrastructure/repositories/drizzle-offboarding.repository.ts`
- Create: `apps/api/src/modules/people/infrastructure/repositories/drizzle-offboarding.repository.integration.spec.ts`
- Create: `apps/api/src/modules/people/infrastructure/repositories/drizzle-account-membership.repository.ts`
- Create: `apps/api/src/modules/people/infrastructure/repositories/drizzle-contract-version.repository.ts`
- Create: `apps/api/src/modules/people/infrastructure/repositories/drizzle-periodic-profile-review.repository.ts`

Key implementation notes:

- `DrizzleOffboardingCaseRepository.findActiveByProfileId` filters: `status NOT IN ('completed', 'rejected')`
- `DrizzleAccountMembershipRepository.closeAllForActor` updates all rows where `actorId` matches AND `leftAt IS NULL`

- [ ] **Step 1: Implement all repositories**
- [ ] **Step 2: Write offboarding integration test**
- [ ] **Step 3: Run integration tests**

Run: `cd apps/api && bunx vitest run src/modules/people/infrastructure/repositories/ --project integration`

- [ ] **Step 4: Commit**

---

## Task 2: TriggerOffboarding (TDD)

Same as original plan Task 12. No changes needed — the handler correctly validates status transitions, checks for duplicate active cases, and creates a decision_case.

**Fix C2:** Import the real `CreateDecisionCaseCommand` from kernel:

```typescript
import { CreateDecisionCaseCommand } from '../../../kernel/application/commands/create-decision-case.command'
```

- [ ] **Step 1-6: Same as original plan Task 12**

---

## Task 3: ApproveOffboarding (TDD)

**Files:**

- Create: `apps/api/src/modules/people/application/commands/approve-offboarding.command.ts`
- Create: `apps/api/src/modules/people/application/commands/approve-offboarding.handler.spec.ts`
- Create: `apps/api/src/modules/people/application/commands/approve-offboarding.handler.ts`

- [ ] **Step 1: Create command DTO**

```typescript
export class ApproveOffboardingCommand {
  constructor(
    readonly tenantId: string,
    readonly offboardingCaseId: string,
    readonly approvedBy: string,
  ) {}
}
```

- [ ] **Step 2: Write failing test**

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandBus } from '@nestjs/cqrs'
import { ApproveOffboardingCommand } from './approve-offboarding.command'
import { ApproveOffboardingHandler } from './approve-offboarding.handler'
import { OffboardingCaseNotFoundException } from '../../domain/exceptions/people.exceptions'
import type { IEmploymentProfileRepository } from '../../domain/repositories/employment-profile.repository.port'
import type {
  IOffboardingTemplateRepository,
  IOffboardingCaseRepository,
} from '../../domain/repositories/offboarding.repository.port'
import type { IOutboxEventRepository } from '../../../kernel/domain/repositories/outbox-event.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const CASE_ID = '01900000-0000-7000-8000-000000000030'
const PROFILE_ID = '01900000-0000-7000-8000-000000000003'
const TEMPLATE_ID = '01900000-0000-7000-8000-000000000040'
const APPROVER_ID = '01900000-0000-7000-8000-000000000005'

describe('ApproveOffboardingHandler', () => {
  let handler: ApproveOffboardingHandler
  let profileRepo: IEmploymentProfileRepository
  let templateRepo: IOffboardingTemplateRepository
  let caseRepo: IOffboardingCaseRepository
  let outboxRepo: IOutboxEventRepository
  let commandBus: CommandBus

  beforeEach(() => {
    profileRepo = {
      findById: vi.fn().mockResolvedValue({
        id: PROFILE_ID,
        tenantId: TENANT_ID,
        actorId: 'actor-1',
        employmentType: 'permanent',
        employmentStatus: 'active',
      }),
      findByActorId: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      list: vi.fn(),
      count: vi.fn(),
    }
    templateRepo = {
      findMatch: vi.fn().mockResolvedValue({
        id: TEMPLATE_ID,
        tenantId: TENANT_ID,
        name: 'Voluntary Permanent',
        employmentType: 'permanent',
        reasonCategory: 'voluntary',
        isDefault: false,
        isActive: true,
      }),
      findDefault: vi.fn(),
      findById: vi.fn(),
      getTaskTemplates: vi.fn().mockResolvedValue([
        {
          id: 'tt-1',
          tenantId: TENANT_ID,
          templateId: TEMPLATE_ID,
          title: 'Return laptop',
          description: null,
          assigneeRole: 'it',
          dueDaysAfterTrigger: 5,
          isRequired: true,
        },
        {
          id: 'tt-2',
          tenantId: TENANT_ID,
          templateId: TEMPLATE_ID,
          title: 'Exit interview',
          description: null,
          assigneeRole: 'hr',
          dueDaysAfterTrigger: 10,
          isRequired: true,
        },
      ]),
      insert: vi.fn(),
      insertTaskTemplate: vi.fn(),
      list: vi.fn(),
    }
    caseRepo = {
      insert: vi.fn(),
      findById: vi.fn().mockResolvedValue({
        id: CASE_ID,
        tenantId: TENANT_ID,
        profileId: PROFILE_ID,
        status: 'pending',
        reason: 'Resignation',
        reasonCategory: 'voluntary',
        templateId: null,
        decisionCaseId: 'dc-1',
        createdAt: new Date(),
      }),
      findActiveByProfileId: vi.fn(),
      updateStatus: vi.fn(),
      insertTask: vi.fn(),
      getRequiredTasks: vi.fn(),
      updateTaskStatus: vi.fn(),
      findTaskById: vi.fn(),
    }
    outboxRepo = { insert: vi.fn() }
    commandBus = { execute: vi.fn() } as unknown as CommandBus
    handler = new ApproveOffboardingHandler(
      profileRepo,
      templateRepo,
      caseRepo,
      outboxRepo,
      commandBus,
    )
  })

  it('matches template, generates tasks, transitions to processing, emits event', async () => {
    await handler.execute(new ApproveOffboardingCommand(TENANT_ID, CASE_ID, APPROVER_ID))

    // Verify status transitions
    expect(profileRepo.updateStatus).toHaveBeenCalledWith(PROFILE_ID, TENANT_ID, 'offboarding')
    expect(caseRepo.updateStatus).toHaveBeenCalledWith(CASE_ID, TENANT_ID, 'approved')
    expect(caseRepo.updateStatus).toHaveBeenCalledWith(CASE_ID, TENANT_ID, 'processing')

    // Verify tasks generated
    expect(caseRepo.insertTask).toHaveBeenCalledTimes(2)
    expect(caseRepo.insertTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Return laptop',
        assigneeRole: 'it',
      }),
    )

    // Verify outbox event
    expect(outboxRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'people.offboarding-started',
      }),
    )

    // Verify decision case resolved
    expect(commandBus.execute).toHaveBeenCalled()
  })

  it('throws OffboardingCaseNotFoundException when case not found', async () => {
    vi.mocked(caseRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new ApproveOffboardingCommand(TENANT_ID, CASE_ID, APPROVER_ID)),
    ).rejects.toThrow(OffboardingCaseNotFoundException)
  })

  it('falls back to default template when no match for employment_type + reason_category', async () => {
    vi.mocked(templateRepo.findMatch).mockResolvedValue(null)
    vi.mocked(templateRepo.findDefault).mockResolvedValue({
      id: 'default-t',
      tenantId: TENANT_ID,
      name: 'Default',
      employmentType: null,
      reasonCategory: null,
      isDefault: true,
      isActive: true,
    })
    vi.mocked(templateRepo.getTaskTemplates).mockResolvedValue([])

    await handler.execute(new ApproveOffboardingCommand(TENANT_ID, CASE_ID, APPROVER_ID))

    expect(templateRepo.findDefault).toHaveBeenCalledWith(TENANT_ID)
  })
})
```

- [ ] **Step 3: Write handler**

```typescript
import { Inject } from '@nestjs/common'
import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { OffboardingCaseNotFoundException } from '../../domain/exceptions/people.exceptions'
import {
  EMPLOYMENT_PROFILE_REPOSITORY,
  type IEmploymentProfileRepository,
} from '../../domain/repositories/employment-profile.repository.port'
import {
  OFFBOARDING_TEMPLATE_REPOSITORY,
  OFFBOARDING_CASE_REPOSITORY,
  type IOffboardingTemplateRepository,
  type IOffboardingCaseRepository,
} from '../../domain/repositories/offboarding.repository.port'
import {
  OUTBOX_EVENT_REPOSITORY,
  type IOutboxEventRepository,
} from '../../../kernel/domain/repositories/outbox-event.repository.port'
import { ResolveDecisionCaseCommand } from '../../../kernel/application/commands/resolve-decision-case.command'
import { OffboardingStartedEvent } from '@future/event-contracts'
import { ApproveOffboardingCommand } from './approve-offboarding.command'

@CommandHandler(ApproveOffboardingCommand)
export class ApproveOffboardingHandler implements ICommandHandler<ApproveOffboardingCommand, void> {
  constructor(
    @Inject(EMPLOYMENT_PROFILE_REPOSITORY)
    private readonly profileRepo: IEmploymentProfileRepository,
    @Inject(OFFBOARDING_TEMPLATE_REPOSITORY)
    private readonly templateRepo: IOffboardingTemplateRepository,
    @Inject(OFFBOARDING_CASE_REPOSITORY)
    private readonly caseRepo: IOffboardingCaseRepository,
    @Inject(OUTBOX_EVENT_REPOSITORY)
    private readonly outboxRepo: IOutboxEventRepository,
    private readonly commandBus: CommandBus,
  ) {}

  async execute(command: ApproveOffboardingCommand): Promise<void> {
    const offboardingCase = await this.caseRepo.findById(
      command.offboardingCaseId,
      command.tenantId,
    )
    if (!offboardingCase) throw new OffboardingCaseNotFoundException(command.offboardingCaseId)

    const profile = await this.profileRepo.findById(offboardingCase.profileId, command.tenantId)
    if (!profile) throw new OffboardingCaseNotFoundException(command.offboardingCaseId)

    // 1. Transition employment status to offboarding
    await this.profileRepo.updateStatus(profile.id, command.tenantId, 'offboarding')

    // 2. Approve the case
    await this.caseRepo.updateStatus(command.offboardingCaseId, command.tenantId, 'approved')

    // 3. Match offboarding template
    let template = offboardingCase.reasonCategory
      ? await this.templateRepo.findMatch(
          profile.employmentType,
          offboardingCase.reasonCategory,
          command.tenantId,
        )
      : null
    if (!template) {
      template = await this.templateRepo.findDefault(command.tenantId)
    }

    // 4. Generate tasks from template
    if (template) {
      const taskTemplates = await this.templateRepo.getTaskTemplates(template.id, command.tenantId)
      for (const tt of taskTemplates) {
        const dueDate = new Date()
        dueDate.setDate(dueDate.getDate() + tt.dueDaysAfterTrigger)

        await this.caseRepo.insertTask({
          tenantId: command.tenantId,
          caseId: command.offboardingCaseId,
          actorId: null,
          title: tt.title,
          description: tt.description,
          assigneeRole: tt.assigneeRole,
          isRequired: tt.isRequired,
          dueDate,
        })
      }
    }

    // 5. Transition to processing
    await this.caseRepo.updateStatus(command.offboardingCaseId, command.tenantId, 'processing')

    // 6. Resolve decision case
    if (offboardingCase.decisionCaseId) {
      await this.commandBus.execute(
        new ResolveDecisionCaseCommand(
          command.tenantId,
          offboardingCase.decisionCaseId,
          'approved',
          command.approvedBy,
          null,
        ),
      )
    }

    // 7. Emit outbox event
    await this.outboxRepo.insert({
      tenantId: command.tenantId,
      eventName: OffboardingStartedEvent.eventName,
      payload: { actorId: profile.actorId, tenantId: command.tenantId, expectedLastDay: null },
    })
  }
}
```

- [ ] **Step 4: Run to verify pass**
- [ ] **Step 5: Commit**

---

## Task 4: RejectOffboarding (TDD)

**Files:**

- Create: `apps/api/src/modules/people/application/commands/reject-offboarding.command.ts`
- Create: `apps/api/src/modules/people/application/commands/reject-offboarding.handler.spec.ts`
- Create: `apps/api/src/modules/people/application/commands/reject-offboarding.handler.ts`

- [ ] **Step 1: Create command DTO**

```typescript
export class RejectOffboardingCommand {
  constructor(
    readonly tenantId: string,
    readonly offboardingCaseId: string,
    readonly rejectedBy: string,
    readonly comment: string,
  ) {}
}
```

- [ ] **Step 2: Write failing test**

Tests: (a) sets case status to `rejected`, resolves decision case with `'rejected'` + comment; (b) throws OffboardingCaseNotFoundException.

- [ ] **Step 3: Write handler**

Finds case, sets status to `rejected`, resolves decision case with `'rejected'` + comment, writes audit_event.

- [ ] **Step 4: Run to verify pass**
- [ ] **Step 5: Commit**

---

## Task 5: CompleteOffboarding — Atomic Termination (TDD)

Same as original plan Task 13, with **C3 fixed**:

**Fix C3:** The handler now calls real kernel commands instead of a TODO:

```typescript
// After marking profile as terminated and closing memberships:

// Kernel side effects — all via CommandBus
await this.commandBus.execute(
  new UpdateActorStatusCommand(command.tenantId, profile.actorId, 'inactive'),
)
await this.commandBus.execute(new DeprovisionUserIdentityCommand(command.tenantId, profile.actorId))
await this.commandBus.execute(new RevokeAllRoleGrantsCommand(command.tenantId, profile.actorId))

// Emit EmployeeTerminatedEvent via outbox
await this.outboxRepo.insert({
  tenantId: command.tenantId,
  eventName: EmployeeTerminatedEvent.eventName,
  payload: {
    actorId: profile.actorId,
    tenantId: command.tenantId,
    terminationDate: now.toISOString(),
  },
})
```

Imports:

```typescript
import { UpdateActorStatusCommand } from '../../../kernel/application/commands/update-actor-status.command'
import { DeprovisionUserIdentityCommand } from '../../../kernel/application/commands/deprovision-user-identity.command'
import { RevokeAllRoleGrantsCommand } from '../../../kernel/application/commands/revoke-all-role-grants.command'
import { EmployeeTerminatedEvent } from '@future/event-contracts'
```

Test must verify all 3 kernel commands are dispatched + outbox event is inserted.

- [ ] **Step 1-6: Same as original plan Task 13 with the fix above**

---

## Task 6: CompleteTask — Onboarding/Offboarding Task Completion (TDD)

**Files:**

- Create: `apps/api/src/modules/people/application/commands/complete-task.command.ts`
- Create: `apps/api/src/modules/people/application/commands/complete-task.handler.spec.ts`
- Create: `apps/api/src/modules/people/application/commands/complete-task.handler.ts`

- [ ] **Step 1: Create command DTO**

```typescript
export class CompleteTaskCommand {
  constructor(
    readonly tenantId: string,
    readonly taskId: string,
    readonly taskType: 'onboarding' | 'offboarding',
    readonly completedBy: string,
    readonly evidenceUrl: string | null,
  ) {}
}
```

- [ ] **Step 2: Write failing test**

Tests:

- (a) Marks onboarding task as completed; when all required tasks done, transitions case to `completed` + profile to `active`, emits `EmployeeActivatedEvent`
- (b) Marks offboarding task as completed; does NOT auto-complete case (that requires explicit CompleteOffboarding)
- (c) Throws TaskNotFoundException when task not found

- [ ] **Step 3: Write handler**

The handler:

1. Finds task by ID (dispatches to onboarding or offboarding repo based on `taskType`)
2. Updates task status to `completed` with `completedAt` and optional `evidenceUrl`
3. If onboarding: checks if all required tasks are done → if yes, transitions `onboarding_case.status → completed` and `employment_status → active`, emits `EmployeeActivatedEvent` via outbox
4. If offboarding: just completes the task (case completion is handled by `CompleteOffboardingCommand`)

- [ ] **Step 4: Run to verify pass**
- [ ] **Step 5: Commit**

---

## Task 7: OnCandidateHired Event Handler

**Files:**

- Create: `apps/api/src/modules/people/application/event-handlers/on-candidate-hired.handler.ts`
- Create: `apps/api/src/modules/people/application/event-handlers/on-candidate-hired.handler.spec.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandBus } from '@nestjs/cqrs'
import { OnCandidateHiredHandler } from './on-candidate-hired.handler'
import { CandidateHiredEvent } from '@future/event-contracts'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'

describe('OnCandidateHiredHandler', () => {
  let handler: OnCandidateHiredHandler
  let commandBus: CommandBus

  beforeEach(() => {
    commandBus = { execute: vi.fn().mockResolvedValue('profile-1') } as unknown as CommandBus
    handler = new OnCandidateHiredHandler(commandBus)
  })

  it('dispatches CreateEmploymentProfileCommand when candidate is hired', async () => {
    await handler.handle(new CandidateHiredEvent(TENANT_ID, ACTOR_ID, 'candidate-1', '2026-04-01'))

    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
      }),
    )
  })
})
```

- [ ] **Step 2: Write handler**

```typescript
import { CommandBus, EventsHandler, type IEventHandler } from '@nestjs/cqrs'
import { CandidateHiredEvent } from '@future/event-contracts'
import { CreateEmploymentProfileCommand } from '../commands/create-employment-profile.command'

@EventsHandler(CandidateHiredEvent)
export class OnCandidateHiredHandler implements IEventHandler<CandidateHiredEvent> {
  constructor(private readonly commandBus: CommandBus) {}

  async handle(event: CandidateHiredEvent): Promise<void> {
    await this.commandBus.execute(
      new CreateEmploymentProfileCommand(
        event.tenantId,
        event.actorId,
        'permanent', // default — can be extended when Hiring module passes employment type
        new Date(event.startDate),
        null, // employeeCode — generated later
        null, // companyEmail — generated later
        null, // jobTitle
        null, // jobLevel
      ),
    )
  }
}
```

- [ ] **Step 3: Run to verify pass**
- [ ] **Step 4: Remove .gitkeep from event-handlers/**

```bash
rm apps/api/src/modules/people/application/event-handlers/.gitkeep
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/people/application/
git commit -m "feat(people): add OnCandidateHired event handler"
```

---

**End of Part 3.** Proceed to Part 4 (queries, router, wiring).
