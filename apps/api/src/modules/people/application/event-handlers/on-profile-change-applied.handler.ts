import { Injectable } from '@nestjs/common'
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs'
import { ProfileChangeAppliedEvent, type AppliedChange } from '@future/event-contracts'
import { PgBossService } from '../../../../common/jobs/pg-boss.service'

export const PEOPLE_SYNC_PROFILE_TO_MS_REVERSAL_JOB = 'people.sync-profile-to-ms-reversal'
const PEOPLE_SYNC_PROFILE_TO_MS_REVERSAL_JOB_OPTIONS = {
  retryLimit: 3,
  retryDelay: 60_000,
} as const

export interface PeopleSyncProfileToMsReversalJobPayload {
  tenantId: string
  employmentId: string
  changes: AppliedChange[]
}

const MS_MAPPABLE_FIELD_PATHS = new Set<string>([
  'person_profile.full_name',
  'person_profile.preferred_name',
  'person_profile.photo_document_id',
  'employment.company_email',
  'employment_detail.office_location',
  'employment_detail.work_phone',
  'employment_detail.personal_phone',
])

@EventsHandler(ProfileChangeAppliedEvent)
@Injectable()
export class OnProfileChangeAppliedHandler implements IEventHandler<ProfileChangeAppliedEvent> {
  constructor(private readonly pgBoss: PgBossService) {}

  async handle(event: ProfileChangeAppliedEvent): Promise<void> {
    const changes = event.appliedChanges.filter((change) =>
      MS_MAPPABLE_FIELD_PATHS.has(change.fieldPath),
    )

    if (changes.length === 0) {
      return
    }

    await this.pgBoss.enqueue<PeopleSyncProfileToMsReversalJobPayload>(
      PEOPLE_SYNC_PROFILE_TO_MS_REVERSAL_JOB,
      {
        tenantId: event.tenantId,
        employmentId: event.employmentId,
        changes,
      },
      PEOPLE_SYNC_PROFILE_TO_MS_REVERSAL_JOB_OPTIONS,
    )
  }
}
