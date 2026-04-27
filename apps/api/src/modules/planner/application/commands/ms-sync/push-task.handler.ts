import { isDeepStrictEqual } from 'node:util'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { Inject, Logger } from '@nestjs/common'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import { PLAN_REPOSITORY, type IPlanRepository } from '../../../domain/repositories/plan.repository'
import {
  BUCKET_REPOSITORY,
  type IBucketRepository,
} from '../../../domain/repositories/bucket.repository'
import {
  MS_SYNC_CONFLICT_REPOSITORY,
  type IMsSyncConflictRepository,
} from '../../../domain/repositories/ms-sync-conflict.repository'
import { MsSyncConflictEntity } from '../../../domain/entities/ms-sync-conflict.entity'
import { MsGraphClient } from '../../../infrastructure/ms-graph/ms-graph-client'
import { OutboxDirtyFieldsQuery } from '../../../infrastructure/outbox/outbox-dirty-fields.query'
import {
  buildTaskPatches,
  TASK_SCOPE_FIELDS,
  DETAILS_SCOPE_FIELDS,
  type PushTaskData,
} from '../../../infrastructure/ms-graph/push/task-patch-builder'
import { mapDomainFieldToMsField } from '../../../infrastructure/ms-graph/push/map-domain-field'
import { IdentityQueryFacade } from '../../../../identity/application/facades/identity-query.facade'
import { IdentityMsGraphCredentialFacade } from '../../../../identity/application/facades/identity-ms-graph-credential.facade'
import {
  GraphPreconditionFailedError,
  GraphThrottledError,
  GraphAuthError,
  GraphQuotaError,
  GraphServerError,
} from '../../../infrastructure/ms-graph/errors'
import { createMsSyncCredentialInvalidatedEvent } from '@future/event-contracts'
import type { SyncableTaskField } from '@future/event-contracts'
import type { Task } from '../../../domain/entities/task.entity'
import type { Plan } from '../../../domain/entities/plan.entity'
import { PushTaskCommand } from './push-task.command'

export class TenantPushPausedError extends Error {
  constructor(public readonly pausedUntil?: Date) {
    super('MS Graph push is paused for this tenant')
    this.name = 'TenantPushPausedError'
  }
}

export class AssigneeBlockedError extends Error {
  constructor(public readonly actorId: string) {
    super(`Cannot resolve AAD user for actor ${actorId}`)
    this.name = 'AssigneeBlockedError'
  }
}

@CommandHandler(PushTaskCommand)
export class PushTaskHandler implements ICommandHandler<PushTaskCommand> {
  private readonly logger = new Logger(PushTaskHandler.name)

  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    @Inject(PLAN_REPOSITORY) private readonly planRepo: IPlanRepository,
    @Inject(BUCKET_REPOSITORY) private readonly bucketRepo: IBucketRepository,
    @Inject(MS_SYNC_CONFLICT_REPOSITORY) private readonly conflictRepo: IMsSyncConflictRepository,
    private readonly graph: MsGraphClient,
    private readonly dirtyQuery: OutboxDirtyFieldsQuery,
    private readonly identityFacade: IdentityQueryFacade,
    private readonly msCredFacade: IdentityMsGraphCredentialFacade,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: PushTaskCommand): Promise<void> {
    const task = await this.taskRepo.findById(command.taskId, command.tenantId)
    if (!task) return

    const plan = await this.planRepo.findById(task.planId, command.tenantId)
    if (!plan || plan.container.type === 'future_only') return

    if (!task.msTaskId) {
      // Creation case — not yet implemented (Plan 4.5)
      await this.createTaskOnMs(command.tenantId, plan, task)
      return
    }

    const cred = await this.identityFacade.getGraphCredential(command.tenantId)
    if (!cred || cred.status !== 'active') {
      if (cred?.status === 'paused') throw new TenantPushPausedError()
      return
    }

    const since = task.lastPushedAt ?? new Date(0)
    const dirty = await this.dirtyQuery.forTask(command.taskId, since)
    if (dirty.size === 0) return

    const aadAssignments: Record<string, { orderHint: string }> = {}
    if (dirty.has('assignees')) {
      for (const assignee of task.assignees) {
        const aadId = await this.identityFacade.getExternalUserId(
          assignee.actorId,
          command.tenantId,
        )
        if (!aadId) {
          await this.conflictRepo.insert(
            MsSyncConflictEntity.forPushFailed({
              tenantId: command.tenantId,
              taskId: task.id,
              rawError: { reason: 'unresolvable_assignee', actorId: assignee.actorId },
            }),
          )
          throw new AssigneeBlockedError(assignee.actorId)
        }
        aadAssignments[aadId] = { orderHint: ' !' }
      }
    }

    const bucket = await this.bucketRepo.findById(task.bucketId, command.tenantId)
    const pushData: PushTaskData = {
      title: task.title,
      msBucketId: bucket?.msBucketId ?? null,
      percentComplete: task.progress,
      priority: task.priority,
      startDate: task.startDate,
      dueDate: task.dueDate,
      completedDate: task.completedAt,
      orderHint: task.orderHint,
      assigneePriority: null,
      appliedCategories: {},
      description: task.description,
      previewType: null,
      checklist: task.checklistItems.map((ci) => ({
        id: ci.id,
        title: ci.title,
        isChecked: ci.isChecked,
        orderHint: ci.orderHint,
      })),
      references: [],
    }

    const { taskScopePatch, detailsScopePatch } = buildTaskPatches(pushData, dirty, aadAssignments)

    if (taskScopePatch) {
      await this.patchTaskScope(command.tenantId, task, taskScopePatch, dirty)
    }
    if (detailsScopePatch) {
      await this.patchDetailsScope(command.tenantId, task, detailsScopePatch, dirty)
    }

    await this.taskRepo.markPushed(task.id, new Date())
  }

  private async patchTaskScope(
    tenantId: string,
    task: Task,
    patch: Record<string, unknown>,
    dirty: Set<SyncableTaskField>,
  ): Promise<void> {
    const prePushValues: Record<string, unknown> = {}
    for (const field of dirty) {
      if (TASK_SCOPE_FIELDS.has(field)) {
        prePushValues[field] = patch[mapDomainFieldToMsField(field)]
      }
    }
    try {
      const res = await this.graph.patch<Record<string, unknown>>(
        tenantId,
        `/planner/tasks/${encodeURIComponent(task.msTaskId!)}`,
        patch,
        { ifMatch: task.msTaskEtag!, preferReturnRepresentation: true },
      )
      const newEtag = res.etag
      if (newEtag) {
        await this.taskRepo.updateMsEtag(task.id, { msTaskEtag: newEtag })
      }
    } catch (e) {
      await this.handlePushError(tenantId, task, 'task', patch, dirty, prePushValues, e as Error, 0)
    }
  }

  private async patchDetailsScope(
    tenantId: string,
    task: Task,
    patch: Record<string, unknown>,
    dirty: Set<SyncableTaskField>,
  ): Promise<void> {
    const prePushValues: Record<string, unknown> = {}
    for (const field of dirty) {
      if (DETAILS_SCOPE_FIELDS.has(field)) {
        prePushValues[field] = patch[mapDomainFieldToMsField(field)]
      }
    }
    try {
      const res = await this.graph.patch<Record<string, unknown>>(
        tenantId,
        `/planner/tasks/${encodeURIComponent(task.msTaskId!)}/details`,
        patch,
        { ifMatch: task.msTaskDetailsEtag!, preferReturnRepresentation: true },
      )
      const newEtag = res.etag
      if (newEtag) {
        await this.taskRepo.updateMsEtag(task.id, { msDetailsEtag: newEtag })
      }
    } catch (e) {
      await this.handlePushError(
        tenantId,
        task,
        'details',
        patch,
        dirty,
        prePushValues,
        e as Error,
        0,
      )
    }
  }

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
            tenantId,
            taskId: task.id,
            rawError: (error as GraphPreconditionFailedError).body,
          }),
        )
        return
      }

      const freshRes = await this.graph.get<Record<string, unknown>>(
        tenantId,
        scope === 'task'
          ? `/planner/tasks/${encodeURIComponent(task.msTaskId!)}`
          : `/planner/tasks/${encodeURIComponent(task.msTaskId!)}/details`,
      )
      const freshBody = freshRes.body!
      const freshEtag = freshBody['@odata.etag'] as string

      const scopeFields = scope === 'task' ? TASK_SCOPE_FIELDS : DETAILS_SCOPE_FIELDS
      const mergedPatch: Record<string, unknown> = {}

      for (const field of dirty) {
        if (!scopeFields.has(field)) continue
        const msField = mapDomainFieldToMsField(field)
        const prePushMsValue = prePushValues[field]
        const freshMsValue = freshBody[msField]

        if (isDeepStrictEqual(prePushMsValue, freshMsValue)) {
          mergedPatch[msField] = originalPatch[msField]
        } else {
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
        return
      }

      await this.taskRepo.applyMsWonFields(task.id, freshBody, { origin: 'ms-sync-pull' })

      try {
        const res = await this.graph.patch<Record<string, unknown>>(
          tenantId,
          scope === 'task'
            ? `/planner/tasks/${encodeURIComponent(task.msTaskId!)}`
            : `/planner/tasks/${encodeURIComponent(task.msTaskId!)}/details`,
          mergedPatch,
          { ifMatch: freshEtag, preferReturnRepresentation: true },
        )
        const newEtag = (res.body?.['@odata.etag'] as string) ?? res.etag
        if (newEtag) {
          await this.taskRepo.updateMsEtag(
            task.id,
            scope === 'task' ? { msTaskEtag: newEtag } : { msDetailsEtag: newEtag },
          )
        }
      } catch (retryError) {
        await this.handlePushError(
          tenantId,
          task,
          scope,
          mergedPatch,
          dirty,
          prePushValues,
          retryError as Error,
          attempt + 1,
        )
      }
      return
    }

    if (error instanceof GraphThrottledError) {
      const pauseUntil = new Date(Date.now() + error.retryAfterSeconds * 1000)
      await this.msCredFacade.setPushPausedUntil(tenantId, pauseUntil)
      throw new TenantPushPausedError(pauseUntil)
    }

    if (error instanceof GraphAuthError) {
      await this.msCredFacade.markCredentialInvalid(tenantId, error.message)
      this.eventBus.publish(
        createMsSyncCredentialInvalidatedEvent({
          tenantId,
          reason: error.message,
          occurredAt: new Date().toISOString(),
        }),
      )
      return
    }

    if (error instanceof GraphQuotaError) {
      await this.conflictRepo.insert(
        MsSyncConflictEntity.forPush403Quota({
          tenantId,
          taskId: task.id,
          limitCode: error.limitCode,
          rawError: error.body,
        }),
      )
      return
    }

    if (error instanceof GraphServerError) {
      throw error
    }

    await this.conflictRepo.insert(
      MsSyncConflictEntity.forPushFailed({
        tenantId,
        taskId: task.id,
        rawError: { message: error.message },
      }),
    )
  }

  private async createTaskOnMs(tenantId: string, plan: Plan, task: Task): Promise<void> {
    // 1. Resolve assignees to AAD user IDs
    const assignments: Record<string, { orderHint: string }> = {}
    for (const a of task.assignees) {
      const aadId = await this.identityFacade.getExternalUserId(a.actorId, tenantId)
      if (!aadId) {
        throw new AssigneeBlockedError(a.actorId)
      }
      assignments[aadId] = { orderHint: ' !' }
    }

    // 2. Look up bucket for msBucketId
    const bucket = await this.bucketRepo.findById(task.bucketId, tenantId)

    // 3. POST to MS Planner
    const res = await this.graph.post<Record<string, unknown>>(
      tenantId,
      '/planner/tasks',
      {
        planId: plan.msPlanId,
        bucketId: bucket?.msBucketId ?? undefined,
        title: task.title,
        orderHint: task.orderHint,
        priority: task.priority,
        percentComplete: task.progress,
        startDateTime: task.startDate?.toISOString() ?? undefined,
        dueDateTime: task.dueDate?.toISOString() ?? undefined,
        appliedCategories: {},
        assignments: Object.keys(assignments).length > 0 ? assignments : undefined,
      },
      { preferReturnRepresentation: true },
    )

    // 4. Validate response
    if (!res.body?.id) {
      throw new Error('plannerTask create returned no id')
    }
    const msTaskId = res.body.id as string
    const msTaskEtag = (res.body['@odata.etag'] as string | undefined) ?? res.etag ?? ''

    // 5. Link task to MS
    await this.taskRepo.linkToMs(task.id, { msTaskId, msTaskEtag, origin: 'ms-sync-push' })

    // 6. PATCH /details if description or checklist items exist
    if (task.description || task.checklistItems.length > 0) {
      const detailsRes = await this.graph.patch<Record<string, unknown>>(
        tenantId,
        `/planner/tasks/${encodeURIComponent(msTaskId)}/details`,
        {
          description: task.description || undefined,
          previewType: 'automatic',
          checklist:
            task.checklistItems.length > 0
              ? Object.fromEntries(
                  task.checklistItems.map((i) => [
                    i.id,
                    {
                      '@odata.type': '#microsoft.graph.plannerChecklistItem',
                      title: i.title,
                      isChecked: i.isChecked,
                      orderHint: i.orderHint,
                    },
                  ]),
                )
              : undefined,
        },
        { ifMatch: '*', preferReturnRepresentation: true },
      )
      const detailsEtag =
        (detailsRes.body?.['@odata.etag'] as string | undefined) ?? detailsRes.etag ?? ''
      if (detailsEtag) {
        await this.taskRepo.updateMsEtag(task.id, { msDetailsEtag: detailsEtag })
      }
    }

    // 7. Mark as pushed
    await this.taskRepo.markPushed(task.id, new Date())
  }
}
