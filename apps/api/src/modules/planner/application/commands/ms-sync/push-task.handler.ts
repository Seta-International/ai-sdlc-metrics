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
  type PushTaskData,
} from '../../../infrastructure/ms-graph/push/task-patch-builder'
import { IdentityQueryFacade } from '../../../../identity/application/facades/identity-query.facade'
import type { SyncableTaskField } from '@future/event-contracts'
import type { Task } from '../../../domain/entities/task.entity'
import type { Plan } from '../../../domain/entities/plan.entity'
import { PushTaskCommand } from './push-task.command'

export class TenantPushPausedError extends Error {
  constructor() {
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

    let aadAssignments: Record<string, { orderHint: string }> = {}
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
      await this.handlePushError(tenantId, task, 'task', patch, dirty, e as Error)
    }
  }

  private async patchDetailsScope(
    tenantId: string,
    task: Task,
    patch: Record<string, unknown>,
    dirty: Set<SyncableTaskField>,
  ): Promise<void> {
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
      await this.handlePushError(tenantId, task, 'details', patch, dirty, e as Error)
    }
  }

  // Task 4 will implement full error handling (412 retry, conflict recording, throttle back-off)
  private async handlePushError(
    _tenantId: string,
    _task: Task,
    _scope: 'task' | 'details',
    _patch: Record<string, unknown>,
    _dirty: Set<SyncableTaskField>,
    error: Error,
  ): Promise<void> {
    this.logger.error(`Push error (${_scope}): ${error.message}`)
    throw error
  }

  // Task 4.5 will implement task creation push
  private async createTaskOnMs(_tenantId: string, _plan: Plan, _task: Task): Promise<void> {
    this.logger.log(`createTaskOnMs: not yet implemented for task ${_task.id}`)
  }
}
