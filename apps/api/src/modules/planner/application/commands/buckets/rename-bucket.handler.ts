import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { BucketRenamedEvent } from '@future/event-contracts'
import {
  BUCKET_REPOSITORY,
  type IBucketRepository,
} from '../../../domain/repositories/bucket.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { BucketNotFoundException } from '../../../domain/exceptions/bucket-not-found.exception'
import { ConcurrentModificationException } from '../../../domain/exceptions/concurrent-modification.exception'
import { RenameBucketCommand } from './rename-bucket.command'

@CommandHandler(RenameBucketCommand)
export class RenameBucketHandler implements ICommandHandler<RenameBucketCommand> {
  constructor(
    @Inject(BUCKET_REPOSITORY) private readonly bucketRepo: IBucketRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: RenameBucketCommand): Promise<void> {
    const bucket = await this.bucketRepo.findById(command.bucketId, command.tenantId)
    if (!bucket) throw new BucketNotFoundException(command.bucketId)

    if (
      command.expectedVersion !== undefined &&
      bucket.updatedAt.getTime() !== command.expectedVersion.getTime()
    ) {
      throw new ConcurrentModificationException()
    }

    await this.authSvc.assertCanEditPlan(command.actorId, command.planId, command.tenantId)

    bucket.rename(command.name)
    await this.bucketRepo.save(bucket)

    await this.eventBus.publish(
      new BucketRenamedEvent(
        command.tenantId,
        command.actorId,
        command.planId,
        command.bucketId,
        command.name,
      ),
    )
  }
}
