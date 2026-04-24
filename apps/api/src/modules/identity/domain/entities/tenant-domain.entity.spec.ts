import { describe, expect, it } from 'vitest'
import { TenantDomainEntity } from './tenant-domain.entity'

describe('TenantDomainEntity', () => {
  const baseProps = {
    id: 'domain-id-1',
    tenantId: 'tenant-id',
    domain: 'example.com',
    status: 'pending' as const,
    verificationTokenHash: 'hash',
    verifiedAt: null,
    createdAt: new Date('2026-04-24T09:00:00Z'),
    updatedAt: new Date('2026-04-24T09:00:00Z'),
  }

  describe('isUsableForLogin', () => {
    it('rejects unverified domain for login discovery', () => {
      const domain = TenantDomainEntity.create({
        tenantId: 'tenant-id',
        domain: 'example.com',
        status: 'pending',
        verificationTokenHash: 'hash',
      })
      expect(domain.isUsableForLogin()).toBe(false)
    })

    it('accepts verified domain for login discovery', () => {
      const domain = TenantDomainEntity.create({
        tenantId: 'tenant-id',
        domain: 'example.com',
        status: 'verified',
        verificationTokenHash: 'hash',
        verifiedAt: new Date('2026-04-24T09:00:00Z'),
      })
      expect(domain.isUsableForLogin()).toBe(true)
    })

    it('rejects disabled domain for login discovery', () => {
      const domain = TenantDomainEntity.create({
        tenantId: 'tenant-id',
        domain: 'example.com',
        status: 'disabled',
        verificationTokenHash: 'hash',
        verifiedAt: new Date('2026-04-24T09:00:00Z'),
      })
      expect(domain.isUsableForLogin()).toBe(false)
    })
  })

  describe('reconstruct', () => {
    it('reconstructs from persistence row', () => {
      const domain = TenantDomainEntity.reconstruct(baseProps)
      expect(domain.id).toBe('domain-id-1')
      expect(domain.tenantId).toBe('tenant-id')
      expect(domain.domain).toBe('example.com')
      expect(domain.status).toBe('pending')
      expect(domain.verificationTokenHash).toBe('hash')
    })
  })
})
