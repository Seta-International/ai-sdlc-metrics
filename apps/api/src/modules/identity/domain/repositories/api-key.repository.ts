import type { ApiKeyEntity } from '../entities/api-key.entity'

export const API_KEY_REPOSITORY = Symbol('IApiKeyRepository')

export interface IApiKeyRepository {
  findByKeyHash(keyHash: string, tenantId: string): Promise<ApiKeyEntity | null>
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
