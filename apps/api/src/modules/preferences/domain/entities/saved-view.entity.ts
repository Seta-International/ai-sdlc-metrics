export type SavedViewState = {
  search: string
  filters: unknown[]
  sorting: Array<{ field: string; direction: 'asc' | 'desc' }>
  pagination: { pageSize: number }
  columnVisibility: Record<string, boolean>
  columnPinning: { left?: string[]; right?: string[] }
  density: 'compact' | 'default' | 'comfortable'
}

export type SavedView = {
  id: string
  tenantId: string
  actorId: string
  resourceKey: string
  name: string
  isDefault: boolean
  stateJson: SavedViewState
  createdAt: Date
  updatedAt: Date
}

export type ResolveResult = {
  views: SavedView[]
  activeView: SavedView | null
  defaultViewId: string | null
}

export function normalizeSavedViewState(input: SavedViewState): SavedViewState {
  return {
    search: input.search,
    filters: input.filters,
    sorting: input.sorting,
    pagination: { pageSize: input.pagination.pageSize },
    columnVisibility: input.columnVisibility,
    columnPinning: input.columnPinning,
    density: input.density,
  }
}
