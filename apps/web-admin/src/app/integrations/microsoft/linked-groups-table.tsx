'use client'

import { useState } from 'react'
import {
  DataTable,
  defaultTableState,
  type ColumnDef,
  type FutureTableState,
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@future/ui'
import { MoreHorizontal } from '@future/ui/icons'

export interface LinkedGroupDto {
  id: string
  msGroupId: string
  displayName: string
  syncEnabled: boolean
  backfillingAt: Date | null
  planCount: number
  lastPolledAt: Date | null
  lastError: string | null
}

export interface LinkedGroupsTableProps {
  groups: LinkedGroupDto[]
  isLoading: boolean
  error?: string
  onUnlink: (msGroupId: string) => void
  onRetry?: () => void
}

function StatusDot({ group }: { group: LinkedGroupDto }) {
  let status: 'backfilling' | 'error' | 'active'

  if (group.backfillingAt !== null) {
    status = 'backfilling'
  } else if (group.lastError !== null) {
    status = 'error'
  } else {
    status = 'active'
  }

  const colorClass =
    status === 'active' ? 'bg-green-500' : status === 'backfilling' ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <span
      data-status={status}
      className={`inline-block size-2 rounded-full ${colorClass}`}
      aria-label={status}
    />
  )
}

export function LinkedGroupsTable({
  groups,
  isLoading,
  error,
  onUnlink,
  onRetry,
}: LinkedGroupsTableProps) {
  const [tableState, setTableState] = useState<FutureTableState>(defaultTableState)

  const columns: ColumnDef<LinkedGroupDto>[] = [
    {
      id: 'displayName',
      header: 'Name',
      cell: ({ row }) => <span>{row.original.displayName}</span>,
    },
    {
      id: 'planCount',
      header: 'Plans',
      cell: ({ row }) => <span>{row.original.planCount}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusDot group={row.original} />,
    },
    {
      id: 'lastPolledAt',
      header: 'Last poll',
      cell: ({ row }) => (
        <span>
          {row.original.lastPolledAt ? new Date(row.original.lastPolledAt).toLocaleString() : '—'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" aria-label="Row actions">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onUnlink(row.original.msGroupId)}>
              Unlink
            </DropdownMenuItem>
            <DropdownMenuItem disabled>Retry</DropdownMenuItem>
            <DropdownMenuItem disabled>View plans</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={groups}
      state={tableState}
      totalCount={groups.length}
      onStateChange={setTableState}
      isLoading={isLoading}
      error={error}
      onRetry={onRetry}
    />
  )
}
