import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminQueryFacade } from './admin-query.facade'
import type { ITenantEmailConfigRepository } from '../../domain/repositories/tenant-email-config.repository.port'
import type { TenantEmailConfig } from '../../domain/entities/tenant-email-config.entity'

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

  beforeEach(() => {
    emailConfigRepo = {
      findByTenantId: vi.fn(),
      upsert: vi.fn(),
    }
    facade = new AdminQueryFacade(emailConfigRepo)
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
})
