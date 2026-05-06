import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { TaskSprintAssignedEvent } from '@future/event-contracts'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { AssignTaskToSprintCommand } from './assign-task-to-sprint.command'

@CommandHandler(AssignTaskToSprintCommand)
export class AssignTaskToSprintHandler implements ICommandHandler<AssignTaskToSprintCommand> {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: AssignTaskToSprintCommand): Promise<void> {
    await this.authSvc.assertCanEditPlan(command.actorId, command.planId, command.tenantId)

    const task = await this.taskRepo.findById(command.taskId, command.tenantId)
    if (!task) throw new TaskNotFoundException(command.taskId)

    const previousSprintId = task.sprintId
    task.setSprintId(command.sprintId)

    await this.taskRepo.update(task, command.expectedVersion)

    await this.eventBus.publish(
      new TaskSprintAssignedEvent(
        command.tenantId,
        command.actorId,
        command.taskId,
        command.planId,
        command.sprintId,
        previousSprintId,
      ),
    )
  }
}
