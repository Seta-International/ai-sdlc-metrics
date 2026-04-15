import type { DirectorySearchIndexFilters } from '../../domain/repositories/directory-search-index.repository'

export class SearchDirectoryQuery {
  constructor(
    readonly tenantId: string,
    readonly query: string,
    readonly filters: DirectorySearchIndexFilters,
    readonly limit: number = 25,
    readonly offset: number = 0,
  ) {}
}
