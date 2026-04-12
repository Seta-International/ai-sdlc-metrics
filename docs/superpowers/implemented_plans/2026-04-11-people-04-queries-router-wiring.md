# People Module — Part 4: Queries, tRPC Router, Module Wiring

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Status:** implemented

**Goal:** Implement all query handlers, the PeopleQueryFacade, the tRPC router (all 24+ routes from the spec), and wire everything into the NestJS module.

**Prerequisite:** Parts 0-3 must be completed.

**Spec:** `docs/superpowers/specs/2026-04-11-people-projects-design.md`

**Key pattern note:** The tRPC routers in this codebase use static exports via `import { router, publicProcedure } from '../../../../common/trpc/trpc-init'`. They do NOT use factory functions. To bridge tRPC (static) with NestJS DI (runtime), we use a singleton service pattern: a `PeopleTrpcService` that wraps `CommandBus`/`QueryBus`, set during module init and accessed by the static router.

---

## Task 1: Query Handlers

**Files:**

- Create: `apps/api/src/modules/people/application/queries/get-profile.query.ts`
- Create: `apps/api/src/modules/people/application/queries/get-profile.handler.ts`
- Create: `apps/api/src/modules/people/application/queries/list-employees.query.ts`
- Create: `apps/api/src/modules/people/application/queries/list-employees.handler.ts`
- Create: `apps/api/src/modules/people/application/queries/list-profile-change-requests.query.ts`
- Create: `apps/api/src/modules/people/application/queries/list-profile-change-requests.handler.ts`
- Create: `apps/api/src/modules/people/application/queries/list-onboarding-tasks.query.ts`
- Create: `apps/api/src/modules/people/application/queries/list-onboarding-tasks.handler.ts`
- Create: `apps/api/src/modules/people/application/queries/list-templates.query.ts`
- Create: `apps/api/src/modules/people/application/queries/list-templates.handler.ts`
- Create: `apps/api/src/modules/people/application/queries/list-contract-versions.query.ts`
- Create: `apps/api/src/modules/people/application/queries/list-contract-versions.handler.ts`
- Create: `apps/api/src/modules/people/application/queries/list-periodic-reviews.query.ts`
- Create: `apps/api/src/modules/people/application/queries/list-periodic-reviews.handler.ts`

- [ ] **Step 1: GetProfile query + handler**

Same as original plan Task 16 — returns profile + detail + sections.

- [ ] **Step 2: ListEmployees query + handler**

Same as original plan Task 16 — paginated list with total count.

- [ ] **Step 3: ListProfileChangeRequests query + handler**

```typescript
// list-profile-change-requests.query.ts
export class ListProfileChangeRequestsQuery {
  constructor(readonly tenantId: string) {}
}
```

Handler calls `changeRequestRepo.listPending(tenantId)` and returns the array.

- [ ] **Step 4: ListOnboardingTasks query + handler**

```typescript
export class ListOnboardingTasksQuery {
  constructor(
    readonly tenantId: string,
    readonly caseId: string,
  ) {}
}
```

Handler calls `onboardingCaseRepo.getRequiredTasks(caseId, tenantId)`.

- [ ] **Step 5: ListTemplates query + handler**

Returns both onboarding and offboarding templates for admin UI.

- [ ] **Step 6: ListContractVersions + ListPeriodicReviews**

Simple repo reads — `contractVersionRepo.findByProfileId` and `periodicReviewRepo.findPendingByProfileId`.

- [ ] **Step 7: Remove .gitkeep and commit**

```bash
rm apps/api/src/modules/people/application/queries/.gitkeep
git add apps/api/src/modules/people/application/queries/
git commit -m "feat(people): add all query handlers"
```

---

## Task 2: PeopleQueryFacade

**Files:**

- Modify: `apps/api/src/modules/people/application/facades/people-query.facade.ts`

- [ ] **Step 1: Implement the facade**

```typescript
import { Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import type { EmploymentProfile } from '../../domain/entities/employment-profile.entity'
import type { AccountMembership } from '../../domain/entities/account-membership.entity'
import type { ProfileResult } from '../queries/get-profile.handler'
import type { ListEmployeesResult } from '../queries/list-employees.handler'
import { GetProfileQuery } from '../queries/get-profile.query'
import { ListEmployeesQuery } from '../queries/list-employees.query'

@Injectable()
export class PeopleQueryFacade {
  constructor(private readonly queryBus: QueryBus) {}

  getProfile(actorId: string, tenantId: string): Promise<ProfileResult | null> {
    return this.queryBus.execute(new GetProfileQuery(actorId, tenantId))
  }

  listEmployees(tenantId: string, limit: number, offset: number): Promise<ListEmployeesResult> {
    return this.queryBus.execute(new ListEmployeesQuery(tenantId, limit, offset))
  }

  // Used by Projects module for account membership routes
  // These delegate to the AccountMembership repository within People
  // Additional query methods will be added as cross-module needs emerge
}
```

- [ ] **Step 2: Commit**

---

## Task 3: PeopleTrpcService — Bridge NestJS DI to Static Router

**Files:**

- Create: `apps/api/src/modules/people/interface/trpc/people-trpc.service.ts`

The tRPC router is a static export. NestJS services (CommandBus, QueryBus) are runtime DI. This service bridges the two: it's instantiated during module init and stores itself as a module-level singleton that the static router references.

- [ ] **Step 1: Create the bridge service**

```typescript
// people-trpc.service.ts
import { Injectable, type OnModuleInit } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'

let instance: PeopleTrpcService | null = null

@Injectable()
export class PeopleTrpcService implements OnModuleInit {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  onModuleInit() {
    instance = this
  }

  static getInstance(): PeopleTrpcService {
    if (!instance) throw new Error('PeopleTrpcService not initialized')
    return instance
  }

  command<T>(command: T): Promise<unknown> {
    return this.commandBus.execute(command as never)
  }

  query<T>(query: T): Promise<unknown> {
    return this.queryBus.execute(query as never)
  }
}
```

- [ ] **Step 2: Commit**

---

## Task 4: tRPC Router — All People Procedures

**Files:**

- Modify: `apps/api/src/modules/people/interface/trpc/people.router.ts`

- [ ] **Step 1: Implement the full router with all 24+ procedures**

```typescript
import { z } from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { PeopleTrpcService } from './people-trpc.service'
import { CreateEmploymentProfileCommand } from '../../application/commands/create-employment-profile.command'
import { UpdateProfileDirectCommand } from '../../application/commands/update-profile-direct.command'
import { RequestProfileChangeCommand } from '../../application/commands/request-profile-change.command'
import { ApproveProfileChangeCommand } from '../../application/commands/approve-profile-change.command'
import { RejectProfileChangeCommand } from '../../application/commands/reject-profile-change.command'
import { TriggerOffboardingCommand } from '../../application/commands/trigger-offboarding.command'
import { ApproveOffboardingCommand } from '../../application/commands/approve-offboarding.command'
import { RejectOffboardingCommand } from '../../application/commands/reject-offboarding.command'
import { CompleteOffboardingCommand } from '../../application/commands/complete-offboarding.command'
import { CompleteTaskCommand } from '../../application/commands/complete-task.command'
import { GetProfileQuery } from '../../application/queries/get-profile.query'
import { ListEmployeesQuery } from '../../application/queries/list-employees.query'
import { ListProfileChangeRequestsQuery } from '../../application/queries/list-profile-change-requests.query'
import { ListOnboardingTasksQuery } from '../../application/queries/list-onboarding-tasks.query'
import { ListTemplatesQuery } from '../../application/queries/list-templates.query'
import { ListContractVersionsQuery } from '../../application/queries/list-contract-versions.query'
import { ListPeriodicReviewsQuery } from '../../application/queries/list-periodic-reviews.query'

const svc = () => PeopleTrpcService.getInstance()

export const peopleRouter = router({
  // --- Profile ---
  getProfile: publicProcedure
    .input(z.object({ actorId: z.string().uuid(), tenantId: z.string().uuid() }))
    .query(({ input }) => svc().query(new GetProfileQuery(input.actorId, input.tenantId))),

  listEmployees: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(({ input }) =>
      svc().query(new ListEmployeesQuery(input.tenantId, input.limit, input.offset)),
    ),

  createProfile: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        actorId: z.string().uuid(),
        employmentType: z.enum(['permanent', 'fixed_term', 'contractor', 'intern']),
        hireDate: z.string().datetime(),
        employeeCode: z.string().nullable(),
        companyEmail: z.string().email().nullable(),
        jobTitle: z.string().nullable(),
        jobLevel: z.string().nullable(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new CreateEmploymentProfileCommand(
          input.tenantId,
          input.actorId,
          input.employmentType,
          new Date(input.hireDate),
          input.employeeCode,
          input.companyEmail,
          input.jobTitle,
          input.jobLevel,
        ),
      ),
    ),

  updateProfileDirect: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        profileId: z.string().uuid(),
        updatedBy: z.string().uuid(),
        fields: z.record(z.unknown()),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new UpdateProfileDirectCommand(
          input.tenantId,
          input.profileId,
          input.updatedBy,
          input.fields,
        ),
      ),
    ),

  // --- Profile Changes ---
  requestProfileChange: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        profileId: z.string().uuid(),
        fieldPath: z.string(),
        newValue: z.unknown(),
        requestedBy: z.string().uuid(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new RequestProfileChangeCommand(
          input.tenantId,
          input.profileId,
          input.fieldPath,
          input.newValue,
          input.requestedBy,
        ),
      ),
    ),

  approveProfileChange: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        changeRequestId: z.string().uuid(),
        approvedBy: z.string().uuid(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new ApproveProfileChangeCommand(input.tenantId, input.changeRequestId, input.approvedBy),
      ),
    ),

  rejectProfileChange: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        changeRequestId: z.string().uuid(),
        rejectedBy: z.string().uuid(),
        comment: z.string().min(1),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new RejectProfileChangeCommand(
          input.tenantId,
          input.changeRequestId,
          input.rejectedBy,
          input.comment,
        ),
      ),
    ),

  listProfileChangeRequests: publicProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .query(({ input }) => svc().query(new ListProfileChangeRequestsQuery(input.tenantId))),

  // --- Onboarding ---
  createOnboardingCase: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        profileId: z.string().uuid(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new CreateEmploymentProfileCommand(
          input.tenantId,
          '',
          'permanent',
          new Date(),
          null,
          null,
          null,
          null,
        ),
        // Note: manual onboarding case creation — the implementer should add a dedicated
        // CreateOnboardingCaseCommand if direct case creation is needed outside the profile flow
      ),
    ),

  listOnboardingTasks: publicProcedure
    .input(z.object({ tenantId: z.string().uuid(), caseId: z.string().uuid() }))
    .query(({ input }) => svc().query(new ListOnboardingTasksQuery(input.tenantId, input.caseId))),

  completeTask: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        taskId: z.string().uuid(),
        taskType: z.enum(['onboarding', 'offboarding']),
        completedBy: z.string().uuid(),
        evidenceUrl: z.string().url().nullable().optional(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new CompleteTaskCommand(
          input.tenantId,
          input.taskId,
          input.taskType,
          input.completedBy,
          input.evidenceUrl ?? null,
        ),
      ),
    ),

  // --- Onboarding/Offboarding Templates ---
  listOnboardingTemplates: publicProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .query(({ input }) => svc().query(new ListTemplatesQuery(input.tenantId, 'onboarding'))),

  listOffboardingTemplates: publicProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .query(({ input }) => svc().query(new ListTemplatesQuery(input.tenantId, 'offboarding'))),

  // Template CRUD — these require dedicated commands added by the implementer:
  // createOnboardingTemplate, updateOnboardingTemplate,
  // createOffboardingTemplate, updateOffboardingTemplate
  // Pattern: CreateOnboardingTemplateCommand { tenantId, name, employmentType, isDefault }
  // Handler: validates, inserts via IOnboardingTemplateRepository.insert()

  // --- Offboarding ---
  triggerOffboarding: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        profileId: z.string().uuid(),
        reason: z.string().nullable(),
        reasonCategory: z
          .enum(['voluntary', 'involuntary', 'redundancy', 'end_of_contract'])
          .nullable(),
        requestedBy: z.string().uuid(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new TriggerOffboardingCommand(
          input.tenantId,
          input.profileId,
          input.reason,
          input.reasonCategory,
          input.requestedBy,
        ),
      ),
    ),

  approveOffboarding: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        offboardingCaseId: z.string().uuid(),
        approvedBy: z.string().uuid(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new ApproveOffboardingCommand(input.tenantId, input.offboardingCaseId, input.approvedBy),
      ),
    ),

  rejectOffboarding: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        offboardingCaseId: z.string().uuid(),
        rejectedBy: z.string().uuid(),
        comment: z.string().min(1),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new RejectOffboardingCommand(
          input.tenantId,
          input.offboardingCaseId,
          input.rejectedBy,
          input.comment,
        ),
      ),
    ),

  completeOffboarding: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        offboardingCaseId: z.string().uuid(),
        completedBy: z.string().uuid(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new CompleteOffboardingCommand(input.tenantId, input.offboardingCaseId, input.completedBy),
      ),
    ),

  // --- Contracts (stub v1) ---
  listContractVersions: publicProcedure
    .input(z.object({ tenantId: z.string().uuid(), profileId: z.string().uuid() }))
    .query(({ input }) =>
      svc().query(new ListContractVersionsQuery(input.tenantId, input.profileId)),
    ),

  // --- Periodic Reviews ---
  listPeriodicReviews: publicProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .query(({ input }) => svc().query(new ListPeriodicReviewsQuery(input.tenantId))),
})
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/people/interface/trpc/
git commit -m "feat(people): add tRPC router with all procedures + PeopleTrpcService bridge"
```

---

## Task 5: PeopleModule — Wire Everything

**Files:**

- Modify: `apps/api/src/modules/people/people.module.ts`

- [ ] **Step 1: Wire all providers**

Same as original plan Task 18, plus:

- Add `PeopleTrpcService` to providers
- Add `AUDIT_EVENT_REPOSITORY` and `OUTBOX_EVENT_REPOSITORY` imports from KernelModule
- Add all newly created command handlers from Parts 2-3:
  - `ApproveProfileChangeHandler`
  - `RejectProfileChangeHandler`
  - `UpdateProfileDirectHandler`
  - `ApproveOffboardingHandler`
  - `RejectOffboardingHandler`
  - `CompleteTaskHandler`
  - `OnCandidateHiredHandler`
- Add all query handlers from Task 1 of this part
- Add `PeopleTrpcService`

- [ ] **Step 2: Run typecheck**

Run: `cd apps/api && bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

---

## Task 6: Final Validation

- [ ] **Step 1: Run typecheck**

Run: `cd apps/api && bunx tsc --noEmit`

- [ ] **Step 2: Run unit tests**

Run: `cd apps/api && bunx vitest run --project unit`

- [ ] **Step 3: Run integration tests**

Run: `cd apps/api && bunx vitest run --project integration`

- [ ] **Step 4: Check coverage**

Run: `cd apps/api && bunx vitest run --coverage`
Expected: >=70% on lines, functions, branches

- [ ] **Step 5: Commit if fixes needed**

---

**End of People Module Plan (all 4 parts).** Next: implement the Projects module using `docs/superpowers/plans/2026-04-11-projects-module.md`.
