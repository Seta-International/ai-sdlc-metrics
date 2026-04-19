'use client'

import { useMemo, useRef, useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type Row,
  type RowSelectionState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  DataTableColumnHeader,
} from '@future/ui'
import { buildColumns } from './columns'
import { useViewState } from '@/lib/hooks/useViewState'
import type { TaskFlat } from '@future/api-client/planner'
import type { TaskGroup } from '@/lib/task-group'
import type { SortField } from '@/lib/view-state'
import { BulkActionsBar } from './BulkActionsBar'

type Member = { actorId: string; displayName: string }
type Label = { id: string; name: string; color: string }

type VirtualRow =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'row'; row: Row<TaskFlat> }

export function TaskGrid({
  planId,
  data,
  groups,
  context,
}: {
  planId: string
  data: TaskFlat[]
  groups: TaskGroup[] | undefined
  context: { members: Member[]; labels: Label[] }
}) {
  const { state, patch } = useViewState({ planId })
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  const columns = useMemo(
    () =>
      buildColumns({
        editable: true,
        onOpen: () => undefined,
        planMembers: context.members,
        planLabels: context.labels,
      }),
    [context.members, context.labels],
  )

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    enableRowSelection: true,
    state: {
      sorting: state.sort ? [{ id: state.sort.field, desc: state.sort.dir === 'desc' }] : [],
      rowSelection,
    },
    onRowSelectionChange: setRowSelection,
  })

  const virtualRows = useMemo<VirtualRow[]>(() => {
    if (groups) {
      return groups.flatMap((g) => {
        const groupTaskIds = new Set(g.tasks.map((t) => t.id))
        const matchingRows = table.getRowModel().rows.filter((r) => groupTaskIds.has(r.original.id))
        return [
          { kind: 'header' as const, key: g.key, label: g.label },
          ...matchingRows.map((r) => ({ kind: 'row' as const, row: r })),
        ]
      })
    }
    return table.getRowModel().rows.map((r) => ({ kind: 'row' as const, row: r }))
  }, [groups, table])

  const parentRef = useRef<HTMLDivElement | null>(null)

  const rowVirtualizer = useVirtualizer({
    count: virtualRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (virtualRows[i]?.kind === 'header' ? 36 : 48),
    overscan: 10,
    getItemKey: (i) => {
      const vr = virtualRows[i]
      if (!vr) return `vr-${i}`
      return vr.kind === 'header' ? `h:${vr.key}` : vr.row.original.id
    },
  })

  const virtualItems = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()

  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original)

  return (
    <div className="relative h-full">
      <div ref={parentRef} className="h-full overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const isSortable = header.column.getCanSort()
                  const sortDir = header.column.getIsSorted()
                  return (
                    <TableHead
                      key={header.id}
                      style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                    >
                      {header.isPlaceholder ? null : isSortable ? (
                        <DataTableColumnHeader
                          label={flexRender(header.column.columnDef.header, header.getContext())}
                          columnId={header.column.id}
                          sortDirection={sortDir === false ? undefined : sortDir}
                          enableSorting={true}
                          onSort={(columnId, next) => {
                            if (next === null) {
                              patch({ sort: undefined })
                            } else {
                              patch({
                                sort: {
                                  field: columnId as SortField,
                                  dir: next,
                                },
                              })
                            }
                          }}
                        />
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {/* spacer for items above the virtual window */}
            {virtualItems.length > 0 && virtualItems[0]!.start > 0 && (
              <tr style={{ height: virtualItems[0]!.start }} aria-hidden="true" />
            )}
            {virtualItems.map((virtualItem) => {
              const vr = virtualRows[virtualItem.index]
              if (!vr) return null

              if (vr.kind === 'header') {
                return (
                  <TableRow
                    key={virtualItem.key}
                    data-index={virtualItem.index}
                    style={{ height: virtualItem.size }}
                    className="bg-muted/50 hover:bg-muted/50"
                  >
                    <TableCell
                      colSpan={table.getVisibleLeafColumns().length}
                      className="py-2 font-medium text-muted-foreground text-xs uppercase tracking-wide"
                    >
                      {vr.label}
                    </TableCell>
                  </TableRow>
                )
              }

              const { row } = vr
              return (
                <TableRow
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  style={{ height: virtualItem.size }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              )
            })}
            {/* spacer for items below the virtual window */}
            {virtualItems.length > 0 &&
              (() => {
                const lastItem = virtualItems[virtualItems.length - 1]!
                const bottomSpace = totalSize - lastItem.end
                return bottomSpace > 0 ? (
                  <tr style={{ height: bottomSpace }} aria-hidden="true" />
                ) : null
              })()}
          </TableBody>
        </Table>
      </div>
      {selectedRows.length > 0 && (
        <BulkActionsBar
          selectedTasks={selectedRows}
          onClearSelection={() => table.resetRowSelection()}
          planId={planId}
          planMembers={context.members}
          planLabels={context.labels}
        />
      )}
    </div>
  )
}
