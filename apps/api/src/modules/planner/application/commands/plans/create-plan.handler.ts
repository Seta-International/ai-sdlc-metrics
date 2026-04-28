import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { PlanCreatedEvent } from '@future/event-contracts'
import { Plan } from '../../../domain/entities/plan.entity'
import { PLAN_REPOSITORY, type IPlanRepository } from '../../../domain/repositories/plan.repository'
import {
  BUCKET_REPOSITORY,
  type IBucketRepository,
} from '../../../domain/repositories/bucket.repository'
import {
  PLAN_MEMBER_REPOSITORY,
  type IPlanMemberRepository,
} from '../../../domain/repositories/plan-member.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { CreatePlanCommand } from './create-plan.command'

@CommandHandler(CreatePlanCommand)
export class CreatePlanHandler implements ICommandHandler<CreatePlanCommand> {
  constructor(
    @Inject(PLAN_REPOSITORY) private readonly planRepo: IPlanRepository,
    @Inject(BUCKET_REPOSITORY) private readonly bucketRepo: IBucketRepository,
    @Inject(PLAN_MEMBER_REPOSITORY) private readonly planMemberRepo: IPlanMemberRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: CreatePlanCommand): Promise<void> {
    await this.authSvc.assertCanCreatePlan(command.createdBy, command.tenantId)

    const plan = Plan.create({
      id: command.id,
      tenantId: command.tenantId,
      name: command.name,
      description: command.description ?? undefined,
      container: command.container,
      createdBy: command.createdBy,
      ownerActorId: command.createdBy,
    })

    plan.addBucket(command.bucketId, 'To do', '!')
    const bucket = plan.buckets[plan.buckets.length - 1]!
    const creatorMember = plan.members[0]!
    await this.planRepo.save(plan)
    await this.planMemberRepo.upsert(command.id, command.tenantId, creatorMember)
    await this.bucketRepo.save(bucket)

    await this.eventBus.publish(
      new PlanCreatedEvent(
        command.tenantId,
        command.createdBy,
        command.id,
        command.name,
        ['title'],
        'user',
      ),
    )
  }
}
