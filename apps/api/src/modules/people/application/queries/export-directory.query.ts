import type { DirectorySearchIndexFilters } from '../../domain/repositories/directory-search-index.repository'

export type ExportFormat = 'csv' | 'xlsx'

export class ExportDirectoryQuery {
  constructor(
    readonly tenantId: string,
    readonly viewerActorId: string,
    readonly filters: DirectorySearchIndexFilters,
    readonly format: ExportFormat = 'csv',
    readonly columns?: string[],
  ) {}
}
