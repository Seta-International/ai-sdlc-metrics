import { TRPCError } from '@trpc/server'
import type { FutureExportQuery } from '../../../../common/list/future-list.contract'
import { PEOPLE_DIRECTORY_FIXTURE } from './people-directory.fixture'
import {
  PEOPLE_DIRECTORY_SORT_FIELDS,
  PEOPLE_DIRECTORY_FILTER_FIELDS,
  type PeopleDirectoryRow,
} from './list-people-directory.query'

export const EXPORT_ROW_LIMIT = 1000

type ExportSuccess = { filename: string; csv: string }
type ExportLimitExceeded = { code: 'EXPORT_LIMIT_EXCEEDED'; limit: 1000; message: string }

export function exportPeopleDirectory(
  input: FutureExportQuery,
  _rows: PeopleDirectoryRow[] = PEOPLE_DIRECTORY_FIXTURE,
): ExportSuccess | ExportLimitExceeded {
  // Validate sort fields
  for (const sort of input.sorting) {
    if (!(PEOPLE_DIRECTORY_SORT_FIELDS as readonly string[]).includes(sort.field)) {
      throw new TRPCError({
        code: 'UNPROCESSABLE_CONTENT',
        message: `Invalid sort field "${sort.field}". Allowed fields: ${PEOPLE_DIRECTORY_SORT_FIELDS.join(', ')}`,
      })
    }
  }

  // Validate filter fields
  for (const filter of input.filters) {
    if (!(PEOPLE_DIRECTORY_FILTER_FIELDS as readonly string[]).includes(filter.field)) {
      throw new TRPCError({
        code: 'UNPROCESSABLE_CONTENT',
        message: `Invalid filter field "${filter.field}". Allowed fields: ${PEOPLE_DIRECTORY_FILTER_FIELDS.join(', ')}`,
      })
    }
  }

  // 1. Apply same search + filter + sort as list (no pagination)
  let rows: PeopleDirectoryRow[] = [..._rows]

  // Apply search
  if (input.search.trim()) {
    const searchLower = input.search.toLowerCase()
    rows = rows.filter((row) => row.fullName.toLowerCase().includes(searchLower))
  }

  // Apply filters
  for (const filter of input.filters) {
    const field = filter.field as keyof PeopleDirectoryRow
    if (filter.operator === 'eq') {
      rows = rows.filter((row) => String(row[field]) === String(filter.value))
    } else if (filter.operator === 'neq') {
      rows = rows.filter((row) => String(row[field]) !== String(filter.value))
    } else if (filter.operator === 'in') {
      const values = (filter.value as Array<string | number | boolean>).map(String)
      rows = rows.filter((row) => values.includes(String(row[field])))
    } else if (filter.operator === 'not_in') {
      const values = (filter.value as Array<string | number | boolean>).map(String)
      rows = rows.filter((row) => !values.includes(String(row[field])))
    } else if (filter.operator === 'contains') {
      rows = rows.filter((row) =>
        String(row[field]).toLowerCase().includes(String(filter.value).toLowerCase()),
      )
    }
  }

  // Apply sorting
  if (input.sorting.length > 0) {
    rows = [...rows].sort((a, b) => {
      for (const sort of input.sorting) {
        const field = sort.field as keyof PeopleDirectoryRow
        const aVal = String(a[field] ?? '')
        const bVal = String(b[field] ?? '')
        const cmp = aVal.localeCompare(bVal)
        if (cmp !== 0) {
          return sort.direction === 'asc' ? cmp : -cmp
        }
      }
      return 0
    })
  }

  // 2. If filtered rows > 1000, return typed error
  if (rows.length > EXPORT_ROW_LIMIT) {
    return {
      code: 'EXPORT_LIMIT_EXCEEDED',
      limit: 1000,
      message: `Export limit of ${EXPORT_ROW_LIMIT} rows exceeded. Please refine your filters.`,
    }
  }

  // 3. Build CSV string from filtered rows
  const exportColumns = input.columns ?? [
    'id',
    'fullName',
    'department',
    'jobTitle',
    'status',
    'employmentType',
  ]

  const header = exportColumns.map((col) => csvEscape(col)).join(',')
  const dataRows = rows.map((row) => {
    return exportColumns
      .map((col) => {
        const val = (row as Record<string, unknown>)[col]
        return csvEscape(val === undefined || val === null ? '' : String(val))
      })
      .join(',')
  })

  const csv = [header, ...dataRows].join('\n')

  // 4. Return filename and CSV
  return { filename: 'people-directory.csv', csv }
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
