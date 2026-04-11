import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  API_KEY_REPOSITORY,
  type IApiKeyRepository,
  type ApiKeyListItem,
} from '../../domain/repositories/api-key.repository.port'
import { ListApiKeysQuery } from './list-api-keys.query'

@QueryHandler(ListApiKeysQuery)
export class ListApiKeysHandler implements IQueryHandler<ListApiKeysQuery, ApiKeyListItem[]> {
  constructor(
    @Inject(API_KEY_REPOSITORY)
    private readonly apiKeyRepo: IApiKeyRepository,
  ) {}

  async execute(query: ListApiKeysQuery): Promise<ApiKeyListItem[]> {
    return this.apiKeyRepo.listByTenantId(query.tenantId)
  }
}
