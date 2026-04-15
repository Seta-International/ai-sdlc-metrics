import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  DIRECTORY_SEARCH_INDEX_REPOSITORY,
  type IDirectorySearchIndexRepository,
} from '../../domain/repositories/directory-search-index.repository'
import type { DirectorySearchIndex } from '../../domain/entities/directory-search-index.entity'
import { computeFullNameUnaccented } from '../../domain/value-objects/name-display-order'
import { SearchDirectoryQuery } from './search-directory.query'

@QueryHandler(SearchDirectoryQuery)
export class SearchDirectoryHandler implements IQueryHandler<
  SearchDirectoryQuery,
  { items: DirectorySearchIndex[]; total: number }
> {
  constructor(
    @Inject(DIRECTORY_SEARCH_INDEX_REPOSITORY)
    private readonly searchRepo: IDirectorySearchIndexRepository,
  ) {}

  async execute(
    query: SearchDirectoryQuery,
  ): Promise<{ items: DirectorySearchIndex[]; total: number }> {
    // Normalize query: strip diacritics for Vietnamese-insensitive search
    const normalizedQuery = query.query ? computeFullNameUnaccented(query.query).toLowerCase() : ''

    return this.searchRepo.search(
      query.tenantId,
      normalizedQuery,
      query.filters,
      query.limit,
      query.offset,
    )
  }
}
