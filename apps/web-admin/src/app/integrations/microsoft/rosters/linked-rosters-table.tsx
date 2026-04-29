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

export interface LinkedRosterDto {
  id: string
  msRosterId: string
  displayName: string
  syncEnabled: boolean
  mintedByFutureAt: string | null
  unlinkedAt: string | null
}

export interface LinkedRostersTableProps {
  rosters: LinkedRosterDto[]
  isLoading: boolean
  error?: string
  onUnlink: (msRosterId: string) => void
  onRetry?: () => void
}

function StatusDot({ roster }: { roster: LinkedRosterDto }) {
  let status: 'active' | 'unlinked' | 'disabled'

  if (roster.unlinkedAt) {
    status = 'unlinked'
  } else if (!roster.syncEnabled) {
    status = 'disabled'
  } else {
    status = 'active'
  }

  const colorClass =
    status === 'active' ? 'bg-green-500' : status === 'disabled' ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <span
      data-status={status}
      className={`inline-block size-2 rounded-full ${colorClass}`}
      aria-label={status}
    />
  )
}

export function LinkedRostersTable({
  rosters,
  isLoading,
  error,
  onUnlink,
  onRetry,
}: LinkedRostersTableProps) {
  const [tableState, setTableState] = useState<FutureTableState>(defaultTableState)

  const columns: ColumnDef<LinkedRosterDto>[] = [
    {
      id: 'displayName',
      header: 'Name',
      cell: ({ row }) => <span>{row.original.displayName}</span>,
    },
    {
      id: 'mintedByFutureAt',
      header: 'Minted by Future',
      cell: ({ row }) => (
        <span>
          {row.original.mintedByFutureAt
            ? new Date(row.original.mintedByFutureAt).toLocaleString()
            : '—'}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusDot roster={row.original} />,
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
            <DropdownMenuItem onSelect={() => onUnlink(row.original.msRosterId)}>
              Unlink
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rosters}
      state={tableState}
      totalCount={rosters.length}
      onStateChange={setTableState}
      isLoading={isLoading}
      error={error}
      onRetry={onRetry}
    />
  )
}
