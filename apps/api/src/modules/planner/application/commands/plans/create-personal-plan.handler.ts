import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { uuidv7 } from 'uuidv7'
import { Plan } from '../../../domain/entities/plan.entity'
import { PLAN_REPOSITORY, type IPlanRepository } from '../../../domain/repositories/plan.repository'
import {
  PLAN_MEMBER_REPOSITORY,
  type IPlanMemberRepository,
} from '../../../domain/repositories/plan-member.repository'
import { CreatePersonalPlanCommand } from './create-personal-plan.command'

export interface CreatePersonalPlanResult {
  planId: string
  created: boolean
}

@CommandHandler(CreatePersonalPlanCommand)
export class CreatePersonalPlanHandler implements ICommandHandler<
  CreatePersonalPlanCommand,
  CreatePersonalPlanResult
> {
  constructor(
    @Inject(PLAN_REPOSITORY) private readonly planRepo: IPlanRepository,
    @Inject(PLAN_MEMBER_REPOSITORY) private readonly planMemberRepo: IPlanMemberRepository,
  ) {}

  async execute(command: CreatePersonalPlanCommand): Promise<CreatePersonalPlanResult> {
    const existing = await this.planRepo.findPersonalByOwner(command.tenantId, command.actorId)
    if (existing) {
      return { planId: existing.id, created: false }
    }

    const plan = Plan.createPersonal({
      id: uuidv7(),
      tenantId: command.tenantId,
      ownerActorId: command.actorId,
      name: 'Personal',
    })

    await this.planRepo.save(plan)
    await this.planMemberRepo.upsert(plan.id, command.tenantId, plan.members[0]!)

    return { planId: plan.id, created: true }
  }
}
