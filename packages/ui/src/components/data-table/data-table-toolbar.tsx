'use client'

import * as React from 'react'
import { DownloadIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { DataTableSearch } from './data-table-search'
import { DataTableFilters } from './data-table-filters'
import { DataTableViewOptions, type ColumnOption } from './data-table-view-options'
import type { FutureTableState } from './table-state'

export interface DataTableToolbarProps {
  state: FutureTableState
  onStateChange: (state: FutureTableState) => void
  onExport?: () => void
  exportDisabled?: boolean
  columns: ColumnOption[]
  className?: string
}

export function DataTableToolbar({
  state,
  onStateChange,
  onExport,
  exportDisabled,
  columns,
  className,
}: DataTableToolbarProps) {
  function handleSearchChange(search: string) {
    onStateChange({ ...state, search, pagination: { ...state.pagination, pageIndex: 0 } })
  }

  function handleRemoveFilter(field: string) {
    onStateChange({
      ...state,
      filters: state.filters.filter((f) => f.field !== field),
      pagination: { ...state.pagination, pageIndex: 0 },
    })
  }

  function handleVisibilityChange(columnVisibility: Record<string, boolean>) {
    onStateChange({ ...state, columnVisibility })
  }

  return (
    <div
      className={cn('flex flex-col gap-1.5 border-b border-border pb-2', className)}
      data-slot="data-table-toolbar"
    >
      <div className="flex items-center gap-2">
        <DataTableSearch value={state.search} onChange={handleSearchChange} />
        <div className="ml-auto flex items-center gap-1.5">
          <DataTableViewOptions
            columns={columns}
            visibility={state.columnVisibility}
            onVisibilityChange={handleVisibilityChange}
          />
          {onExport && (
            <Button
              variant="outline"
              size="sm"
              onClick={onExport}
              disabled={exportDisabled}
              aria-label="Export"
            >
              <DownloadIcon className="size-3.5" />
              Export
            </Button>
          )}
        </div>
      </div>
      {state.filters.length > 0 && (
        <DataTableFilters filters={state.filters} onRemoveFilter={handleRemoveFilter} />
      )}
    </div>
  )
}
