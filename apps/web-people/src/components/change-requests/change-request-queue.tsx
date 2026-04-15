// apps/web-people/src/components/change-requests/change-request-queue.tsx
'use client'

import * as React from 'react'
import type { ColumnDef, CellContext } from '@tanstack/react-table'
import {
  DataTable,
  Badge,
  Button,
  Card,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type FutureTableState,
  defaultTableState,
} from '@future/ui'
import { Check, X } from 'lucide-react'
import { AvatarNameCell } from '../avatar-name-cell'
import type { ChangeRequestRow } from '../../lib/types-workflows'
import { trpc } from '../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

const columns: ColumnDef<ChangeRequestRow>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <input
        type="checkbox"
        checked={table.getIsAllPageRowsSelected()}
        onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
        className="h-3.5 w-3.5"
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        checked={row.getIsSelected()}
        onChange={(e) => row.toggleSelected(e.target.checked)}
        className="h-3.5 w-3.5"
      />
    ),
    enableSorting: false,
  },
  {
    accessorKey: 'employeeName',
    header: 'Employee',
    enableSorting: true,
    cell: ({ row }: CellContext<ChangeRequestRow, unknown>) => (
      <AvatarNameCell fullName={row.original.employeeName} avatarUrl={row.original.avatarUrl} />
    ),
  },
  {
    accessorKey: 'fieldLabel',
    header: 'Field',
    enableSorting: true,
  },
  {
    id: 'change',
    header: 'Change',
    cell: ({ row }: CellContext<ChangeRequestRow, unknown>) => (
      <div className="flex items-center gap-1 text-xs">
        <span className="text-[#8a8f98] line-through truncate max-w-[100px]">
          {row.original.oldValue}
        </span>
        <span className="text-[#62666d]">-&gt;</span>
        <span className="text-[#10b981] font-[510] truncate max-w-[100px]">
          {row.original.newValue}
        </span>
      </div>
    ),
  },
  {
    accessorKey: 'requestedByName',
    header: 'Requested By',
  },
  {
    accessorKey: 'requestedAt',
    header: 'Date',
    enableSorting: true,
    cell: ({ getValue }: CellContext<ChangeRequestRow, unknown>) =>
      new Date(getValue() as string).toLocaleDateString('en-GB'),
  },
  {
    accessorKey: 'effectiveDate',
    header: 'Effective',
    cell: ({ getValue }: CellContext<ChangeRequestRow, unknown>) => {
      const val = getValue() as string | null
      return val ? new Date(val).toLocaleDateString('en-GB') : '--'
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }: CellContext<ChangeRequestRow, unknown>) => {
      const status = getValue() as string
      const cfg: Record<
        string,
        { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
      > = {
        pending: { label: 'Pending', variant: 'outline' },
        approved: { label: 'Approved', variant: 'default' },
        rejected: { label: 'Rejected', variant: 'destructive' },
        cancelled: { label: 'Cancelled', variant: 'secondary' },
      }
      const c = cfg[status] ?? { label: status, variant: 'secondary' as const }
      return <Badge variant={c.variant}>{c.label}</Badge>
    },
  },
]

type FilterTab = 'my_review' | 'all_pending' | 'recent'

export function ChangeRequestQueue() {
  const [activeTab, setActiveTab] = React.useState<FilterTab>('my_review')
  const [requests, setRequests] = React.useState<ChangeRequestRow[]>([])
  const [totalCount, setTotalCount] = React.useState(0)
  const [stats, setStats] = React.useState({
    pending: 0,
    approvedToday: 0,
    rejectedToday: 0,
    oldestDays: 0,
  })
  const [tableState, setTableState] = React.useState<FutureTableState>(defaultTableState)
  const [isLoading, setIsLoading] = React.useState(true)
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.changeRequests.list.query({
          filter: activeTab,
          ...tableState,
        }) as Promise<{
          requests: ChangeRequestRow[]
          totalCount: number
          stats: typeof stats
        }>)
        setRequests(result.requests)
        setTotalCount(result.totalCount)
        setStats(result.stats)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [activeTab, tableState])

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4 text-center">
          <div className="text-2xl font-[510] text-[#f7f8f8]">{stats.pending}</div>
          <div className="text-xs text-[#8a8f98]">Pending</div>
        </Card>
        <Card className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4 text-center">
          <div className="text-2xl font-[510] text-[#10b981]">{stats.approvedToday}</div>
          <div className="text-xs text-[#8a8f98]">Approved Today</div>
        </Card>
        <Card className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4 text-center">
          <div className="text-2xl font-[510] text-red-400">{stats.rejectedToday}</div>
          <div className="text-xs text-[#8a8f98]">Rejected Today</div>
        </Card>
        <Card className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4 text-center">
          <div className="text-2xl font-[510] text-amber-400">{stats.oldestDays}d</div>
          <div className="text-xs text-[#8a8f98]">Oldest Pending</div>
        </Card>
      </div>

      {/* Filter tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as FilterTab)}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="my_review">Pending My Review</TabsTrigger>
            <TabsTrigger value="all_pending">All Pending</TabsTrigger>
            <TabsTrigger value="recent">Recently Decided</TabsTrigger>
          </TabsList>

          {/* Batch actions */}
          {activeTab !== 'recent' && selectedIds.length > 0 && (
            <div className="flex gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="default" size="sm" className="gap-1">
                    <Check className="h-3.5 w-3.5" />
                    Approve ({selectedIds.length})
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Approve Selected Changes</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to approve {selectedIds.length} change request(s)?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction>Approve All</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Button variant="outline" size="sm" className="gap-1">
                <X className="h-3.5 w-3.5" />
                Reject ({selectedIds.length})
              </Button>
            </div>
          )}
        </div>

        <TabsContent value={activeTab} className="mt-4">
          <DataTable
            columns={columns}
            rows={requests}
            state={tableState}
            totalCount={totalCount}
            onStateChange={setTableState}
            isLoading={isLoading}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
