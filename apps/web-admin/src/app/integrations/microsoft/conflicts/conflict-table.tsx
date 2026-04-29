'use client'

import { useState } from 'react'
import {
  Button,
  DataTable,
  defaultTableState,
  type ColumnDef,
  type FutureTableState,
} from '@future/ui'
import { type ConflictDto, KindBadge, formatRelativeTime } from './conflict-row'
import { ConflictDetailDrawer } from './conflict-detail-drawer'

export interface ConflictTableProps {
  conflicts: ConflictDto[]
  isLoading: boolean
  error?: string
  onRetry?: () => void
  onActionSuccess: () => void
}

export function ConflictTable({
  conflicts,
  isLoading,
  error,
  onRetry,
  onActionSuccess,
}: ConflictTableProps) {
  const [tableState, setTableState] = useState<FutureTableState>(defaultTableState)
  const [selected, setSelected] = useState<ConflictDto | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const columns: ColumnDef<ConflictDto>[] = [
    {
      id: 'createdAt',
      header: 'Created',
      cell: ({ row }) => (
        <span
          className="text-sm text-muted-foreground"
          title={new Date(row.original.createdAt).toLocaleString()}
        >
          {formatRelativeTime(row.original.createdAt)}
        </span>
      ),
    },
    {
      id: 'kind',
      header: 'Kind',
      cell: ({ row }) => <KindBadge kind={row.original.kind} />,
    },
    {
      id: 'resource',
      header: 'Resource',
      cell: ({ row }) => {
        const { taskId, taskTitle } = row.original
        if (!taskId) return <span className="text-sm text-muted-foreground">—</span>
        return (
          <a
            href={`/planner/tasks/${taskId}`}
            className="text-sm text-accent-foreground hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {taskTitle ?? taskId}
          </a>
        )
      },
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`View conflict details for ${row.original.taskTitle ?? row.original.id}`}
          onClick={() => {
            setSelected(row.original)
            setDrawerOpen(true)
          }}
        >
          View
        </Button>
      ),
    },
  ]

  return (
    <>
      <DataTable
        columns={columns}
        rows={conflicts}
        state={tableState}
        totalCount={conflicts.length}
        onStateChange={setTableState}
        isLoading={isLoading}
        error={error}
        onRetry={onRetry}
      />
      <ConflictDetailDrawer
        conflict={selected}
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open)
          if (!open) setSelected(null)
        }}
        onActionSuccess={onActionSuccess}
      />
    </>
  )
}
