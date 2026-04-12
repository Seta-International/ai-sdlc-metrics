/** Legacy entity name used by Plan 01-04 infrastructure layer */
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

/** Plan 05 interface (cleaner, no keyLastFour on root) */
export interface ApiKey {
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
