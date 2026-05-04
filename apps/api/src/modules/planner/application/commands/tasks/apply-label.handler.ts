import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { TaskLabelAppliedEvent } from '@future/event-contracts'
import { LabelSlot } from '../../../domain/value-objects/label-slot.vo'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import { PLAN_REPOSITORY, type IPlanRepository } from '../../../domain/repositories/plan.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { PlanNotFoundException } from '../../../domain/exceptions/plan-not-found.exception'
import { LabelSlotNotDefinedException } from '../../../domain/exceptions/label-slot-not-defined.exception'
import { ApplyLabelCommand } from './apply-label.command'

@CommandHandler(ApplyLabelCommand)
export class ApplyLabelHandler implements ICommandHandler<ApplyLabelCommand, { updatedAt: Date }> {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    @Inject(PLAN_REPOSITORY) private readonly planRepo: IPlanRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: ApplyLabelCommand): Promise<{ updatedAt: Date }> {
    const task = await this.taskRepo.findById(command.taskId, command.tenantId)
    if (!task) throw new TaskNotFoundException(command.taskId)

    const plan = await this.planRepo.findById(command.planId, command.tenantId)
    if (!plan) throw new PlanNotFoundException(command.planId)

    await this.authSvc.assertCanEditPlan(command.actorId, command.planId, command.tenantId)

    // Cross-aggregate invariant: the slot must be defined on the plan
    const slotDefined = plan.labels.some((l) => l.slot.value === command.slot)
    if (!slotDefined) {
      throw new LabelSlotNotDefinedException(command.slot, command.planId)
    }

    const labelSlot = LabelSlot.of(command.slot)
    task.applyLabel(labelSlot)

    await this.taskRepo.update(task, command.expectedVersion)

    await this.eventBus.publish(
      new TaskLabelAppliedEvent(
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
