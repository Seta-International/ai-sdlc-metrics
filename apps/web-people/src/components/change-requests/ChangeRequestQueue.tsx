'use client'

import * as React from 'react'
import { useSession } from '@future/auth'
import type { CellContext, ColumnDef, FutureTableState } from '@future/ui'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Badge,
  Button,
  Card,
  Checkbox,
  DataTable,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  defaultTableState,
  toast,
} from '@future/ui'
import { ArrowRight, Check, X } from '@future/ui/icons'
import { AvatarNameCell } from '../AvatarNameCell'
import { useHrChangeRequests, type HrFilter } from '../../lib/hooks/use-hr-change-requests'
import { trpc } from '../../lib/trpc'
import type { ChangeRequestRow } from '../../lib/types-workflows'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

const STATUS_BADGE: Record<
  ChangeRequestRow['status'],
  { label: string; variant: 'default' | 'subtle' | 'destructive' }
> = {
  pending: { label: 'Pending', variant: 'subtle' },
  approved: { label: 'Approved', variant: 'default' },
  rejected: { label: 'Rejected', variant: 'destructive' },
  cancelled: { label: 'Cancelled', variant: 'subtle' },
}

function createColumns(
  rows: ChangeRequestRow[],
  selectedIds: string[],
  onToggleAll: (checked: boolean) => void,
  onToggleRow: (id: string, checked: boolean) => void,
  showSelection: boolean,
): ColumnDef<ChangeRequestRow>[] {
  const allSelected = rows.length > 0 && rows.every((row) => selectedIds.includes(row.id))
  const someSelected = rows.some((row) => selectedIds.includes(row.id))

  return [
    ...(showSelection
      ? [
          {
            id: 'select',
            header: () => (
              <Checkbox
                checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                onCheckedChange={(value) => onToggleAll(value === true)}
                aria-label="Select all"
              />
            ),
            cell: ({ row }: CellContext<ChangeRequestRow, unknown>) => (
              <Checkbox
                checked={selectedIds.includes(row.original.id)}
                onCheckedChange={(value) => onToggleRow(row.original.id, value === true)}
                aria-label={`Select ${row.original.employeeName}`}
              />
            ),
            enableSorting: false,
          } satisfies ColumnDef<ChangeRequestRow>,
        ]
      : []),
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
          <span className="max-w-24 truncate text-muted-foreground line-through">
            {row.original.oldValue}
          </span>
          <ArrowRight className="size-3 text-secondary-foreground/60" aria-hidden="true" />
          <span className="max-w-24 truncate text-emerald-500 font-510">
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
        const value = getValue() as string | null
        return value ? new Date(value).toLocaleDateString('en-GB') : '--'
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }: CellContext<ChangeRequestRow, unknown>) => {
        const status = getValue() as ChangeRequestRow['status']
        const config = STATUS_BADGE[status] ?? { label: status, variant: 'subtle' as const }
        return <Badge variant={config.variant}>{config.label}</Badge>
      },
    },
  ]
}

export function ChangeRequestQueue() {
  const session = useSession()
  const [activeTab, setActiveTab] = React.useState<HrFilter>('all_pending')
  const [tableState, setTableState] = React.useState<FutureTableState>(defaultTableState)
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])
  const [rejectNote, setRejectNote] = React.useState('')
  const [isMutating, setIsMutating] = React.useState(false)

  const { rows, stats, isLoading, refetch } = useHrChangeRequests(activeTab)

  React.useEffect(() => {
    setSelectedIds((current) => {
      const next = current.filter((id) => rows.some((row) => row.id === id))
      return next.length === current.length && next.every((id, index) => id === current[index])
        ? current
        : next
    })
  }, [rows])

  React.useEffect(() => {
    setSelectedIds([])
    setRejectNote('')
  }, [activeTab])

  const handleToggleAll = React.useCallback(
    (checked: boolean) => {
      setSelectedIds(checked ? rows.map((row) => row.id) : [])
    },
    [rows],
  )

  const handleToggleRow = React.useCallback((id: string, checked: boolean) => {
    setSelectedIds((current) => {
      if (checked) {
        return current.includes(id) ? current : [...current, id]
      }

      return current.filter((value) => value !== id)
    })
  }, [])

  const columns = React.useMemo(
    () =>
      createColumns(rows, selectedIds, handleToggleAll, handleToggleRow, activeTab !== 'recent'),
    [activeTab, handleToggleAll, handleToggleRow, rows, selectedIds],
  )

  async function handleBulkApprove() {
    if (!session?.tenantId || !session.actorId) {
      toast.error('Unable to approve without an active session')
      return
    }

    setIsMutating(true)
    try {
      for (const batchId of selectedIds) {
        await anyTrpc.people.batchApproveChanges.mutate({
          tenantId: session.tenantId,
          batchId,
          approvedBy: session.actorId,
        })
      }

      toast.success(`Approved ${selectedIds.length} change request(s)`)
      setSelectedIds([])
      refetch()
    } catch {
      toast.error('Failed to approve — please try again')
    } finally {
      setIsMutating(false)
    }
  }

  async function handleBulkReject() {
    if (!session?.tenantId || !session.actorId) {
      toast.error('Unable to reject without an active session')
      return
    }

    setIsMutating(true)
    try {
      for (const batchId of selectedIds) {
        await anyTrpc.people.batchRejectChanges.mutate({
          tenantId: session.tenantId,
          batchId,
          rejectedBy: session.actorId,
          note: rejectNote.trim() || undefined,
        })
      }

      toast.success(`Rejected ${selectedIds.length} change request(s)`)
      setRejectNote('')
      setSelectedIds([])
      refetch()
    } catch {
      toast.error('Failed to reject — please try again')
    } finally {
      setIsMutating(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        <Card className="border-border bg-card p-4 text-center">
          <div className="text-2xl font-510 text-foreground">{stats.pending}</div>
          <div className="text-xs text-muted-foreground">Pending</div>
        </Card>
        <Card className="border-border bg-card p-4 text-center">
          <div className="text-2xl font-510 text-emerald-500">{stats.approvedToday}</div>
          <div className="text-xs text-muted-foreground">Approved Today</div>
        </Card>
        <Card className="border-border bg-card p-4 text-center">
          <div className="text-2xl font-510 text-red-400">{stats.rejectedToday}</div>
          <div className="text-xs text-muted-foreground">Rejected Today</div>
        </Card>
        <Card className="border-border bg-card p-4 text-center">
          <div className="text-2xl font-510 text-amber-400">{stats.oldestDays}d</div>
          <div className="text-xs text-muted-foreground">Oldest Pending</div>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as HrFilter)}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="all_pending">All Pending</TabsTrigger>
            <TabsTrigger value="recent">Recently Decided</TabsTrigger>
          </TabsList>

          {activeTab === 'all_pending' && selectedIds.length > 0 ? (
            <div className="flex gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="default" size="sm" className="gap-1" disabled={isMutating}>
                    <Check className="size-4" />
                    Approve ({selectedIds.length})
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Approve Selected Changes</AlertDialogTitle>
                    <AlertDialogDescription>
                      Approve {selectedIds.length} change request(s)? This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        void handleBulkApprove()
                      }}
                    >
                      {isMutating ? <Spinner className="size-4" /> : null}
                      Approve All
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1" disabled={isMutating}>
                    <X className="size-4" />
                    Reject ({selectedIds.length})
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reject Selected Changes</AlertDialogTitle>
                    <AlertDialogDescription>
                      Reject {selectedIds.length} change request(s)? Provide a reason below.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="px-6 pb-2">
                    <Textarea
                      placeholder="Rejection reason (optional)"
                      value={rejectNote}
                      onChange={(event) => setRejectNote(event.target.value)}
                    />
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => {
                        void handleBulkReject()
                      }}
                    >
                      {isMutating ? <Spinner className="size-4" /> : null}
                      Reject All
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ) : null}
        </div>

        <TabsContent value={activeTab} className="mt-4">
          <DataTable
            columns={columns}
            rows={rows}
            state={tableState}
            totalCount={rows.length}
            onStateChange={setTableState}
            isLoading={isLoading}
            enableRowSelection={false}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
