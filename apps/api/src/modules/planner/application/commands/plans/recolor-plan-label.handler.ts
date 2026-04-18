import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { PlanLabelUpdatedEvent } from '@future/event-contracts'
import { PLAN_REPOSITORY, type IPlanRepository } from '../../../domain/repositories/plan.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { PlanNotFoundException } from '../../../domain/exceptions/plan-not-found.exception'
import { RecolorPlanLabelCommand } from './recolor-plan-label.command'

@CommandHandler(RecolorPlanLabelCommand)
export class RecolorPlanLabelHandler implements ICommandHandler<RecolorPlanLabelCommand> {
  constructor(
    @Inject(PLAN_REPOSITORY) private readonly planRepo: IPlanRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: RecolorPlanLabelCommand): Promise<void> {
    const plan = await this.planRepo.findById(command.planId, command.tenantId)
    if (!plan) throw new PlanNotFoundException(command.planId)

    await this.authSvc.assertCanEditPlan(command.actorId, command.planId, command.tenantId)

    plan.recolorLabel(command.slot, command.name, command.color)
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
