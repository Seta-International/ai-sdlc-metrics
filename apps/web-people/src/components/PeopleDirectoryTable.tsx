'use client'

import * as React from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import type { ColumnDef, CellContext } from '@tanstack/react-table'
import { DataTable, type FutureTableState, Button } from '@future/ui'
import { LayoutGrid, LayoutList, Download } from 'lucide-react'
import { trpc } from '../lib/trpc'
import { getTableStateFromUrl, pushTableStateToUrl } from '../lib/table-url-state'
import { AvatarNameCell } from './AvatarNameCell'
import { StatusBadge } from './StatusBadge'
import { FilterPanel, emptyFilters, type FilterValues } from './FilterPanel'
import { CardGridView } from './CardGridView'
import type { DirectoryRow, EmploymentStatus } from '../lib/types'
import type { TableFilter } from '@future/ui'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

function toFilterArray(tableFilters: TableFilter[], panelFilters: FilterValues): TableFilter[] {
  const out: TableFilter[] = [...tableFilters]
  const add = (field: string, operator: TableFilter['operator'], value: unknown) =>
    out.push({ field, operator, value } as TableFilter)

  if (panelFilters.departmentIds.length) add('departmentId', 'in', panelFilters.departmentIds)
  if (panelFilters.jobFamilyIds.length) add('jobFamilyId', 'in', panelFilters.jobFamilyIds)
  if (panelFilters.jobProfileIds.length) add('jobProfileId', 'in', panelFilters.jobProfileIds)
  if (panelFilters.employmentStatus.length)
    add('employmentStatus', 'in', panelFilters.employmentStatus)
  if (panelFilters.employmentType.length) add('employmentType', 'in', panelFilters.employmentType)
  if (panelFilters.workerType.length) add('workerType', 'in', panelFilters.workerType)
  if (panelFilters.workArrangement.length)
    add('workArrangement', 'in', panelFilters.workArrangement)
  if (panelFilters.countryCode.length) add('countryCode', 'in', panelFilters.countryCode)
  if (panelFilters.location.length) add('locationId', 'in', panelFilters.location)
  if (panelFilters.managerId) add('managerId', 'eq', panelFilters.managerId)
  if (panelFilters.hireDateFrom) add('hiredAfter', 'gte', panelFilters.hireDateFrom)
  if (panelFilters.hireDateTo) add('hireDateTo', 'lte', panelFilters.hireDateTo)
  return out
}

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
      return val ?? <span className="text-secondary-foreground/60">--</span>
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
      const code = getValue() as string | null
      return code ? (
        <span className="text-xs text-secondary-foreground">{code.toUpperCase()}</span>
      ) : (
        <span className="text-secondary-foreground/60">--</span>
      )
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
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const [tableState, setTableState] = React.useState<FutureTableState>(() =>
    getTableStateFromUrl(searchParams),
  )
  const viewParam = searchParams.get('view')
  const [viewMode, setViewMode] = React.useState<ViewMode>(viewParam === 'card' ? 'card' : 'list')
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

  // Load data + facets whenever state changes
  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      setError(undefined)
      try {
        const result = await (anyTrpc.people.directory.list.query({
          resourceKey,
          search: tableState.search,
          filters: toFilterArray(tableState.filters, filterValues),
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
    pushTableStateToUrl(next, pathname)
  }

  function handleRowClick(row: DirectoryRow) {
    router.push(`/profile/${row.id}`)
  }

  async function handleExport(format: 'csv' | 'xlsx' = 'csv') {
    try {
      const result = await (anyTrpc.people.directory.export.query({
        resourceKey,
        search: tableState.search,
        filters: toFilterArray(tableState.filters, filterValues),
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
          {totalCount > 0 && (
            <span className="text-xs text-secondary-foreground/60">{totalCount} employees</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center rounded-md border border-border">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setViewMode('list')}
              className={`rounded-l-md rounded-r-none h-7 w-7 ${
                viewMode === 'list'
                  ? 'bg-border text-foreground'
                  : 'text-secondary-foreground/60 hover:text-muted-foreground'
              }`}
              aria-label="List view"
            >
              <LayoutList className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setViewMode('card')}
              className={`rounded-r-md rounded-l-none h-7 w-7 ${
                viewMode === 'card'
                  ? 'bg-border text-foreground'
                  : 'text-secondary-foreground/60 hover:text-muted-foreground'
              }`}
              aria-label="Card view"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
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
          onRowClick={handleRowClick}
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
