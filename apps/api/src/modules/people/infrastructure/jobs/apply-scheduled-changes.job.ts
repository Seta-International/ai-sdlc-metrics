import { Inject, Injectable } from '@nestjs/common'
import { EventBus } from '@nestjs/cqrs'
import { ProfileChangeAppliedEvent } from '@future/event-contracts'
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
    }

    const byEmployment = new Map<string, typeof scheduled>()
    for (const c of scheduled) {
      const arr = byEmployment.get(c.employmentId) ?? []
      arr.push(c)
      byEmployment.set(c.employmentId, arr)
    }

    for (const [employmentId, changes] of byEmployment) {
      this.eventBus.publish(
        new ProfileChangeAppliedEvent(
          tenantId,
          employmentId,
          changes.map((c) => ({
            fieldPath: c.fieldPath,
            oldValue: c.oldValue,
            newValue: c.newValue,
          })),
        ),
      )
    }
  }
}
