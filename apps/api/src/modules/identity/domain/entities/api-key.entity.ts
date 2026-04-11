export interface ApiKeyEntity {
  id: string
  tenantId: string
  actorId: string
  keyHash: string
  keyLastFour: string
  name: string
  lastUsedAt: Date | null
  expiresAt: Date | null
  revokedAt: Date | null
  createdAt: Date
}

// Canonical alias used by the new port/handler layer
export type ApiKey = ApiKeyEntity
