import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgBossJobScheduler } from './pg-boss-job-scheduler'
import { PgBossService } from '../../../../common/jobs/pg-boss.service'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROVIDER_ID = '01900000-0000-7000-8000-000000000010'
const JOB_ID = 'pg-boss-job-uuid'

describe('PgBossJobScheduler', () => {
  let scheduler: PgBossJobScheduler
  let pgBoss: PgBossService

  beforeEach(() => {
    pgBoss = { enqueue: vi.fn() } as unknown as PgBossService
    scheduler = new PgBossJobScheduler(pgBoss)
  })

  it('enqueues an identity.directory-sync job with tenantId and identityProviderId', async () => {
    vi.mocked(pgBoss.enqueue).mockResolvedValue(JOB_ID)

    const result = await scheduler.enqueueDirectorySync(TENANT_ID, PROVIDER_ID)

    expect(pgBoss.enqueue).toHaveBeenCalledWith('identity.directory-sync', {
      tenantId: TENANT_ID,
      identityProviderId: PROVIDER_ID,
    })
    expect(result).toBe(JOB_ID)
  })

  it('getNextScheduledSync returns null (scheduled syncs not yet implemented)', async () => {
    const result = await scheduler.getNextScheduledSync(TENANT_ID)
    expect(result).toBeNull()
  })
})
