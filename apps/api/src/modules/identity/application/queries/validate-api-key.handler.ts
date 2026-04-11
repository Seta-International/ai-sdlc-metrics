import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  API_KEY_REPOSITORY,
  type IApiKeyRepository,
} from '../../domain/repositories/api-key.repository.port'
import { ValidateApiKeyQuery } from './validate-api-key.query'

export interface ValidateApiKeyResult {
  valid: boolean
  actorId: string | null
  tenantId: string | null
}

@QueryHandler(ValidateApiKeyQuery)
export class ValidateApiKeyHandler implements IQueryHandler<
  ValidateApiKeyQuery,
  ValidateApiKeyResult
> {
  constructor(
    @Inject(API_KEY_REPOSITORY)
    private readonly apiKeyRepo: IApiKeyRepository,
  ) {}

  async execute(query: ValidateApiKeyQuery): Promise<ValidateApiKeyResult> {
    const key = await this.apiKeyRepo.findByKeyHash(query.keyHash, query.tenantId)

    if (!key) {
      return { valid: false, actorId: null, tenantId: null }
    }

    if (key.revokedAt) {
      return { valid: false, actorId: null, tenantId: null }
    }

    if (key.expiresAt && key.expiresAt < new Date()) {
      return { valid: false, actorId: null, tenantId: null }
    }

    void this.apiKeyRepo.updateLastUsedAt(key.id, key.tenantId, new Date())

    return { valid: true, actorId: key.actorId, tenantId: key.tenantId }
  }
}
