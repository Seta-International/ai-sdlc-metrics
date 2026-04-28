import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { PlanRenamedEvent } from '@future/event-contracts'
import { PLAN_REPOSITORY, type IPlanRepository } from '../../../domain/repositories/plan.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { PlanNotFoundException } from '../../../domain/exceptions/plan-not-found.exception'
import { PlanConflictException } from '../../../domain/exceptions/plan-conflict.exception'
import { RenamePlanCommand } from './rename-plan.command'

@CommandHandler(RenamePlanCommand)
export class RenamePlanHandler implements ICommandHandler<RenamePlanCommand> {
  constructor(
    @Inject(PLAN_REPOSITORY) private readonly planRepo: IPlanRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: RenamePlanCommand): Promise<void> {
    const plan = await this.planRepo.findById(command.planId, command.tenantId)
    if (!plan) throw new PlanNotFoundException(command.planId)

    if (
      command.expectedVersion !== undefined &&
      plan.updatedAt.getTime() !== command.expectedVersion.getTime()
    ) {
      throw new PlanConflictException(command.planId)
    }

    await this.authSvc.assertCanEditPlan(command.actorId, command.planId, command.tenantId)

    plan.renameTo(command.name)
    await this.planRepo.save(plan)

    await this.eventBus.publish(
      new PlanRenamedEvent(
        command.tenantId,
        command.actorId,
        command.planId,
        command.name,
        ['title'],
        'user',
      ),
    )
  }
}
