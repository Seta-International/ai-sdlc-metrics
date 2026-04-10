import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClsService } from 'nestjs-cls'
import { TenantContextService } from './tenant-context.service'

const TENANT_ID = '01900000-0000-7fff-8000-000000000001'

describe('TenantContextService', () => {
  let cls: Pick<ClsService, 'get' | 'set'>
  let service: TenantContextService

  beforeEach(() => {
    cls = { get: vi.fn(), set: vi.fn() }
    service = new TenantContextService(cls as ClsService)
  })

  describe('getTenantId', () => {
    it('returns the tenant id when set', () => {
      vi.mocked(cls.get).mockReturnValue(TENANT_ID)
      expect(service.getTenantId()).toBe(TENANT_ID)
    })

    it('throws when tenant id is not set', () => {
      vi.mocked(cls.get).mockReturnValue(undefined)
      expect(() => service.getTenantId()).toThrow('TenantContextService: tenantId not set')
    })
  })

  describe('setTenantId', () => {
    it('stores the tenant id in CLS', () => {
      service.setTenantId(TENANT_ID)
      expect(cls.set).toHaveBeenCalledWith('tenantId', TENANT_ID)
    })
  })
})
