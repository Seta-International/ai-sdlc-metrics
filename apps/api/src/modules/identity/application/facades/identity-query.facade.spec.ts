import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryBus } from '@nestjs/cqrs'
import type { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import { IdentityQueryFacade } from './identity-query.facade'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const AAD_OID = 'aad-oid-abc123'

describe('IdentityQueryFacade', () => {
  let facade: IdentityQueryFacade
  let queryBus: QueryBus
  let kernelQueryFacade: KernelQueryFacade

  beforeEach(() => {
    queryBus = { execute: vi.fn() } as unknown as QueryBus
    kernelQueryFacade = {
      getExternalUserId: vi.fn(),
      getUserIdentityBySsoSubject: vi.fn(),
    } as unknown as KernelQueryFacade
    facade = new IdentityQueryFacade(queryBus, kernelQueryFacade)
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

  it('listGroupMembers delegates to query bus', async () => {
    const expected = [{ actorId: ACTOR_ID, ssoSubject: AAD_OID }]
    vi.mocked(queryBus.execute).mockResolvedValue(expected)

    const result = await facade.listGroupMembers('group-1', TENANT_ID)

    expect(result).toBe(expected)
    expect(queryBus.execute).toHaveBeenCalledTimes(1)
  })

  it('getGraphCredential delegates to query bus', async () => {
    const expected = { tenantId: TENANT_ID, clientId: 'c' }
    vi.mocked(queryBus.execute).mockResolvedValue(expected)

    const result = await facade.getGraphCredential(TENANT_ID)

    expect(result).toBe(expected)
    expect(queryBus.execute).toHaveBeenCalledTimes(1)
  })

  describe('getExternalUserId', () => {
    it('returns ssoSubject when user identity exists', async () => {
      vi.mocked(kernelQueryFacade.getExternalUserId).mockResolvedValue(AAD_OID)
      const result = await facade.getExternalUserId(ACTOR_ID, TENANT_ID)
      expect(result).toBe(AAD_OID)
      expect(kernelQueryFacade.getExternalUserId).toHaveBeenCalledWith(ACTOR_ID, TENANT_ID)
    })

    it('returns null when no user identity exists', async () => {
      vi.mocked(kernelQueryFacade.getExternalUserId).mockResolvedValue(null)
      const result = await facade.getExternalUserId(ACTOR_ID, TENANT_ID)
      expect(result).toBeNull()
    })
  })

  describe('getActorIdByExternalUserId', () => {
    it('returns actorId when user identity is found by sso subject', async () => {
      vi.mocked(kernelQueryFacade.getUserIdentityBySsoSubject).mockResolvedValue({
        id: 'identity-1',
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        email: 'user@example.com',
        ssoSubject: AAD_OID,
        provider: 'microsoft',
        status: 'active',
        lastLoginAt: null,
        createdAt: new Date(),
      })
      const result = await facade.getActorIdByExternalUserId(AAD_OID, TENANT_ID)
      expect(result).toBe(ACTOR_ID)
      expect(kernelQueryFacade.getUserIdentityBySsoSubject).toHaveBeenCalledWith(AAD_OID, TENANT_ID)
    })

    it('returns null when no user identity is found', async () => {
      vi.mocked(kernelQueryFacade.getUserIdentityBySsoSubject).mockResolvedValue(null)
      const result = await facade.getActorIdByExternalUserId('unknown-oid', TENANT_ID)
      expect(result).toBeNull()
    })
  })
})
