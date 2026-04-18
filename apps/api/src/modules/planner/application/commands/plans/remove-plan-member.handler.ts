import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { PlanMemberRemovedEvent } from '@future/event-contracts'
import { PLAN_REPOSITORY, type IPlanRepository } from '../../../domain/repositories/plan.repository'
import {
  PLAN_MEMBER_REPOSITORY,
  type IPlanMemberRepository,
} from '../../../domain/repositories/plan-member.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { PlanNotFoundException } from '../../../domain/exceptions/plan-not-found.exception'
import { RemovePlanMemberCommand } from './remove-plan-member.command'

@CommandHandler(RemovePlanMemberCommand)
export class RemovePlanMemberHandler implements ICommandHandler<RemovePlanMemberCommand> {
  constructor(
    @Inject(PLAN_REPOSITORY) private readonly planRepo: IPlanRepository,
    @Inject(PLAN_MEMBER_REPOSITORY) private readonly planMemberRepo: IPlanMemberRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: RemovePlanMemberCommand): Promise<void> {
    const plan = await this.planRepo.findById(command.planId, command.tenantId)
    if (!plan) throw new PlanNotFoundException(command.planId)

    await this.authSvc.assertCanManageMembers(command.actorId, command.planId, command.tenantId)

    plan.removeMember(command.targetActorId)
    await this.planRepo.save(plan)
    await this.planMemberRepo.delete(command.planId, command.targetActorId, command.tenantId)

    await this.eventBus.publish(
      new PlanMemberRemovedEvent(
        command.tenantId,
        command.actorId,
        command.planId,
        command.targetActorId,
      ),
    )
  }
}
