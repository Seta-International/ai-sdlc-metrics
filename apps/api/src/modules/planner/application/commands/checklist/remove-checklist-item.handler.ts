import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { ChecklistItemRemovedEvent } from '@future/event-contracts'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import {
  CHECKLIST_ITEM_REPOSITORY,
  type IChecklistItemRepository,
} from '../../../domain/repositories/checklist-item.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { RemoveChecklistItemCommand } from './remove-checklist-item.command'

@CommandHandler(RemoveChecklistItemCommand)
export class RemoveChecklistItemHandler implements ICommandHandler<RemoveChecklistItemCommand> {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    @Inject(CHECKLIST_ITEM_REPOSITORY) private readonly checklistRepo: IChecklistItemRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: RemoveChecklistItemCommand): Promise<void> {
    await this.authSvc.assertCanEditPlan(command.actorId, command.planId, command.tenantId)

    const task = await this.taskRepo.findById(command.taskId, command.tenantId)
    if (!task) throw new TaskNotFoundException(command.taskId)

    task.removeChecklistItem(command.itemId)

    await this.checklistRepo.removeItem(
      command.taskId,
      command.tenantId,
      command.itemId,
      command.expectedVersion,
    )

    await this.eventBus.publish(
      new ChecklistItemRemovedEvent(
        command.tenantId,
        command.actorId,
        command.taskId,
        command.itemId,
      ),
    )
  }
}
