import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { BucketCreatedEvent } from '@future/event-contracts'
import { Bucket } from '../../../domain/entities/bucket.entity'
import { MsOrderHint } from '../../../domain/value-objects/ms-order-hint.vo'
import {
  BUCKET_REPOSITORY,
  type IBucketRepository,
} from '../../../domain/repositories/bucket.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { CreateBucketCommand } from './create-bucket.command'

@CommandHandler(CreateBucketCommand)
export class CreateBucketHandler implements ICommandHandler<CreateBucketCommand> {
  constructor(
    @Inject(BUCKET_REPOSITORY) private readonly bucketRepo: IBucketRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: CreateBucketCommand): Promise<void> {
    await this.authSvc.assertCanEditPlan(command.actorId, command.planId, command.tenantId)

    const existingBuckets = await this.bucketRepo.findByPlanId(command.planId, command.tenantId)

    const lastHint =
      existingBuckets.length > 0
        ? existingBuckets.reduce((prev, cur) => (cur.orderHint > prev.orderHint ? cur : prev))
            .orderHint
        : undefined

    const orderHint = MsOrderHint.between(lastHint, undefined)

    const bucket = Bucket.create({
      id: command.bucketId,
      tenantId: command.tenantId,
      planId: command.planId,
      name: command.name,
      orderHint,
    })

    await this.bucketRepo.save(bucket)

    await this.eventBus.publish(
      new BucketCreatedEvent(
        command.tenantId,
        command.actorId,
        command.planId,
        command.bucketId,
        command.name,
        orderHint,
      ),
    )
  }
}
