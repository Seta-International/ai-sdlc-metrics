import type { DirectorySearchIndex } from '../entities/directory-search-index.entity'

export const DIRECTORY_SEARCH_INDEX_REPOSITORY = Symbol('IDirectorySearchIndexRepository')

export interface DirectorySearchIndexFilters {
  departmentId?: string
  jobProfileId?: string
  jobFamilyId?: string
  jobLevel?: string
  managerId?: string
  employmentStatus?: string
  employmentType?: string
  workerType?: string
  workArrangement?: string
  locationId?: string
  countryCode?: string
  hiredAfter?: Date
  hiredBefore?: Date
}

export interface IDirectorySearchIndexRepository {
  upsert(data: Omit<DirectorySearchIndex, 'id'>): Promise<DirectorySearchIndex>
  deleteByEmploymentId(employmentId: string, tenantId: string): Promise<void>
  search(
    tenantId: string,
    query: string,
    filters: DirectorySearchIndexFilters,
    limit: number,
    offset: number,
  ): Promise<{ items: DirectorySearchIndex[]; total: number }>
  list(
    tenantId: string,
    filters: DirectorySearchIndexFilters,
    limit: number,
    offset: number,
  ): Promise<{ items: DirectorySearchIndex[]; total: number }>
  rebuildAll(tenantId: string): Promise<void>
  countByTenant(tenantId: string): Promise<number>
}
