import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { BucketDeletedEvent, TaskDeletedEvent } from '@future/event-contracts'
import {
  BUCKET_REPOSITORY,
  type IBucketRepository,
} from '../../../domain/repositories/bucket.repository'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { BucketNotFoundException } from '../../../domain/exceptions/bucket-not-found.exception'
import { DeleteBucketCommand } from './delete-bucket.command'

@CommandHandler(DeleteBucketCommand)
export class DeleteBucketHandler implements ICommandHandler<DeleteBucketCommand> {
  constructor(
    @Inject(BUCKET_REPOSITORY) private readonly bucketRepo: IBucketRepository,
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: DeleteBucketCommand): Promise<void> {
    const bucket = await this.bucketRepo.findById(command.bucketId, command.tenantId)
    if (!bucket) throw new BucketNotFoundException(command.bucketId)

    await this.authSvc.assertCanEditPlan(command.actorId, command.planId, command.tenantId)

    const deletedTaskIds = await this.taskRepo.softDeleteMany(command.bucketId, command.tenantId)
    await this.bucketRepo.softDelete(command.bucketId, command.tenantId)

    const deletedAt = new Date().toISOString()

    for (const taskId of deletedTaskIds) {
      await this.eventBus.publish(
        new TaskDeletedEvent(command.tenantId, command.actorId, taskId, deletedAt, [], 'user'),
      )
    }

    await this.eventBus.publish(
      new BucketDeletedEvent(
        command.tenantId,
        command.actorId,
        command.planId,
        command.bucketId,
        deletedAt,
        [],
        'user',
      ),
    )
  }
}
