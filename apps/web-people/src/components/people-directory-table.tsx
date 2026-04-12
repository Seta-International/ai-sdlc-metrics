'use client'

import * as React from 'react'
import type { ColumnDef, CellContext } from '@tanstack/react-table'
import {
  DataTable,
  type FutureTableState,
  type PersistedSavedViewState,
  defaultTableState,
  isSavedViewDirty,
} from '@future/ui'
import { trpc } from '../lib/trpc'
import {
  getTableStateFromUrl,
  pushTableStateToUrl,
  replaceTableStateInUrl,
  resolveHydratedTableState,
} from '../lib/table-url-state'

type PeopleDirectoryRow = {
  id: string
  fullName: string
  department: string
  jobTitle: string
  status: 'active' | 'inactive' | 'on_leave'
  employmentType: 'permanent' | 'fixed_term' | 'contractor' | 'intern'
  detailPanel?: Record<string, unknown>
}

// Column definitions for the people directory
const columns: ColumnDef<PeopleDirectoryRow>[] = [
  {
    accessorKey: 'fullName',
    header: 'Full Name',
    enableSorting: true,
  },
  {
    accessorKey: 'department',
    header: 'Department',
    enableSorting: true,
  },
  {
    accessorKey: 'jobTitle',
    header: 'Job Title',
    enableSorting: true,
  },
  {
    accessorKey: 'status',
    header: 'Status',
    enableSorting: true,
    cell: ({ getValue }: CellContext<PeopleDirectoryRow, unknown>) => {
      const status = getValue() as string
      const labels: Record<string, string> = {
        active: 'Active',
        inactive: 'Inactive',
        on_leave: 'On Leave',
      }
      return labels[status] ?? status
    },
  },
  {
    accessorKey: 'employmentType',
    header: 'Employment Type',
    enableSorting: false,
    cell: ({ getValue }: CellContext<PeopleDirectoryRow, unknown>) => {
      const type = getValue() as string
      const labels: Record<string, string> = {
        permanent: 'Permanent',
        fixed_term: 'Fixed Term',
        contractor: 'Contractor',
        intern: 'Intern',
      }
      return labels[type] ?? type
    },
  },
]

type SavedViewEntry = {
  id: string
  name: string
  isDefault: boolean
  stateJson: PersistedSavedViewState
}

type ResolveResult = {
  views: SavedViewEntry[]
  activeView: SavedViewEntry | null
  defaultViewId: string | null
}

// The AppRouter type has `people` and `preferences` typed as `any` because of the
// mutable router pattern (runtime injection). We cast through unknown to access them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

export interface PeopleDirectoryTableProps {
  resourceKey: string
}

export function PeopleDirectoryTable({ resourceKey }: PeopleDirectoryTableProps) {
  const [tableState, setTableState] = React.useState<FutureTableState>(defaultTableState)
  const [activeViewId, setActiveViewId] = React.useState<string | null>(null)
  const [viewsData, setViewsData] = React.useState<ResolveResult>({
    views: [],
    activeView: null,
    defaultViewId: null,
  })
  const [rows, setRows] = React.useState<PeopleDirectoryRow[]>([])
  const [totalCount, setTotalCount] = React.useState(0)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | undefined>()
  const [isViewsLoading, setIsViewsLoading] = React.useState(true)
  const [isSaving, setIsSaving] = React.useState(false)

  // On mount: resolve saved view state and initialize table state
  React.useEffect(() => {
    const urlState = getTableStateFromUrl()
    const requestedActiveViewId =
      new URLSearchParams(window.location.search).get('activeViewId') ?? null

    ;(
      anyTrpc.preferences.savedView.resolve.query({
        resourceKey,
        activeViewId: requestedActiveViewId,
      }) as Promise<ResolveResult>
    )
      .then((result) => {
        const activeView: PersistedSavedViewState | null = result.activeView
          ? result.activeView.stateJson
          : null

        const defaultViewEntry = result.defaultViewId
          ? result.views.find((v) => v.id === result.defaultViewId)
          : null
        const defaultView: PersistedSavedViewState | null = defaultViewEntry
          ? defaultViewEntry.stateJson
          : null

        const { nextState, nextActiveViewId, replaceUrl } = resolveHydratedTableState({
          urlState,
          activeView,
          defaultView,
          requestedActiveViewId,
        })

        setViewsData(result)
        setActiveViewId(nextActiveViewId)
        setTableState(nextState)

        if (replaceUrl) {
          replaceTableStateInUrl(nextState, nextActiveViewId)
        }
      })
      .catch((err: unknown) => {
        console.error('Failed to load saved views:', err)
        // Fall back to URL state
        setTableState(urlState)
      })
      .finally(() => {
        setIsViewsLoading(false)
      })
    // intentionally only run on mount (resourceKey is stable)
  }, [resourceKey])

  // Load data whenever table state changes (after initial view resolution)
  React.useEffect(() => {
    if (isViewsLoading) return

    void (async () => {
      setIsLoading(true)
      setError(undefined)
      try {
        const result = await (anyTrpc.people.directory.list.query({
          resourceKey,
          search: tableState.search,
          filters: tableState.filters,
          sorting: tableState.sorting,
          pagination: tableState.pagination,
        }) as Promise<{
          rows: PeopleDirectoryRow[]
          totalCount: number
          pageCount: number
          pageIndex: number
          pageSize: number
        }>)
        setRows(result.rows)
        setTotalCount(result.totalCount)
      } catch (err: unknown) {
        console.error('Failed to load directory:', err)
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setIsLoading(false)
      }
    })()
  }, [tableState, resourceKey, isViewsLoading])

  // Handle state changes from the table
  function handleStateChange(next: FutureTableState) {
    setTableState(next)
    pushTableStateToUrl(next)
  }

  // Handle view selection
  function handleSelectView(viewId: string | null) {
    if (!viewId) {
      setActiveViewId(null)
      const next = { ...defaultTableState }
      setTableState(next)
      replaceTableStateInUrl(next, null)
      return
    }

    const view = viewsData.views.find((v) => v.id === viewId)
    if (!view) return

    const next: FutureTableState = {
      ...defaultTableState,
      ...view.stateJson,
      pagination: { pageIndex: 0, pageSize: view.stateJson.pagination.pageSize },
    }
    setActiveViewId(viewId)
    setTableState(next)
    replaceTableStateInUrl(next, viewId)
  }

  // Handle saving current state to active view
  async function handleSaveView() {
    if (!activeViewId) return

    setIsSaving(true)
    try {
      const stateJson: PersistedSavedViewState = {
        search: tableState.search,
        filters: tableState.filters,
        sorting: tableState.sorting,
        pagination: { pageSize: tableState.pagination.pageSize },
        columnVisibility: tableState.columnVisibility,
        columnPinning: tableState.columnPinning,
        density: tableState.density,
      }
      await (anyTrpc.preferences.savedView.update.mutate({
        id: activeViewId,
        stateJson,
      }) as Promise<SavedViewEntry>)
      const updated = await (anyTrpc.preferences.savedView.resolve.query({
        resourceKey,
        activeViewId,
      }) as Promise<ResolveResult>)
      setViewsData(updated)
    } catch (err) {
      console.error('Failed to save view:', err)
    } finally {
      setIsSaving(false)
    }
  }

  // Handle creating a new saved view
  async function handleCreateView(name: string) {
    const stateJson: PersistedSavedViewState = {
      search: tableState.search,
      filters: tableState.filters,
      sorting: tableState.sorting,
      pagination: { pageSize: tableState.pagination.pageSize },
      columnVisibility: tableState.columnVisibility,
      columnPinning: tableState.columnPinning,
      density: tableState.density,
    }
    try {
      const newView = await (anyTrpc.preferences.savedView.create.mutate({
        resourceKey,
        name,
        stateJson,
        isDefault: false,
      }) as Promise<SavedViewEntry>)
      setActiveViewId(newView.id)
      replaceTableStateInUrl(tableState, newView.id)
      const updated = await (anyTrpc.preferences.savedView.resolve.query({
        resourceKey,
        activeViewId: newView.id,
      }) as Promise<ResolveResult>)
      setViewsData(updated)
    } catch (err) {
      console.error('Failed to create view:', err)
    }
  }

  // Handle deleting a saved view
  async function handleDeleteView(viewId: string) {
    try {
      await (anyTrpc.preferences.savedView.delete.mutate({ id: viewId }) as Promise<void>)
      const nextActiveViewId = activeViewId === viewId ? null : activeViewId
      if (activeViewId === viewId) {
        setActiveViewId(null)
        replaceTableStateInUrl(tableState, null)
      }
      const updated = await (anyTrpc.preferences.savedView.resolve.query({
        resourceKey,
        activeViewId: nextActiveViewId,
      }) as Promise<ResolveResult>)
      setViewsData(updated)
    } catch (err) {
      console.error('Failed to delete view:', err)
    }
  }

  // Handle setting a view as default
  async function handleSetDefaultView(viewId: string) {
    try {
      await (anyTrpc.preferences.savedView.setDefault.mutate({
        id: viewId,
        resourceKey,
      }) as Promise<void>)
      const updated = await (anyTrpc.preferences.savedView.resolve.query({
        resourceKey,
        activeViewId,
      }) as Promise<ResolveResult>)
      setViewsData(updated)
    } catch (err) {
      console.error('Failed to set default view:', err)
    }
  }

  // Compute if the active view is dirty
  const currentActiveView = activeViewId ? viewsData.views.find((v) => v.id === activeViewId) : null
  const isViewDirty =
    currentActiveView != null && isSavedViewDirty(currentActiveView.stateJson, tableState)

  // Handle export: download as CSV
  async function handleExport() {
    try {
      const result = await (anyTrpc.people.directory.export.query({
        resourceKey,
        search: tableState.search,
        filters: tableState.filters,
        sorting: tableState.sorting,
      }) as Promise<{ rows: Record<string, unknown>[] }>)

      const exportRows = result.rows
      if (exportRows.length === 0) return

      const headers = Object.keys(exportRows[0] ?? {})
      const csvLines = [
        headers.join(','),
        ...exportRows.map((row) =>
          headers
            .map((h) => {
              const val = row[h]
              const str = val == null ? '' : String(val)
              return str.includes(',') || str.includes('"') || str.includes('\n')
                ? `"${str.replace(/"/g, '""')}"`
                : str
            })
            .join(','),
        ),
      ]
      const csvContent = csvLines.join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'people-directory.csv'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
    }
  }

  // Render expanded row detail panel
  function renderExpandedRow(row: PeopleDirectoryRow) {
    return (
      <div data-testid="expanded-row" className="px-4 py-3 text-sm">
        <div className="font-medium mb-2">{row.fullName} — Details</div>
        {row.detailPanel ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
            {Object.entries(row.detailPanel).map(([key, val]) => (
              <React.Fragment key={key}>
                <dt className="text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</dt>
                <dd>{val == null ? '—' : String(val)}</dd>
              </React.Fragment>
            ))}
          </dl>
        ) : (
          <p className="text-muted-foreground">No additional details available.</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Saved views toolbar */}
      {viewsData.views.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Views:</span>
          <button
            type="button"
            onClick={() => handleSelectView(null)}
            className={`px-2 py-1 text-xs rounded border ${
              activeViewId == null
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border hover:bg-muted'
            }`}
          >
            Default
          </button>
          {viewsData.views.map((view) => (
            <div key={view.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleSelectView(view.id)}
                className={`px-2 py-1 text-xs rounded border ${
                  activeViewId === view.id
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border hover:bg-muted'
                }`}
              >
                {view.name}
                {view.isDefault && <span className="ml-1 text-xs opacity-60">(default)</span>}
              </button>
              {activeViewId === view.id && (
                <>
                  <button
                    type="button"
                    onClick={() => void handleSetDefaultView(view.id)}
                    className="px-1.5 py-1 text-xs rounded border border-border hover:bg-muted"
                    title="Set as default"
                  >
                    ★
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteView(view.id)}
                    className="px-1.5 py-1 text-xs rounded border border-border hover:bg-muted text-destructive"
                    title="Delete view"
                  >
                    ✕
                  </button>
                </>
              )}
            </div>
          ))}
          {/* Save button when view is dirty */}
          {isViewDirty && (
            <button
              type="button"
              onClick={() => void handleSaveView()}
              disabled={isSaving}
              className="px-2 py-1 text-xs rounded border border-primary bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      )}

      {/* Create new view */}
      <CreateViewForm onCreate={(name) => void handleCreateView(name)} />

      {/* Main data table */}
      <DataTable
        columns={columns}
        rows={rows}
        state={tableState}
        totalCount={totalCount}
        onStateChange={handleStateChange}
        renderExpandedRow={renderExpandedRow}
        onExport={() => void handleExport()}
        isLoading={isLoading}
        error={error}
        onRetry={() => setTableState({ ...tableState })}
      />
    </div>
  )
}

// Simple inline create-view form
function CreateViewForm({ onCreate }: { onCreate: (name: string) => void }) {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    onCreate(name.trim())
    setName('')
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
      >
        + Save current view
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="View name…"
        className="h-7 text-xs px-2 rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        autoFocus
      />
      <button
        type="submit"
        className="px-2 h-7 text-xs rounded border border-primary bg-primary text-primary-foreground hover:bg-primary/90"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="px-2 h-7 text-xs rounded border border-border hover:bg-muted"
      >
        Cancel
      </button>
    </form>
  )
}
