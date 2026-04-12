export interface ApiKeyEntity {
  id: string
  tenantId: string
  actorId: string
  keyHash: string
  name: string
  lastUsedAt: Date | null
  expiresAt: Date | null
  revokedAt: Date | null
  createdAt: Date
}
