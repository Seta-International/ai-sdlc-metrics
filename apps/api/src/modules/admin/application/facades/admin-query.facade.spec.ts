import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueryBus } from '@nestjs/cqrs'
import { AdminQueryFacade } from './admin-query.facade'
import type { ITenantEmailConfigRepository } from '../../domain/repositories/tenant-email-config.repository.port'
import type { TenantEmailConfig } from '../../domain/entities/tenant-email-config.entity'
import { GetTenantTimezoneQuery } from '../queries/get-tenant-timezone.query'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

const tenantConfig: TenantEmailConfig = {
  id: '01900000-0000-7000-8000-000000000010',
  tenantId: TENANT_ID,
  provider: 'smtp',
  fromAddress: 'hr@acme.com',
  smtpHost: 'smtp.acme.com',
  smtpPort: 587,
  credentialRef: 'arn:aws:secretsmanager:ap-southeast-1:123:secret:acme-smtp',
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('AdminQueryFacade', () => {
  let facade: AdminQueryFacade
  let emailConfigRepo: ITenantEmailConfigRepository
  let queryBus: { execute: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    emailConfigRepo = {
      findByTenantId: vi.fn(),
      upsert: vi.fn(),
    }
    queryBus = { execute: vi.fn() }
    facade = new AdminQueryFacade(emailConfigRepo, queryBus as unknown as QueryBus)
  })

  describe('getEmailConfig', () => {
    it('returns tenant config when it exists', async () => {
      vi.mocked(emailConfigRepo.findByTenantId).mockResolvedValue(tenantConfig)

      const result = await facade.getEmailConfig(TENANT_ID)

      expect(result).toEqual(tenantConfig)
    })

    it('returns null when tenant has no email config (platform default applies)', async () => {
      vi.mocked(emailConfigRepo.findByTenantId).mockResolvedValue(null)

      const result = await facade.getEmailConfig(TENANT_ID)

      expect(result).toBeNull()
    })
  })

  describe('getTenantTimezone', () => {
    it('delegates to queryBus with a GetTenantTimezoneQuery and returns the timezone', async () => {
      queryBus.execute.mockResolvedValue('America/New_York')

      const result = await facade.getTenantTimezone(TENANT_ID)

      expect(queryBus.execute).toHaveBeenCalledTimes(1)
      const arg = queryBus.execute.mock.calls[0][0]
      expect(arg).toBeInstanceOf(GetTenantTimezoneQuery)
      expect(arg.tenantId).toBe(TENANT_ID)
      expect(result).toBe('America/New_York')
    })
  })
})
