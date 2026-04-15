import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  DIRECTORY_SEARCH_INDEX_REPOSITORY,
  type IDirectorySearchIndexRepository,
} from '../../domain/repositories/directory-search-index.repository'
import { ExportDirectoryQuery } from './export-directory.query'

export interface ExportResult {
  data: Buffer
  filename: string
  mimeType: string
}

@QueryHandler(ExportDirectoryQuery)
export class ExportDirectoryHandler implements IQueryHandler<ExportDirectoryQuery, ExportResult> {
  constructor(
    @Inject(DIRECTORY_SEARCH_INDEX_REPOSITORY)
    private readonly searchRepo: IDirectorySearchIndexRepository,
  ) {}

  async execute(query: ExportDirectoryQuery): Promise<ExportResult> {
    const { items } = await this.searchRepo.list(query.tenantId, query.filters, 10000, 0)

    const columns = query.columns ?? [
      'fullName',
      'companyEmail',
      'jobTitle',
      'departmentName',
      'locationName',
      'workArrangement',
      'employmentStatus',
      'hireDate',
    ]

    if (query.format === 'csv') {
      const header = columns.join(',')
      const rows = items.map((item) =>
        columns
          .map((col) => {
            const value = (item as Record<string, unknown>)[col]
            if (value === null || value === undefined) return ''
            const str = String(value)
            return str.includes(',') ? `"${str}"` : str
          })
          .join(','),
      )
      const csvContent = '\uFEFF' + [header, ...rows].join('\n') // UTF-8 BOM for Excel
      return {
        data: Buffer.from(csvContent, 'utf-8'),
        filename: `directory-export-${new Date().toISOString().slice(0, 10)}.csv`,
        mimeType: 'text/csv; charset=utf-8',
      }
    }

    // XLSX format — not implemented yet
    // TODO: implement XLSX export using a library (e.g. exceljs)
    throw new Error('XLSX export not implemented yet')
  }
}
