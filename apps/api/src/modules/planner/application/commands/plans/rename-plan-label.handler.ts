import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { PlanLabelUpdatedEvent } from '@future/event-contracts'
import { PLAN_REPOSITORY, type IPlanRepository } from '../../../domain/repositories/plan.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { PlanNotFoundException } from '../../../domain/exceptions/plan-not-found.exception'
import { RenamePlanLabelCommand } from './rename-plan-label.command'

const DEFAULT_LABEL_COLOR = '#6B7280'

@CommandHandler(RenamePlanLabelCommand)
export class RenamePlanLabelHandler implements ICommandHandler<RenamePlanLabelCommand> {
  constructor(
    @Inject(PLAN_REPOSITORY) private readonly planRepo: IPlanRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: RenamePlanLabelCommand): Promise<void> {
    const plan = await this.planRepo.findById(command.planId, command.tenantId)
    if (!plan) throw new PlanNotFoundException(command.planId)

    await this.authSvc.assertCanEditPlan(command.actorId, command.planId, command.tenantId)

    const existing = plan.labels.find((l) => l.slot.value === command.slot.value)
    const color = existing?.color ?? DEFAULT_LABEL_COLOR

    plan.recolorLabel(command.slot, command.name, color)
    await this.planRepo.save(plan)

    await this.eventBus.publish(
      new PlanLabelUpdatedEvent(
        command.tenantId,
        command.actorId,
        command.planId,
        command.slot.value,
      ),
    )
  }
}
