# Plan 4.4 — Push Engine (Field-Dirty + 412 Recovery + Conflict Log)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Future → Microsoft Graph push. Every user / API edit on an MS-linked plan lands in MS within ~5 seconds (debounced). Field-dirty PATCH with `If-Match`; on 412, re-merge with MS-tiebreak and retry once; second 412 → conflict log. 429 pauses the tenant's push queue. 403-quota surfaces in admin conflict viewer.

**Architecture:** `MsSyncPushListener` subscribes to every planner outbox event with `origin='user'|'api'`, enqueues debounced `ms-sync-push-{task,plan,bucket}` pg-boss jobs keyed by entity id. Workers reload current DB state, compute dirty-field set from outbox events since `last_pushed_at`, build minimal PATCH body, send with `If-Match`, handle 412 via re-fetch + tiebreak.

**Tech Stack:** NestJS CQRS, pg-boss, `MsGraphClient` from Plan 4.2, Plan 4.3's `ms_sync_conflict` table.

**Source spec:** [`2026-04-21-planner-ms-sync-4a-design.md`](../../specs/2026-04-21-planner-ms-sync-4a-design.md) §6, §7.1, §7.2, §10.2 (Plan 4.4).

**Depends on:** Plan 4.3 complete.

---

## Task 1: Extend outbox event payloads with `changedFields`

Every user-facing planner command that mutates a task/plan/bucket must now emit an event whose payload includes `changedFields: string[]` enumerating the domain fields changed.

**Files:**

- Modify: planner command handlers across `apps/api/src/modules/planner/application/commands/`
- Modify: event contracts in `packages/event-contracts/src/planner/`

- [ ] **Step 1: Decide the canonical field name set**

Task fields that are syncable:

```
title, bucketId, percentComplete, priority, startDate, dueDate, completedDate,
assignees, appliedCategories, orderHint, assigneePriority,
description, checklist, references, previewType, attachments
```

Plan fields: `title`. Bucket fields: `name, orderHint`.

Document these in `packages/event-contracts/src/planner/ms-sync/field-names.ts`:

```typescript
export const SYNCABLE_TASK_FIELDS = [
  'title',
  'bucketId',
  'percentComplete',
  'priority',
  'startDate',
  'dueDate',
  'completedDate',
  'assignees',
  'appliedCategories',
  'orderHint',
  'assigneePriority',
  'description',
  'checklist',
  'references',
  'previewType',
  'attachments',
] as const
export type SyncableTaskField = (typeof SYNCABLE_TASK_FIELDS)[number]

export const SYNCABLE_PLAN_FIELDS = ['title'] as const
export const SYNCABLE_BUCKET_FIELDS = ['name', 'orderHint'] as const
```

- [ ] **Step 2: Update event contracts to carry `changedFields`**

For every planner task/plan/bucket event type (examples — `TaskProgressChangedEvent`, `TaskTitleChangedEvent`, etc.), add:

```typescript
export interface TaskProgressChangedEvent {
  // ...existing fields
  readonly changedFields: readonly SyncableTaskField[] // e.g., ['percentComplete']
  readonly origin: 'user' | 'api' | 'ms-sync-pull' | 'ms-sync-backfill' | 'ms-sync-push'
}
```

(The `origin` field was added in Plan 4.3; confirm + extend.)

- [ ] **Step 3: Update command handlers**

Example — `set-task-progress.handler.ts`:

```typescript
this.eventBus.publish({
  type: TASK_PROGRESS_CHANGED_EVENT,
  tenantId,
  taskId,
  progress: newValue,
  changedFields: ['percentComplete'],
  origin: 'user',
  occurredAt: new Date().toISOString(),
})
```

Do the same for every mutating handler in the planner module.

- [ ] **Step 4: Type-check**

```bash
bun run --filter @future/api typecheck
```

Fix any places that construct events without `changedFields`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(planner): emit changedFields[] on all task/plan/bucket mutation events"
```

---

## Task 2: `MsSyncPushListener` — enqueue debounced jobs

**Files:**

- Create: `apps/api/src/modules/planner/application/event-handlers/ms-sync-push.listener.ts` (+ `.spec.ts`)

- [ ] **Step 1: Listener test**

```typescript
describe('MsSyncPushListener', () => {
  let boss: any, planRepo: any, credRepo: any, listener: MsSyncPushListener

  beforeEach(() => {
    boss = { send: vi.fn() }
    planRepo = { get: vi.fn() }
    credRepo = { get: vi.fn() }
    listener = new MsSyncPushListener(boss, planRepo, credRepo)
  })

  it('skips events with origin=ms-sync-pull', async () => {
    await listener.handle({
      type: 'planner.task.progress_changed',
      tenantId: 't1',
      taskId: 'task-1',
      planId: 'plan-1',
      changedFields: ['percentComplete'],
      origin: 'ms-sync-pull',
    } as any)
    expect(boss.send).not.toHaveBeenCalled()
  })

  it('skips when plan.containerType is future_only', async () => {
    planRepo.get.mockResolvedValue({ containerType: 'future_only' })
    await listener.handle({
      type: 'planner.task.progress_changed',
      tenantId: 't1',
      taskId: 'task-1',
      planId: 'plan-1',
      changedFields: ['percentComplete'],
      origin: 'user',
    } as any)
    expect(boss.send).not.toHaveBeenCalled()
  })

  it('skips when credential is not active', async () => {
    planRepo.get.mockResolvedValue({ containerType: 'ms_group' })
    credRepo.get.mockResolvedValue({ status: 'paused' })
    await listener.handle({
      type: 'planner.task.progress_changed',
      tenantId: 't1',
      taskId: 'task-1',
      planId: 'plan-1',
      changedFields: ['percentComplete'],
      origin: 'user',
    } as any)
    expect(boss.send).not.toHaveBeenCalled()
  })

  it('enqueues ms-sync-push-task with debounce + singletonKey', async () => {
    planRepo.get.mockResolvedValue({ containerType: 'ms_group' })
    credRepo.get.mockResolvedValue({ status: 'active' })
    await listener.handle({
      type: 'planner.task.progress_changed',
      tenantId: 't1',
      taskId: 'task-1',
      planId: 'plan-1',
      changedFields: ['percentComplete'],
      origin: 'user',
    } as any)
    expect(boss.send).toHaveBeenCalledWith(
      'ms-sync-push-task',
      { tenantId: 't1', taskId: 'task-1' },
      expect.objectContaining({ singletonKey: 'push-task:task-1', startAfter: 2 }),
    )
  })

  it('enqueues ms-sync-push-plan for plan events', async () => {
    /* ... */
  })
  it('enqueues ms-sync-push-bucket for bucket events', async () => {
    /* ... */
  })
})
```

- [ ] **Step 2: Listener implementation**

```typescript
import { EventsHandler, IEventHandler } from '@nestjs/cqrs'
import { Inject, Injectable } from '@nestjs/common'
import type PgBoss from 'pg-boss'
import {
  MS_GRAPH_CREDENTIAL_REPOSITORY,
  type IMsGraphCredentialRepository,
} from '../../../identity/domain/repositories/ms-graph-credential.repository'
import { PLAN_REPOSITORY, type IPlanRepository } from '../../domain/repositories/plan.repository'
import { PG_BOSS } from '../../infrastructure/jobs/pg-boss.token'

// Event wildcard matcher — adjust to your CQRS + outbox wiring.
// Listener subscribes to ALL planner task/plan/bucket events.

@Injectable()
@EventsHandler(
  'planner.task.*',
  'planner.plan.*',
  'planner.bucket.*',
  'planner.task_attachment.*' as any,
)
export class MsSyncPushListener implements IEventHandler<any> {
  constructor(
    @Inject(PG_BOSS) private readonly boss: PgBoss,
    @Inject(PLAN_REPOSITORY) private readonly planRepo: IPlanRepository,
    @Inject(MS_GRAPH_CREDENTIAL_REPOSITORY) private readonly credRepo: IMsGraphCredentialRepository,
  ) {}

  async handle(event: any): Promise<void> {
    if (!event?.origin || event.origin.startsWith('ms-sync-')) return

    const tenantId: string = event.tenantId
    const taskId: string | undefined = event.taskId
    const planId: string | undefined = event.planId
    const bucketId: string | undefined = event.bucketId
    const attachmentId: string | undefined = event.taskAttachmentId

    // Credential must be active
    const cred = await this.credRepo.get(tenantId)
    if (!cred || cred.status !== 'active') return

    // Plan must be MS-linked
    const planIdForCheck = planId ?? event.taskPlanId
    if (!planIdForCheck) return
    const plan = await this.planRepo.get(planIdForCheck)
    if (!plan || plan.containerType === 'future_only') return

    // Route to job
    if (taskId) {
      await this.boss.send(
        'ms-sync-push-task',
        { tenantId, taskId },
        {
          singletonKey: `push-task:${taskId}`,
          startAfter: 2, // seconds
        },
      )
    } else if (bucketId) {
      await this.boss.send(
        'ms-sync-push-bucket',
        { tenantId, bucketId },
        {
          singletonKey: `push-bucket:${bucketId}`,
          startAfter: 2,
        },
      )
    } else if (planId) {
      await this.boss.send(
        'ms-sync-push-plan',
        { tenantId, planId },
        {
          singletonKey: `push-plan:${planId}`,
          startAfter: 2,
        },
      )
    }

    if (attachmentId) {
      await this.boss.send(
        'ms-sync-push-attachment',
        { tenantId, attachmentId },
        {
          singletonKey: `push-attachment:${attachmentId}`,
          startAfter: 0.5,
        },
      )
    }
  }
}
```

Note: event type patterns and subscription style depend on the existing CQRS + outbox wiring. If your repo uses a central `OutboxRelay` that dispatches events by name string matching, adapt accordingly.

- [ ] **Step 3: Run tests — expect PASS**

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(planner): MsSyncPushListener — debounced push job enqueue"
```

---

## Task 3: Push-task worker — dirty-field computation + PATCH

**Files:**

- Create: `apps/api/src/modules/planner/application/commands/ms-sync/push-task.command.ts`
- Create: `apps/api/src/modules/planner/application/commands/ms-sync/push-task.handler.ts` (+ `.spec.ts`)
- Create: `apps/api/src/modules/planner/infrastructure/ms-graph/push/task-patch-builder.ts` (+ `.spec.ts`)

- [ ] **Step 1: Dirty-field aggregator query**

Add to outbox repository or create a dedicated query: `getChangedFieldsSincePush(taskId: string, since: Date): Promise<Set<SyncableTaskField>>`. It reads outbox_event rows where `payload.taskId = taskId AND payload.origin IN ('user','api') AND created_at >= since`, unions their `payload.changedFields`.

- [ ] **Step 2: `TaskPatchBuilder` — pure function**

```typescript
import type { Task } from '../../../domain/entities/task.entity'
import type { SyncableTaskField } from '@future/event-contracts'

export interface TaskPatchResult {
  taskScopePatch: Record<string, unknown> | null
  detailsScopePatch: Record<string, unknown> | null
}

const TASK_SCOPE_FIELDS = new Set<SyncableTaskField>([
  'title',
  'bucketId',
  'percentComplete',
  'priority',
  'startDate',
  'dueDate',
  'completedDate',
  'assignees',
  'appliedCategories',
  'orderHint',
  'assigneePriority',
])
const DETAILS_SCOPE_FIELDS = new Set<SyncableTaskField>([
  'description',
  'checklist',
  'references',
  'previewType',
])

export function buildTaskPatches(
  task: Task,
  dirty: Set<SyncableTaskField>,
  aadAssignments: Record<string, { orderHint: string }>,
): TaskPatchResult {
  const taskScope: Record<string, unknown> = {}
  const detailsScope: Record<string, unknown> = {}

  for (const field of dirty) {
    if (TASK_SCOPE_FIELDS.has(field)) {
      switch (field) {
        case 'title':
          taskScope.title = task.title
          break
        case 'bucketId':
          taskScope.bucketId = task.msBucketId
          break
        case 'percentComplete':
          taskScope.percentComplete = task.percentComplete
          break
        case 'priority':
          taskScope.priority = task.priority
          break
        case 'startDate':
          taskScope.startDateTime = task.startDate?.toISOString() ?? null
          break
        case 'dueDate':
          taskScope.dueDateTime = task.dueDate?.toISOString() ?? null
          break
        case 'completedDate':
          taskScope.completedDateTime = task.completedDate?.toISOString() ?? null
          break
        case 'orderHint':
          taskScope.orderHint = task.orderHint
          break
        case 'assigneePriority':
          taskScope.assigneePriority = task.assigneePriority
          break
        case 'assignees':
          taskScope.assignments = Object.fromEntries(
            Object.entries(aadAssignments).map(([aadId, v]) => [
              aadId,
              { '@odata.type': '#microsoft.graph.plannerAssignment', orderHint: v.orderHint },
            ]),
          )
          break
        case 'appliedCategories':
          taskScope.appliedCategories = task.appliedCategories
          break
      }
    } else if (DETAILS_SCOPE_FIELDS.has(field)) {
      switch (field) {
        case 'description':
          detailsScope.description = task.description ?? ''
          break
        case 'previewType':
          detailsScope.previewType = task.previewType ?? 'automatic'
          break
        case 'checklist':
          detailsScope.checklist = Object.fromEntries(
            task.checklist.map((item) => [
              item.id,
              {
                '@odata.type': '#microsoft.graph.plannerChecklistItem',
                title: item.title,
                isChecked: item.isChecked,
                orderHint: item.orderHint,
              },
            ]),
          )
          break
        case 'references':
          detailsScope.references = Object.fromEntries(
            task.references.map((r) => [
              r.encodedUrl,
              {
                '@odata.type': '#microsoft.graph.plannerExternalReference',
                alias: r.alias,
                type: r.type,
              },
            ]),
          )
          break
      }
    }
    // 'attachments' is handled by push-attachment worker (Plan 4.5), not here.
  }

  return {
    taskScopePatch: Object.keys(taskScope).length > 0 ? taskScope : null,
    detailsScopePatch: Object.keys(detailsScope).length > 0 ? detailsScope : null,
  }
}
```

- [ ] **Step 3: Extensive test matrix for `TaskPatchBuilder`**

```typescript
describe('buildTaskPatches', () => {
  it('percentComplete-only dirt → taskScopePatch has percentComplete, details null', () => {
    /* ... */
  })
  it('description-only dirt → detailsScopePatch, task null', () => {
    /* ... */
  })
  it('title+description dirt → both patches populated with only those fields', () => {
    /* ... */
  })
  it('assignees maps to MS plannerAssignment open-type with @odata.type', () => {
    /* ... */
  })
  it('checklist maps to keyed map with @odata.type on each item', () => {
    /* ... */
  })
  it('null startDate pushes null (explicit clear)', () => {
    /* ... */
  })
  it('no dirty fields → both patches null', () => {
    /* ... */
  })
})
```

- [ ] **Step 4: `PushTaskHandler`**

```typescript
@CommandHandler(PushTaskCommand)
export class PushTaskHandler implements ICommandHandler<PushTaskCommand> {
  private readonly logger = new Logger(PushTaskHandler.name)

  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    @Inject(PLAN_REPOSITORY) private readonly planRepo: IPlanRepository,
    @Inject(MS_SYNC_CONFLICT_REPOSITORY) private readonly conflictRepo: IMsSyncConflictRepository,
    @Inject(MS_GRAPH_CREDENTIAL_REPOSITORY) private readonly credRepo: IMsGraphCredentialRepository,
    private readonly graph: MsGraphClient,
    private readonly dirtyQuery: OutboxDirtyFieldsQuery,
    private readonly identityFacade: IdentityQueryFacade,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: PushTaskCommand): Promise<void> {
    const task = await this.taskRepo.get(command.taskId)
    if (!task) return

    const plan = await this.planRepo.get(task.planId)
    if (!plan || plan.containerType === 'future_only' || plan.containerType === 'ms_roster') {
      // ms_roster is fine; future_only is skipped
      if (plan?.containerType === 'future_only') return
    }
    if (!task.msTaskId) {
      // Creation case — Task is Future-new, not yet pushed
      await this.createTaskOnMs(command.tenantId, plan!, task)
      return
    }

    // Check tenant push pause
    const cred = await this.credRepo.get(command.tenantId)
    if (cred?.tenantPushPausedUntil && cred.tenantPushPausedUntil > new Date()) {
      throw new TenantPushPausedError(cred.tenantPushPausedUntil)
    }

    const dirty = await this.dirtyQuery.forTask(command.taskId, task.lastPushedAt ?? new Date(0))
    if (dirty.size === 0) return

    // Resolve assignees (hard-block)
    let aadAssignments: Record<string, { orderHint: string }> = task.aadAssignmentsCache ?? {}
    if (dirty.has('assignees')) {
      aadAssignments = {}
      for (const actorId of task.assignees) {
        const aadId = await this.identityFacade.getExternalUserId(actorId, command.tenantId)
        if (!aadId) {
          await this.conflictRepo.insert(
            MsSyncConflictEntity.forPushFailed({
              tenantId: command.tenantId,
              taskId: task.id,
              rawError: { reason: 'unresolvable_assignee', actorId },
            }),
          )
          throw new AssigneeBlockedError(actorId)
        }
        aadAssignments[aadId] = { orderHint: task.assigneeOrderHints[actorId] ?? ' !' }
      }
      // Explicit nulls for removed assignees (AAD ids that used to be there)
      for (const aadId of Object.keys(task.aadAssignmentsCache ?? {})) {
        if (!(aadId in aadAssignments)) {
          aadAssignments[aadId] = undefined as unknown as { orderHint: string }
        }
      }
    }

    const prePushValues = snapshotFields(task, dirty)
    const { taskScopePatch, detailsScopePatch } = buildTaskPatches(task, dirty, aadAssignments)

    if (taskScopePatch) {
      await this.patchTaskScope(command.tenantId, task, taskScopePatch, dirty, prePushValues)
    }
    if (detailsScopePatch) {
      await this.patchDetailsScope(command.tenantId, task, detailsScopePatch, dirty, prePushValues)
    }

    await this.taskRepo.markPushed(task.id, new Date())
  }

  private async patchTaskScope(
    tenantId: string,
    task: Task,
    patch: Record<string, unknown>,
    dirty: Set<SyncableTaskField>,
    prePush: Record<string, unknown>,
  ): Promise<void> {
    try {
      const res = await this.graph.patch<any>(
        tenantId,
        `/planner/tasks/${encodeURIComponent(task.msTaskId!)}`,
        patch,
        { ifMatch: task.msTaskEtag!, preferReturnRepresentation: true },
      )
      if (res.body?.['@odata.etag']) {
        await this.taskRepo.updateEtag(task.id, { msTaskEtag: res.body['@odata.etag'] })
      } else if (res.etag) {
        await this.taskRepo.updateEtag(task.id, { msTaskEtag: res.etag })
      }
    } catch (e) {
      await this.handlePushError(tenantId, task, 'task', patch, dirty, prePush, e as Error, 0)
    }
  }

  private async patchDetailsScope(
    tenantId: string,
    task: Task,
    patch: Record<string, unknown>,
    dirty: Set<SyncableTaskField>,
    prePush: Record<string, unknown>,
  ): Promise<void> {
    try {
      const res = await this.graph.patch<any>(
        tenantId,
        `/planner/tasks/${encodeURIComponent(task.msTaskId!)}/details`,
        patch,
        { ifMatch: task.msDetailsEtag!, preferReturnRepresentation: true },
      )
      if (res.body?.['@odata.etag']) {
        await this.taskRepo.updateEtag(task.id, { msDetailsEtag: res.body['@odata.etag'] })
      }
    } catch (e) {
      await this.handlePushError(tenantId, task, 'details', patch, dirty, prePush, e as Error, 0)
    }
  }

  // handlePushError implementation in Task 4 below
}
```

- [ ] **Step 5: Tests for the happy path**

```typescript
it('dirty percentComplete only → single PATCH to /planner/tasks/{id}', async () => {
  /* ... */
})
it('dirty description → single PATCH to /planner/tasks/{id}/details', async () => {
  /* ... */
})
it('mixed dirt → two PATCHes, each with If-Match from respective etag', async () => {
  /* ... */
})
it('no dirty fields → no Graph calls (idempotent)', async () => {
  /* ... */
})
it('future_only plan → no-op', async () => {
  /* ... */
})
it('credential paused → TenantPushPausedError requeues', async () => {
  /* ... */
})
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(planner): push-task happy path — dirty-field PATCH with If-Match"
```

---

## Task 4: 412 recovery — re-fetch, MS-tiebreak, retry once

- [ ] **Step 1: `handlePushError` implementation**

```typescript
private async handlePushError(
  tenantId: string,
  task: Task,
  scope: 'task' | 'details',
  originalPatch: Record<string, unknown>,
  dirty: Set<SyncableTaskField>,
  prePushValues: Record<string, unknown>,
  error: Error,
  attempt: number,
): Promise<void> {
  if (error instanceof GraphPreconditionFailedError) {
    if (attempt >= 1) {
      await this.conflictRepo.insert(
        MsSyncConflictEntity.forPush412Exhausted({
          tenantId, taskId: task.id, rawError: error.body,
        }),
      )
      return
    }
    // Re-fetch + re-merge + retry once
    const freshRes = await this.graph.get<any>(
      tenantId,
      scope === 'task'
        ? `/planner/tasks/${encodeURIComponent(task.msTaskId!)}`
        : `/planner/tasks/${encodeURIComponent(task.msTaskId!)}/details`,
    )
    const freshBody = freshRes.body!
    const freshEtag = freshBody['@odata.etag'] as string

    // For each field in originalPatch, compare fresh MS value against prePushValues
    const mergedPatch: Record<string, unknown> = {}
    for (const field of dirty) {
      const msField = mapDomainFieldToMsField(field) // helper — 'percentComplete' → 'percentComplete', 'startDate' → 'startDateTime', etc.
      if (scope === 'task' && !TASK_SCOPE_FIELDS.has(field)) continue
      if (scope === 'details' && !DETAILS_SCOPE_FIELDS.has(field)) continue

      const prePushMsValue = prePushValues[field]
      const freshMsValue = freshBody[msField]

      if (deepEqual(prePushMsValue, freshMsValue)) {
        // MS has not changed this field — our edit is safe
        mergedPatch[msField] = originalPatch[msField]
      } else {
        // MS changed this field too — MS-tiebreak: drop from merge, log conflict
        await this.conflictRepo.insert(
          MsSyncConflictEntity.forFieldLww({
            tenantId,
            taskId: task.id,
            field,
            mineValue: originalPatch[msField],
            theirsValue: freshMsValue,
          }),
        )
      }
    }

    if (Object.keys(mergedPatch).length === 0) {
      // Everything lost to MS
      return
    }

    // Update our local state with MS's fresh values for the fields MS won
    await this.taskRepo.applyMsWonFields(task.id, freshBody, {
      origin: 'ms-sync-pull', // critical — must not re-trigger push
    })
    // Retry once
    try {
      const res = await this.graph.patch<any>(
        tenantId,
        scope === 'task'
          ? `/planner/tasks/${encodeURIComponent(task.msTaskId!)}`
          : `/planner/tasks/${encodeURIComponent(task.msTaskId!)}/details`,
        mergedPatch,
        { ifMatch: freshEtag, preferReturnRepresentation: true },
      )
      const newEtag = (res.body?.['@odata.etag'] as string) ?? res.etag
      if (newEtag) {
        await this.taskRepo.updateEtag(task.id, scope === 'task' ? { msTaskEtag: newEtag } : { msDetailsEtag: newEtag })
      }
    } catch (retryError) {
      await this.handlePushError(tenantId, task, scope, mergedPatch, dirty, prePushValues, retryError as Error, attempt + 1)
    }
    return
  }

  if (error instanceof GraphThrottledError) {
    await this.pauseTenantPushQueue(tenantId, error.retryAfterSeconds)
    throw new TenantPushPausedError(new Date(Date.now() + error.retryAfterSeconds * 1000))
  }

  if (error instanceof GraphAuthError) {
    const cred = await this.credRepo.get(tenantId)
    if (cred) {
      cred.markInvalid(error.message)
      await this.credRepo.upsert(cred)
      this.eventBus.publish(
        createMsSyncCredentialInvalidatedEvent({
          tenantId, reason: error.message, occurredAt: new Date().toISOString(),
        }),
      )
    }
    return
  }

  if (error instanceof GraphQuotaError) {
    await this.conflictRepo.insert(
      MsSyncConflictEntity.forPush403Quota({
        tenantId, taskId: task.id, limitCode: error.limitCode, rawError: error.body,
      }),
    )
    return
  }

  if (error instanceof GraphServerError) {
    throw error // pg-boss will retry with backoff
  }

  // Unknown / other — write as push_failed
  await this.conflictRepo.insert(
    MsSyncConflictEntity.forPushFailed({
      tenantId, taskId: task.id, rawError: { message: error.message },
    }),
  )
}

private async pauseTenantPushQueue(tenantId: string, retryAfterSeconds: number): Promise<void> {
  const cred = await this.credRepo.get(tenantId)
  if (!cred) return
  const pauseUntil = new Date(Date.now() + retryAfterSeconds * 1000)
  await this.credRepo.setPushPausedUntil(tenantId, pauseUntil)
}
```

Helper: `mapDomainFieldToMsField('startDate')` → `'startDateTime'`, etc. Pure function, unit-tested.

Extend `IMsGraphCredentialRepository` with `setPushPausedUntil(tenantId, date)`. Add `tenant_push_paused_until` column to `ms_graph_credential` via a new migration.

- [ ] **Step 2: Tests — 412 recovery matrix**

```typescript
it('412: MS field unchanged → merged patch retried, succeeds', async () => {
  /* ... */
})
it('412: MS field changed → conflict row written, field dropped from merge', async () => {
  /* ... */
})
it('412: all MS fields changed → empty merge, no retry PATCH', async () => {
  /* ... */
})
it('412 twice → ms_sync_conflict(kind=push_412_exhausted)', async () => {
  /* ... */
})
it('412 then 429 on retry → push queue paused', async () => {
  /* ... */
})
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(planner): push 412 recovery with MS-tiebreak + error routing"
```

---

## Task 5: Create-task on MS (Future-originated tasks)

When `task.msTaskId` is null and plan is MS-linked, this is a newly-created Future task that hasn't been pushed yet.

- [ ] **Step 1: `createTaskOnMs` method on `PushTaskHandler`**

```typescript
private async createTaskOnMs(tenantId: string, plan: Plan, task: Task): Promise<void> {
  // Resolve assignees
  const assignments: Record<string, unknown> = {}
  for (const actorId of task.assignees) {
    const aadId = await this.identityFacade.getExternalUserId(actorId, tenantId)
    if (!aadId) {
      throw new AssigneeBlockedError(actorId)
    }
    assignments[aadId] = {
      '@odata.type': '#microsoft.graph.plannerAssignment',
      orderHint: task.assigneeOrderHints[actorId] ?? ' !',
    }
  }

  // POST /planner/tasks
  const res = await this.graph.post<any>(
    tenantId,
    '/planner/tasks',
    {
      planId: plan.msPlanId,
      bucketId: task.msBucketId ?? undefined,
      title: task.title,
      orderHint: task.orderHint,
      priority: task.priority,
      percentComplete: task.percentComplete,
      startDateTime: task.startDate?.toISOString() ?? undefined,
      dueDateTime: task.dueDate?.toISOString() ?? undefined,
      appliedCategories: task.appliedCategories,
      assignments: Object.keys(assignments).length > 0 ? assignments : undefined,
    },
    { preferReturnRepresentation: true },
  )

  if (!res.body?.id) throw new Error('plannerTask create returned no id')

  await this.taskRepo.linkToMs(task.id, {
    msTaskId: res.body.id,
    msTaskEtag: res.body['@odata.etag'] ?? res.etag ?? '',
    origin: 'ms-sync-push',
  })

  // If task has description / checklist / references → follow-up PATCH /details
  if (task.description || task.checklist.length > 0) {
    const detailsRes = await this.graph.patch<any>(
      tenantId,
      `/planner/tasks/${encodeURIComponent(res.body.id)}/details`,
      {
        description: task.description ?? undefined,
        previewType: task.previewType,
        checklist: task.checklist.length > 0 ? Object.fromEntries(task.checklist.map((i) => [i.id, {
          '@odata.type': '#microsoft.graph.plannerChecklistItem',
          title: i.title, isChecked: i.isChecked, orderHint: i.orderHint,
        }])) : undefined,
      },
      { ifMatch: '*', preferReturnRepresentation: true }, // '*' wildcard If-Match — only acceptable on first details PATCH
    )
    if (detailsRes.body?.['@odata.etag']) {
      await this.taskRepo.updateEtag(task.id, { msDetailsEtag: detailsRes.body['@odata.etag'] })
    }
  }

  await this.taskRepo.markPushed(task.id, new Date())
}
```

Note on `If-Match: '*'` — Graph accepts wildcard for first details edit (details resource is auto-created when task is created; any etag matches). Verify in contract test; if not, fetch first to get etag.

- [ ] **Step 2: Tests**

```typescript
it('createTaskOnMs: POSTs with resolved assignees + subsequent details PATCH', async () => {
  /* ... */
})
it('createTaskOnMs: unresolvable assignee → AssigneeBlockedError', async () => {
  /* ... */
})
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(planner): push-task creates Future-originated tasks on MS"
```

---

## Task 6: push-plan + push-bucket workers

Smaller-scope sibling workers. Plans and buckets are simpler (fewer fields).

**Files:**

- Create: `apps/api/src/modules/planner/application/commands/ms-sync/push-plan.handler.ts` (+ `.spec.ts`)
- Create: `apps/api/src/modules/planner/application/commands/ms-sync/push-bucket.handler.ts` (+ `.spec.ts`)
- Create: `apps/api/src/modules/planner/application/commands/ms-sync/push-plan.command.ts`
- Create: `apps/api/src/modules/planner/application/commands/ms-sync/push-bucket.command.ts`

- [ ] **Step 1: push-plan — supports `title` only**

```typescript
if (dirty.has('title')) {
  await this.graph.patch(
    tenantId,
    `/planner/plans/${encodeURIComponent(plan.msPlanId!)}`,
    { title: plan.title },
    { ifMatch: plan.msPlanEtag!, preferReturnRepresentation: true },
  )
}
```

Creation case — if `plan.msPlanId` is null and `containerType != 'future_only'`, POST `/planner/plans`:

```typescript
const containerType = plan.containerType === 'ms_group' ? 'group' : 'roster'
await this.graph.post(
  tenantId,
  '/planner/plans',
  {
    container: {
      '@odata.type': '#microsoft.graph.plannerPlanContainer',
      containerId: plan.containerRef!,
      type: containerType,
    },
    title: plan.title,
  },
  { preferReturnRepresentation: true },
)
```

- [ ] **Step 2: push-bucket — `name`, `orderHint`**

- [ ] **Step 3: Tests for each**

- [ ] **Step 4: Register with pg-boss**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(planner): push-plan + push-bucket workers"
```

---

## Task 7: Echo-suppression: push-origin writes must not re-trigger push

- [ ] **Step 1: Verify `taskRepo.updateEtag`, `applyMsWonFields`, `linkToMs`, `markPushed` emit outbox events (if any) with `origin: 'ms-sync-push'` or `'ms-sync-pull'`**

```typescript
it('taskRepo.linkToMs does not trigger push-task enqueue (origin=ms-sync-push)', async () => {
  // seed a listener recording all enqueued jobs
  await taskRepo.linkToMs('task-1', {
    msTaskId: 'ms-1',
    msTaskEtag: 'W/"x"',
    origin: 'ms-sync-push',
  })
  expect(pgBossSend).not.toHaveBeenCalled()
})
```

If any repository methods don't set origin, fix them.

- [ ] **Step 2: Commit (if any fixes)**

```bash
git add -A
git commit -m "fix(planner): ensure push-path repo writes carry ms-sync-* origin"
```

---

## Task 8: Register pg-boss workers + wire to module

**Files:**

- Modify: `apps/api/src/modules/planner/infrastructure/jobs/pg-boss.registrar.ts` (or equivalent)
- Modify: `apps/api/src/modules/planner/planner.module.ts`

- [ ] **Step 1: Register handlers**

```typescript
await boss.work('ms-sync-push-task', async (job) => {
  await commandBus.execute(new PushTaskCommand(job.data.tenantId, job.data.taskId))
})
await boss.work('ms-sync-push-plan', async (job) => {
  await commandBus.execute(new PushPlanCommand(job.data.tenantId, job.data.planId))
})
await boss.work('ms-sync-push-bucket', async (job) => {
  await commandBus.execute(new PushBucketCommand(job.data.tenantId, job.data.bucketId))
})
```

- [ ] **Step 2: Provide `MsSyncPushListener` in module providers**

- [ ] **Step 3: Smoke-test end-to-end**

With a connected SETA tenant and a linked Group:

1. Edit a task's title in web-planner.
2. Within ~5 s, open the same task in MS Planner web UI — title matches.
3. Change title in MS Planner.
4. Within ~3 min, web-planner shows the new title (poll engine).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(planner): register push workers + listener with pg-boss"
```

---

## Task 9: Coverage + PR prep

- [ ] **Step 1: Coverage**

```bash
bun run --filter @future/api test:coverage -- apps/api/src/modules/planner/application/commands/ms-sync \
  apps/api/src/modules/planner/application/event-handlers \
  apps/api/src/modules/planner/infrastructure/ms-graph/push
```

Target ≥ 70% on the new code.

- [ ] **Step 2: PR** — `feat/planner-ms-sync-push-engine`

## Completion criteria

- `MsSyncPushListener` enqueues debounced push jobs for user/api-origin events.
- Push-task: field-dirty PATCH with If-Match; dual PATCH (task scope + details scope) as needed.
- 412 recovery: re-fetch, MS-tiebreak, retry once; second 412 → push_412_exhausted.
- 429 pauses tenant push queue via `tenant_push_paused_until`; resumes on next successful push.
- 403-quota → ms_sync_conflict with limitCode.
- 401/auth → credential invalidation cascade.
- Create flows for plan / task / bucket when Future originates them.
- Echo suppression: push-origin and pull-origin repo writes never trigger push enqueue.
- `MsSyncPushCompletedEvent` (optional; outbox analytics) emitted.
- Coverage ≥ 70%.
- End-to-end bidirectional sync on SETA internal tenant.
