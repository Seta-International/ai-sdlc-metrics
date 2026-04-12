export interface MagicLinkToken {
  id: string
  tenantId: string
  email: string
  tokenHash: string
  expiresAt: Date
  usedAt: Date | null
  createdAt: Date
}
