import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetLoginOptionsQuery } from './get-login-options.query'
import { GetLoginOptionsHandler } from './get-login-options.handler'
import type { IIdentityProviderRepository } from '../../domain/repositories/identity-provider.repository'
import type { ITenantDomainRepository } from '../../domain/repositories/tenant-domain.repository'
import type { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import type { IdentityProviderEntity } from '../../domain/entities/identity-provider.entity'
import { TenantDomainEntity } from '../../domain/entities/tenant-domain.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const TENANT_SLUG = 'seta'
const EMAIL_DOMAIN = 'seta-international.vn'

const activeTenant = {
  id: TENANT_ID,
  name: 'SETA International',
  slug: TENANT_SLUG,
  status: 'active' as const,
  planTier: 'enterprise' as const,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
}

const suspendedTenant = {
  ...activeTenant,
  status: 'suspended' as const,
}

const fakeProvider: IdentityProviderEntity = {
  id: '01900000-0000-7000-8000-000000000010',
  tenantId: TENANT_ID,
  providerType: 'microsoft',
  displayName: 'SETA Entra',
  clientId: 'client-id-123',
  clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123:secret:entra-client-secret',
  directoryId: 'directory-id-456',
  isPrimary: true,
  syncEnabled: true,
  lastSyncAt: new Date('2026-04-10T10:00:00Z'),
  syncStatus: 'idle',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const verifiedDomain = TenantDomainEntity.reconstruct({
  id: '01900000-0000-7000-8000-000000000020',
  tenantId: TENANT_ID,
  domain: EMAIL_DOMAIN,
  status: 'verified',
  verificationTokenHash: 'hash-xyz',
  verifiedAt: new Date('2026-03-01'),
  createdAt: new Date(),
  updatedAt: new Date(),
})

describe('GetLoginOptionsHandler', () => {
  let handler: GetLoginOptionsHandler
  let kernelFacade: Pick<KernelQueryFacade, 'getTenantBySlug' | 'getTenant'>
  let providerRepo: IIdentityProviderRepository
  let domainRepo: ITenantDomainRepository

  beforeEach(() => {
    kernelFacade = {
      getTenantBySlug: vi.fn(),
      getTenant: vi.fn(),
    }
    providerRepo = {
      findById: vi.fn(),
      findByTenantId: vi.fn(),
      findPrimary: vi.fn(),
      findPrimaryByTenantId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    domainRepo = {
      insert: vi.fn(),
      findById: vi.fn(),
      findByTenantId: vi.fn(),
      findVerifiedByDomain: vi.fn(),
      update: vi.fn(),
    }
    handler = new GetLoginOptionsHandler(
      kernelFacade as unknown as KernelQueryFacade,
      providerRepo,
      domainRepo,
    )
  })

  describe('slug-based discovery', () => {
    it('resolves tenant by slug and returns login options', async () => {
      vi.mocked(kernelFacade.getTenantBySlug).mockResolvedValue(activeTenant)
      vi.mocked(providerRepo.findPrimaryByTenantId).mockResolvedValue(fakeProvider)

      const result = await handler.execute(new GetLoginOptionsQuery(TENANT_SLUG, null))

      expect(result).not.toBeNull()
      expect(result!.tenant).toEqual({
        id: TENANT_ID,
        slug: TENANT_SLUG,
        name: 'SETA International',
        status: 'active',
      })
    })

    it('returns null when slug does not match any tenant', async () => {
      vi.mocked(kernelFacade.getTenantBySlug).mockResolvedValue(null)

      const result = await handler.execute(new GetLoginOptionsQuery('unknown-slug', null))

      expect(result).toBeNull()
    })
  })

  describe('email domain-based discovery', () => {
    it('resolves tenant from a verified email domain', async () => {
      vi.mocked(domainRepo.findVerifiedByDomain).mockResolvedValue(verifiedDomain)
      vi.mocked(kernelFacade.getTenant).mockResolvedValue(activeTenant)
      vi.mocked(providerRepo.findPrimaryByTenantId).mockResolvedValue(fakeProvider)

      const result = await handler.execute(new GetLoginOptionsQuery(null, EMAIL_DOMAIN))

      expect(result).not.toBeNull()
      expect(result!.tenant.id).toBe(TENANT_ID)
    })

    it('returns null for a pending (unverified) domain', async () => {
      vi.mocked(domainRepo.findVerifiedByDomain).mockResolvedValue(null)

      const result = await handler.execute(new GetLoginOptionsQuery(null, 'pending.example.com'))

      expect(result).toBeNull()
    })

    it('returns null when domain is not registered at all', async () => {
      vi.mocked(domainRepo.findVerifiedByDomain).mockResolvedValue(null)

      const result = await handler.execute(new GetLoginOptionsQuery(null, 'notexist.example.com'))

      expect(result).toBeNull()
    })
  })

  describe('SSO methods', () => {
    it('returns no startable SSO methods for suspended tenants', async () => {
      vi.mocked(kernelFacade.getTenantBySlug).mockResolvedValue(suspendedTenant)
      vi.mocked(providerRepo.findPrimaryByTenantId).mockResolvedValue(fakeProvider)

      const result = await handler.execute(new GetLoginOptionsQuery(TENANT_SLUG, null))

      expect(result).not.toBeNull()
      expect(result!.tenant.status).toBe('suspended')
      expect(result!.methods).toHaveLength(0)
    })

    it('returns SSO method DTO with public fields only (no clientSecretRef)', async () => {
      vi.mocked(kernelFacade.getTenantBySlug).mockResolvedValue(activeTenant)
      vi.mocked(providerRepo.findPrimaryByTenantId).mockResolvedValue(fakeProvider)

      const result = await handler.execute(new GetLoginOptionsQuery(TENANT_SLUG, null))

      expect(result).not.toBeNull()
      expect(result!.methods).toHaveLength(1)
      const method = result!.methods[0]
      expect(method).toEqual({
        type: 'microsoft',
        displayName: 'SETA Entra',
        clientId: 'client-id-123',
        directoryId: 'directory-id-456',
        status: 'ready',
      })
      expect(method).not.toHaveProperty('clientSecretRef')
    })

    it('maps failed syncStatus to needs_attention', async () => {
      const failedProvider: IdentityProviderEntity = {
        ...fakeProvider,
        syncStatus: 'failed',
      }
      vi.mocked(kernelFacade.getTenantBySlug).mockResolvedValue(activeTenant)
      vi.mocked(providerRepo.findPrimaryByTenantId).mockResolvedValue(failedProvider)

      const result = await handler.execute(new GetLoginOptionsQuery(TENANT_SLUG, null))

      expect(result!.methods[0].status).toBe('needs_attention')
    })

    it('returns empty methods array when no provider is configured', async () => {
      vi.mocked(kernelFacade.getTenantBySlug).mockResolvedValue(activeTenant)
      vi.mocked(providerRepo.findPrimaryByTenantId).mockResolvedValue(null)

      const result = await handler.execute(new GetLoginOptionsQuery(TENANT_SLUG, null))

      expect(result).not.toBeNull()
      expect(result!.methods).toHaveLength(0)
    })
  })

  describe('validation', () => {
    it('returns null when both slug and emailDomain are null', async () => {
      const result = await handler.execute(new GetLoginOptionsQuery(null, null))

      expect(result).toBeNull()
    })
  })
})
