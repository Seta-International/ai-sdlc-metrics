import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { IMsProfileSyncStateRepository } from '../../domain/repositories/ms-profile-sync-state.repository'
import type { IMsStagedUserRepository } from '../../domain/repositories/ms-staged-user.repository'
import type { IdentityQueryFacade } from '../../../identity/application/facades/identity-query.facade'
import { GetMsSyncStatusHandler } from './get-ms-sync-status.handler'
import { GetMsSyncStatusQuery } from './get-ms-sync-status.query'

const TENANT = 'tenant-1'

describe('GetMsSyncStatusHandler', () => {
  let syncStateRepo: IMsProfileSyncStateRepository
  let stagedUserRepo: IMsStagedUserRepository
  let identityFacade: IdentityQueryFacade
  let handler: GetMsSyncStatusHandler

  beforeEach(() => {
    syncStateRepo = {
      findByTenantId: vi.fn(),
      upsert: vi.fn(),
      clearDeltaToken: vi.fn(),
    } as unknown as IMsProfileSyncStateRepository

    stagedUserRepo = {
      findById: vi.fn(),
      findByMsExternalId: vi.fn(),
      upsertPending: vi.fn(),
      updateStatus: vi.fn(),
      listByStatus: vi.fn(),
      countByStatus: vi.fn(),
    } as unknown as IMsStagedUserRepository

    identityFacade = {
      getGraphCredential: vi.fn(),
    } as unknown as IdentityQueryFacade

    handler = new GetMsSyncStatusHandler(syncStateRepo, stagedUserRepo, identityFacade)
  })

  it('returns connected=true when credential status is active', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(identityFacade.getGraphCredential).mockResolvedValue({ status: 'active' } as any)
    vi.mocked(syncStateRepo.findByTenantId).mockResolvedValue({
      tenantId: TENANT,
      deltaToken: null,
      lastSyncedAt: new Date('2026-01-01T10:00:00Z'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    vi.mocked(stagedUserRepo.countByStatus).mockResolvedValueOnce(3).mockResolvedValueOnce(7)

    const result = await handler.execute(new GetMsSyncStatusQuery(TENANT))

    expect(result.connected).toBe(true)
    expect(result.lastSyncedAt).toBe('2026-01-01T10:00:00.000Z')
    expect(result.pendingCount).toBe(3)
    expect(result.importedCount).toBe(7)
  })

  it('returns connected=false when credential is null', async () => {
    vi.mocked(identityFacade.getGraphCredential).mockResolvedValue(null)
    vi.mocked(syncStateRepo.findByTenantId).mockResolvedValue(null)
    vi.mocked(stagedUserRepo.countByStatus).mockResolvedValue(0)

    const result = await handler.execute(new GetMsSyncStatusQuery(TENANT))

    expect(result.connected).toBe(false)
    expect(result.lastSyncedAt).toBeNull()
  })

  it('returns connected=false when credential status is invalid', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(identityFacade.getGraphCredential).mockResolvedValue({ status: 'invalid' } as any)
    vi.mocked(syncStateRepo.findByTenantId).mockResolvedValue(null)
    vi.mocked(stagedUserRepo.countByStatus).mockResolvedValue(0)

    const result = await handler.execute(new GetMsSyncStatusQuery(TENANT))

    expect(result.connected).toBe(false)
  })
})
