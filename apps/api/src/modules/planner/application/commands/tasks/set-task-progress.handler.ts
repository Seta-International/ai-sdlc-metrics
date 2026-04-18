import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import {
  TaskProgressSetEvent,
  TaskCompletedEvent,
  TaskReopenedEvent,
} from '@future/event-contracts'
import { Progress } from '../../../domain/value-objects/progress.vo'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { SetTaskProgressCommand } from './set-task-progress.command'

@CommandHandler(SetTaskProgressCommand)
export class SetTaskProgressHandler implements ICommandHandler<SetTaskProgressCommand> {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: SetTaskProgressCommand): Promise<void> {
    const task = await this.taskRepo.findById(command.taskId, command.tenantId)
    if (!task) throw new TaskNotFoundException(command.taskId)

    await this.authSvc.assertCanUpdateOwnTaskProgress(
      command.actorId,
      command.planId,
      command.tenantId,
      task.assignees.map((a) => a.actorId),
    )

    const wasCompleted = task.progress === 100
    const prevProgress = task.progress

    if (command.progress === 100) {
      task.markCompleted(command.actorId, new Date())
    } else {
      task.setProgress(Progress.of(command.progress))
    }

    await this.taskRepo.update(task, command.expectedVersion)

    await this.eventBus.publish(
      new TaskProgressSetEvent(
        command.tenantId,
        command.actorId,
        command.taskId,
        command.planId,
        command.progress,
      ),
    )

    if (command.progress === 100 && !wasCompleted) {
      await this.eventBus.publish(
        new TaskCompletedEvent(
          command.tenantId,
          command.actorId,
          command.taskId,
          new Date().toISOString(),
        ),
      )
    } else if (command.progress < 100 && wasCompleted) {
      await this.eventBus.publish(
        new TaskReopenedEvent(command.tenantId, command.actorId, command.taskId, command.planId),
      )
    }

    void prevProgress
  }
}
