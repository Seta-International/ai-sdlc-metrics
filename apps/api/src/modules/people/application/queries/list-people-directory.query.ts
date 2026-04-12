import { TRPCError } from '@trpc/server'
import type {
  FutureListQuery,
  FutureListResult,
} from '../../../../common/list/future-list.contract'
import { PEOPLE_DIRECTORY_FIXTURE } from './people-directory.fixture'

export const PEOPLE_DIRECTORY_SORT_FIELDS = [
  'fullName',
  'department',
  'jobTitle',
  'status',
] as const
export const PEOPLE_DIRECTORY_FILTER_FIELDS = ['department', 'status', 'employmentType'] as const

export type PeopleDirectoryRow = {
  id: string
  fullName: string
  department: string
  jobTitle: string
  status: 'active' | 'inactive' | 'on_leave'
  employmentType: 'permanent' | 'fixed_term' | 'contractor' | 'intern'
  detailPanel?: Record<string, unknown>
}

type SortField = (typeof PEOPLE_DIRECTORY_SORT_FIELDS)[number]
type FilterField = (typeof PEOPLE_DIRECTORY_FILTER_FIELDS)[number]

export function listPeopleDirectory(input: FutureListQuery): FutureListResult {
  // Validate sort fields before processing
  for (const sort of input.sorting) {
    if (!(PEOPLE_DIRECTORY_SORT_FIELDS as readonly string[]).includes(sort.field)) {
      throw new TRPCError({
        code: 'UNPROCESSABLE_CONTENT',
        message: `Invalid sort field "${sort.field}". Allowed fields: ${PEOPLE_DIRECTORY_SORT_FIELDS.join(', ')}`,
      })
    }
  }

  // Validate filter fields before processing
  for (const filter of input.filters) {
    if (!(PEOPLE_DIRECTORY_FILTER_FIELDS as readonly string[]).includes(filter.field)) {
      throw new TRPCError({
        code: 'UNPROCESSABLE_CONTENT',
        message: `Invalid filter field "${filter.field}". Allowed fields: ${PEOPLE_DIRECTORY_FILTER_FIELDS.join(', ')}`,
      })
    }
  }

  // 1. Start with fixture data
  let rows: PeopleDirectoryRow[] = [...PEOPLE_DIRECTORY_FIXTURE]

  // 2. Apply search (case-insensitive match on fullName)
  if (input.search.trim()) {
    const searchLower = input.search.toLowerCase()
    rows = rows.filter((row) => row.fullName.toLowerCase().includes(searchLower))
  }

  // 3. Apply filters (only PEOPLE_DIRECTORY_FILTER_FIELDS)
  for (const filter of input.filters) {
    const field = filter.field as FilterField
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

  // 4. Apply sorting (only PEOPLE_DIRECTORY_SORT_FIELDS)
  if (input.sorting.length > 0) {
    rows = [...rows].sort((a, b) => {
      for (const sort of input.sorting) {
        const field = sort.field as SortField
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

  // Compute availableFilters (distinct values for each filter field) from unfiltered rows
  const allRows = PEOPLE_DIRECTORY_FIXTURE
  const availableFilters: Record<string, unknown[]> = {}
  for (const field of PEOPLE_DIRECTORY_FILTER_FIELDS) {
    const distinct = [...new Set(allRows.map((r) => r[field]))]
    availableFilters[field] = distinct.sort()
  }

  // 5. Apply pagination
  const totalCount = rows.length
  const { pageIndex, pageSize } = input.pagination
  const pageCount = Math.ceil(totalCount / pageSize)
  const start = pageIndex * pageSize
  const pageRows = rows.slice(start, start + pageSize)

  // 6. Return standardized FutureListResult
  return {
    rows: pageRows as unknown as Record<string, unknown>[],
    totalCount,
    pageCount,
    pageIndex,
    pageSize,
    availableFilters,
  }
}
