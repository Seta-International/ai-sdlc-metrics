import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { PlanMemberAddedEvent } from '@future/event-contracts'
import { PLAN_REPOSITORY, type IPlanRepository } from '../../../domain/repositories/plan.repository'
import {
  PLAN_MEMBER_REPOSITORY,
  type IPlanMemberRepository,
} from '../../../domain/repositories/plan-member.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { PlanNotFoundException } from '../../../domain/exceptions/plan-not-found.exception'
import { AddPlanMemberCommand } from './add-plan-member.command'

@CommandHandler(AddPlanMemberCommand)
export class AddPlanMemberHandler implements ICommandHandler<AddPlanMemberCommand> {
  constructor(
    @Inject(PLAN_REPOSITORY) private readonly planRepo: IPlanRepository,
    @Inject(PLAN_MEMBER_REPOSITORY) private readonly planMemberRepo: IPlanMemberRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: AddPlanMemberCommand): Promise<void> {
    const plan = await this.planRepo.findById(command.planId, command.tenantId)
    if (!plan) throw new PlanNotFoundException(command.planId)

    await this.authSvc.assertCanManageMembers(command.actorId, command.planId, command.tenantId)

    plan.addMember(command.targetActorId, command.role, command.actorId)
    const member = plan.members.find((m) => m.actorId === command.targetActorId)!
    await this.planRepo.save(plan)
    await this.planMemberRepo.upsert(command.planId, command.tenantId, member)

    await this.eventBus.publish(
      new PlanMemberAddedEvent(
        command.tenantId,
        command.actorId,
        command.planId,
        command.targetActorId,
        command.role,
      ),
    )
  }
}
