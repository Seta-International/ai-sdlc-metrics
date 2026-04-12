import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryBus } from '@nestjs/cqrs'
import { IdentityQueryFacade } from './identity-query.facade'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

describe('IdentityQueryFacade', () => {
  let facade: IdentityQueryFacade
  let queryBus: QueryBus

  beforeEach(() => {
    queryBus = { execute: vi.fn() } as unknown as QueryBus
    facade = new IdentityQueryFacade(queryBus)
  })

  it('getIdentityProvider delegates to query bus', async () => {
    const expected = { id: 'p1', providerType: 'microsoft' }
    vi.mocked(queryBus.execute).mockResolvedValue(expected)
    const result = await facade.getIdentityProvider(TENANT_ID)
    expect(result).toBe(expected)
    expect(queryBus.execute).toHaveBeenCalledTimes(1)
  })

  it('getIdpGroupMappings delegates to query bus', async () => {
    const expected = [{ id: 'm1', roleKey: 'employee' }]
    vi.mocked(queryBus.execute).mockResolvedValue(expected)
    const result = await facade.getIdpGroupMappings(TENANT_ID)
    expect(result).toBe(expected)
  })

  it('getSyncStatus delegates to query bus', async () => {
    const expected = { syncStatus: 'idle', lastSyncAt: null }
    vi.mocked(queryBus.execute).mockResolvedValue(expected)
    const result = await facade.getSyncStatus(TENANT_ID)
    expect(result).toBe(expected)
  })

  it('validateApiKey delegates to query bus', async () => {
    const expected = { actorId: 'a1', tenantId: TENANT_ID, valid: true }
    vi.mocked(queryBus.execute).mockResolvedValue(expected)
    const result = await facade.validateApiKey('hash-123', TENANT_ID)
    expect(result).toBe(expected)
  })
})
