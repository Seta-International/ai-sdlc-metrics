import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { TaskLabelRemovedEvent } from '@future/event-contracts'
import { LabelSlot } from '../../../domain/value-objects/label-slot.vo'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import { PLAN_REPOSITORY, type IPlanRepository } from '../../../domain/repositories/plan.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { PlanNotFoundException } from '../../../domain/exceptions/plan-not-found.exception'
import { RemoveLabelCommand } from './remove-label.command'

@CommandHandler(RemoveLabelCommand)
export class RemoveLabelHandler implements ICommandHandler<
  RemoveLabelCommand,
  { updatedAt: Date }
> {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    @Inject(PLAN_REPOSITORY) private readonly planRepo: IPlanRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: RemoveLabelCommand): Promise<{ updatedAt: Date }> {
    const task = await this.taskRepo.findById(command.taskId, command.tenantId)
    if (!task) throw new TaskNotFoundException(command.taskId)

    const plan = await this.planRepo.findById(command.planId, command.tenantId)
    if (!plan) throw new PlanNotFoundException(command.planId)

    await this.authSvc.assertCanEditPlan(command.actorId, command.planId, command.tenantId)

    // Validate the slot value (throws InvalidLabelSlotException for invalid values)
    const labelSlot = LabelSlot.of(command.slot)
    task.removeLabel(labelSlot)

    await this.taskRepo.update(task, command.expectedVersion)

    await this.eventBus.publish(
      new TaskLabelRemovedEvent(
        command.tenantId,
        command.actorId,
        command.taskId,
        command.planId,
        command.slot,
        ['appliedCategories'],
        'user',
      ),
    )

    return { updatedAt: task.updatedAt }
  }
}
