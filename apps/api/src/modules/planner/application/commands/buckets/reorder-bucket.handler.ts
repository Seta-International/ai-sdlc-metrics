import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { BucketReorderedEvent } from '@future/event-contracts'
import { MsOrderHint } from '../../../domain/value-objects/ms-order-hint.vo'
import {
  BUCKET_REPOSITORY,
  type IBucketRepository,
} from '../../../domain/repositories/bucket.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { BucketNotFoundException } from '../../../domain/exceptions/bucket-not-found.exception'
import { ReorderBucketCommand } from './reorder-bucket.command'

@CommandHandler(ReorderBucketCommand)
export class ReorderBucketHandler implements ICommandHandler<ReorderBucketCommand> {
  constructor(
    @Inject(BUCKET_REPOSITORY) private readonly bucketRepo: IBucketRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: ReorderBucketCommand): Promise<void> {
    const bucket = await this.bucketRepo.findById(command.bucketId, command.tenantId)
    if (!bucket) throw new BucketNotFoundException(command.bucketId)

    await this.authSvc.assertCanEditPlan(command.actorId, command.planId, command.tenantId)

    const orderHint = MsOrderHint.between(command.orderHintAfter, command.orderHintBefore)

    bucket.reorder(orderHint)
    await this.bucketRepo.save(bucket)

    await this.eventBus.publish(
      new BucketReorderedEvent(
        command.tenantId,
        command.actorId,
        command.planId,
        command.bucketId,
        orderHint,
      ),
    )
  }
}
