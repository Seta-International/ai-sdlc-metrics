# People Module — Part 0: Kernel Prerequisites

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add kernel commands required by the People module before any People code is written. These commands expose decision-case management, actor status transitions, user identity deprovisioning, and role grant revocation.

**Architecture:** All commands follow the kernel's existing hexagonal pattern: command DTO → `@CommandHandler` → repository port → Drizzle implementation. Tests are co-located `.spec.ts` files using vitest + mocked repositories.

**Tech Stack:** NestJS 11, @nestjs/cqrs, Drizzle ORM, vitest, uuidv7

**Spec:** `docs/superpowers/specs/2026-04-11-people-projects-design.md` (Kernel Schema Changes section)

**Why this is needed:** The People module's profile-change-approval and offboarding workflows dispatch kernel commands via `CommandBus`. These commands do not exist yet — only `CreateActorCommand`, `CreateUserIdentityCommand`, and `GrantRoleCommand` exist today.

---

## Task 1: Kernel — Decision Case Commands (TDD)

**Files:**

- Create: `apps/api/src/modules/kernel/domain/repositories/decision-case.repository.port.ts`
- Create: `apps/api/src/modules/kernel/infrastructure/repositories/drizzle-decision-case.repository.ts`
- Create: `apps/api/src/modules/kernel/application/commands/create-decision-case.command.ts`
- Create: `apps/api/src/modules/kernel/application/commands/create-decision-case.handler.ts`
- Create: `apps/api/src/modules/kernel/application/commands/create-decision-case.handler.spec.ts`
- Create: `apps/api/src/modules/kernel/application/commands/resolve-decision-case.command.ts`
- Create: `apps/api/src/modules/kernel/application/commands/resolve-decision-case.handler.ts`
- Create: `apps/api/src/modules/kernel/application/commands/resolve-decision-case.handler.spec.ts`
- Modify: `apps/api/src/modules/kernel/kernel.module.ts`
- Modify: `apps/api/src/modules/kernel/infrastructure/schema/index.ts`

- [ ] **Step 1: Create the decision case repository port**

```typescript
// apps/api/src/modules/kernel/domain/repositories/decision-case.repository.port.ts
export interface DecisionCase {
  id: string
  tenantId: string
  module: string
  subjectId: string
  requestedBy: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  createdAt: Date
}

export interface DecisionOutcome {
  id: string
  tenantId: string
  caseId: string
  finalAction: 'approved' | 'rejected'
  decidedBy: string
  decidedAt: Date
  comment: string | null
}

export const DECISION_CASE_REPOSITORY = Symbol('IDecisionCaseRepository')

export interface IDecisionCaseRepository {
  findById(id: string, tenantId: string): Promise<DecisionCase | null>
  insert(data: {
    tenantId: string
    module: string
    subjectId: string
    requestedBy: string
  }): Promise<DecisionCase>
  updateStatus(id: string, tenantId: string, status: DecisionCase['status']): Promise<void>
  insertOutcome(data: {
    tenantId: string
    caseId: string
    finalAction: 'approved' | 'rejected'
    decidedBy: string
    comment: string | null
  }): Promise<DecisionOutcome>
}
```

- [ ] **Step 2: Create the Drizzle implementation**

```typescript
// apps/api/src/modules/kernel/infrastructure/repositories/drizzle-decision-case.repository.ts
import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import type {
  DecisionCase,
  DecisionOutcome,
  IDecisionCaseRepository,
} from '../../domain/repositories/decision-case.repository.port'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { decisionCase } from '../schema/decision-case.schema'
import { decisionOutcome } from '../schema/decision-outcome.schema'

@Injectable()
export class DrizzleDecisionCaseRepository implements IDecisionCaseRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<DecisionCase | null> {
    const rows = await this.db
      .select()
      .from(decisionCase)
      .where(and(eq(decisionCase.id, id), eq(decisionCase.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as DecisionCase | undefined) ?? null
  }

  async insert(data: {
    tenantId: string
    module: string
    subjectId: string
    requestedBy: string
  }): Promise<DecisionCase> {
    const rows = await this.db
      .insert(decisionCase)
      .values({
        tenantId: data.tenantId,
        module: data.module,
        subjectId: data.subjectId,
        requestedBy: data.requestedBy,
      })
      .returning()
    return rows[0] as DecisionCase
  }

  async updateStatus(id: string, tenantId: string, status: DecisionCase['status']): Promise<void> {
    await this.db
      .update(decisionCase)
      .set({ status })
      .where(and(eq(decisionCase.id, id), eq(decisionCase.tenantId, tenantId)))
  }

  async insertOutcome(data: {
    tenantId: string
    caseId: string
    finalAction: 'approved' | 'rejected'
    decidedBy: string
    comment: string | null
  }): Promise<DecisionOutcome> {
    const rows = await this.db
      .insert(decisionOutcome)
      .values({
        tenantId: data.tenantId,
        caseId: data.caseId,
        finalAction: data.finalAction,
        decidedBy: data.decidedBy,
        comment: data.comment,
      })
      .returning()
    return rows[0] as DecisionOutcome
  }
}
```

- [ ] **Step 3: Add schema exports**

Add to `apps/api/src/modules/kernel/infrastructure/schema/index.ts`:

```typescript
export { decisionCase } from './decision-case.schema'
export { decisionOutcome } from './decision-outcome.schema'
export { decisionStep } from './decision-step.schema'
```

- [ ] **Step 4: Write CreateDecisionCase command + failing test**

```typescript
// create-decision-case.command.ts
export class CreateDecisionCaseCommand {
  constructor(
    readonly tenantId: string,
    readonly module: string,
    readonly subjectId: string,
    readonly requestedBy: string,
  ) {}
}
```

```typescript
// create-decision-case.handler.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateDecisionCaseCommand } from './create-decision-case.command'
import { CreateDecisionCaseHandler } from './create-decision-case.handler'
import type { IDecisionCaseRepository } from '../../domain/repositories/decision-case.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const CASE_ID = '01900000-0000-7000-8000-000000000010'

describe('CreateDecisionCaseHandler', () => {
  let handler: CreateDecisionCaseHandler
  let repo: IDecisionCaseRepository

  beforeEach(() => {
    repo = {
      findById: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      insertOutcome: vi.fn(),
    }
    handler = new CreateDecisionCaseHandler(repo)
  })

  it('creates a decision case and returns the id', async () => {
    vi.mocked(repo.insert).mockResolvedValue({
      id: CASE_ID,
      tenantId: TENANT_ID,
      module: 'people',
      subjectId: ACTOR_ID,
      requestedBy: ACTOR_ID,
      status: 'pending',
      createdAt: new Date(),
    })

    const result = await handler.execute(
      new CreateDecisionCaseCommand(TENANT_ID, 'people', ACTOR_ID, ACTOR_ID),
    )

    expect(result).toBe(CASE_ID)
    expect(repo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      module: 'people',
      subjectId: ACTOR_ID,
      requestedBy: ACTOR_ID,
    })
  })
})
```

- [ ] **Step 5: Run test to verify failure**

Run: `cd apps/api && bunx vitest run src/modules/kernel/application/commands/create-decision-case.handler.spec.ts --project unit`
Expected: FAIL — handler not found

- [ ] **Step 6: Write the handler**

```typescript
// create-decision-case.handler.ts
import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  DECISION_CASE_REPOSITORY,
  type IDecisionCaseRepository,
} from '../../domain/repositories/decision-case.repository.port'
import { CreateDecisionCaseCommand } from './create-decision-case.command'

@CommandHandler(CreateDecisionCaseCommand)
export class CreateDecisionCaseHandler implements ICommandHandler<
  CreateDecisionCaseCommand,
  string
> {
  constructor(@Inject(DECISION_CASE_REPOSITORY) private readonly repo: IDecisionCaseRepository) {}

  async execute(command: CreateDecisionCaseCommand): Promise<string> {
    const decisionCase = await this.repo.insert({
      tenantId: command.tenantId,
      module: command.module,
      subjectId: command.subjectId,
      requestedBy: command.requestedBy,
    })
    return decisionCase.id
  }
}
```

- [ ] **Step 7: Run test to verify pass**

Run: `cd apps/api && bunx vitest run src/modules/kernel/application/commands/create-decision-case.handler.spec.ts --project unit`
Expected: PASS

- [ ] **Step 8: Write ResolveDecisionCase command + test + handler**

```typescript
// resolve-decision-case.command.ts
export class ResolveDecisionCaseCommand {
  constructor(
    readonly tenantId: string,
    readonly caseId: string,
    readonly finalAction: 'approved' | 'rejected',
    readonly decidedBy: string,
    readonly comment: string | null,
  ) {}
}
```

```typescript
// resolve-decision-case.handler.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ResolveDecisionCaseCommand } from './resolve-decision-case.command'
import { ResolveDecisionCaseHandler } from './resolve-decision-case.handler'
import type { IDecisionCaseRepository } from '../../domain/repositories/decision-case.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const CASE_ID = '01900000-0000-7000-8000-000000000010'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'

describe('ResolveDecisionCaseHandler', () => {
  let handler: ResolveDecisionCaseHandler
  let repo: IDecisionCaseRepository

  beforeEach(() => {
    repo = {
      findById: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      insertOutcome: vi.fn(),
    }
    handler = new ResolveDecisionCaseHandler(repo)
  })

  it('approves a decision case and creates an outcome', async () => {
    vi.mocked(repo.findById).mockResolvedValue({
      id: CASE_ID,
      tenantId: TENANT_ID,
      module: 'people',
      subjectId: ACTOR_ID,
      requestedBy: ACTOR_ID,
      status: 'pending',
      createdAt: new Date(),
    })
    vi.mocked(repo.insertOutcome).mockResolvedValue({
      id: 'outcome-1',
      tenantId: TENANT_ID,
      caseId: CASE_ID,
      finalAction: 'approved',
      decidedBy: ACTOR_ID,
      decidedAt: new Date(),
      comment: null,
    })

    await handler.execute(
      new ResolveDecisionCaseCommand(TENANT_ID, CASE_ID, 'approved', ACTOR_ID, null),
    )

    expect(repo.updateStatus).toHaveBeenCalledWith(CASE_ID, TENANT_ID, 'approved')
    expect(repo.insertOutcome).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      caseId: CASE_ID,
      finalAction: 'approved',
      decidedBy: ACTOR_ID,
      comment: null,
    })
  })

  it('rejects a decision case with a comment', async () => {
    vi.mocked(repo.findById).mockResolvedValue({
      id: CASE_ID,
      tenantId: TENANT_ID,
      module: 'people',
      subjectId: ACTOR_ID,
      requestedBy: ACTOR_ID,
      status: 'pending',
      createdAt: new Date(),
    })
    vi.mocked(repo.insertOutcome).mockResolvedValue({
      id: 'outcome-2',
      tenantId: TENANT_ID,
      caseId: CASE_ID,
      finalAction: 'rejected',
      decidedBy: ACTOR_ID,
      decidedAt: new Date(),
      comment: 'Insufficient docs',
    })

    await handler.execute(
      new ResolveDecisionCaseCommand(TENANT_ID, CASE_ID, 'rejected', ACTOR_ID, 'Insufficient docs'),
    )

    expect(repo.updateStatus).toHaveBeenCalledWith(CASE_ID, TENANT_ID, 'rejected')
    expect(repo.insertOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ comment: 'Insufficient docs' }),
    )
  })
})
```

```typescript
// resolve-decision-case.handler.ts
import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  DECISION_CASE_REPOSITORY,
  type IDecisionCaseRepository,
} from '../../domain/repositories/decision-case.repository.port'
import { ResolveDecisionCaseCommand } from './resolve-decision-case.command'

@CommandHandler(ResolveDecisionCaseCommand)
export class ResolveDecisionCaseHandler implements ICommandHandler<
  ResolveDecisionCaseCommand,
  void
> {
  constructor(@Inject(DECISION_CASE_REPOSITORY) private readonly repo: IDecisionCaseRepository) {}

  async execute(command: ResolveDecisionCaseCommand): Promise<void> {
    await this.repo.updateStatus(command.caseId, command.tenantId, command.finalAction)
    await this.repo.insertOutcome({
      tenantId: command.tenantId,
      caseId: command.caseId,
      finalAction: command.finalAction,
      decidedBy: command.decidedBy,
      comment: command.comment,
    })
  }
}
```

- [ ] **Step 9: Run tests**

Run: `cd apps/api && bunx vitest run src/modules/kernel/application/commands/resolve-decision-case.handler.spec.ts --project unit`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/kernel/domain/repositories/decision-case.repository.port.ts \
  apps/api/src/modules/kernel/infrastructure/repositories/drizzle-decision-case.repository.ts \
  apps/api/src/modules/kernel/infrastructure/schema/index.ts \
  apps/api/src/modules/kernel/application/commands/create-decision-case* \
  apps/api/src/modules/kernel/application/commands/resolve-decision-case*
git commit -m "feat(kernel): add CreateDecisionCase and ResolveDecisionCase commands"
```

---

## Task 2: Kernel — Actor Lifecycle Commands (TDD)

**Files:**

- Create: `apps/api/src/modules/kernel/application/commands/update-actor-status.command.ts`
- Create: `apps/api/src/modules/kernel/application/commands/update-actor-status.handler.ts`
- Create: `apps/api/src/modules/kernel/application/commands/update-actor-status.handler.spec.ts`
- Create: `apps/api/src/modules/kernel/application/commands/deprovision-user-identity.command.ts`
- Create: `apps/api/src/modules/kernel/application/commands/deprovision-user-identity.handler.ts`
- Create: `apps/api/src/modules/kernel/application/commands/deprovision-user-identity.handler.spec.ts`
- Create: `apps/api/src/modules/kernel/application/commands/revoke-all-role-grants.command.ts`
- Create: `apps/api/src/modules/kernel/application/commands/revoke-all-role-grants.handler.ts`
- Create: `apps/api/src/modules/kernel/application/commands/revoke-all-role-grants.handler.spec.ts`
- Modify: `apps/api/src/modules/kernel/domain/repositories/actor.repository.port.ts` (add `updateStatus`)
- Modify: `apps/api/src/modules/kernel/domain/repositories/user-identity.repository.port.ts` (add `deprovisionByActorId`)
- Modify: `apps/api/src/modules/kernel/domain/repositories/role-grant.repository.port.ts` (add `revokeAllForActor`)

- [ ] **Step 1: Extend repository ports**

Add to `IActorRepository`:

```typescript
updateStatus(id: string, tenantId: string, status: Actor['status']): Promise<void>
```

Add to `IUserIdentityRepository` (read the existing file first):

```typescript
deprovisionByActorId(actorId: string, tenantId: string): Promise<void>
```

Add to `IRoleGrantRepository`:

```typescript
revokeAllForActor(actorId: string, tenantId: string, revokedAt: Date): Promise<void>
```

- [ ] **Step 2: Implement in Drizzle repositories**

Add to `DrizzleActorRepository`:

```typescript
async updateStatus(id: string, tenantId: string, status: Actor['status']): Promise<void> {
  await this.db
    .update(actor)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(actor.id, id), eq(actor.tenantId, tenantId)))
}
```

Add to `DrizzleUserIdentityRepository`:

```typescript
async deprovisionByActorId(actorId: string, tenantId: string): Promise<void> {
  await this.db
    .update(userIdentity)
    .set({ status: 'deprovisioned' })
    .where(and(eq(userIdentity.actorId, actorId), eq(userIdentity.tenantId, tenantId)))
}
```

Add to `DrizzleRoleGrantRepository`:

```typescript
async revokeAllForActor(actorId: string, tenantId: string, revokedAt: Date): Promise<void> {
  await this.db
    .update(roleGrant)
    .set({ validUntil: revokedAt })
    .where(
      and(
        eq(roleGrant.actorId, actorId),
        eq(roleGrant.tenantId, tenantId),
        isNull(roleGrant.validUntil),
      ),
    )
}
```

- [ ] **Step 3: Write UpdateActorStatus command + test + handler**

```typescript
// update-actor-status.command.ts
import type { ActorStatus } from '../../domain/entities/actor.entity'

export class UpdateActorStatusCommand {
  constructor(
    readonly tenantId: string,
    readonly actorId: string,
    readonly status: ActorStatus,
  ) {}
}
```

```typescript
// update-actor-status.handler.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UpdateActorStatusCommand } from './update-actor-status.command'
import { UpdateActorStatusHandler } from './update-actor-status.handler'
import { ActorNotFoundException } from '../../domain/exceptions/actor.exceptions'
import type { IActorRepository } from '../../domain/repositories/actor.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'

describe('UpdateActorStatusHandler', () => {
  let handler: UpdateActorStatusHandler
  let actorRepo: IActorRepository

  beforeEach(() => {
    actorRepo = { findById: vi.fn(), insert: vi.fn(), updateStatus: vi.fn() }
    handler = new UpdateActorStatusHandler(actorRepo)
  })

  it('updates actor status to inactive', async () => {
    vi.mocked(actorRepo.findById).mockResolvedValue({
      id: ACTOR_ID,
      tenantId: TENANT_ID,
      type: 'person',
      displayName: 'Test',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await handler.execute(new UpdateActorStatusCommand(TENANT_ID, ACTOR_ID, 'inactive'))

    expect(actorRepo.updateStatus).toHaveBeenCalledWith(ACTOR_ID, TENANT_ID, 'inactive')
  })

  it('throws ActorNotFoundException when actor does not exist', async () => {
    vi.mocked(actorRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new UpdateActorStatusCommand(TENANT_ID, ACTOR_ID, 'inactive')),
    ).rejects.toThrow(ActorNotFoundException)
  })
})
```

```typescript
// update-actor-status.handler.ts
import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { ActorNotFoundException } from '../../domain/exceptions/actor.exceptions'
import {
  ACTOR_REPOSITORY,
  type IActorRepository,
} from '../../domain/repositories/actor.repository.port'
import { UpdateActorStatusCommand } from './update-actor-status.command'

@CommandHandler(UpdateActorStatusCommand)
export class UpdateActorStatusHandler implements ICommandHandler<UpdateActorStatusCommand, void> {
  constructor(@Inject(ACTOR_REPOSITORY) private readonly actorRepo: IActorRepository) {}

  async execute(command: UpdateActorStatusCommand): Promise<void> {
    const actor = await this.actorRepo.findById(command.actorId, command.tenantId)
    if (!actor) throw new ActorNotFoundException(command.actorId)
    await this.actorRepo.updateStatus(command.actorId, command.tenantId, command.status)
  }
}
```

- [ ] **Step 4: Write DeprovisionUserIdentity command + test + handler (same pattern)**

```typescript
// deprovision-user-identity.command.ts
export class DeprovisionUserIdentityCommand {
  constructor(
    readonly tenantId: string,
    readonly actorId: string,
  ) {}
}
```

Handler calls `userIdentityRepo.deprovisionByActorId(command.actorId, command.tenantId)`.

Test: verifies `deprovisionByActorId` is called.

- [ ] **Step 5: Write RevokeAllRoleGrants command + test + handler (same pattern)**

```typescript
// revoke-all-role-grants.command.ts
export class RevokeAllRoleGrantsCommand {
  constructor(
    readonly tenantId: string,
    readonly actorId: string,
  ) {}
}
```

Handler calls `roleGrantRepo.revokeAllForActor(command.actorId, command.tenantId, new Date())`.

Test: verifies `revokeAllForActor` is called with correct args.

- [ ] **Step 6: Wire into KernelModule**

Add to `kernel.module.ts` providers:

```typescript
{ provide: DECISION_CASE_REPOSITORY, useClass: DrizzleDecisionCaseRepository },
CreateDecisionCaseHandler,
ResolveDecisionCaseHandler,
UpdateActorStatusHandler,
DeprovisionUserIdentityHandler,
RevokeAllRoleGrantsHandler,
```

- [ ] **Step 7: Run all kernel tests**

Run: `cd apps/api && bunx vitest run src/modules/kernel/ --project unit`
Expected: all pass

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/kernel/
git commit -m "feat(kernel): add UpdateActorStatus, DeprovisionUserIdentity, RevokeAllRoleGrants commands"
```

---

## Task 3: Kernel — Audit + Outbox Infrastructure

**Files:**

- Create: `apps/api/src/modules/kernel/domain/repositories/audit-event.repository.port.ts`
- Create: `apps/api/src/modules/kernel/domain/repositories/outbox-event.repository.port.ts`
- Create: `apps/api/src/modules/kernel/infrastructure/repositories/drizzle-audit-event.repository.ts`
- Create: `apps/api/src/modules/kernel/infrastructure/repositories/drizzle-outbox-event.repository.ts`
- Modify: `apps/api/src/modules/kernel/application/facades/kernel-query.facade.ts`
- Modify: `apps/api/src/modules/kernel/kernel.module.ts`

- [ ] **Step 1: Create audit event repository port**

```typescript
// audit-event.repository.port.ts
export const AUDIT_EVENT_REPOSITORY = Symbol('IAuditEventRepository')

export interface IAuditEventRepository {
  insert(data: {
    tenantId: string
    actorId: string
    eventType: string
    module: string
    subjectId: string
    payload: unknown
  }): Promise<void>
}
```

- [ ] **Step 2: Create outbox event repository port**

```typescript
// outbox-event.repository.port.ts
export const OUTBOX_EVENT_REPOSITORY = Symbol('IOutboxEventRepository')

export interface IOutboxEventRepository {
  insert(data: { tenantId: string; eventName: string; payload: unknown }): Promise<void>
}
```

- [ ] **Step 3: Implement both Drizzle repositories**

```typescript
// drizzle-audit-event.repository.ts
import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import type { IAuditEventRepository } from '../../domain/repositories/audit-event.repository.port'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { auditEvent } from '../schema/audit-event.schema'

@Injectable()
export class DrizzleAuditEventRepository implements IAuditEventRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async insert(data: {
    tenantId: string
    actorId: string
    eventType: string
    module: string
    subjectId: string
    payload: unknown
  }): Promise<void> {
    await this.db.insert(auditEvent).values({
      tenantId: data.tenantId,
      actorId: data.actorId,
      eventType: data.eventType,
      module: data.module,
      subjectId: data.subjectId,
      payload: data.payload,
    })
  }
}
```

```typescript
// drizzle-outbox-event.repository.ts
import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import type { IOutboxEventRepository } from '../../domain/repositories/outbox-event.repository.port'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { outboxEvent } from '../schema/outbox-event.schema'

@Injectable()
export class DrizzleOutboxEventRepository implements IOutboxEventRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async insert(data: { tenantId: string; eventName: string; payload: unknown }): Promise<void> {
    await this.db.insert(outboxEvent).values({
      tenantId: data.tenantId,
      eventName: data.eventName,
      payload: data.payload,
    })
  }
}
```

- [ ] **Step 4: Add audit/outbox schema exports to index.ts**

```typescript
export { auditEvent } from './audit-event.schema'
export { outboxEvent } from './outbox-event.schema'
```

- [ ] **Step 5: Wire into KernelModule and export tokens**

Add providers + exports so People and Projects modules can inject `AUDIT_EVENT_REPOSITORY` and `OUTBOX_EVENT_REPOSITORY`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/kernel/
git commit -m "feat(kernel): add AuditEvent and OutboxEvent repository infrastructure"
```

---

**End of Part 0.** After these 3 tasks, the kernel has all the commands the People module needs. Proceed to Part 1.
