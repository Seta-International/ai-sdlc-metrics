import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetSyncHistoryQuery } from './get-sync-history.query'
import { GetSyncHistoryHandler } from './get-sync-history.handler'
import type { ISyncHistoryRepository } from '../../domain/repositories/sync-history.repository'
import type { SyncHistory } from '../../domain/entities/sync-history.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

const fakeSyncHistory: SyncHistory[] = [
  {
    id: '01900000-0000-7000-8000-000000000060',
    tenantId: TENANT_ID,
    identityProviderId: '01900000-0000-7000-8000-000000000010',
    status: 'completed',
    usersCreated: 5,
    usersDeactivated: 1,
    rolesChanged: 12,
    errorMessage: null,
    startedAt: new Date('2026-04-11T08:00:00Z'),
    completedAt: new Date('2026-04-11T08:00:45Z'),
  },
]

describe('GetSyncHistoryHandler', () => {
  let handler: GetSyncHistoryHandler
  let syncHistoryRepo: ISyncHistoryRepository

  beforeEach(() => {
    syncHistoryRepo = {
      findLatestByTenantId: vi.fn(),
      insert: vi.fn(),
    }
    handler = new GetSyncHistoryHandler(syncHistoryRepo)
  })

  it('returns paginated sync history', async () => {
    vi.mocked(syncHistoryRepo.findLatestByTenantId).mockResolvedValue(fakeSyncHistory)

    const result = await handler.execute(new GetSyncHistoryQuery(TENANT_ID, 20, 0))

    expect(result).toEqual(fakeSyncHistory)
    expect(syncHistoryRepo.findLatestByTenantId).toHaveBeenCalledWith(TENANT_ID, 20)
  })
})
