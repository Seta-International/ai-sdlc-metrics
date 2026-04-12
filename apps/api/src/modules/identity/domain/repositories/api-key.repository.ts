import type { ApiKeyEntity } from '../entities/api-key.entity'

export const API_KEY_REPOSITORY = Symbol('IApiKeyRepository')

export interface ApiKeyListItem {
  id: string
  actorId: string
  name: string
  keyLastFour: string
  lastUsedAt: Date | null
  expiresAt: Date | null
  revokedAt: Date | null
  createdAt: Date
}

export interface IApiKeyRepository {
  findById(id: string, tenantId: string): Promise<ApiKeyEntity | null>
  findByKeyHash(keyHash: string, tenantId: string): Promise<ApiKeyEntity | null>
  listByTenantId(tenantId: string): Promise<ApiKeyListItem[]>
  insert(data: {
    tenantId: string
    actorId: string
    keyHash: string
    keyLastFour: string
    name: string
    expiresAt: Date | null
  }): Promise<ApiKeyEntity>
  revoke(id: string, tenantId: string): Promise<void>
  updateLastUsed(id: string, tenantId: string): Promise<void>
}
