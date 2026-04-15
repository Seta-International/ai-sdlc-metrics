import type { EmailGenerationConfig } from '../entities/email-generation-config.entity'

export const EMAIL_GENERATION_CONFIG_REPOSITORY = Symbol('IEmailGenerationConfigRepository')

export interface IEmailGenerationConfigRepository {
  findByTenantId(tenantId: string): Promise<EmailGenerationConfig | null>
  upsert(data: EmailGenerationConfig): Promise<EmailGenerationConfig>
}
