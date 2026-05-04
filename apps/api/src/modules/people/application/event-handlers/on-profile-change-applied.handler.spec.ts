import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProfileChangeAppliedEvent } from '@future/event-contracts'
import {
  OnProfileChangeAppliedHandler,
  PEOPLE_SYNC_PROFILE_TO_MS_REVERSAL_JOB,
} from './on-profile-change-applied.handler'
import type { PgBossService } from '../../../../common/jobs/pg-boss.service'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000002'

describe('OnProfileChangeAppliedHandler', () => {
  let handler: OnProfileChangeAppliedHandler
  let pgBoss: { enqueue: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    pgBoss = { enqueue: vi.fn().mockResolvedValue('job-id') }
    handler = new OnProfileChangeAppliedHandler(pgBoss as unknown as PgBossService)
  })

  it('enqueues one reversal job when a mapped field changes', async () => {
    await handler.handle(
      new ProfileChangeAppliedEvent(TENANT_ID, EMPLOYMENT_ID, [
        { fieldPath: 'person_profile.full_name', oldValue: 'Old', newValue: 'New' },
        { fieldPath: 'person_profile.preferred_name', oldValue: 'Old', newValue: 'New' },
      ]),
    )

    expect(pgBoss.enqueue).toHaveBeenCalledOnce()
    expect(pgBoss.enqueue).toHaveBeenCalledWith(PEOPLE_SYNC_PROFILE_TO_MS_REVERSAL_JOB, {
      tenantId: TENANT_ID,
      employmentId: EMPLOYMENT_ID,
      changes: [{ fieldPath: 'person_profile.full_name', oldValue: 'Old', newValue: 'New' }],
    })
  })

  it('does not enqueue when no mapped fields change', async () => {
    await handler.handle(
      new ProfileChangeAppliedEvent(TENANT_ID, EMPLOYMENT_ID, [
        { fieldPath: 'person_profile.preferred_name', oldValue: 'Old', newValue: 'New' },
        { fieldPath: 'employment_detail.bank_account_number', oldValue: 'Old', newValue: 'New' },
      ]),
    )

    expect(pgBoss.enqueue).not.toHaveBeenCalled()
  })

  it('enqueues all mapped fields together in one payload', async () => {
    await handler.handle(
      new ProfileChangeAppliedEvent(TENANT_ID, EMPLOYMENT_ID, [
        { fieldPath: 'person_profile.full_name', oldValue: 'Old 1', newValue: 'New 1' },
        { fieldPath: 'person_profile.photo_document_id', oldValue: 'Old 2', newValue: 'New 2' },
        { fieldPath: 'employment.company_email', oldValue: 'Old 3', newValue: 'New 3' },
        { fieldPath: 'employment_detail.office_location', oldValue: 'Old 4', newValue: 'New 4' },
        { fieldPath: 'employment_detail.work_phone', oldValue: 'Old 5', newValue: 'New 5' },
        { fieldPath: 'employment_detail.personal_phone', oldValue: 'Old 6', newValue: 'New 6' },
        { fieldPath: 'employment_detail.preferred_language', oldValue: 'Old 7', newValue: 'New 7' },
      ]),
    )

    expect(pgBoss.enqueue).toHaveBeenCalledOnce()
    expect(pgBoss.enqueue).toHaveBeenCalledWith(PEOPLE_SYNC_PROFILE_TO_MS_REVERSAL_JOB, {
      tenantId: TENANT_ID,
      employmentId: EMPLOYMENT_ID,
      changes: [
        { fieldPath: 'person_profile.full_name', oldValue: 'Old 1', newValue: 'New 1' },
        { fieldPath: 'person_profile.photo_document_id', oldValue: 'Old 2', newValue: 'New 2' },
        { fieldPath: 'employment.company_email', oldValue: 'Old 3', newValue: 'New 3' },
        { fieldPath: 'employment_detail.office_location', oldValue: 'Old 4', newValue: 'New 4' },
        { fieldPath: 'employment_detail.work_phone', oldValue: 'Old 5', newValue: 'New 5' },
        { fieldPath: 'employment_detail.personal_phone', oldValue: 'Old 6', newValue: 'New 6' },
      ],
    })
  })
})
