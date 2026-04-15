import { Inject, Injectable } from '@nestjs/common'
import { EventBus } from '@nestjs/cqrs'
import {
  PROFILE_CHANGE_REQUEST_REPOSITORY,
  type IProfileChangeRequestRepository,
} from '../../domain/repositories/profile-change-request.repository'

@Injectable()
export class ApplyScheduledChangesJob {
  constructor(
    @Inject(PROFILE_CHANGE_REQUEST_REPOSITORY)
    private readonly changeRepo: IProfileChangeRequestRepository,
    private readonly eventBus: EventBus,
  ) {}

  /**
   * Runs daily. Finds all scheduled changes with effective_date <= today,
   * applies them, and emits ProfileChangeAppliedEvent.
   */
  async handle(tenantId: string): Promise<void> {
    const today = new Date()
    const scheduled = await this.changeRepo.findScheduledBeforeDate(tenantId, today)

    for (const change of scheduled) {
      await this.changeRepo.updateStatus(
        change.id,
        tenantId,
        'applied',
        undefined,
        'Auto-applied by scheduled job',
      )

      this.eventBus.publish({
        type: 'ProfileChangeAppliedEvent',
        tenantId,
        employmentId: change.employmentId,
        fieldPath: change.fieldPath,
        oldValue: change.oldValue,
        newValue: change.newValue,
        effectiveDate: change.effectiveDate,
      })
    }
  }
}
