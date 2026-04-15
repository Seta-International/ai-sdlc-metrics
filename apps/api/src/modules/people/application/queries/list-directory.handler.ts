import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  DIRECTORY_SEARCH_INDEX_REPOSITORY,
  type IDirectorySearchIndexRepository,
} from '../../domain/repositories/directory-search-index.repository'
import type { DirectorySearchIndex } from '../../domain/entities/directory-search-index.entity'
import { ListDirectoryQuery } from './list-directory.query'

@QueryHandler(ListDirectoryQuery)
export class ListDirectoryHandler implements IQueryHandler<
  ListDirectoryQuery,
  { items: DirectorySearchIndex[]; total: number }
> {
  constructor(
    @Inject(DIRECTORY_SEARCH_INDEX_REPOSITORY)
    private readonly searchRepo: IDirectorySearchIndexRepository,
  ) {}

  async execute(
    query: ListDirectoryQuery,
  ): Promise<{ items: DirectorySearchIndex[]; total: number }> {
    return this.searchRepo.list(query.tenantId, query.filters, query.limit, query.offset)
  }
}
