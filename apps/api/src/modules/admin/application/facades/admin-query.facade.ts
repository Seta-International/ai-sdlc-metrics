import { Inject, Injectable } from '@nestjs/common'
import type { ITenantEmailConfigRepository } from '../../domain/repositories/tenant-email-config.repository.port'
import { TENANT_EMAIL_CONFIG_REPOSITORY } from '../../domain/repositories/tenant-email-config.repository.port'
import type { TenantEmailConfig } from '../../domain/entities/tenant-email-config.entity'

@Injectable()
export class AdminQueryFacade {
  constructor(
    @Inject(TENANT_EMAIL_CONFIG_REPOSITORY)
    private readonly emailConfigRepo: ITenantEmailConfigRepository,
  ) {}

  async getEmailConfig(tenantId: string): Promise<TenantEmailConfig | null> {
    return this.emailConfigRepo.findByTenantId(tenantId)
  }
}
