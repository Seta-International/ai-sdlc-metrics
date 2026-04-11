import type { MagicLinkToken } from '../entities/magic-link-token.entity'

export const MAGIC_LINK_TOKEN_REPOSITORY = Symbol('IMagicLinkTokenRepository')

export interface IMagicLinkTokenRepository {
  insert(data: {
    tenantId: string
    email: string
    tokenHash: string
    expiresAt: Date
  }): Promise<MagicLinkToken>
  findByTokenHash(tokenHash: string): Promise<MagicLinkToken | null>
  markUsed(id: string, tenantId: string): Promise<void>
}
