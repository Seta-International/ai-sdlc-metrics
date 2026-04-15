'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import type { ColumnDef, CellContext } from '@tanstack/react-table'
import { DataTable, type FutureTableState, defaultTableState, Button } from '@future/ui'
import { LayoutGrid, LayoutList, Download } from 'lucide-react'
import { trpc } from '../lib/trpc'
import { getTableStateFromUrl, pushTableStateToUrl } from '../lib/table-url-state'
import { AvatarNameCell } from './avatar-name-cell'
import { StatusBadge } from './status-badge'
import { FilterPanel, emptyFilters, type FilterValues } from './filter-panel'
import { CardGridView } from './card-grid-view'
import type { DirectoryRow, EmploymentStatus } from '../lib/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

const columns: ColumnDef<DirectoryRow>[] = [
  {
    accessorKey: 'fullName',
    header: 'Name',
    enableSorting: true,
    cell: ({ row }: CellContext<DirectoryRow, unknown>) => (
      <AvatarNameCell
        fullName={row.original.fullName}
        preferredName={row.original.preferredName}
        avatarUrl={row.original.avatarUrl}
        subtitle={row.original.companyEmail}
      />
    ),
  },
  {
    accessorKey: 'jobTitle',
    header: 'Job Title',
    enableSorting: true,
  },
  {
    accessorKey: 'department',
    header: 'Department',
    enableSorting: true,
  },
  {
    accessorKey: 'location',
    header: 'Location',
    enableSorting: true,
    cell: ({ getValue }: CellContext<DirectoryRow, unknown>) => {
      const val = getValue() as string | null
      return val ?? <span className="text-[#62666d]">--</span>
    },
  },
  {
    accessorKey: 'employmentStatus',
    header: 'Status',
    enableSorting: true,
    cell: ({ getValue }: CellContext<DirectoryRow, unknown>) => (
      <StatusBadge status={getValue() as EmploymentStatus} />
    ),
  },
  {
    accessorKey: 'countryCode',
    header: 'Country',
    enableSorting: true,
    cell: ({ getValue }: CellContext<DirectoryRow, unknown>) => {
      const code = getValue() as string
      return <span className="text-xs text-[#d0d6e0]">{code.toUpperCase()}</span>
    },
  },
]

type ViewMode = 'list' | 'card'

type Facets = {
  departments: Array<{ value: string; label: string; count?: number }>
  jobFamilies: Array<{ value: string; label: string; count?: number }>
  countries: Array<{ value: string; label: string; count?: number }>
  locations: Array<{ value: string; label: string; count?: number }>
}

export interface PeopleDirectoryTableProps {
  resourceKey: string
}

export function PeopleDirectoryTable({ resourceKey }: PeopleDirectoryTableProps) {
  const router = useRouter()
  const [tableState, setTableState] = React.useState<FutureTableState>(defaultTableState)
  const [viewMode, setViewMode] = React.useState<ViewMode>('list')
  const [rows, setRows] = React.useState<DirectoryRow[]>([])
  const [totalCount, setTotalCount] = React.useState(0)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | undefined>()

  const [facets, setFacets] = React.useState<Facets>({
    departments: [],
    jobFamilies: [],
    countries: [],
    locations: [],
  })

  const [filterValues, setFilterValues] = React.useState<FilterValues>(emptyFilters)

  // On mount: restore state from URL
  React.useEffect(() => {
    const urlState = getTableStateFromUrl()
    const urlViewMode = new URLSearchParams(window.location.search).get('view')
    if (urlViewMode === 'card' || urlViewMode === 'list') setViewMode(urlViewMode)
    setTableState(urlState)
  }, [])

  // Load data + facets whenever state changes
  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      setError(undefined)
      try {
        const result = await (anyTrpc.people.directory.list.query({
          resourceKey,
          search: tableState.search,
          filters: {
            ...tableState.filters,
            ...filterValues,
          },
          sorting: tableState.sorting,
          pagination: tableState.pagination,
        }) as Promise<{
          rows: DirectoryRow[]
          totalCount: number
          facets: Facets
        }>)
        setRows(result.rows)
        setTotalCount(result.totalCount)
        if (result.facets) setFacets(result.facets)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setIsLoading(false)
      }
    })()
  }, [tableState, filterValues, resourceKey])

  function handleStateChange(next: FutureTableState) {
    setTableState(next)
    pushTableStateToUrl(next)
  }

  function handleRowClick(row: DirectoryRow) {
    router.push(`/profile/${row.id}`)
  }

  async function handleExport(format: 'csv' | 'xlsx' = 'csv') {
    try {
      const result = await (anyTrpc.people.directory.export.query({
        resourceKey,
        search: tableState.search,
        filters: { ...tableState.filters, ...filterValues },
        sorting: tableState.sorting,
        format,
      }) as Promise<{ filename: string; csv: string }>)
      const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = result.filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
    }
  }

  // Render expanded row: navigate to profile on click
  function renderExpandedRow(row: DirectoryRow) {
    return (
      <button
        type="button"
        className="w-full text-left px-4 py-3 text-sm hover:bg-[rgba(255,255,255,0.04)] transition-colors"
        onClick={() => handleRowClick(row)}
      >
        <span className="text-[#62666d]">View profile →</span>
      </button>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1">
          <FilterPanel
            filters={filterValues}
            onFiltersChange={setFilterValues}
            departments={facets.departments}
            jobFamilies={facets.jobFamilies}
            countries={facets.countries}
            locations={facets.locations}
          />
          {totalCount > 0 && <span className="text-xs text-[#62666d]">{totalCount} employees</span>}
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center rounded-md border border-[rgba(255,255,255,0.08)]">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`rounded-l-md p-1.5 ${
                viewMode === 'list'
                  ? 'bg-[rgba(255,255,255,0.08)] text-[#f7f8f8]'
                  : 'text-[#62666d] hover:text-[#8a8f98]'
              }`}
              aria-label="List view"
            >
              <LayoutList className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('card')}
              className={`rounded-r-md p-1.5 ${
                viewMode === 'card'
                  ? 'bg-[rgba(255,255,255,0.08)] text-[#f7f8f8]'
                  : 'text-[#62666d] hover:text-[#8a8f98]'
              }`}
              aria-label="Card view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>

          {/* Export */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleExport('csv')}
            className="gap-1"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'list' ? (
        <DataTable
          columns={columns}
          rows={rows}
          state={tableState}
          totalCount={totalCount}
          onStateChange={handleStateChange}
          renderExpandedRow={renderExpandedRow}
          onExport={() => void handleExport('csv')}
          isLoading={isLoading}
          error={error}
          onRetry={() => setTableState({ ...tableState })}
        />
      ) : (
        <CardGridView employees={rows} />
      )}
    </div>
  )
}
