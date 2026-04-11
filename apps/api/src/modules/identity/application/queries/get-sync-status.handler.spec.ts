import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetSyncStatusQuery } from './get-sync-status.query'
import { GetSyncStatusHandler } from './get-sync-status.handler'
import type { IIdentityProviderRepository } from '../../domain/repositories/identity-provider.repository'
import type { ISyncHistoryRepository } from '../../domain/repositories/sync-history.repository.port'
import type { IJobScheduler } from '../../domain/ports/job-scheduler.port'
import type { IdentityProviderEntity } from '../../domain/entities/identity-provider.entity'
import type { SyncHistory } from '../../domain/entities/sync-history.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROVIDER_ID = '01900000-0000-7000-8000-000000000010'

const fakeProvider: IdentityProviderEntity = {
  id: PROVIDER_ID,
  tenantId: TENANT_ID,
  providerType: 'microsoft',
  displayName: 'SETA Entra',
  clientId: 'client-id-123',
  clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123:secret:entra-client-secret',
  directoryId: 'directory-id-456',
  isPrimary: true,
  syncEnabled: true,
  lastSyncAt: new Date('2026-04-11T08:00:00Z'),
  syncStatus: 'idle',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const fakeLastSync: SyncHistory = {
  id: '01900000-0000-7000-8000-000000000060',
  tenantId: TENANT_ID,
  identityProviderId: PROVIDER_ID,
  status: 'completed',
  usersCreated: 5,
  usersDeactivated: 1,
  rolesChanged: 12,
  errorMessage: null,
  startedAt: new Date('2026-04-11T08:00:00Z'),
  completedAt: new Date('2026-04-11T08:00:45Z'),
}

describe('GetSyncStatusHandler', () => {
  let handler: GetSyncStatusHandler
  let providerRepo: IIdentityProviderRepository
  let syncHistoryRepo: ISyncHistoryRepository
  let jobScheduler: IJobScheduler

  beforeEach(() => {
    providerRepo = {
      findById: vi.fn(),
      findByTenantId: vi.fn(),
      findPrimary: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    syncHistoryRepo = {
      findLatestByTenantId: vi.fn(),
      insert: vi.fn(),
    }
    jobScheduler = {
      enqueueDirectorySync: vi.fn(),
      getNextScheduledSync: vi.fn(),
    }
    handler = new GetSyncStatusHandler(providerRepo, syncHistoryRepo, jobScheduler)
  })

  it('returns sync status with last sync and next scheduled', async () => {
    vi.mocked(providerRepo.findPrimary).mockResolvedValue(fakeProvider)
    vi.mocked(syncHistoryRepo.findLatestByTenantId).mockResolvedValue([fakeLastSync])
    vi.mocked(jobScheduler.getNextScheduledSync).mockResolvedValue(new Date('2026-04-11T09:00:00Z'))

    const result = await handler.execute(new GetSyncStatusQuery(TENANT_ID))

    expect(result).toEqual({
      syncEnabled: true,
      syncStatus: 'idle',
      lastSyncAt: '2026-04-11T08:00:00.000Z',
      nextScheduledAt: '2026-04-11T09:00:00.000Z',
      lastSyncStats: {
        usersCreated: 5,
        usersDeactivated: 1,
        rolesChanged: 12,
        status: 'completed',
        errorMessage: null,
      },
    })
  })

  it('returns null fields when no provider configured', async () => {
    vi.mocked(providerRepo.findPrimary).mockResolvedValue(null)

    const result = await handler.execute(new GetSyncStatusQuery(TENANT_ID))

    expect(result).toEqual({
      syncEnabled: false,
      syncStatus: null,
      lastSyncAt: null,
      nextScheduledAt: null,
      lastSyncStats: null,
    })
  })

  it('returns null lastSyncStats when provider has no sync history', async () => {
    vi.mocked(providerRepo.findPrimary).mockResolvedValue(fakeProvider)
    vi.mocked(syncHistoryRepo.findLatestByTenantId).mockResolvedValue([])
    vi.mocked(jobScheduler.getNextScheduledSync).mockResolvedValue(null)

    const result = await handler.execute(new GetSyncStatusQuery(TENANT_ID))

    expect(result).toEqual({
      syncEnabled: true,
      syncStatus: 'idle',
      lastSyncAt: '2026-04-11T08:00:00.000Z',
      nextScheduledAt: null,
      lastSyncStats: null,
    })
  })
})
