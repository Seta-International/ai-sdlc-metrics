import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { ProfileChangeAppliedEvent } from '@future/event-contracts'
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
    const immediateChanges = pending.filter((c) => !c.effectiveDate || c.effectiveDate <= now)

    if (immediateChanges.length > 0) {
      const byEmployment = new Map<string, typeof immediateChanges>()
      for (const c of immediateChanges) {
        const arr = byEmployment.get(c.employmentId) ?? []
        arr.push(c)
        byEmployment.set(c.employmentId, arr)
      }

      for (const [employmentId, empChanges] of byEmployment) {
        this.eventBus.publish(
          new ProfileChangeAppliedEvent(
            command.tenantId,
            employmentId,
            empChanges.map((c) => ({
              fieldPath: c.fieldPath,
              oldValue: c.oldValue,
              newValue: c.newValue,
            })),
          ),
        )
      }
    }
  }
}
