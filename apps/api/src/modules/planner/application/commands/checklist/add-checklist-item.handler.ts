import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { ChecklistItemAddedEvent } from '@future/event-contracts'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import {
  CHECKLIST_ITEM_REPOSITORY,
  type IChecklistItemRepository,
} from '../../../domain/repositories/checklist-item.repository'
import { ChecklistItem } from '../../../domain/entities/checklist-item.value-object'
import { MsOrderHint } from '../../../domain/value-objects/ms-order-hint.vo'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { AddChecklistItemCommand } from './add-checklist-item.command'

@CommandHandler(AddChecklistItemCommand)
export class AddChecklistItemHandler implements ICommandHandler<AddChecklistItemCommand> {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    @Inject(CHECKLIST_ITEM_REPOSITORY) private readonly checklistRepo: IChecklistItemRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: AddChecklistItemCommand): Promise<void> {
    await this.authSvc.assertCanEditPlan(command.actorId, command.planId, command.tenantId)

    const task = await this.taskRepo.findById(command.taskId, command.tenantId)
    if (!task) throw new TaskNotFoundException(command.taskId)

    const orderHint = MsOrderHint.between(command.orderHintAfter, command.orderHintBefore)
    const item = ChecklistItem.create({
      id: command.itemId,
      title: command.title,
      orderHint,
    })

    task.addChecklistItem(item)

    await this.checklistRepo.addItem(
      command.taskId,
      command.tenantId,
      item,
      command.actorId,
      command.expectedVersion,
    )

    await this.eventBus.publish(
      new ChecklistItemAddedEvent(
        command.tenantId,
        command.actorId,
        command.taskId,
        command.itemId,
        command.title,
        ['checklist'],
        'user',
      ),
    )
  }
}
