export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'contains'
  | 'starts_with'
  | 'ends_with'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'not_in'
  | 'between'
  | 'is_empty'
  | 'is_not_empty'

export type TableFilter = {
  field: string
  operator: FilterOperator
  value: unknown
}

export type FutureTableState = {
  search: string
  filters: TableFilter[]
  sorting: Array<{ field: string; direction: 'asc' | 'desc' }>
  pagination: { pageIndex: number; pageSize: number }
  columnVisibility: Record<string, boolean>
  columnPinning: { left?: string[]; right?: string[] }
  density: 'compact' | 'default' | 'comfortable'
}

export type PersistedSavedViewState = {
  search: FutureTableState['search']
  filters: FutureTableState['filters']
  sorting: FutureTableState['sorting']
  pagination: { pageSize: FutureTableState['pagination']['pageSize'] }
  columnVisibility: FutureTableState['columnVisibility']
  columnPinning: FutureTableState['columnPinning']
  density: FutureTableState['density']
}

export const defaultTableState: FutureTableState = {
  search: '',
  filters: [],
  sorting: [],
  pagination: { pageIndex: 0, pageSize: 20 },
  columnVisibility: {},
  columnPinning: {},
  density: 'default',
}

export function serializeTableStateToSearchParams(state: FutureTableState): URLSearchParams {
  const params = new URLSearchParams()
  if (state.search) params.set('search', state.search)
  if (state.sorting.length > 0) {
    params.set('sort', state.sorting.map((s) => `${s.field}:${s.direction}`).join(','))
  }
  if (state.pagination.pageSize !== defaultTableState.pagination.pageSize) {
    params.set('pageSize', String(state.pagination.pageSize))
  }
  if (state.pagination.pageIndex > 0) {
    params.set('page', String(state.pagination.pageIndex))
  }
  if (state.filters.length > 0) {
    params.set('filters', JSON.stringify(state.filters))
  }
  if (state.density !== 'default') {
    params.set('density', state.density)
  }
  // columnVisibility and columnPinning are saved in saved views, not URL
  return params
}

export function parseTableStateFromSearchParams(params: URLSearchParams): FutureTableState {
  const search = params.get('search') ?? ''

  const sortStr = params.get('sort')
  const sorting = sortStr
    ? sortStr.split(',').map((s) => {
        const [field = '', direction] = s.split(':')
        return { field, direction: (direction === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc' }
      })
    : []

  const rawPageSize = parseInt(params.get('pageSize') ?? '20', 10)
  const pageSize = isNaN(rawPageSize) || rawPageSize <= 0 ? 20 : rawPageSize

  const rawPageIndex = parseInt(params.get('page') ?? params.get('pageIndex') ?? '0', 10)
  const pageIndex = isNaN(rawPageIndex) || rawPageIndex < 0 ? 0 : rawPageIndex

  const filtersStr = params.get('filters')
  const filters = filtersStr ? (JSON.parse(filtersStr) as TableFilter[]) : []

  const densityStr = params.get('density')
  const density = (['compact', 'default', 'comfortable'] as const).includes(densityStr as 'compact')
    ? (densityStr as FutureTableState['density'])
    : 'default'

  return {
    search,
    filters,
    sorting,
    pagination: { pageIndex, pageSize },
    columnVisibility: defaultTableState.columnVisibility,
    columnPinning: defaultTableState.columnPinning,
    density,
  }
}

export function isSavedViewDirty(
  saved: PersistedSavedViewState,
  current: FutureTableState,
): boolean {
  // Compare persistent fields only (ignore pageIndex, rowSelection, expanded)
  return (
    saved.search !== current.search ||
    JSON.stringify(saved.filters) !== JSON.stringify(current.filters) ||
    JSON.stringify(saved.sorting) !== JSON.stringify(current.sorting) ||
    saved.pagination.pageSize !== current.pagination.pageSize ||
    JSON.stringify(saved.columnVisibility) !== JSON.stringify(current.columnVisibility) ||
    JSON.stringify(saved.columnPinning) !== JSON.stringify(current.columnPinning) ||
    saved.density !== current.density
  )
}
