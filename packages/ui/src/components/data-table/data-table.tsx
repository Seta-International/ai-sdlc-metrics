'use client'

import * as React from 'react'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  type ColumnPinningState,
  type RowSelectionState,
  type ExpandedState,
} from '@tanstack/react-table'
import { cn } from '../../lib/utils'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../ui/table'
// Note: using native checkbox for row selection to ensure jsdom test compatibility
import { DataTableColumnHeader } from './data-table-column-header'
import { DataTableToolbar } from './data-table-toolbar'
import { DataTablePagination } from './data-table-pagination'
import { DataTableLoading } from './data-table-loading'
import { DataTableError } from './data-table-error'
import { DataTableEmpty } from './data-table-empty'
import { DataTableExpandedRow } from './data-table-expanded-row'
import { DataTableBulkActions } from './data-table-bulk-actions'
import type { FutureTableState } from './table-state'

export interface DataTableProps<TData> {
  columns: ColumnDef<TData>[]
  rows: TData[]
  state: FutureTableState
  totalCount: number
  onStateChange: (state: FutureTableState) => void
  renderExpandedRow?: (row: TData) => React.ReactNode
  onRowClick?: (row: TData) => void
  onExport?: () => void
  exportDisabled?: boolean
  isLoading?: boolean
  error?: string
  onRetry?: () => void
  className?: string
}

const DENSITY_CELL_CLASS: Record<FutureTableState['density'], string> = {
  compact: 'py-1 text-sm',
  default: 'py-2 text-sm',
  comfortable: 'py-3 text-base',
}

// Selection column id
const SELECTION_COL_ID = '__select__'

export function DataTable<TData>({
  columns,
  rows,
  state,
  totalCount,
  onStateChange,
  renderExpandedRow,
  onRowClick,
  onExport,
  exportDisabled,
  isLoading,
  error,
  onRetry,
  className,
}: DataTableProps<TData>) {
  // Local expanded state (not persisted)
  const [expanded, setExpanded] = React.useState<ExpandedState>({})
  // Local row selection (controlled via onStateChange if needed, but kept local for now)
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})

  // Map FutureTableState → TanStack types
  const sorting: SortingState = state.sorting.map((s) => ({
    id: s.field,
    desc: s.direction === 'desc',
  }))

  const columnVisibility: VisibilityState = state.columnVisibility

  const columnPinning: ColumnPinningState = {
    left: state.columnPinning.left ?? [],
    right: state.columnPinning.right ?? [],
  }

  // Build full column list with optional selection column
  const selectionColumn: ColumnDef<TData> = {
    id: SELECTION_COL_ID,
    enableSorting: false,
    header: ({ table }) => (
      <input
        type="checkbox"
        checked={table.getIsAllPageRowsSelected()}
        ref={(el) => {
          if (el) {
            el.indeterminate = table.getIsSomePageRowsSelected()
          }
        }}
        onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
        aria-label="Select all"
        className="size-4 accent-primary"
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        checked={row.getIsSelected()}
        onChange={(e) => row.toggleSelected(e.target.checked)}
        aria-label="Select row"
        className="size-4 accent-primary"
      />
    ),
    size: 36,
  }

  const expandColumn: ColumnDef<TData> = {
    id: '__expand__',
    enableSorting: false,
    header: () => null,
    cell: ({ row }) => (
      <button
        type="button"
        className="flex size-5 items-center justify-center rounded text-muted-foreground transition-transform hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onClick={() => row.toggleExpanded()}
        aria-label={row.getIsExpanded() ? 'Collapse row' : 'Expand row'}
        aria-expanded={row.getIsExpanded()}
        style={{ transform: row.getIsExpanded() ? 'rotate(90deg)' : undefined }}
      >
        ▶
      </button>
    ),
    size: 32,
  }

  const allColumns: ColumnDef<TData>[] = [
    selectionColumn,
    ...(renderExpandedRow ? [expandColumn] : []),
    ...columns,
  ]

  const table = useReactTable<TData>({
    data: rows,
    columns: allColumns,
    state: {
      sorting,
      columnVisibility,
      columnPinning,
      rowSelection,
      expanded,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    // We manage sorting externally via onStateChange
    manualSorting: true,
    manualPagination: true,
    pageCount: Math.ceil(totalCount / state.pagination.pageSize),
  })

  function handleSort(columnId: string, next: 'asc' | 'desc' | null) {
    onStateChange({
      ...state,
      sorting: next === null ? [] : [{ field: columnId, direction: next }],
      pagination: { ...state.pagination, pageIndex: 0 },
    })
  }

  // Column options for toolbar view options (exclude internal columns)
  const columnOptions = columns.map((col) => ({
    id:
      (col as { id?: string; accessorKey?: string }).id ??
      (col as { accessorKey?: string }).accessorKey ??
      '',
    label:
      typeof col.header === 'string'
        ? col.header
        : ((col as { id?: string; accessorKey?: string }).id ??
          (col as { accessorKey?: string }).accessorKey ??
          ''),
  }))

  const densityClass = DENSITY_CELL_CLASS[state.density]
  const selectedCount = Object.keys(rowSelection).length

  // Determine what to render in the body area
  const showLoading = isLoading
  const showError = !isLoading && !!error
  const showEmpty = !isLoading && !error && rows.length === 0
  const showRows = !isLoading && !error && rows.length > 0

  return (
    <div
      className={cn('flex flex-col gap-0 rounded-md border border-border bg-background', className)}
      data-slot="data-table"
    >
      {/* Toolbar */}
      {!isLoading && !error && (
        <div className="px-3 pt-3">
          <DataTableToolbar
            state={state}
            onStateChange={onStateChange}
            onExport={onExport}
            exportDisabled={exportDisabled}
            columns={columnOptions}
          />
        </div>
      )}

      {/* Bulk actions */}
      {selectedCount > 0 && (
        <div className="px-3 py-1.5">
          <DataTableBulkActions
            selectedCount={selectedCount}
            onClearSelection={() => setRowSelection({})}
          />
        </div>
      )}

      {/* Body area */}
      {showLoading && <DataTableLoading rows={5} columns={columns.length + 1} />}

      {showError && <DataTableError message={error!} onRetry={onRetry} />}

      {showEmpty && <DataTableEmpty />}

      {showRows && (
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const colDef = header.column.columnDef
                  const colId = header.column.id
                  const isInternal = colId === SELECTION_COL_ID || colId === '__expand__'
                  const canSort = !isInternal && header.column.getCanSort()
                  const sortDir = header.column.getIsSorted()
                  // Derive a plain-text aria-label for the sort button
                  const headerText = typeof colDef.header === 'string' ? colDef.header : colId

                  return (
                    <TableHead key={header.id} style={{ width: header.getSize() }}>
                      {header.isPlaceholder ? null : isInternal ? (
                        flexRender(colDef.header, header.getContext())
                      ) : (
                        <DataTableColumnHeader
                          label={flexRender(colDef.header, header.getContext())}
                          ariaLabel={headerText}
                          columnId={colId}
                          sortDirection={sortDir === false ? undefined : sortDir}
                          enableSorting={canSort}
                          onSort={handleSort}
                        />
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody data-density={state.density}>
            {table.getRowModel().rows.map((row) => (
              <React.Fragment key={row.id}>
                <TableRow
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={onRowClick ? 'cursor-pointer' : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(densityClass)}
                      data-density={state.density}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
                {row.getIsExpanded() && renderExpandedRow && (
                  <tr>
                    <td colSpan={table.getVisibleLeafColumns().length} className="p-0">
                      <DataTableExpandedRow>{renderExpandedRow(row.original)}</DataTableExpandedRow>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Pagination */}
      {!isLoading && !error && (
        <DataTablePagination
          pageIndex={state.pagination.pageIndex}
          pageSize={state.pagination.pageSize}
          totalCount={totalCount}
          onPageChange={(pageIndex) =>
            onStateChange({ ...state, pagination: { ...state.pagination, pageIndex } })
          }
          onPageSizeChange={(pageSize) =>
            onStateChange({ ...state, pagination: { pageIndex: 0, pageSize } })
          }
          className="border-t border-border"
        />
      )}
    </div>
  )
}
