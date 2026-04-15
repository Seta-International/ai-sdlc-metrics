import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import {
  PROFILE_CHANGE_REQUEST_REPOSITORY,
  type IProfileChangeRequestRepository,
} from '../../domain/repositories/profile-change-request.repository'
import { BatchApproveChangesCommand } from './batch-approve-changes.command'

@CommandHandler(BatchApproveChangesCommand)
export class BatchApproveChangesHandler implements ICommandHandler<BatchApproveChangesCommand> {
  constructor(
    @Inject(PROFILE_CHANGE_REQUEST_REPOSITORY)
    private readonly changeRepo: IProfileChangeRequestRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: BatchApproveChangesCommand): Promise<void> {
    const changes = await this.changeRepo.findByBatchId(command.batchId, command.tenantId)
    const pending = changes.filter((c) => c.status === 'pending')

    if (pending.length === 0) {
      throw new Error(`No pending changes found in batch ${command.batchId}`)
    }

    await this.changeRepo.updateStatusByBatchId(
      command.batchId,
      command.tenantId,
      'approved',
      command.approvedBy,
      command.note ?? undefined,
    )

    const now = new Date()
    for (const change of pending) {
      const isImmediate = !change.effectiveDate || change.effectiveDate <= now
      if (isImmediate) {
        this.eventBus.publish({
          type: 'ProfileChangeAppliedEvent',
          tenantId: command.tenantId,
          employmentId: change.employmentId,
          fieldPath: change.fieldPath,
          oldValue: change.oldValue,
          newValue: change.newValue,
          effectiveDate: change.effectiveDate,
        })
      }
    }
  }
}
