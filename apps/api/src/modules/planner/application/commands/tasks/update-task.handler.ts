import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { TaskUpdatedEvent } from '@future/event-contracts'
import { Progress } from '../../../domain/value-objects/progress.vo'
import { Priority } from '../../../domain/value-objects/priority.vo'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { UpdateTaskCommand } from './update-task.command'

@CommandHandler(UpdateTaskCommand)
export class UpdateTaskHandler implements ICommandHandler<UpdateTaskCommand> {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: UpdateTaskCommand): Promise<void> {
    const task = await this.taskRepo.findById(command.taskId, command.tenantId)
    if (!task) throw new TaskNotFoundException(command.taskId)

    // Viewer-assignee exception: when ONLY progress is being changed, use the relaxed check
    const onlyProgressChange =
      command.progress !== undefined &&
      command.title === undefined &&
      command.description === undefined &&
      command.priority === undefined &&
      command.startDate === undefined &&
      command.dueDate === undefined

    if (onlyProgressChange) {
      await this.authSvc.assertCanUpdateOwnTaskProgress(
        command.actorId,
        command.planId,
        command.tenantId,
        task.assignees.map((a) => a.actorId),
      )
    } else {
      await this.authSvc.assertCanEditPlan(command.actorId, command.planId, command.tenantId)
    }

    if (command.title !== undefined) {
      task.rename(command.title)
    }
    if (command.description !== undefined) {
      task.setDescription(command.description)
    }
    if (command.progress !== undefined) {
      task.setProgress(Progress.of(command.progress))
    }
    if (command.priority !== undefined) {
      task.setPriority(Priority.of(command.priority))
    }
    if (command.startDate !== undefined || command.dueDate !== undefined) {
      task.setDates(
        command.startDate !== undefined ? command.startDate : task.startDate,
        command.dueDate !== undefined ? command.dueDate : task.dueDate,
      )
    }

    await this.taskRepo.update(task, command.expectedVersion)

    await this.eventBus.publish(
      new TaskUpdatedEvent(command.tenantId, command.actorId, command.taskId, command.planId),
    )
  }
}
