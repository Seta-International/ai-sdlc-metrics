import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { EventBus } from '@nestjs/cqrs'
import type { Subscription } from 'rxjs'
import { uuidv7 } from 'uuidv7'
import {
  TaskUpdatedEvent,
  TaskProgressSetEvent,
  TaskAssignedEvent,
  TaskUnassignedEvent,
  TaskMovedEvent,
  TaskLabelAppliedEvent,
  TaskLabelRemovedEvent,
  TaskCustomFieldUpdatedEvent,
  TaskDependencyAddedEvent,
  TaskDependencyRemovedEvent,
  TaskSprintAssignedEvent,
} from '@future/event-contracts'
import {
  TASK_HISTORY_REPOSITORY,
  type ITaskHistoryRepository,
  type HistoryRecord,
} from '../../domain/repositories/task-history.repository'

@Injectable()
export class TaskHistoryRecorderHandler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TaskHistoryRecorderHandler.name)
  private subscription?: Subscription

  constructor(
    @Inject(TASK_HISTORY_REPOSITORY) private readonly repo: ITaskHistoryRepository,
    private readonly eventBus?: EventBus,
  ) {}

  onModuleInit(): void {
    if (this.eventBus) {
      this.subscription = this.eventBus.subscribe((event) => {
        void this.dispatch(event)
      })
    }
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe()
  }

  private dispatch(event: unknown): Promise<void> {
    if (event instanceof TaskUpdatedEvent) return this.handleTaskUpdated(event)
    if (event instanceof TaskProgressSetEvent) return this.handleProgressSet(event)
    if (event instanceof TaskAssignedEvent) return this.handleAssigned(event)
    if (event instanceof TaskUnassignedEvent) return this.handleUnassigned(event)
    if (event instanceof TaskMovedEvent) return this.handleMoved(event)
    if (event instanceof TaskLabelAppliedEvent) return this.handleLabelApplied(event)
    if (event instanceof TaskLabelRemovedEvent) return this.handleLabelRemoved(event)
    if (event instanceof TaskCustomFieldUpdatedEvent) return this.handleCustomFieldUpdated(event)
    if (event instanceof TaskDependencyAddedEvent) return this.handleDependencyAdded(event)
    if (event instanceof TaskDependencyRemovedEvent) return this.handleDependencyRemoved(event)
    if (event instanceof TaskSprintAssignedEvent) return this.handleSprintAssigned(event)
    return Promise.resolve()
  }

  private buildBaseRecord(
    event: {
      tenantId: string
      actorId: string
      taskId: string
    },
    field: string,
    oldValue: unknown,
    newValue: unknown,
  ): HistoryRecord {
    return {
      id: uuidv7(),
      tenantId: event.tenantId,
      taskId: event.taskId,
      actorId: event.actorId,
      field,
      oldValue,
      newValue,
      changedAt: new Date(),
    }
  }

  async handleTaskUpdated(event: TaskUpdatedEvent): Promise<void> {
    for (const field of event.changedFields) {
      const record = this.buildBaseRecord(event, field, null, null)
      await this.safeAppend(record)
    }
  }

  async handleProgressSet(event: TaskProgressSetEvent): Promise<void> {
    const record = this.buildBaseRecord(event, 'progress', null, event.progress)
    await this.safeAppend(record)
  }

  async handleAssigned(event: TaskAssignedEvent): Promise<void> {
    const record = this.buildBaseRecord(event, 'assignee.added', null, event.assigneeId)
    await this.safeAppend(record)
  }

  async handleUnassigned(event: TaskUnassignedEvent): Promise<void> {
    const record = this.buildBaseRecord(event, 'assignee.removed', event.assigneeId, null)
    await this.safeAppend(record)
  }

  async handleMoved(event: TaskMovedEvent): Promise<void> {
    const record = this.buildBaseRecord(event, 'bucket', null, event.toBucketId)
    await this.safeAppend(record)
  }

  async handleLabelApplied(event: TaskLabelAppliedEvent): Promise<void> {
    const record = this.buildBaseRecord(event, 'label.applied', null, event.slot)
    await this.safeAppend(record)
  }

  async handleLabelRemoved(event: TaskLabelRemovedEvent): Promise<void> {
    const record = this.buildBaseRecord(event, 'label.removed', event.slot, null)
    await this.safeAppend(record)
  }

  async handleCustomFieldUpdated(event: TaskCustomFieldUpdatedEvent): Promise<void> {
    const record = this.buildBaseRecord(event, `customField.${event.fieldName}`, null, null)
    await this.safeAppend(record)
  }

  async handleDependencyAdded(event: TaskDependencyAddedEvent): Promise<void> {
    const record = this.buildBaseRecord(event, 'dependency.added', null, {
      fromTaskId: event.fromTaskId,
      toTaskId: event.toTaskId,
      kind: event.kind,
    })
    await this.safeAppend(record)
  }

  async handleDependencyRemoved(event: TaskDependencyRemovedEvent): Promise<void> {
    const record = this.buildBaseRecord(
      event,
      'dependency.removed',
      {
        fromTaskId: event.fromTaskId,
        toTaskId: event.toTaskId,
        kind: event.kind,
      },
      null,
    )
    await this.safeAppend(record)
  }

  async handleSprintAssigned(event: TaskSprintAssignedEvent): Promise<void> {
    const record = this.buildBaseRecord(event, 'sprint', null, event.sprintId)
    await this.safeAppend(record)
  }

  private async safeAppend(record: HistoryRecord): Promise<void> {
    try {
      await this.repo.append(record)
    } catch (err) {
      this.logger.warn(
        `[TaskHistoryRecorder] Failed to append history record for task ${record.taskId}: ${String(err)}`,
      )
    }
  }
}
