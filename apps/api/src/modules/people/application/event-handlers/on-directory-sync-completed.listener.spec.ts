import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DirectorySyncCompletedEvent } from '@future/event-contracts'
import {
  OnDirectorySyncCompletedListener,
  PEOPLE_MS_PROFILE_SYNC_JOB,
} from './on-directory-sync-completed.listener'
import type { PgBossService } from '../../../../common/jobs/pg-boss.service'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROVIDER_ID = '01900000-0000-7000-8000-000000000002'

describe('OnDirectorySyncCompletedListener', () => {
  let listener: OnDirectorySyncCompletedListener
  let pgBoss: { enqueue: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    pgBoss = { enqueue: vi.fn().mockResolvedValue('job-id') }
    listener = new OnDirectorySyncCompletedListener(pgBoss as unknown as PgBossService)
  })

  it('enqueues people.ms-profile-sync job with tenantId when directory sync completes', async () => {
    const event = new DirectorySyncCompletedEvent(
      TENANT_ID,
      PROVIDER_ID,
      5,
      2,
      new Date().toISOString(),
    )

    await listener.handle(event)

    expect(pgBoss.enqueue).toHaveBeenCalledWith(PEOPLE_MS_PROFILE_SYNC_JOB, { tenantId: TENANT_ID })
  })
})
