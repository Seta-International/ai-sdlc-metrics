import type { DirectorySearchIndexFilters } from '../../domain/repositories/directory-search-index.repository'

export class ListDirectoryQuery {
  constructor(
    readonly tenantId: string,
    readonly filters: DirectorySearchIndexFilters,
    readonly limit: number = 25,
    readonly offset: number = 0,
  ) {}
}
