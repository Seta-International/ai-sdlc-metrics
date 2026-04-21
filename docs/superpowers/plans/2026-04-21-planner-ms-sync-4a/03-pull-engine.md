# Plan 4.3 — Pull Engine (Steady-State Polling)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-tenant recurring pg-boss job that polls Microsoft Graph every 3 minutes, applies deltas via the `PlanIngestor` built in 4.2, handles 429/401/403 gracefully, and maintains the pending-assignee resolution queue.

**Architecture:** One pg-boss singleton job per tenant, jittered start. Each run iterates every `ms_linked_group` not currently back-filling and ingests each of its plans via the shared `PlanIngestor`. Rate-limit / auth errors route to `ms_plan_sync_state.poll_paused_until`, `credential.status='invalid'`, or conflict log. Separate `ms-sync-resolve-pending` cron retries unresolved AAD assignments on directory-sync completion.

**Tech Stack:** pg-boss, NestJS CQRS, native fetch (via Plan 4.2's `MsGraphClient`).

**Source spec:** [`2026-04-21-planner-ms-sync-4a-design.md`](../../specs/2026-04-21-planner-ms-sync-4a-design.md) §5, §7.4, §7.5, §10.2 (Plan 4.3).

**Depends on:** Plan 4.2 complete.

---

## Task 1: `PollTenantCommand` + handler skeleton

**Files:**

- Create: `apps/api/src/modules/planner/application/commands/ms-sync/poll-tenant.command.ts`
- Create: `apps/api/src/modules/planner/application/commands/ms-sync/poll-tenant.handler.ts` (+ `.spec.ts`)

- [ ] **Step 1: Command**

```typescript
export class PollTenantCommand {
  constructor(public readonly tenantId: string) {}
}
```

- [ ] **Step 2: Handler — shape**

```typescript
@CommandHandler(PollTenantCommand)
export class PollTenantHandler implements ICommandHandler<PollTenantCommand> {
  private readonly logger = new Logger(PollTenantHandler.name)

  constructor(
    @Inject(MS_GRAPH_CREDENTIAL_REPOSITORY)
    private readonly credRepo: IMsGraphCredentialRepository,
    @Inject(MS_LINKED_GROUP_REPOSITORY)
    private readonly groupRepo: IMsLinkedGroupRepository,
    @Inject(MS_PLAN_SYNC_STATE_REPOSITORY)
    private readonly syncStateRepo: IMsPlanSyncStateRepository,
    private readonly graph: MsGraphClient,
    private readonly ingestor: PlanIngestor,
    private readonly identityFacade: IdentityQueryFacade,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: PollTenantCommand): Promise<void> {
    const cred = await this.credRepo.get(command.tenantId)
    if (!cred || cred.status !== 'active') {
      this.logger.log(`Skipping poll for ${command.tenantId}: status=${cred?.status ?? 'missing'}`)
      return
    }

    const groups = await this.groupRepo.listActiveForTenant(command.tenantId)

    for (const group of groups) {
      if (group.backfillingAt) continue // backfill is running; skip to avoid thrash
      if (!group.syncEnabled) continue
      try {
        await this.pollGroup(command.tenantId, group)
      } catch (e) {
        await this.handlePollError(command.tenantId, group, e as Error)
      }
    }
  }

  // pollGroup + handlePollError implemented in Tasks 2–3
}
```

- [ ] **Step 3: Skeleton test**

```typescript
describe('PollTenantHandler', () => {
  it('skips when credential status is not active', async () => {
    /* ... */
  })
  it('skips back-filling groups', async () => {
    /* ... */
  })
  it('iterates active groups and delegates to pollGroup', async () => {
    /* ... */
  })
})
```

- [ ] **Step 4: Commit the skeleton**

```bash
git add -A apps/api/src/modules/planner/application/commands/ms-sync
git commit -m "feat(planner): PollTenantHandler skeleton — credential + group iteration"
```

---

## Task 2: Per-group poll — plan listing and `PlanIngestor` delegation

**Files:** continuing `poll-tenant.handler.ts`

- [ ] **Step 1: Test**

```typescript
it('lists group plans, calls PlanIngestor per plan, detects archived plans', async () => {
  graph.getAllPages.mockResolvedValue([
    { id: 'ms-plan-1', title: 'Plan A' },
    { id: 'ms-plan-2', title: 'Plan B' },
  ])
  ingestor.ingestPlan.mockResolvedValue(undefined)

  // local DB has three plans linked to this group — one should be archived
  planRepo.listByContainer.mockResolvedValue([
    { id: 'local-1', msPlanId: 'ms-plan-1' },
    { id: 'local-2', msPlanId: 'ms-plan-2' },
    { id: 'local-3', msPlanId: 'ms-plan-gone' },
  ])

  await handler.execute(new PollTenantCommand('t1'))

  expect(ingestor.ingestPlan).toHaveBeenCalledWith({
    tenantId: 't1',
    msPlanId: 'ms-plan-1',
    origin: 'ms-sync-pull',
  })
  expect(ingestor.ingestPlan).toHaveBeenCalledWith({
    tenantId: 't1',
    msPlanId: 'ms-plan-2',
    origin: 'ms-sync-pull',
  })
  expect(planRepo.markArchived).toHaveBeenCalledWith('local-3', { origin: 'ms-sync-pull' })
})
```

- [ ] **Step 2: Implementation — `pollGroup` method**

```typescript
private async pollGroup(tenantId: string, group: MsLinkedGroupEntity): Promise<void> {
  const plansResponse = await this.graph.getAllPages<any>(
    tenantId,
    `/groups/${encodeURIComponent(group.msGroupId)}/planner/plans`,
  )
  const msPlanIds = new Set(plansResponse.map((p) => p.id as string))

  // Ingest each plan
  for (const p of plansResponse) {
    await this.ingestor.ingestPlan({ tenantId, msPlanId: p.id, origin: 'ms-sync-pull' })
  }

  // Detect archived — local plans for this container whose MS plan is gone
  const locals = await this.planRepo.listByContainer({
    tenantId,
    containerType: 'ms_group',
    containerRef: group.msGroupId,
  })
  for (const local of locals) {
    if (local.msPlanId && !msPlanIds.has(local.msPlanId) && !local.isMsArchived) {
      await this.planRepo.markArchived(local.id, { origin: 'ms-sync-pull' })
    }
  }
}
```

Inject `IPlanRepository` into the handler constructor. Add `listByContainer` and `markArchived` methods (if not already present from Plan 4.2).

- [ ] **Step 3: Run — expect PASS**

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(planner): poll iterates group plans and detects archived"
```

---

## Task 3: Error routing — 429 / auth / quota / 5xx

**Files:** continuing `poll-tenant.handler.ts`, `ms_sync_conflict` schema

- [ ] **Step 1: Migration for `ms_sync_conflict`**

Append to planner schema:

```typescript
export const msSyncConflict = plannerSchema.table(
  'ms_sync_conflict',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    kind: text('kind').notNull(),
    taskId: uuid('task_id'),
    planId: uuid('plan_id'),
    field: text('field'),
    mineValue: jsonb('mine_value'),
    theirsValue: jsonb('theirs_value'),
    mineChangedAt: timestamp('mine_changed_at', { withTimezone: true }),
    theirsChangedAt: timestamp('theirs_changed_at', { withTimezone: true }),
    resolution: text('resolution'),
    resolvedByActorId: uuid('resolved_by_actor_id'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    rawError: jsonb('raw_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantLookup: index('idx_ms_sync_conflict_tenant').on(t.tenantId, t.resolvedAt, t.createdAt),
  }),
)
```

Generate migration + RLS (same pattern as Plan 4.2 Task 1).

- [ ] **Step 2: Entity + repository**

Create `MsSyncConflictEntity` with a factory method per `kind`:

```typescript
export class MsSyncConflictEntity {
  // ... fields as per schema

  static forFieldLww(input: {
    tenantId: string
    taskId: string
    field: string
    mineValue: unknown
    theirsValue: unknown
    mineChangedAt?: Date
    theirsChangedAt?: Date
  }): MsSyncConflictEntity {
    /* ... */
  }
  static forPush412Exhausted(input: {
    tenantId: string
    taskId: string
    rawError: unknown
  }): MsSyncConflictEntity {
    /* ... */
  }
  static forPush403Quota(input: {
    tenantId: string
    taskId?: string
    planId?: string
    limitCode: string
    rawError: unknown
  }): MsSyncConflictEntity {
    /* ... */
  }
  static forPushFailed(input: {
    tenantId: string
    taskId?: string
    planId?: string
    rawError: unknown
  }): MsSyncConflictEntity {
    /* ... */
  }
  static forPullUnresolvedAssignee(input: {
    tenantId: string
    taskId: string
    aadOid: string
  }): MsSyncConflictEntity {
    /* ... */
  }
  static forCredentialInvalidated(input: {
    tenantId: string
    reason: string
    rawError: unknown
  }): MsSyncConflictEntity {
    /* ... */
  }
  static forAttachmentUploadFailed(input: {
    tenantId: string
    taskId: string
    attachmentId: string
    rawError: unknown
  }): MsSyncConflictEntity {
    /* ... */
  }
}
```

Repository: `IMsSyncConflictRepository` with `insert(entity)`, `listOpenForTenant(tenantId)`, `markResolved(id, actorId, resolution)`.

Drizzle adapter + integration test per Plan 4.0 Task 4 pattern.

- [ ] **Step 3: `handlePollError` implementation**

```typescript
private async handlePollError(tenantId: string, group: MsLinkedGroupEntity, error: Error): Promise<void> {
  this.logger.warn(`Poll error for tenant=${tenantId} group=${group.msGroupId}: ${error.message}`)

  if (error instanceof GraphThrottledError) {
    const pauseUntil = new Date(Date.now() + error.retryAfterSeconds * 1000)
    await this.syncStateRepo.pauseAllPlansForGroup(tenantId, group.id, pauseUntil)
    return
  }

  if (error instanceof GraphAuthError) {
    const cred = await this.credRepo.get(tenantId)
    if (cred) {
      cred.markInvalid(error.message)
      await this.credRepo.upsert(cred)
    }
    this.eventBus.publish(
      createMsSyncCredentialInvalidatedEvent({
        tenantId,
        reason: error.message,
        occurredAt: new Date().toISOString(),
      }),
    )
    return // halt further groups this run
  }

  if (error instanceof GraphQuotaError) {
    await this.conflictRepo.insert(
      MsSyncConflictEntity.forPush403Quota({
        tenantId,
        limitCode: error.limitCode,
        rawError: error.body,
      }),
    )
    return
  }

  if (error instanceof GraphServerError || !(error instanceof GraphError)) {
    // Count and, after threshold, pause the group's plans for 1 hour
    await this.syncStateRepo.incrementErrorCountForGroup(tenantId, group.id, error.message)
    const count = await this.syncStateRepo.maxConsecutiveErrorCountForGroup(tenantId, group.id)
    if (count >= 10) {
      const pauseUntil = new Date(Date.now() + 60 * 60 * 1000)
      await this.syncStateRepo.pauseAllPlansForGroup(tenantId, group.id, pauseUntil)
    }
    return
  }
}
```

- [ ] **Step 4: Check `poll_paused_until` at plan iteration**

In `pollGroup`, before calling `ingestor.ingestPlan`, load the `ms_plan_sync_state` for that plan. If `pollPausedUntil > now()`, skip.

```typescript
const state = await this.syncStateRepo.findByMsPlanId(tenantId, p.id)
if (state?.pollPausedUntil && state.pollPausedUntil > new Date()) continue
```

- [ ] **Step 5: Tests — one per error class**

```typescript
it("429: sets pollPausedUntil across the group's plans per Retry-After", async () => {
  /* ... */
})
it('401: marks credential invalid and emits event', async () => {
  /* ... */
})
it('403 with MaximumPlannerPlans: writes ms_sync_conflict', async () => {
  /* ... */
})
it('5xx: increments error count; after 10 errors pauses plans for an hour', async () => {
  /* ... */
})
it('poll skips plans whose pollPausedUntil is in the future', async () => {
  /* ... */
})
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(planner): poll error routing — 429/401/403/5xx to conflict or pause"
```

---

## Task 4: Echo-suppression plumbing — `payload.origin` everywhere

Ensure every planner outbox event carries `origin` in its payload JSONB. The pull path sets `origin='ms-sync-pull'`; push path (Plan 4.4) sets `origin='ms-sync-push'`; user commands set `origin='user'` (default).

**Files:**

- Modify: `apps/api/src/modules/planner/infrastructure/outbox/outbox-event.publisher.ts` (or wherever outbox writes happen)
- Modify: All command handlers in `apps/api/src/modules/planner/application/commands/`

- [ ] **Step 1: Extend outbox publisher signature**

```typescript
export interface PublishEventInput<T> {
  eventName: string
  payload: T & { origin?: 'user' | 'api' | 'ms-sync-pull' | 'ms-sync-backfill' | 'ms-sync-push' }
  tenantId: string
}
```

- [ ] **Step 2: Default `origin='user'` when not set**

```typescript
const payloadWithOrigin = { ...input.payload, origin: input.payload.origin ?? 'user' }
```

- [ ] **Step 3: Pull-origin repo writes**

In Plan 4.2, repo `upsertFromMs` / `upsertDetailsFromMs` / `softDeleteFromMs` / `markArchived` methods accept `{ origin }`. Verify they pass it all the way through to the outbox publisher. Update if not.

- [ ] **Step 4: Integration test**

```typescript
it('pull-origin writes an event with payload.origin=ms-sync-pull', async () => {
  await ingestor.ingestPlan({ tenantId: 't1', msPlanId: 'p1', origin: 'ms-sync-pull' })
  const events = await db.select().from(outboxEvent).where(eq(outboxEvent.tenantId, 't1'))
  expect(events.every((e) => (e.payload as any).origin?.startsWith('ms-sync-'))).toBe(true)
})

it('user-origin command (e.g., SetTaskProgressCommand) writes an event with payload.origin=user', async () => {
  await handler.execute(new SetTaskProgressCommand(/* ... */))
  const events = await db.select().from(outboxEvent).where(eq(outboxEvent.tenantId, 't1'))
  expect(events.some((e) => (e.payload as any).origin === 'user')).toBe(true)
})
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(planner): payload.origin on every outbox event for echo suppression"
```

---

## Task 5: Register pg-boss cron — `ms-sync-poll-tenant` per tenant

**Files:**

- Create: `apps/api/src/modules/planner/infrastructure/jobs/ms-sync-poll-tenant.registrar.ts` (+ `.spec.ts`)
- Modify: the planner module's `onModuleInit` or the pg-boss initialization entrypoint

- [ ] **Step 1: Registrar service**

```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { EventBus } from '@nestjs/cqrs'
import { CommandBus } from '@nestjs/cqrs'
import type PgBoss from 'pg-boss'
import type { IMsGraphCredentialRepository } from '../../../identity/domain/repositories/ms-graph-credential.repository'
import {
  MS_SYNC_ENABLED_EVENT,
  MS_SYNC_DISABLED_EVENT,
  MS_SYNC_CREDENTIAL_INVALIDATED_EVENT,
} from '@future/event-contracts'
import { PollTenantCommand } from '../../application/commands/ms-sync/poll-tenant.command'

const JOB_NAME = 'ms-sync-poll-tenant'

@Injectable()
export class MsSyncPollTenantRegistrar implements OnModuleInit {
  private readonly logger = new Logger(MsSyncPollTenantRegistrar.name)

  constructor(
    @Inject(PG_BOSS) private readonly boss: PgBoss,
    @Inject(MS_GRAPH_CREDENTIAL_REPOSITORY)
    private readonly credRepo: IMsGraphCredentialRepository,
    private readonly commandBus: CommandBus,
    private readonly eventBus: EventBus,
  ) {}

  async onModuleInit(): Promise<void> {
    // Register the worker once
    await this.boss.work(JOB_NAME, async (job) => {
      const { tenantId } = job.data as { tenantId: string }
      await this.commandBus.execute(new PollTenantCommand(tenantId))
    })

    // Rehydrate crons for every tenant already connected
    const allActiveCreds = await this.credRepo.listActive()
    for (const cred of allActiveCreds) {
      await this.scheduleForTenant(cred.tenantId)
    }

    // Subscribe to lifecycle events to schedule / cancel crons dynamically
    this.eventBus.subscribe((event: any) => {
      if (event.type === MS_SYNC_ENABLED_EVENT) {
        void this.scheduleForTenant(event.tenantId)
      } else if (
        event.type === MS_SYNC_DISABLED_EVENT ||
        event.type === MS_SYNC_CREDENTIAL_INVALIDATED_EVENT
      ) {
        void this.cancelForTenant(event.tenantId)
      }
    })
  }

  private async scheduleForTenant(tenantId: string): Promise<void> {
    const jitterSeconds = Math.floor(Math.random() * 180)
    // pg-boss cron: "*/3 * * * *" every 3 min
    await this.boss.schedule(
      JOB_NAME,
      '*/3 * * * *',
      { tenantId },
      {
        singletonKey: `poll-tenant:${tenantId}`,
        startAfter: jitterSeconds,
      },
    )
    this.logger.log(`Scheduled ms-sync-poll-tenant for tenant=${tenantId} jitter=${jitterSeconds}s`)
  }

  private async cancelForTenant(tenantId: string): Promise<void> {
    // pg-boss unschedule API — confirm exact method name for installed version
    await this.boss.unschedule(JOB_NAME, `poll-tenant:${tenantId}`)
    this.logger.log(`Unscheduled ms-sync-poll-tenant for tenant=${tenantId}`)
  }
}
```

Check pg-boss version in repo for `unschedule`/`schedule` API shape. Sub-project #3's orphan-sweep job uses pg-boss cron — mirror that.

- [ ] **Step 2: Test**

```typescript
it('on module init, schedules a cron per active credential', async () => {
  /* ... */
})
it('subscribes MsSyncEnabledEvent → schedules cron', async () => {
  /* ... */
})
it('subscribes MsSyncDisabledEvent → unschedules cron', async () => {
  /* ... */
})
```

- [ ] **Step 3: Register in module providers**

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(planner): ms-sync-poll-tenant pg-boss registrar"
```

---

## Task 6: Pending-assignee resolver

**Files:**

- Create: `apps/api/src/modules/planner/application/commands/ms-sync/resolve-pending-assignments.command.ts`
- Create: `apps/api/src/modules/planner/application/commands/ms-sync/resolve-pending-assignments.handler.ts` (+ `.spec.ts`)
- Create: `apps/api/src/modules/planner/application/event-handlers/identity-directory-synced.listener.ts` (+ `.spec.ts`)
- Create: `apps/api/src/modules/planner/infrastructure/jobs/ms-sync-resolve-pending.registrar.ts`

- [ ] **Step 1: Command**

```typescript
export class ResolvePendingAssignmentsCommand {
  constructor(public readonly tenantId: string) {}
}
```

- [ ] **Step 2: Handler**

```typescript
@CommandHandler(ResolvePendingAssignmentsCommand)
export class ResolvePendingAssignmentsHandler implements ICommandHandler<ResolvePendingAssignmentsCommand> {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    private readonly identityFacade: IdentityQueryFacade,
  ) {}

  async execute(cmd: ResolvePendingAssignmentsCommand): Promise<void> {
    const tasks = await this.taskRepo.listWithPendingAssignments(cmd.tenantId)
    for (const task of tasks) {
      const stillPending: string[] = []
      const newlyResolved: string[] = []
      for (const aadOid of task.pendingMsAssignments) {
        const actorId = await this.identityFacade.getActorIdByExternalUserId(aadOid, cmd.tenantId)
        if (actorId) newlyResolved.push(actorId)
        else stillPending.push(aadOid)
      }
      if (newlyResolved.length > 0 || stillPending.length !== task.pendingMsAssignments.length) {
        await this.taskRepo.applyPendingResolution(task.id, {
          newAssignees: newlyResolved,
          stillPending,
          origin: 'ms-sync-pull',
        })
      }
    }
  }
}
```

`applyPendingResolution` adds `newAssignees` to `task.assignees`, sets `pendingMsAssignments = stillPending`. Emits `TaskAssigneeAddedEvent` with origin=`ms-sync-pull` so push listener skips it (user didn't do this; MS already has these).

- [ ] **Step 3: Listener on `IdentityDirectorySyncedEvent`** — calls the command for the event's tenant.

If the event type doesn't exist yet, add it in `@future/event-contracts` and emit from `identity.sync-idp-groups.handler` completion.

- [ ] **Step 4: Nightly fallback cron** — pg-boss cron `0 2 * * *` runs `ResolvePendingAssignmentsCommand` for every tenant with an active credential.

- [ ] **Step 5: Tests**

```typescript
it('resolves pending AAD OIDs and adds actors to task.assignees', async () => {
  /* ... */
})
it('leaves still-unresolved OIDs in pending_ms_assignments', async () => {
  /* ... */
})
it('emits events with origin=ms-sync-pull (push listener will skip)', async () => {
  /* ... */
})
it('listener fires on IdentityDirectorySyncedEvent', async () => {
  /* ... */
})
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(planner): ResolvePendingAssignmentsCommand + listener + nightly cron"
```

---

## Task 7: Contract-test harness — polling against a sandbox MS tenant

**Files:**

- Create: `apps/api/src/modules/planner/infrastructure/ms-graph/__contract__/poll-tenant.contract.spec.ts`
- Modify: CI workflow (`.github/workflows/contract-tests.yml` or similar)

- [ ] **Step 1: Contract test skeleton**

```typescript
// Runs only when MS_SANDBOX_TENANT_AD_ID, _CLIENT_ID, _CLIENT_SECRET are set.
const skip = !process.env.MS_SANDBOX_TENANT_AD_ID

describe.skipIf(skip)('Contract: poll-tenant against sandbox tenant', () => {
  it('poll imports a known plan with known tasks', async () => {
    // Seed: a known plan ID in the sandbox tenant with known tasks
    // Connect Future to the sandbox
    // Run PollTenantCommand
    // Assert that local DB state matches expected
  })

  it('order-hint algorithm round-trips a task reorder', async () => {
    // Create a task in Future-originated path, push, re-fetch, verify orderHint placement
  })
})
```

- [ ] **Step 2: CI workflow** — nightly schedule that runs contract specs with sandbox secrets injected. Failures open a GitHub issue via `actions/github-script`, do NOT block main.

- [ ] **Step 3: Document sandbox provisioning** in `apps/api/docs/ms-sync-sandbox.md` — how to create the sandbox tenant, assign scopes, seed the known plan.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test(planner): contract-test harness vs sandbox MS tenant (CI nightly)"
```

---

## Task 8: Coverage + PR prep

- [ ] **Step 1: Run coverage**

```bash
bun run --filter @future/api test:coverage -- apps/api/src/modules/planner
```

Target: ≥70% on all new handlers + repositories.

- [ ] **Step 2: Lint + format**

```bash
bun run lint
bun run format
```

- [ ] **Step 3: End-to-end smoke** — on a live SETA MS tenant, confirm:
  1. After connecting + linking a Group, plans appear within ~5 min.
  2. After editing a task in MS Planner, change appears in Future within 3 min.
  3. After deleting a task in MS, it shows as soft-deleted in Future.
  4. 429 received during a high-activity window does not crash the worker.

- [ ] **Step 4: Open PR** — `feat/planner-ms-sync-pull-engine`.

## Completion criteria

- `ms-sync-poll-tenant` cron running per-tenant every 3 min with jittered start.
- `PollTenantHandler` iterates linked Groups, delegates to `PlanIngestor`, detects archived plans.
- 429 / 401 / 403 / 5xx all routed to correct side-effect (pause / invalidate / conflict log / retry counter).
- `ms_sync_conflict` table + entity + repository with factory methods per kind.
- Pending-assignee resolver wired to directory sync completion + nightly fallback.
- Echo-suppression `payload.origin` standardized across planner outbox emitters.
- Contract-test harness against sandbox MS tenant scheduled in CI.
- Coverage ≥ 70%.
- **Scope boundary: no push side effects from this plan.** Plan 4.4 adds push.
