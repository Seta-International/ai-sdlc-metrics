'use client'

import { useState } from 'react'
import { useQuery } from '@future/api-client'
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  DataTable,
  Input,
  Skeleton,
  defaultTableState,
  type ColumnDef,
  type FutureTableState,
} from '@future/ui'
import { AdminPageHeader } from '@/components/admin-page-header'
import { trpc } from '@/lib/trpc'

interface AuditLogPageProps {
  params: { tenantId: string }
}

interface AuditEventRow {
  id: string
  eventType: string
  module: string
  actorId: string
  subjectId: string
  createdAt: Date | string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminAuditLog = (trpc.admin as any).auditLog

const COLUMNS: ColumnDef<AuditEventRow>[] = [
  {
    id: 'eventType',
    accessorKey: 'eventType',
    header: 'Event Type',
    cell: ({ row }) => <Badge variant="subtle">{row.original.eventType}</Badge>,
  },
  {
    id: 'module',
    accessorKey: 'module',
    header: 'Module',
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.module}</span>,
  },
  {
    id: 'actorId',
    accessorKey: 'actorId',
    header: 'Actor',
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.actorId.slice(0, 8)}…</span>
    ),
  },
  {
    id: 'subjectId',
    accessorKey: 'subjectId',
    header: 'Subject',
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.subjectId.slice(0, 8)}…</span>
    ),
  },
  {
    id: 'createdAt',
    accessorKey: 'createdAt',
    header: 'Time',
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {new Date(row.original.createdAt).toLocaleString()}
      </span>
    ),
  },
]

export default function AuditLogPage({ params: { tenantId: _tenantId } }: AuditLogPageProps) {
  const [actorFilter, setActorFilter] = useState('')
  const [eventTypeFilter, setEventTypeFilter] = useState('')
  const [tableState, setTableState] = useState<FutureTableState>(defaultTableState)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'auditLog', actorFilter, eventTypeFilter],
    queryFn: () =>
      adminAuditLog.query.query({
        actorId: actorFilter || undefined,
        eventType: eventTypeFilter || undefined,
        limit: 50,
        offset: 0,
      }) as Promise<{ items: AuditEventRow[]; total: number }>,
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0

  return (
    <main className="p-8">
      <AdminPageHeader
        title="Audit Log"
        description="Review all administrative actions for this tenant."
      />

      <div className="mt-6 space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Input
            placeholder="Filter by actor ID…"
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            className="max-w-xs"
          />
          <Input
            placeholder="Filter by event type…"
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value)}
            className="max-w-xs"
          />
          <Button
            variant="outline"
            onClick={() => {
              setActorFilter('')
              setEventTypeFilter('')
            }}
          >
            Clear
          </Button>
        </div>

        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        )}

        {isError && (
          <Alert variant="destructive">
            <AlertDescription>Failed to load audit log.</AlertDescription>
          </Alert>
        )}

        {!isLoading && !isError && (
          <>
            <p className="text-sm text-muted-foreground">{total} events</p>
            <DataTable
              columns={COLUMNS}
              rows={items}
              state={tableState}
              totalCount={total}
              onStateChange={setTableState}
              isLoading={isLoading}
            />
          </>
        )}
      </div>
    </main>
  )
}
