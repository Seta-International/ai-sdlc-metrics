import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RebuildSearchIndexJob, type RebuildSearchIndexPayload } from './rebuild-search-index.job'
import type { SearchIndexRebuildService } from '../../application/services/search-index-rebuild.service'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000002'

describe('RebuildSearchIndexJob', () => {
  let job: RebuildSearchIndexJob
  let rebuildService: SearchIndexRebuildService

  beforeEach(() => {
    rebuildService = {
      rebuildForEmployment: vi.fn(),
      rebuildAllForTenant: vi.fn(),
    } as never
    job = new RebuildSearchIndexJob(rebuildService)
  })

  it('calls rebuildForEmployment when employmentId is provided', async () => {
    const payload: RebuildSearchIndexPayload = { tenantId: TENANT_ID, employmentId: EMPLOYMENT_ID }

    await job.handle(payload)

    expect(rebuildService.rebuildForEmployment).toHaveBeenCalledWith(EMPLOYMENT_ID, TENANT_ID)
    expect(rebuildService.rebuildAllForTenant).not.toHaveBeenCalled()
  })

  it('calls rebuildAllForTenant when no employmentId is provided', async () => {
    const payload: RebuildSearchIndexPayload = { tenantId: TENANT_ID }

    await job.handle(payload)

    expect(rebuildService.rebuildAllForTenant).toHaveBeenCalledWith(TENANT_ID)
    expect(rebuildService.rebuildForEmployment).not.toHaveBeenCalled()
  })
})
