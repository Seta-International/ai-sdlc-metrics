import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { ChecklistItemReorderedEvent } from '@future/event-contracts'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import {
  CHECKLIST_ITEM_REPOSITORY,
  type IChecklistItemRepository,
} from '../../../domain/repositories/checklist-item.repository'
import { MsOrderHint } from '../../../domain/value-objects/ms-order-hint.vo'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { ReorderChecklistItemCommand } from './reorder-checklist-item.command'

@CommandHandler(ReorderChecklistItemCommand)
export class ReorderChecklistItemHandler implements ICommandHandler<ReorderChecklistItemCommand> {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    @Inject(CHECKLIST_ITEM_REPOSITORY) private readonly checklistRepo: IChecklistItemRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: ReorderChecklistItemCommand): Promise<void> {
    await this.authSvc.assertCanEditPlan(command.actorId, command.planId, command.tenantId)

    const task = await this.taskRepo.findById(command.taskId, command.tenantId)
    if (!task) throw new TaskNotFoundException(command.taskId)

    const newHint = MsOrderHint.between(command.orderHintAfter, command.orderHintBefore)

    task.reorderChecklistItem(command.itemId, command.orderHintAfter, command.orderHintBefore)

    await this.checklistRepo.reorderItem(command.taskId, command.tenantId, command.itemId, newHint)

    await this.eventBus.publish(
      new ChecklistItemReorderedEvent(
        command.tenantId,
        command.actorId,
        command.taskId,
        command.itemId,
        newHint,
      ),
    )
  }
}
