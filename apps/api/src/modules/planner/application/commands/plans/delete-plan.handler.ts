import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { PlanDeletedEvent } from '@future/event-contracts'
import { PLAN_REPOSITORY, type IPlanRepository } from '../../../domain/repositories/plan.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { PlanNotFoundException } from '../../../domain/exceptions/plan-not-found.exception'
import { DeletePlanCommand } from './delete-plan.command'

@CommandHandler(DeletePlanCommand)
export class DeletePlanHandler implements ICommandHandler<DeletePlanCommand> {
  constructor(
    @Inject(PLAN_REPOSITORY) private readonly planRepo: IPlanRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: DeletePlanCommand): Promise<void> {
    const plan = await this.planRepo.findById(command.planId, command.tenantId)
    if (!plan) throw new PlanNotFoundException(command.planId)

    plan.assertCanDelete(command.actorId)

    await this.authSvc.assertCanAdminPlan(command.actorId, command.planId, command.tenantId)

    await this.planRepo.softDelete(command.planId, command.tenantId)

    await this.eventBus.publish(
      new PlanDeletedEvent(command.tenantId, command.actorId, command.planId),
    )
  }
}
