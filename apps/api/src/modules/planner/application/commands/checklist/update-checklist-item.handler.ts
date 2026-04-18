import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { ChecklistItemUpdatedEvent } from '@future/event-contracts'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import {
  CHECKLIST_ITEM_REPOSITORY,
  type IChecklistItemRepository,
} from '../../../domain/repositories/checklist-item.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { UpdateChecklistItemCommand } from './update-checklist-item.command'

@CommandHandler(UpdateChecklistItemCommand)
export class UpdateChecklistItemHandler implements ICommandHandler<UpdateChecklistItemCommand> {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    @Inject(CHECKLIST_ITEM_REPOSITORY) private readonly checklistRepo: IChecklistItemRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: UpdateChecklistItemCommand): Promise<void> {
    await this.authSvc.assertCanEditPlan(command.actorId, command.planId, command.tenantId)

    const task = await this.taskRepo.findById(command.taskId, command.tenantId)
    if (!task) throw new TaskNotFoundException(command.taskId)

    task.updateChecklistItem(command.itemId, command.title)

    await this.checklistRepo.updateItem(
      command.taskId,
      command.tenantId,
      command.itemId,
      command.title,
      command.expectedVersion,
    )

    await this.eventBus.publish(
      new ChecklistItemUpdatedEvent(
        command.tenantId,
        command.actorId,
        command.taskId,
        command.itemId,
        command.title,
      ),
    )
  }
}
