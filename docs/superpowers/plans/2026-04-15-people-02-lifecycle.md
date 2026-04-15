# People Module — Plan 02: Employment Lifecycle

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the employment status state machine, probation management, and contract versioning. This plan adds all lifecycle transitions (pre_hire through terminated), probation policies/records with auto-creation, and enhanced contract version tracking with expiry monitoring.

**Architecture:** Hexagonal + DDD + CQRS. State machine is a pure value object with zero NestJS deps. Each transition is a dedicated command/handler pair. Probation auto-creates via event handler on EmploymentActivatedEvent. pg-boss jobs handle reminders and expiry checks.

**Tech Stack:** NestJS, Drizzle ORM, PostgreSQL 16, tRPC, Zod, Vitest, pg-boss

**Spec Reference:** `docs/superpowers/specs/2026-04-15-people-module-redesign.md` — Sections 4 (State Machine), 10 (Probation), 11 (Contracts)

**Depends on:** Plan 01 (Foundation & Core Schema)

---

## File Structure

### Files to CREATE

```
# Value objects
apps/api/src/modules/people/domain/value-objects/employment-state-machine.ts

# Entities
apps/api/src/modules/people/domain/entities/probation-policy.entity.ts
apps/api/src/modules/people/domain/entities/probation-record.entity.ts
apps/api/src/modules/people/domain/entities/contract-version.entity.ts
apps/api/src/modules/people/domain/entities/contract-policy.entity.ts

# Repositories
apps/api/src/modules/people/domain/repositories/probation-policy.repository.ts
apps/api/src/modules/people/domain/repositories/probation-record.repository.ts
apps/api/src/modules/people/domain/repositories/contract-version.repository.ts
apps/api/src/modules/people/domain/repositories/contract-policy.repository.ts

# Infrastructure — schema additions
apps/api/src/modules/people/infrastructure/schema/lifecycle.schema.ts

# Infrastructure — repositories
apps/api/src/modules/people/infrastructure/repositories/drizzle-probation-policy.repository.ts
apps/api/src/modules/people/infrastructure/repositories/drizzle-probation-record.repository.ts
apps/api/src/modules/people/infrastructure/repositories/drizzle-contract-version.repository.ts
apps/api/src/modules/people/infrastructure/repositories/drizzle-contract-policy.repository.ts

# Commands — state machine transitions
apps/api/src/modules/people/application/commands/activate-employment.command.ts
apps/api/src/modules/people/application/commands/activate-employment.handler.ts
apps/api/src/modules/people/application/commands/activate-employment.handler.spec.ts
apps/api/src/modules/people/application/commands/start-leave.command.ts
apps/api/src/modules/people/application/commands/start-leave.handler.ts
apps/api/src/modules/people/application/commands/start-leave.handler.spec.ts
apps/api/src/modules/people/application/commands/return-from-leave.command.ts
apps/api/src/modules/people/application/commands/return-from-leave.handler.ts
apps/api/src/modules/people/application/commands/return-from-leave.handler.spec.ts
apps/api/src/modules/people/application/commands/suspend-employment.command.ts
apps/api/src/modules/people/application/commands/suspend-employment.handler.ts
apps/api/src/modules/people/application/commands/suspend-employment.handler.spec.ts
apps/api/src/modules/people/application/commands/reinstate-suspension.command.ts
apps/api/src/modules/people/application/commands/reinstate-suspension.handler.ts
apps/api/src/modules/people/application/commands/reinstate-suspension.handler.spec.ts
apps/api/src/modules/people/application/commands/give-notice.command.ts
apps/api/src/modules/people/application/commands/give-notice.handler.ts
apps/api/src/modules/people/application/commands/give-notice.handler.spec.ts
apps/api/src/modules/people/application/commands/terminate-employment.command.ts
apps/api/src/modules/people/application/commands/terminate-employment.handler.ts
apps/api/src/modules/people/application/commands/terminate-employment.handler.spec.ts
apps/api/src/modules/people/application/commands/complete-termination.command.ts
apps/api/src/modules/people/application/commands/complete-termination.handler.ts
apps/api/src/modules/people/application/commands/complete-termination.handler.spec.ts

# Commands — probation
apps/api/src/modules/people/application/commands/set-probation.command.ts
apps/api/src/modules/people/application/commands/set-probation.handler.ts
apps/api/src/modules/people/application/commands/set-probation.handler.spec.ts
apps/api/src/modules/people/application/commands/confirm-probation.command.ts
apps/api/src/modules/people/application/commands/confirm-probation.handler.ts
apps/api/src/modules/people/application/commands/confirm-probation.handler.spec.ts
apps/api/src/modules/people/application/commands/extend-probation.command.ts
apps/api/src/modules/people/application/commands/extend-probation.handler.ts
apps/api/src/modules/people/application/commands/extend-probation.handler.spec.ts
apps/api/src/modules/people/application/commands/fail-probation.command.ts
apps/api/src/modules/people/application/commands/fail-probation.handler.ts
apps/api/src/modules/people/application/commands/fail-probation.handler.spec.ts

# Commands — contracts
apps/api/src/modules/people/application/commands/create-contract-version.command.ts
apps/api/src/modules/people/application/commands/create-contract-version.handler.ts
apps/api/src/modules/people/application/commands/create-contract-version.handler.spec.ts

# Infrastructure — jobs
apps/api/src/modules/people/infrastructure/jobs/probation-reminder.job.ts
apps/api/src/modules/people/infrastructure/jobs/check-contract-expiry.job.ts

# Event contracts
packages/event-contracts/src/people/employment-activated.event.ts
packages/event-contracts/src/people/employee-on-leave.event.ts
packages/event-contracts/src/people/employee-suspended.event.ts
packages/event-contracts/src/people/employee-notice-given.event.ts
packages/event-contracts/src/people/employee-reinstated.event.ts
packages/event-contracts/src/people/employee-returned-from-leave.event.ts
packages/event-contracts/src/people/employment-terminated.event.ts
packages/event-contracts/src/people/probation-confirmed.event.ts
packages/event-contracts/src/people/probation-ending.event.ts
packages/event-contracts/src/people/contract-version-created.event.ts
packages/event-contracts/src/people/contract-expiring.event.ts

# Tests (co-located with handlers — listed above)
```

---

## Task 1: Employment Status State Machine Value Object

**Files:**

- Create: `apps/api/src/modules/people/domain/value-objects/employment-state-machine.ts`

- [ ] **Step 1: Create the state machine value object**

```typescript
// apps/api/src/modules/people/domain/value-objects/employment-state-machine.ts

import type { EmploymentStatus, TerminationReason } from './employment-status'

export interface TransitionGuard {
  description: string
}

export interface Transition {
  from: EmploymentStatus
  to: EmploymentStatus
  command: string
  guards: TransitionGuard[]
}

const TRANSITIONS: Transition[] = [
  {
    from: 'pre_hire',
    to: 'active',
    command: 'ActivateEmployment',
    guards: [
      { description: 'Start date reached' },
      { description: 'Required onboarding tasks complete' },
    ],
  },
  {
    from: 'pre_hire',
    to: 'terminated',
    command: 'TerminateEmployment',
    guards: [{ description: 'Reason must be no_show' }],
  },
  {
    from: 'active',
    to: 'on_leave',
    command: 'StartLeave',
    guards: [
      { description: 'Leave type required' },
      { description: 'Expected return date required' },
    ],
  },
  {
    from: 'active',
    to: 'suspended',
    command: 'SuspendEmployment',
    guards: [{ description: 'Reason required' }, { description: 'Review date required' }],
  },
  {
    from: 'active',
    to: 'notice_period',
    command: 'GiveNotice',
    guards: [{ description: 'Last working day required' }],
  },
  {
    from: 'active',
    to: 'terminated',
    command: 'TerminateEmployment',
    guards: [{ description: 'Direct termination: deceased, failed_probation, gross misconduct' }],
  },
  {
    from: 'on_leave',
    to: 'active',
    command: 'ReturnFromLeave',
    guards: [{ description: 'Actual return date required' }],
  },
  {
    from: 'on_leave',
    to: 'terminated',
    command: 'TerminateEmployment',
    guards: [{ description: 'Rare: company closure' }],
  },
  {
    from: 'suspended',
    to: 'active',
    command: 'ReinstateSuspension',
    guards: [{ description: 'Reinstatement reason required' }],
  },
  {
    from: 'suspended',
    to: 'terminated',
    command: 'TerminateEmployment',
    guards: [{ description: 'Investigation concluded' }],
  },
  {
    from: 'notice_period',
    to: 'terminated',
    command: 'CompleteTermination',
    guards: [{ description: 'Last working day reached' }],
  },
]

const VALID_TRANSITIONS_MAP = new Map<string, Transition>()
for (const t of TRANSITIONS) {
  VALID_TRANSITIONS_MAP.set(`${t.from}:${t.to}`, t)
}

export function canTransition(from: EmploymentStatus, to: EmploymentStatus): boolean {
  return VALID_TRANSITIONS_MAP.has(`${from}:${to}`)
}

export function getTransition(from: EmploymentStatus, to: EmploymentStatus): Transition | null {
  return VALID_TRANSITIONS_MAP.get(`${from}:${to}`) ?? null
}

export function getValidTargetStates(from: EmploymentStatus): EmploymentStatus[] {
  return TRANSITIONS.filter((t) => t.from === from).map((t) => t.to)
}

/** Termination reasons allowed for direct active -> terminated (no notice period) */
export const DIRECT_TERMINATION_REASONS: TerminationReason[] = [
  'deceased',
  'failed_probation',
  'involuntary_misconduct',
]

/** Termination reasons allowed from pre_hire -> terminated */
export const PRE_HIRE_TERMINATION_REASONS: TerminationReason[] = ['no_show']
```

- [ ] **Step 2: Write unit test for state machine**

```typescript
// apps/api/src/modules/people/domain/value-objects/employment-state-machine.spec.ts

import { describe, expect, it } from 'vitest'
import { canTransition, getTransition, getValidTargetStates } from './employment-state-machine'

describe('EmploymentStateMachine', () => {
  it('allows pre_hire -> active', () => {
    expect(canTransition('pre_hire', 'active')).toBe(true)
  })

  it('allows pre_hire -> terminated', () => {
    expect(canTransition('pre_hire', 'terminated')).toBe(true)
  })

  it('rejects pre_hire -> on_leave', () => {
    expect(canTransition('pre_hire', 'on_leave')).toBe(false)
  })

  it('rejects terminated -> active', () => {
    expect(canTransition('terminated', 'active')).toBe(false)
  })

  it('allows active -> on_leave, suspended, notice_period, terminated', () => {
    const targets = getValidTargetStates('active')
    expect(targets).toEqual(
      expect.arrayContaining(['on_leave', 'suspended', 'notice_period', 'terminated']),
    )
    expect(targets).toHaveLength(4)
  })

  it('returns transition details', () => {
    const t = getTransition('active', 'on_leave')
    expect(t).not.toBeNull()
    expect(t!.command).toBe('StartLeave')
    expect(t!.guards.length).toBeGreaterThan(0)
  })

  it('returns null for invalid transition', () => {
    expect(getTransition('terminated', 'active')).toBeNull()
  })

  it('notice_period can only go to terminated', () => {
    const targets = getValidTargetStates('notice_period')
    expect(targets).toEqual(['terminated'])
  })

  it('terminated is a terminal state', () => {
    expect(getValidTargetStates('terminated')).toEqual([])
  })
})
```

- [ ] **Step 3: Run test and commit**

```bash
cd apps/api && bunx vitest run src/modules/people/domain/value-objects/employment-state-machine.spec.ts
git add apps/api/src/modules/people/domain/value-objects/employment-state-machine*
git commit -m "feat(people): add employment status state machine value object"
```

---

## Task 2: ActivateEmployment Command + Handler + Test

**Files:**

- Create: `activate-employment.command.ts`, `activate-employment.handler.ts`, `activate-employment.handler.spec.ts`

- [ ] **Step 1: Write the command class**

```typescript
// apps/api/src/modules/people/application/commands/activate-employment.command.ts

export class ActivateEmploymentCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly activatedBy: string,
    readonly effectiveDate?: Date,
  ) {}
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// apps/api/src/modules/people/application/commands/activate-employment.handler.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ActivateEmploymentCommand } from './activate-employment.command'
import { ActivateEmploymentHandler } from './activate-employment.handler'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import {
  EmploymentNotFoundException,
  InvalidEmploymentStatusTransitionException,
} from '../../domain/exceptions/people.exceptions'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000002'
const ACTOR_ID = '01900000-0000-7000-8000-000000000003'

describe('ActivateEmploymentHandler', () => {
  let handler: ActivateEmploymentHandler
  let employmentRepo: IEmploymentRepository
  let eventBus: { publish: ReturnType<typeof vi.fn> }

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
    eventBus = { publish: vi.fn() }
    handler = new ActivateEmploymentHandler(employmentRepo, eventBus as any)
  })

  it('activates a pre_hire employment when hire date is reached', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
      employmentStatus: 'pre_hire',
      hireDate: new Date('2026-04-01'),
      personProfileId: 'profile-1',
    } as any)

    await handler.execute(new ActivateEmploymentCommand(TENANT_ID, EMPLOYMENT_ID, ACTOR_ID))

    expect(employmentRepo.updateStatus).toHaveBeenCalledWith(
      EMPLOYMENT_ID,
      TENANT_ID,
      'active',
      null,
      null,
    )
    expect(eventBus.publish).toHaveBeenCalled()
  })

  it('throws EmploymentNotFoundException when employment does not exist', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new ActivateEmploymentCommand(TENANT_ID, EMPLOYMENT_ID, ACTOR_ID)),
    ).rejects.toThrow(EmploymentNotFoundException)
  })

  it('throws InvalidEmploymentStatusTransitionException when not pre_hire', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
      employmentStatus: 'active',
    } as any)

    await expect(
      handler.execute(new ActivateEmploymentCommand(TENANT_ID, EMPLOYMENT_ID, ACTOR_ID)),
    ).rejects.toThrow(InvalidEmploymentStatusTransitionException)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd apps/api && bunx vitest run src/modules/people/application/commands/activate-employment.handler.spec.ts
```

- [ ] **Step 4: Implement the handler**

```typescript
// apps/api/src/modules/people/application/commands/activate-employment.handler.ts

import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import {
  EmploymentNotFoundException,
  InvalidEmploymentStatusTransitionException,
} from '../../domain/exceptions/people.exceptions'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import { canTransition } from '../../domain/value-objects/employment-state-machine'
import { ActivateEmploymentCommand } from './activate-employment.command'

@CommandHandler(ActivateEmploymentCommand)
export class ActivateEmploymentHandler implements ICommandHandler<ActivateEmploymentCommand, void> {
  constructor(
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: ActivateEmploymentCommand): Promise<void> {
    const employment = await this.employmentRepo.findById(command.employmentId, command.tenantId)
    if (!employment) {
      throw new EmploymentNotFoundException(command.employmentId)
    }

    if (!canTransition(employment.employmentStatus, 'active')) {
      throw new InvalidEmploymentStatusTransitionException(employment.employmentStatus, 'active')
    }

    await this.employmentRepo.updateStatus(
      command.employmentId,
      command.tenantId,
      'active',
      null,
      null,
    )

    // Emit EmploymentActivatedEvent — triggers probation auto-creation
    this.eventBus.publish({
      tenantId: command.tenantId,
      employmentId: command.employmentId,
      actorId: command.activatedBy,
      effectiveDate: command.effectiveDate ?? new Date(),
    })
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd apps/api && bunx vitest run src/modules/people/application/commands/activate-employment.handler.spec.ts
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/people/application/commands/activate-employment*
git commit -m "feat(people): add ActivateEmployment command — pre_hire to active transition"
```

---

## Task 3: StartLeave Command + Handler + Test

**Files:**

- Create: `start-leave.command.ts`, `start-leave.handler.ts`, `start-leave.handler.spec.ts`

- [ ] **Step 1: Write the command class**

```typescript
// apps/api/src/modules/people/application/commands/start-leave.command.ts

export class StartLeaveCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly leaveType: string,
    readonly expectedReturnDate: Date,
    readonly initiatedBy: string,
    readonly note?: string | null,
  ) {}
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// apps/api/src/modules/people/application/commands/start-leave.handler.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StartLeaveCommand } from './start-leave.command'
import { StartLeaveHandler } from './start-leave.handler'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import {
  EmploymentNotFoundException,
  InvalidEmploymentStatusTransitionException,
} from '../../domain/exceptions/people.exceptions'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000002'
const ACTOR_ID = '01900000-0000-7000-8000-000000000003'

describe('StartLeaveHandler', () => {
  let handler: StartLeaveHandler
  let employmentRepo: IEmploymentRepository
  let eventBus: { publish: ReturnType<typeof vi.fn> }

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
    eventBus = { publish: vi.fn() }
    handler = new StartLeaveHandler(employmentRepo, eventBus as any)
  })

  it('transitions active employment to on_leave', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
      employmentStatus: 'active',
    } as any)

    await handler.execute(
      new StartLeaveCommand(
        TENANT_ID,
        EMPLOYMENT_ID,
        'maternity',
        new Date('2026-10-01'),
        ACTOR_ID,
      ),
    )

    expect(employmentRepo.updateStatus).toHaveBeenCalledWith(
      EMPLOYMENT_ID,
      TENANT_ID,
      'on_leave',
      null,
      null,
    )
    expect(eventBus.publish).toHaveBeenCalled()
  })

  it('throws EmploymentNotFoundException when employment does not exist', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(
        new StartLeaveCommand(TENANT_ID, EMPLOYMENT_ID, 'maternity', new Date(), ACTOR_ID),
      ),
    ).rejects.toThrow(EmploymentNotFoundException)
  })

  it('throws InvalidEmploymentStatusTransitionException when not active', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      employmentStatus: 'suspended',
    } as any)

    await expect(
      handler.execute(
        new StartLeaveCommand(TENANT_ID, EMPLOYMENT_ID, 'maternity', new Date(), ACTOR_ID),
      ),
    ).rejects.toThrow(InvalidEmploymentStatusTransitionException)
  })
})
```

- [ ] **Step 3: Implement the handler**

```typescript
// apps/api/src/modules/people/application/commands/start-leave.handler.ts

import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import {
  EmploymentNotFoundException,
  InvalidEmploymentStatusTransitionException,
} from '../../domain/exceptions/people.exceptions'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import { canTransition } from '../../domain/value-objects/employment-state-machine'
import { StartLeaveCommand } from './start-leave.command'

@CommandHandler(StartLeaveCommand)
export class StartLeaveHandler implements ICommandHandler<StartLeaveCommand, void> {
  constructor(
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: StartLeaveCommand): Promise<void> {
    const employment = await this.employmentRepo.findById(command.employmentId, command.tenantId)
    if (!employment) {
      throw new EmploymentNotFoundException(command.employmentId)
    }

    if (!canTransition(employment.employmentStatus, 'on_leave')) {
      throw new InvalidEmploymentStatusTransitionException(employment.employmentStatus, 'on_leave')
    }

    await this.employmentRepo.updateStatus(
      command.employmentId,
      command.tenantId,
      'on_leave',
      null,
      null,
    )

    this.eventBus.publish({
      tenantId: command.tenantId,
      employmentId: command.employmentId,
      leaveType: command.leaveType,
      expectedReturnDate: command.expectedReturnDate,
    })
  }
}
```

- [ ] **Step 4: Run tests and commit**

```bash
cd apps/api && bunx vitest run src/modules/people/application/commands/start-leave.handler.spec.ts
git add apps/api/src/modules/people/application/commands/start-leave*
git commit -m "feat(people): add StartLeave command — active to on_leave transition"
```

---

## Task 4: ReturnFromLeave Command + Handler + Test

**Files:**

- Create: `return-from-leave.command.ts`, `return-from-leave.handler.ts`, `return-from-leave.handler.spec.ts`

- [ ] **Step 1: Write the command class**

```typescript
// apps/api/src/modules/people/application/commands/return-from-leave.command.ts

export class ReturnFromLeaveCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly actualReturnDate: Date,
    readonly initiatedBy: string,
  ) {}
}
```

- [ ] **Step 2: Write test and handler**

Follow the identical pattern as StartLeave. Test cases:

1. Transitions on_leave to active
2. Throws EmploymentNotFoundException
3. Throws InvalidEmploymentStatusTransitionException when not on_leave

```typescript
// apps/api/src/modules/people/application/commands/return-from-leave.handler.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReturnFromLeaveCommand } from './return-from-leave.command'
import { ReturnFromLeaveHandler } from './return-from-leave.handler'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import {
  EmploymentNotFoundException,
  InvalidEmploymentStatusTransitionException,
} from '../../domain/exceptions/people.exceptions'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000002'
const ACTOR_ID = '01900000-0000-7000-8000-000000000003'

describe('ReturnFromLeaveHandler', () => {
  let handler: ReturnFromLeaveHandler
  let employmentRepo: IEmploymentRepository
  let eventBus: { publish: ReturnType<typeof vi.fn> }

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
    eventBus = { publish: vi.fn() }
    handler = new ReturnFromLeaveHandler(employmentRepo, eventBus as any)
  })

  it('transitions on_leave employment to active', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
      employmentStatus: 'on_leave',
    } as any)

    await handler.execute(
      new ReturnFromLeaveCommand(TENANT_ID, EMPLOYMENT_ID, new Date('2026-10-01'), ACTOR_ID),
    )

    expect(employmentRepo.updateStatus).toHaveBeenCalledWith(
      EMPLOYMENT_ID,
      TENANT_ID,
      'active',
      null,
      null,
    )
  })

  it('throws EmploymentNotFoundException', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new ReturnFromLeaveCommand(TENANT_ID, EMPLOYMENT_ID, new Date(), ACTOR_ID)),
    ).rejects.toThrow(EmploymentNotFoundException)
  })

  it('throws InvalidEmploymentStatusTransitionException when active', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      employmentStatus: 'active',
    } as any)

    await expect(
      handler.execute(new ReturnFromLeaveCommand(TENANT_ID, EMPLOYMENT_ID, new Date(), ACTOR_ID)),
    ).rejects.toThrow(InvalidEmploymentStatusTransitionException)
  })
})
```

- [ ] **Step 3: Implement handler** — same pattern as StartLeave, target state `'active'`, emits `EmployeeReturnedFromLeaveEvent`.

- [ ] **Step 4: Run tests and commit**

```bash
cd apps/api && bunx vitest run src/modules/people/application/commands/return-from-leave.handler.spec.ts
git add apps/api/src/modules/people/application/commands/return-from-leave*
git commit -m "feat(people): add ReturnFromLeave command — on_leave to active transition"
```

---

## Task 5: SuspendEmployment Command + Handler + Test

**Files:**

- Create: `suspend-employment.command.ts`, `suspend-employment.handler.ts`, `suspend-employment.handler.spec.ts`

- [ ] **Step 1: Write command class**

```typescript
// apps/api/src/modules/people/application/commands/suspend-employment.command.ts

export class SuspendEmploymentCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly reason: string,
    readonly reviewDate: Date,
    readonly suspendedBy: string,
  ) {}
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// apps/api/src/modules/people/application/commands/suspend-employment.handler.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SuspendEmploymentCommand } from './suspend-employment.command'
import { SuspendEmploymentHandler } from './suspend-employment.handler'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import {
  EmploymentNotFoundException,
  InvalidEmploymentStatusTransitionException,
} from '../../domain/exceptions/people.exceptions'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000002'
const ACTOR_ID = '01900000-0000-7000-8000-000000000003'

describe('SuspendEmploymentHandler', () => {
  let handler: SuspendEmploymentHandler
  let employmentRepo: IEmploymentRepository
  let eventBus: { publish: ReturnType<typeof vi.fn> }

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
    eventBus = { publish: vi.fn() }
    handler = new SuspendEmploymentHandler(employmentRepo, eventBus as any)
  })

  it('suspends an active employment', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
      employmentStatus: 'active',
    } as any)

    await handler.execute(
      new SuspendEmploymentCommand(
        TENANT_ID,
        EMPLOYMENT_ID,
        'Investigation pending',
        new Date('2026-06-01'),
        ACTOR_ID,
      ),
    )

    expect(employmentRepo.updateStatus).toHaveBeenCalledWith(
      EMPLOYMENT_ID,
      TENANT_ID,
      'suspended',
      null,
      null,
    )
    expect(eventBus.publish).toHaveBeenCalled()
  })

  it('throws when employment is on_leave (not active)', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      employmentStatus: 'on_leave',
    } as any)

    await expect(
      handler.execute(
        new SuspendEmploymentCommand(TENANT_ID, EMPLOYMENT_ID, 'reason', new Date(), ACTOR_ID),
      ),
    ).rejects.toThrow(InvalidEmploymentStatusTransitionException)
  })
})
```

- [ ] **Step 3: Implement handler** — validates active -> suspended, emits `EmployeeSuspendedEvent`.

- [ ] **Step 4: Run tests and commit**

```bash
cd apps/api && bunx vitest run src/modules/people/application/commands/suspend-employment.handler.spec.ts
git add apps/api/src/modules/people/application/commands/suspend-employment*
git commit -m "feat(people): add SuspendEmployment command — active to suspended transition"
```

---

## Task 6: ReinstateSuspension Command + Handler + Test

**Files:**

- Create: `reinstate-suspension.command.ts`, `reinstate-suspension.handler.ts`, `reinstate-suspension.handler.spec.ts`

- [ ] **Step 1: Write command class**

```typescript
// apps/api/src/modules/people/application/commands/reinstate-suspension.command.ts

export class ReinstateSuspensionCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly reason: string,
    readonly reinstatedBy: string,
  ) {}
}
```

- [ ] **Step 2: Write test** — validates suspended -> active transition, throws on non-suspended status, emits `EmployeeReinstatedEvent`.

- [ ] **Step 3: Implement handler** — same pattern, target state `'active'`.

- [ ] **Step 4: Run tests and commit**

```bash
cd apps/api && bunx vitest run src/modules/people/application/commands/reinstate-suspension.handler.spec.ts
git add apps/api/src/modules/people/application/commands/reinstate-suspension*
git commit -m "feat(people): add ReinstateSuspension command — suspended to active transition"
```

---

## Task 7: GiveNotice Command + Handler + Test

**Files:**

- Create: `give-notice.command.ts`, `give-notice.handler.ts`, `give-notice.handler.spec.ts`

- [ ] **Step 1: Write command class**

```typescript
// apps/api/src/modules/people/application/commands/give-notice.command.ts

export class GiveNoticeCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly lastWorkingDay: Date,
    readonly noticeType: 'employee_resignation' | 'employer_notice',
    readonly initiatedBy: string,
    readonly reason?: string | null,
  ) {}
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// apps/api/src/modules/people/application/commands/give-notice.handler.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GiveNoticeCommand } from './give-notice.command'
import { GiveNoticeHandler } from './give-notice.handler'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import {
  EmploymentNotFoundException,
  InvalidEmploymentStatusTransitionException,
} from '../../domain/exceptions/people.exceptions'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000002'
const ACTOR_ID = '01900000-0000-7000-8000-000000000003'

describe('GiveNoticeHandler', () => {
  let handler: GiveNoticeHandler
  let employmentRepo: IEmploymentRepository
  let eventBus: { publish: ReturnType<typeof vi.fn> }

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
    eventBus = { publish: vi.fn() }
    handler = new GiveNoticeHandler(employmentRepo, eventBus as any)
  })

  it('transitions active employment to notice_period', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
      employmentStatus: 'active',
    } as any)

    await handler.execute(
      new GiveNoticeCommand(
        TENANT_ID,
        EMPLOYMENT_ID,
        new Date('2026-06-30'),
        'employee_resignation',
        ACTOR_ID,
      ),
    )

    expect(employmentRepo.updateStatus).toHaveBeenCalledWith(
      EMPLOYMENT_ID,
      TENANT_ID,
      'notice_period',
      null,
      null,
    )
    expect(eventBus.publish).toHaveBeenCalled()
  })

  it('throws when employment is suspended', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      employmentStatus: 'suspended',
    } as any)

    await expect(
      handler.execute(
        new GiveNoticeCommand(
          TENANT_ID,
          EMPLOYMENT_ID,
          new Date(),
          'employee_resignation',
          ACTOR_ID,
        ),
      ),
    ).rejects.toThrow(InvalidEmploymentStatusTransitionException)
  })
})
```

- [ ] **Step 3: Implement handler** — validates active -> notice_period, stores lastWorkingDay on employment, emits `EmployeeNoticeGivenEvent`.

- [ ] **Step 4: Run tests and commit**

```bash
cd apps/api && bunx vitest run src/modules/people/application/commands/give-notice.handler.spec.ts
git add apps/api/src/modules/people/application/commands/give-notice*
git commit -m "feat(people): add GiveNotice command — active to notice_period transition"
```

---

## Task 8: TerminateEmployment Command + Handler + Test

**Files:**

- Create: `terminate-employment.command.ts`, `terminate-employment.handler.ts`, `terminate-employment.handler.spec.ts`

- [ ] **Step 1: Write command class**

```typescript
// apps/api/src/modules/people/application/commands/terminate-employment.command.ts

import type { TerminationReason } from '../../domain/value-objects/employment-status'

export class TerminateEmploymentCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly terminationReason: TerminationReason,
    readonly terminationDate: Date,
    readonly terminatedBy: string,
    readonly note?: string | null,
  ) {}
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// apps/api/src/modules/people/application/commands/terminate-employment.handler.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TerminateEmploymentCommand } from './terminate-employment.command'
import { TerminateEmploymentHandler } from './terminate-employment.handler'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import {
  EmploymentNotFoundException,
  InvalidEmploymentStatusTransitionException,
} from '../../domain/exceptions/people.exceptions'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000002'
const ACTOR_ID = '01900000-0000-7000-8000-000000000003'

describe('TerminateEmploymentHandler', () => {
  let handler: TerminateEmploymentHandler
  let employmentRepo: IEmploymentRepository
  let eventBus: { publish: ReturnType<typeof vi.fn> }

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
    eventBus = { publish: vi.fn() }
    handler = new TerminateEmploymentHandler(employmentRepo, eventBus as any)
  })

  it('terminates from pre_hire with no_show reason', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
      employmentStatus: 'pre_hire',
      personProfileId: 'profile-1',
    } as any)

    await handler.execute(
      new TerminateEmploymentCommand(
        TENANT_ID,
        EMPLOYMENT_ID,
        'no_show',
        new Date('2026-05-01'),
        ACTOR_ID,
      ),
    )

    expect(employmentRepo.updateStatus).toHaveBeenCalledWith(
      EMPLOYMENT_ID,
      TENANT_ID,
      'terminated',
      new Date('2026-05-01'),
      'no_show',
    )
  })

  it('terminates active employment with deceased reason (direct)', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
      employmentStatus: 'active',
      personProfileId: 'profile-1',
    } as any)

    await handler.execute(
      new TerminateEmploymentCommand(TENANT_ID, EMPLOYMENT_ID, 'deceased', new Date(), ACTOR_ID),
    )

    expect(employmentRepo.updateStatus).toHaveBeenCalledWith(
      EMPLOYMENT_ID,
      TENANT_ID,
      'terminated',
      expect.any(Date),
      'deceased',
    )
  })

  it('terminates suspended employment', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
      employmentStatus: 'suspended',
      personProfileId: 'profile-1',
    } as any)

    await handler.execute(
      new TerminateEmploymentCommand(
        TENANT_ID,
        EMPLOYMENT_ID,
        'involuntary_misconduct',
        new Date(),
        ACTOR_ID,
      ),
    )

    expect(employmentRepo.updateStatus).toHaveBeenCalled()
  })

  it('throws when employment is already terminated', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      employmentStatus: 'terminated',
    } as any)

    await expect(
      handler.execute(
        new TerminateEmploymentCommand(
          TENANT_ID,
          EMPLOYMENT_ID,
          'voluntary_resignation',
          new Date(),
          ACTOR_ID,
        ),
      ),
    ).rejects.toThrow(InvalidEmploymentStatusTransitionException)
  })

  it('throws EmploymentNotFoundException', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(
        new TerminateEmploymentCommand(
          TENANT_ID,
          EMPLOYMENT_ID,
          'voluntary_resignation',
          new Date(),
          ACTOR_ID,
        ),
      ),
    ).rejects.toThrow(EmploymentNotFoundException)
  })
})
```

- [ ] **Step 3: Implement handler** — validates transition using `canTransition`, validates termination reason against source state constraints (pre_hire only allows no_show, active direct only allows DIRECT_TERMINATION_REASONS), emits `EmploymentTerminatedEvent`.

- [ ] **Step 4: Run tests and commit**

```bash
cd apps/api && bunx vitest run src/modules/people/application/commands/terminate-employment.handler.spec.ts
git add apps/api/src/modules/people/application/commands/terminate-employment*
git commit -m "feat(people): add TerminateEmployment command — multi-source termination"
```

---

## Task 9: CompleteTermination Command + Handler + Test

**Files:**

- Create: `complete-termination.command.ts`, `complete-termination.handler.ts`, `complete-termination.handler.spec.ts`

- [ ] **Step 1: Write command class**

```typescript
// apps/api/src/modules/people/application/commands/complete-termination.command.ts

export class CompleteTerminationCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly completedBy: string,
  ) {}
}
```

- [ ] **Step 2: Write test** — validates notice_period -> terminated, throws on non-notice_period status.

- [ ] **Step 3: Implement handler** — validates only notice_period source, sets terminationDate to today, emits `EmploymentTerminatedEvent`.

- [ ] **Step 4: Run tests and commit**

```bash
cd apps/api && bunx vitest run src/modules/people/application/commands/complete-termination.handler.spec.ts
git add apps/api/src/modules/people/application/commands/complete-termination*
git commit -m "feat(people): add CompleteTermination command — notice_period to terminated"
```

---

## Task 10: Probation Policy Schema + Entity + Repository + Drizzle Repo

**Files:**

- Create: entity, repository interface, Drizzle schema, Drizzle repository

- [ ] **Step 1: Create probation policy entity**

```typescript
// apps/api/src/modules/people/domain/entities/probation-policy.entity.ts

export interface ProbationPolicy {
  id: string
  tenantId: string
  countryCode: string
  jobLevelCategory: 'executive' | 'professional' | 'technical' | 'general'
  defaultDurationDays: number
  maxDurationDays: number
  allowExtension: boolean
  maxExtensions: number
  extensionDays: number | null
  minSalaryPercentage: number
  autoConfirm: boolean
  createdAt: Date
  updatedAt: Date
}
```

- [ ] **Step 2: Create repository interface**

```typescript
// apps/api/src/modules/people/domain/repositories/probation-policy.repository.ts

import type { ProbationPolicy } from '../entities/probation-policy.entity'

export const PROBATION_POLICY_REPOSITORY = Symbol('IProbationPolicyRepository')

export interface IProbationPolicyRepository {
  findById(id: string, tenantId: string): Promise<ProbationPolicy | null>
  findByCountryAndLevel(
    countryCode: string,
    jobLevelCategory: string,
    tenantId: string,
  ): Promise<ProbationPolicy | null>
  listByTenant(tenantId: string): Promise<ProbationPolicy[]>
  insert(data: Omit<ProbationPolicy, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProbationPolicy>
  update(
    id: string,
    tenantId: string,
    data: Partial<Omit<ProbationPolicy, 'id' | 'tenantId' | 'createdAt'>>,
  ): Promise<ProbationPolicy>
}
```

- [ ] **Step 3: Add to Drizzle schema**

```typescript
// apps/api/src/modules/people/infrastructure/schema/lifecycle.schema.ts

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
import { peopleSchema } from './people.schema'

export const probationPolicy = peopleSchema.table(
  'probation_policy',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    countryCode: text('country_code').notNull(),
    jobLevelCategory: text('job_level_category', {
      enum: ['executive', 'professional', 'technical', 'general'],
    }).notNull(),
    defaultDurationDays: integer('default_duration_days').notNull(),
    maxDurationDays: integer('max_duration_days').notNull(),
    allowExtension: boolean('allow_extension').notNull(),
    maxExtensions: integer('max_extensions').notNull(),
    extensionDays: integer('extension_days'),
    minSalaryPercentage: numeric('min_salary_percentage').notNull(),
    autoConfirm: boolean('auto_confirm').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_probation_policy_country_level').on(
      table.tenantId,
      table.countryCode,
      table.jobLevelCategory,
    ),
  ],
)

export const probationRecord = peopleSchema.table(
  'probation_record',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    employmentId: uuid('employment_id').notNull(),
    startDate: date('start_date', { mode: 'date' }).notNull(),
    originalEndDate: date('original_end_date', { mode: 'date' }).notNull(),
    currentEndDate: date('current_end_date', { mode: 'date' }).notNull(),
    extensionCount: integer('extension_count').notNull().default(0),
    status: text('status', {
      enum: ['active', 'passed', 'failed', 'extended', 'not_applicable'],
    }).notNull(),
    outcomeDate: date('outcome_date', { mode: 'date' }),
    outcomeBy: uuid('outcome_by'),
    outcomeNote: text('outcome_note'),
    probationPolicyId: uuid('probation_policy_id').notNull(),
    salaryPercentage: numeric('salary_percentage').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('uq_probation_record_employment').on(table.tenantId, table.employmentId)],
)

export const contractVersion = peopleSchema.table('contract_version', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  employmentId: uuid('employment_id').notNull(),
  contractType: text('contract_type', {
    enum: ['indefinite', 'fixed_term', 'seasonal', 'probation', 'internship', 'consultancy'],
  }).notNull(),
  startDate: date('start_date', { mode: 'date' }).notNull(),
  endDate: date('end_date', { mode: 'date' }),
  status: text('status', {
    enum: ['draft', 'active', 'expired', 'terminated', 'superseded'],
  }).notNull(),
  probationEndDate: date('probation_end_date', { mode: 'date' }),
  noticePeriodDays: integer('notice_period_days'),
  workHoursPerWeek: numeric('work_hours_per_week'),
  baseSalary: numeric('base_salary'),
  salaryCurrency: text('salary_currency'),
  salaryFrequency: text('salary_frequency', {
    enum: ['monthly', 'biweekly', 'weekly', 'annual'],
  }),
  documentId: uuid('document_id'),
  note: text('note'),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  signedAt: timestamp('signed_at'),
  signedBy: uuid('signed_by'),
})

export const contractPolicy = peopleSchema.table(
  'contract_policy',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    countryCode: text('country_code').notNull(),
    maxFixedTermMonths: integer('max_fixed_term_months'),
    maxFixedTermRenewals: integer('max_fixed_term_renewals'),
    forceIndefiniteAfter: boolean('force_indefinite_after').notNull(),
    probationRequiresContract: boolean('probation_requires_contract').notNull(),
  },
  (table) => [uniqueIndex('uq_contract_policy_country').on(table.tenantId, table.countryCode)],
)
```

- [ ] **Step 4: Implement Drizzle repo**

```typescript
// apps/api/src/modules/people/infrastructure/repositories/drizzle-probation-policy.repository.ts

import { Inject, Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { DB_TOKEN, type Db } from '@future/db'
import type { ProbationPolicy } from '../../domain/entities/probation-policy.entity'
import type { IProbationPolicyRepository } from '../../domain/repositories/probation-policy.repository'
import { probationPolicy } from '../schema/lifecycle.schema'

@Injectable()
export class DrizzleProbationPolicyRepository implements IProbationPolicyRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<ProbationPolicy | null> {
    const rows = await this.db
      .select()
      .from(probationPolicy)
      .where(and(eq(probationPolicy.id, id), eq(probationPolicy.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as ProbationPolicy | undefined) ?? null
  }

  async findByCountryAndLevel(
    countryCode: string,
    jobLevelCategory: string,
    tenantId: string,
  ): Promise<ProbationPolicy | null> {
    const rows = await this.db
      .select()
      .from(probationPolicy)
      .where(
        and(
          eq(probationPolicy.tenantId, tenantId),
          eq(probationPolicy.countryCode, countryCode),
          eq(probationPolicy.jobLevelCategory, jobLevelCategory as any),
        ),
      )
      .limit(1)
    return (rows[0] as ProbationPolicy | undefined) ?? null
  }

  async listByTenant(tenantId: string): Promise<ProbationPolicy[]> {
    return (await this.db
      .select()
      .from(probationPolicy)
      .where(eq(probationPolicy.tenantId, tenantId))) as ProbationPolicy[]
  }

  async insert(
    data: Omit<ProbationPolicy, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ProbationPolicy> {
    const rows = await this.db
      .insert(probationPolicy)
      .values(data as Record<string, unknown>)
      .returning()
    return rows[0] as ProbationPolicy
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<Omit<ProbationPolicy, 'id' | 'tenantId' | 'createdAt'>>,
  ): Promise<ProbationPolicy> {
    const rows = await this.db
      .update(probationPolicy)
      .set({ ...data, updatedAt: new Date() } as Record<string, unknown>)
      .where(and(eq(probationPolicy.id, id), eq(probationPolicy.tenantId, tenantId)))
      .returning()
    return rows[0] as ProbationPolicy
  }
}
```

- [ ] **Step 5: Run build and commit**

```bash
bun run --filter @future/db build
git add apps/api/src/modules/people/domain/entities/probation-policy* \
  apps/api/src/modules/people/domain/repositories/probation-policy* \
  apps/api/src/modules/people/infrastructure/schema/lifecycle.schema.ts \
  apps/api/src/modules/people/infrastructure/repositories/drizzle-probation-policy*
git commit -m "feat(people): add probation policy schema, entity, repository"
```

---

## Task 11: Probation Record Schema + Entity + Repository + Drizzle Repo

**Files:**

- Create: entity, repository interface, Drizzle repository (schema already in Task 10)

- [ ] **Step 1: Create probation record entity**

```typescript
// apps/api/src/modules/people/domain/entities/probation-record.entity.ts

export interface ProbationRecord {
  id: string
  tenantId: string
  employmentId: string
  startDate: Date
  originalEndDate: Date
  currentEndDate: Date
  extensionCount: number
  status: 'active' | 'passed' | 'failed' | 'extended' | 'not_applicable'
  outcomeDate: Date | null
  outcomeBy: string | null
  outcomeNote: string | null
  probationPolicyId: string
  salaryPercentage: number
  createdAt: Date
  updatedAt: Date
}
```

- [ ] **Step 2: Create repository interface**

```typescript
// apps/api/src/modules/people/domain/repositories/probation-record.repository.ts

import type { ProbationRecord } from '../entities/probation-record.entity'

export const PROBATION_RECORD_REPOSITORY = Symbol('IProbationRecordRepository')

export interface IProbationRecordRepository {
  findById(id: string, tenantId: string): Promise<ProbationRecord | null>
  findByEmploymentId(employmentId: string, tenantId: string): Promise<ProbationRecord | null>
  findActiveByTenant(tenantId: string): Promise<ProbationRecord[]>
  findEndingBefore(tenantId: string, beforeDate: Date): Promise<ProbationRecord[]>
  insert(data: Omit<ProbationRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProbationRecord>
  update(
    id: string,
    tenantId: string,
    data: Partial<Omit<ProbationRecord, 'id' | 'tenantId' | 'employmentId' | 'createdAt'>>,
  ): Promise<ProbationRecord>
}
```

- [ ] **Step 3: Implement Drizzle repo** — standard CRUD pattern, `findEndingBefore` uses `lte(probationRecord.currentEndDate, beforeDate)` with status in `['active', 'extended']`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/people/domain/entities/probation-record* \
  apps/api/src/modules/people/domain/repositories/probation-record* \
  apps/api/src/modules/people/infrastructure/repositories/drizzle-probation-record*
git commit -m "feat(people): add probation record entity, repository"
```

---

## Task 12: SetProbation Command (Auto-Triggered) + Handler + Test

**Files:**

- Create: `set-probation.command.ts`, `set-probation.handler.ts`, `set-probation.handler.spec.ts`

- [ ] **Step 1: Write command class**

```typescript
// apps/api/src/modules/people/application/commands/set-probation.command.ts

export class SetProbationCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
  ) {}
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// apps/api/src/modules/people/application/commands/set-probation.handler.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SetProbationCommand } from './set-probation.command'
import { SetProbationHandler } from './set-probation.handler'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { IProbationPolicyRepository } from '../../domain/repositories/probation-policy.repository'
import type { IProbationRecordRepository } from '../../domain/repositories/probation-record.repository'
import type { IJobAssignmentRepository } from '../../domain/repositories/job-assignment.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000002'
const POLICY_ID = '01900000-0000-7000-8000-000000000003'

describe('SetProbationHandler', () => {
  let handler: SetProbationHandler
  let employmentRepo: IEmploymentRepository
  let policyRepo: IProbationPolicyRepository
  let recordRepo: IProbationRecordRepository
  let assignmentRepo: IJobAssignmentRepository

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
    policyRepo = {
      findById: vi.fn(),
      findByCountryAndLevel: vi.fn(),
      listByTenant: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    recordRepo = {
      findById: vi.fn(),
      findByEmploymentId: vi.fn(),
      findActiveByTenant: vi.fn(),
      findEndingBefore: vi.fn(),
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
    handler = new SetProbationHandler(employmentRepo, policyRepo, recordRepo, assignmentRepo)
  })

  it('creates probation record based on country + job level policy', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
      countryCode: 'VN',
      hireDate: new Date('2026-05-01'),
    } as any)
    vi.mocked(assignmentRepo.findCurrent).mockResolvedValue({
      jobProfileId: 'jp-1',
    } as any)
    vi.mocked(policyRepo.findByCountryAndLevel).mockResolvedValue({
      id: POLICY_ID,
      defaultDurationDays: 60,
      minSalaryPercentage: 85,
      allowExtension: false,
      maxExtensions: 0,
    } as any)
    vi.mocked(recordRepo.findByEmploymentId).mockResolvedValue(null)
    vi.mocked(recordRepo.insert).mockResolvedValue({} as any)

    await handler.execute(new SetProbationCommand(TENANT_ID, EMPLOYMENT_ID))

    expect(recordRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        employmentId: EMPLOYMENT_ID,
        status: 'active',
        salaryPercentage: 85,
        probationPolicyId: POLICY_ID,
        extensionCount: 0,
      }),
    )
  })

  it('creates not_applicable record when no policy found', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
      countryCode: 'US',
      hireDate: new Date('2026-05-01'),
    } as any)
    vi.mocked(assignmentRepo.findCurrent).mockResolvedValue({
      jobProfileId: 'jp-1',
    } as any)
    vi.mocked(policyRepo.findByCountryAndLevel).mockResolvedValue(null)
    vi.mocked(recordRepo.findByEmploymentId).mockResolvedValue(null)
    vi.mocked(recordRepo.insert).mockResolvedValue({} as any)

    await handler.execute(new SetProbationCommand(TENANT_ID, EMPLOYMENT_ID))

    expect(recordRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'not_applicable' }),
    )
  })

  it('skips if probation record already exists', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({ id: EMPLOYMENT_ID } as any)
    vi.mocked(recordRepo.findByEmploymentId).mockResolvedValue({ id: 'existing' } as any)

    await handler.execute(new SetProbationCommand(TENANT_ID, EMPLOYMENT_ID))

    expect(recordRepo.insert).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Implement handler** — looks up employment, finds current job assignment to determine job level, queries policy by country + level, computes dates, creates record.

- [ ] **Step 4: Run tests and commit**

```bash
cd apps/api && bunx vitest run src/modules/people/application/commands/set-probation.handler.spec.ts
git add apps/api/src/modules/people/application/commands/set-probation*
git commit -m "feat(people): add SetProbation command — auto-triggered on employment activation"
```

---

## Task 13: ConfirmProbation Command + Handler + Test

**Files:**

- Create: `confirm-probation.command.ts`, `confirm-probation.handler.ts`, `confirm-probation.handler.spec.ts`

- [ ] **Step 1: Write command class**

```typescript
// apps/api/src/modules/people/application/commands/confirm-probation.command.ts

export class ConfirmProbationCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly confirmedBy: string,
    readonly note?: string | null,
  ) {}
}
```

- [ ] **Step 2: Write test** — validates status must be active or extended, sets status to passed, emits `ProbationConfirmedEvent`.

- [ ] **Step 3: Implement handler**

- [ ] **Step 4: Run tests and commit**

```bash
cd apps/api && bunx vitest run src/modules/people/application/commands/confirm-probation.handler.spec.ts
git add apps/api/src/modules/people/application/commands/confirm-probation*
git commit -m "feat(people): add ConfirmProbation command"
```

---

## Task 14: ExtendProbation Command + Handler + Test

**Files:**

- Create: `extend-probation.command.ts`, `extend-probation.handler.ts`, `extend-probation.handler.spec.ts`

- [ ] **Step 1: Write command class**

```typescript
// apps/api/src/modules/people/application/commands/extend-probation.command.ts

export class ExtendProbationCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly newEndDate: Date,
    readonly extendedBy: string,
    readonly reason?: string | null,
  ) {}
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// apps/api/src/modules/people/application/commands/extend-probation.handler.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ExtendProbationCommand } from './extend-probation.command'
import { ExtendProbationHandler } from './extend-probation.handler'
import type { IProbationRecordRepository } from '../../domain/repositories/probation-record.repository'
import type { IProbationPolicyRepository } from '../../domain/repositories/probation-policy.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000002'
const RECORD_ID = '01900000-0000-7000-8000-000000000003'
const POLICY_ID = '01900000-0000-7000-8000-000000000004'
const ACTOR_ID = '01900000-0000-7000-8000-000000000005'

describe('ExtendProbationHandler', () => {
  let handler: ExtendProbationHandler
  let recordRepo: IProbationRecordRepository
  let policyRepo: IProbationPolicyRepository

  beforeEach(() => {
    recordRepo = {
      findById: vi.fn(),
      findByEmploymentId: vi.fn(),
      findActiveByTenant: vi.fn(),
      findEndingBefore: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    policyRepo = {
      findById: vi.fn(),
      findByCountryAndLevel: vi.fn(),
      listByTenant: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    handler = new ExtendProbationHandler(recordRepo, policyRepo)
  })

  it('extends probation when policy allows extension', async () => {
    vi.mocked(recordRepo.findByEmploymentId).mockResolvedValue({
      id: RECORD_ID,
      tenantId: TENANT_ID,
      status: 'active',
      extensionCount: 0,
      startDate: new Date('2026-05-01'),
      probationPolicyId: POLICY_ID,
    } as any)
    vi.mocked(policyRepo.findById).mockResolvedValue({
      allowExtension: true,
      maxExtensions: 1,
      maxDurationDays: 120,
    } as any)
    vi.mocked(recordRepo.update).mockResolvedValue({} as any)

    await handler.execute(
      new ExtendProbationCommand(TENANT_ID, EMPLOYMENT_ID, new Date('2026-09-01'), ACTOR_ID),
    )

    expect(recordRepo.update).toHaveBeenCalledWith(
      RECORD_ID,
      TENANT_ID,
      expect.objectContaining({
        status: 'extended',
        extensionCount: 1,
        currentEndDate: new Date('2026-09-01'),
      }),
    )
  })

  it('throws when policy does not allow extension', async () => {
    vi.mocked(recordRepo.findByEmploymentId).mockResolvedValue({
      id: RECORD_ID,
      status: 'active',
      probationPolicyId: POLICY_ID,
    } as any)
    vi.mocked(policyRepo.findById).mockResolvedValue({
      allowExtension: false,
    } as any)

    await expect(
      handler.execute(new ExtendProbationCommand(TENANT_ID, EMPLOYMENT_ID, new Date(), ACTOR_ID)),
    ).rejects.toThrow()
  })

  it('throws when max extensions reached', async () => {
    vi.mocked(recordRepo.findByEmploymentId).mockResolvedValue({
      id: RECORD_ID,
      status: 'extended',
      extensionCount: 1,
      probationPolicyId: POLICY_ID,
    } as any)
    vi.mocked(policyRepo.findById).mockResolvedValue({
      allowExtension: true,
      maxExtensions: 1,
    } as any)

    await expect(
      handler.execute(new ExtendProbationCommand(TENANT_ID, EMPLOYMENT_ID, new Date(), ACTOR_ID)),
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 3: Implement handler** — validates policy.allowExtension, extensionCount < maxExtensions, new end date within maxDurationDays from start.

- [ ] **Step 4: Run tests and commit**

```bash
cd apps/api && bunx vitest run src/modules/people/application/commands/extend-probation.handler.spec.ts
git add apps/api/src/modules/people/application/commands/extend-probation*
git commit -m "feat(people): add ExtendProbation command with policy guard validation"
```

---

## Task 15: FailProbation Command + Handler + Test

**Files:**

- Create: `fail-probation.command.ts`, `fail-probation.handler.ts`, `fail-probation.handler.spec.ts`

- [ ] **Step 1: Write command class**

```typescript
// apps/api/src/modules/people/application/commands/fail-probation.command.ts

export class FailProbationCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly failedBy: string,
    readonly note?: string | null,
  ) {}
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// apps/api/src/modules/people/application/commands/fail-probation.handler.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FailProbationCommand } from './fail-probation.command'
import { FailProbationHandler } from './fail-probation.handler'
import type { IProbationRecordRepository } from '../../domain/repositories/probation-record.repository'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000002'
const RECORD_ID = '01900000-0000-7000-8000-000000000003'
const ACTOR_ID = '01900000-0000-7000-8000-000000000004'

describe('FailProbationHandler', () => {
  let handler: FailProbationHandler
  let recordRepo: IProbationRecordRepository
  let employmentRepo: IEmploymentRepository
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    recordRepo = {
      findById: vi.fn(),
      findByEmploymentId: vi.fn(),
      findActiveByTenant: vi.fn(),
      findEndingBefore: vi.fn(),
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
    eventBus = { publish: vi.fn() }
    handler = new FailProbationHandler(recordRepo, employmentRepo, eventBus as any)
  })

  it('fails probation and triggers employment termination', async () => {
    vi.mocked(recordRepo.findByEmploymentId).mockResolvedValue({
      id: RECORD_ID,
      tenantId: TENANT_ID,
      status: 'active',
    } as any)
    vi.mocked(recordRepo.update).mockResolvedValue({} as any)
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
      employmentStatus: 'active',
    } as any)

    await handler.execute(
      new FailProbationCommand(TENANT_ID, EMPLOYMENT_ID, ACTOR_ID, 'Did not meet expectations'),
    )

    expect(recordRepo.update).toHaveBeenCalledWith(
      RECORD_ID,
      TENANT_ID,
      expect.objectContaining({ status: 'failed' }),
    )
    expect(employmentRepo.updateStatus).toHaveBeenCalledWith(
      EMPLOYMENT_ID,
      TENANT_ID,
      'terminated',
      expect.any(Date),
      'failed_probation',
    )
  })

  it('throws when probation record is not active/extended', async () => {
    vi.mocked(recordRepo.findByEmploymentId).mockResolvedValue({
      id: RECORD_ID,
      status: 'passed',
    } as any)

    await expect(
      handler.execute(new FailProbationCommand(TENANT_ID, EMPLOYMENT_ID, ACTOR_ID)),
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 3: Implement handler** — sets probation status to failed, triggers TerminateEmployment with `failed_probation` reason, emits `EmploymentTerminatedEvent`.

- [ ] **Step 4: Run tests and commit**

```bash
cd apps/api && bunx vitest run src/modules/people/application/commands/fail-probation.handler.spec.ts
git add apps/api/src/modules/people/application/commands/fail-probation*
git commit -m "feat(people): add FailProbation command — triggers employment termination"
```

---

## Task 16: Contract Version Entity + Repository (Enhanced)

**Files:**

- Create: entity, repository interface, Drizzle repository (schema already in Task 10)

- [ ] **Step 1: Create contract version entity**

```typescript
// apps/api/src/modules/people/domain/entities/contract-version.entity.ts

export interface ContractVersion {
  id: string
  tenantId: string
  employmentId: string
  contractType:
    | 'indefinite'
    | 'fixed_term'
    | 'seasonal'
    | 'probation'
    | 'internship'
    | 'consultancy'
  startDate: Date
  endDate: Date | null
  status: 'draft' | 'active' | 'expired' | 'terminated' | 'superseded'
  probationEndDate: Date | null
  noticePeriodDays: number | null
  workHoursPerWeek: number | null
  baseSalary: number | null
  salaryCurrency: string | null
  salaryFrequency: 'monthly' | 'biweekly' | 'weekly' | 'annual' | null
  documentId: string | null
  note: string | null
  createdBy: string
  createdAt: Date
  signedAt: Date | null
  signedBy: string | null
}
```

- [ ] **Step 2: Create repository interface**

```typescript
// apps/api/src/modules/people/domain/repositories/contract-version.repository.ts

import type { ContractVersion } from '../entities/contract-version.entity'

export const CONTRACT_VERSION_REPOSITORY = Symbol('IContractVersionRepository')

export interface IContractVersionRepository {
  findById(id: string, tenantId: string): Promise<ContractVersion | null>
  findActiveByEmploymentId(employmentId: string, tenantId: string): Promise<ContractVersion | null>
  findByEmploymentId(employmentId: string, tenantId: string): Promise<ContractVersion[]>
  findExpiringBefore(tenantId: string, beforeDate: Date): Promise<ContractVersion[]>
  insert(data: Omit<ContractVersion, 'id' | 'createdAt'>): Promise<ContractVersion>
  update(
    id: string,
    tenantId: string,
    data: Partial<Omit<ContractVersion, 'id' | 'tenantId' | 'employmentId' | 'createdAt'>>,
  ): Promise<ContractVersion>
}
```

- [ ] **Step 3: Implement Drizzle repo** — standard CRUD, `findActiveByEmploymentId` filters by status = 'active', `findExpiringBefore` uses `lte(contractVersion.endDate, beforeDate)` with status = 'active'.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/people/domain/entities/contract-version* \
  apps/api/src/modules/people/domain/repositories/contract-version* \
  apps/api/src/modules/people/infrastructure/repositories/drizzle-contract-version*
git commit -m "feat(people): add contract version entity and repository"
```

---

## Task 17: Contract Policy Schema + Entity + Repository

**Files:**

- Create: entity, repository interface, Drizzle repository (schema already in Task 10)

- [ ] **Step 1: Create contract policy entity**

```typescript
// apps/api/src/modules/people/domain/entities/contract-policy.entity.ts

export interface ContractPolicy {
  id: string
  tenantId: string
  countryCode: string
  maxFixedTermMonths: number | null
  maxFixedTermRenewals: number | null
  forceIndefiniteAfter: boolean
  probationRequiresContract: boolean
}
```

- [ ] **Step 2: Create repository interface**

```typescript
// apps/api/src/modules/people/domain/repositories/contract-policy.repository.ts

import type { ContractPolicy } from '../entities/contract-policy.entity'

export const CONTRACT_POLICY_REPOSITORY = Symbol('IContractPolicyRepository')

export interface IContractPolicyRepository {
  findByCountry(countryCode: string, tenantId: string): Promise<ContractPolicy | null>
  listByTenant(tenantId: string): Promise<ContractPolicy[]>
  upsert(data: Omit<ContractPolicy, 'id'>): Promise<ContractPolicy>
}
```

- [ ] **Step 3: Implement Drizzle repo**

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/people/domain/entities/contract-policy* \
  apps/api/src/modules/people/domain/repositories/contract-policy* \
  apps/api/src/modules/people/infrastructure/repositories/drizzle-contract-policy*
git commit -m "feat(people): add contract policy entity and repository"
```

---

## Task 18: pg-boss Job — Probation Reminder

**Files:**

- Create: `apps/api/src/modules/people/infrastructure/jobs/probation-reminder.job.ts`

- [ ] **Step 1: Implement the job handler**

```typescript
// apps/api/src/modules/people/infrastructure/jobs/probation-reminder.job.ts

import { Inject, Injectable } from '@nestjs/common'
import { EventBus } from '@nestjs/cqrs'
import {
  PROBATION_RECORD_REPOSITORY,
  type IProbationRecordRepository,
} from '../../domain/repositories/probation-record.repository'
import {
  PROBATION_POLICY_REPOSITORY,
  type IProbationPolicyRepository,
} from '../../domain/repositories/probation-policy.repository'

@Injectable()
export class ProbationReminderJob {
  constructor(
    @Inject(PROBATION_RECORD_REPOSITORY)
    private readonly recordRepo: IProbationRecordRepository,
    @Inject(PROBATION_POLICY_REPOSITORY)
    private readonly policyRepo: IProbationPolicyRepository,
    private readonly eventBus: EventBus,
  ) {}

  /**
   * Runs daily. Emits ProbationEndingEvent at 30/14/7 day marks.
   * Auto-confirms if policy.autoConfirm = true and overdue.
   * Emits ProbationOverdueEvent if overdue and not auto-confirm.
   */
  async handle(tenantId: string): Promise<void> {
    const today = new Date()
    const thirtyDaysOut = new Date(today)
    thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30)

    const records = await this.recordRepo.findEndingBefore(tenantId, thirtyDaysOut)

    for (const record of records) {
      if (record.status !== 'active' && record.status !== 'extended') continue

      const daysUntilEnd = Math.ceil(
        (record.currentEndDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      )

      if (daysUntilEnd <= 0) {
        // Overdue — check auto-confirm
        const policy = await this.policyRepo.findById(record.probationPolicyId, tenantId)
        if (policy?.autoConfirm) {
          await this.recordRepo.update(record.id, tenantId, {
            status: 'passed',
            outcomeDate: today,
            outcomeNote: 'Auto-confirmed by policy',
          })
          this.eventBus.publish({
            type: 'ProbationConfirmedEvent',
            tenantId,
            employmentId: record.employmentId,
            autoConfirmed: true,
          })
        } else {
          this.eventBus.publish({
            type: 'ProbationOverdueEvent',
            tenantId,
            employmentId: record.employmentId,
            currentEndDate: record.currentEndDate,
          })
        }
      } else if ([30, 14, 7].includes(daysUntilEnd)) {
        this.eventBus.publish({
          type: 'ProbationEndingEvent',
          tenantId,
          employmentId: record.employmentId,
          currentEndDate: record.currentEndDate,
          daysRemaining: daysUntilEnd,
        })
      }
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/people/infrastructure/jobs/probation-reminder.job.ts
git commit -m "feat(people): add probation-reminder pg-boss job"
```

---

## Task 19: pg-boss Job — Check Contract Expiry

**Files:**

- Create: `apps/api/src/modules/people/infrastructure/jobs/check-contract-expiry.job.ts`

- [ ] **Step 1: Implement the job handler**

```typescript
// apps/api/src/modules/people/infrastructure/jobs/check-contract-expiry.job.ts

import { Inject, Injectable } from '@nestjs/common'
import { EventBus } from '@nestjs/cqrs'
import {
  CONTRACT_VERSION_REPOSITORY,
  type IContractVersionRepository,
} from '../../domain/repositories/contract-version.repository'

@Injectable()
export class CheckContractExpiryJob {
  constructor(
    @Inject(CONTRACT_VERSION_REPOSITORY)
    private readonly contractRepo: IContractVersionRepository,
    private readonly eventBus: EventBus,
  ) {}

  /**
   * Runs daily. Emits ContractExpiringEvent at 60/30/14 day marks.
   */
  async handle(tenantId: string): Promise<void> {
    const today = new Date()
    const sixtyDaysOut = new Date(today)
    sixtyDaysOut.setDate(sixtyDaysOut.getDate() + 60)

    const contracts = await this.contractRepo.findExpiringBefore(tenantId, sixtyDaysOut)

    for (const contract of contracts) {
      if (!contract.endDate || contract.status !== 'active') continue

      const daysUntilExpiry = Math.ceil(
        (contract.endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      )

      if ([60, 30, 14].includes(daysUntilExpiry)) {
        this.eventBus.publish({
          type: 'ContractExpiringEvent',
          tenantId,
          employmentId: contract.employmentId,
          contractId: contract.id,
          endDate: contract.endDate,
          daysRemaining: daysUntilExpiry,
        })
      }

      // Auto-expire contracts past end date
      if (daysUntilExpiry <= 0) {
        await this.contractRepo.update(contract.id, tenantId, {
          status: 'expired',
        })
      }
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/people/infrastructure/jobs/check-contract-expiry.job.ts
git commit -m "feat(people): add check-contract-expiry pg-boss job"
```

---

## Task 20: Wire into people.module.ts + tRPC Router

**Files:**

- Modify: `apps/api/src/modules/people/people.module.ts`
- Modify: `apps/api/src/modules/people/interface/trpc/people.router.ts`

- [ ] **Step 1: Add lifecycle providers to people.module.ts**

Add all new command handlers, repositories, and jobs to the NestJS module:

```typescript
// Add to providers array in people.module.ts:

// Lifecycle command handlers
ActivateEmploymentHandler,
StartLeaveHandler,
ReturnFromLeaveHandler,
SuspendEmploymentHandler,
ReinstateSuspensionHandler,
GiveNoticeHandler,
TerminateEmploymentHandler,
CompleteTerminationHandler,

// Probation
SetProbationHandler,
ConfirmProbationHandler,
ExtendProbationHandler,
FailProbationHandler,

// Contract
CreateContractVersionHandler,

// Jobs
ProbationReminderJob,
CheckContractExpiryJob,

// Repository bindings
{ provide: PROBATION_POLICY_REPOSITORY, useClass: DrizzleProbationPolicyRepository },
{ provide: PROBATION_RECORD_REPOSITORY, useClass: DrizzleProbationRecordRepository },
{ provide: CONTRACT_VERSION_REPOSITORY, useClass: DrizzleContractVersionRepository },
{ provide: CONTRACT_POLICY_REPOSITORY, useClass: DrizzleContractPolicyRepository },
```

- [ ] **Step 2: Add tRPC procedures**

```typescript
// Add to people.router.ts:

// Employment lifecycle
activateEmployment: protectedProcedure
  .input(z.object({
    employmentId: z.string().uuid(),
    effectiveDate: z.date().optional(),
  }))
  .mutation(({ ctx, input }) =>
    commandBus.execute(new ActivateEmploymentCommand(ctx.tenantId, input.employmentId, ctx.actorId, input.effectiveDate)),
  ),

startLeave: protectedProcedure
  .input(z.object({
    employmentId: z.string().uuid(),
    leaveType: z.string(),
    expectedReturnDate: z.date(),
    note: z.string().optional(),
  }))
  .mutation(({ ctx, input }) =>
    commandBus.execute(new StartLeaveCommand(ctx.tenantId, input.employmentId, input.leaveType, input.expectedReturnDate, ctx.actorId, input.note)),
  ),

// ... (similar for all other lifecycle commands)

// Probation
confirmProbation: protectedProcedure
  .input(z.object({
    employmentId: z.string().uuid(),
    note: z.string().optional(),
  }))
  .mutation(({ ctx, input }) =>
    commandBus.execute(new ConfirmProbationCommand(ctx.tenantId, input.employmentId, ctx.actorId, input.note)),
  ),

extendProbation: protectedProcedure
  .input(z.object({
    employmentId: z.string().uuid(),
    newEndDate: z.date(),
    reason: z.string().optional(),
  }))
  .mutation(({ ctx, input }) =>
    commandBus.execute(new ExtendProbationCommand(ctx.tenantId, input.employmentId, input.newEndDate, ctx.actorId, input.reason)),
  ),

failProbation: protectedProcedure
  .input(z.object({
    employmentId: z.string().uuid(),
    note: z.string().optional(),
  }))
  .mutation(({ ctx, input }) =>
    commandBus.execute(new FailProbationCommand(ctx.tenantId, input.employmentId, ctx.actorId, input.note)),
  ),

// Contract
createContractVersion: protectedProcedure
  .input(z.object({
    employmentId: z.string().uuid(),
    contractType: z.enum(['indefinite', 'fixed_term', 'seasonal', 'probation', 'internship', 'consultancy']),
    startDate: z.date(),
    endDate: z.date().optional(),
    baseSalary: z.number().optional(),
    salaryCurrency: z.string().optional(),
    salaryFrequency: z.enum(['monthly', 'biweekly', 'weekly', 'annual']).optional(),
    noticePeriodDays: z.number().optional(),
    workHoursPerWeek: z.number().optional(),
    note: z.string().optional(),
  }))
  .mutation(({ ctx, input }) =>
    commandBus.execute(new CreateContractVersionCommand(ctx.tenantId, input.employmentId, input.contractType, input.startDate, ctx.actorId, input.endDate, input.baseSalary, input.salaryCurrency, input.salaryFrequency, input.noticePeriodDays, input.workHoursPerWeek, input.note)),
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
git commit -m "feat(people): wire lifecycle commands, probation, contracts into module + tRPC"
```
