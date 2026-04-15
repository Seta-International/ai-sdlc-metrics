import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  PROFILE_CHANGE_REQUEST_REPOSITORY,
  type IProfileChangeRequestRepository,
} from '../../domain/repositories/profile-change-request.repository'
import { BatchRejectChangesCommand } from './batch-reject-changes.command'

@CommandHandler(BatchRejectChangesCommand)
export class BatchRejectChangesHandler implements ICommandHandler<BatchRejectChangesCommand> {
  constructor(
    @Inject(PROFILE_CHANGE_REQUEST_REPOSITORY)
    private readonly changeRepo: IProfileChangeRequestRepository,
  ) {}

  async execute(command: BatchRejectChangesCommand): Promise<void> {
    const changes = await this.changeRepo.findByBatchId(command.batchId, command.tenantId)
    const pending = changes.filter((c) => c.status === 'pending')

    if (pending.length === 0) {
      throw new Error(`No pending changes found in batch ${command.batchId}`)
    }

    await this.changeRepo.updateStatusByBatchId(
      command.batchId,
      command.tenantId,
      'rejected',
      command.rejectedBy,
      command.note ?? undefined,
    )
  }
}
