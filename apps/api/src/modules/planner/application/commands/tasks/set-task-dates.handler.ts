import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { TaskUpdatedEvent } from '@future/event-contracts'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { SetTaskDatesCommand } from './set-task-dates.command'

@CommandHandler(SetTaskDatesCommand)
export class SetTaskDatesHandler implements ICommandHandler<SetTaskDatesCommand> {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: SetTaskDatesCommand): Promise<void> {
    const task = await this.taskRepo.findById(command.taskId, command.tenantId)
    if (!task) throw new TaskNotFoundException(command.taskId)

    await this.authSvc.assertCanEditPlan(command.actorId, command.planId, command.tenantId)

    task.setDates(command.startDate, command.dueDate)

    await this.taskRepo.update(task, command.expectedVersion)

    await this.eventBus.publish(
      new TaskUpdatedEvent(command.tenantId, command.actorId, command.taskId, command.planId),
    )
  }
}
