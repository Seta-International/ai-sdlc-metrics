'use client'

import { useState } from 'react'
import { useQuery } from '@future/api-client'
import {
  Alert,
  AlertDescription,
  Badge,
  DataTable,
  Skeleton,
  defaultTableState,
  type ColumnDef,
  type FutureTableState,
} from '@future/ui'
import { AdminPageHeader } from '@/components/admin-page-header'
import { trpc } from '@/lib/trpc'

interface RolesPageProps {
  params: { tenantId: string }
}

interface RoleSummary {
  roleKey: string
  displayName: string
  permissionCount: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminRoles = (trpc.admin as any).roles

const COLUMNS: ColumnDef<RoleSummary>[] = [
  {
    id: 'roleKey',
    accessorKey: 'roleKey',
    header: 'Role',
    cell: ({ row }) => (
      <div>
        <span className="font-medium">{row.original.displayName ?? row.original.roleKey}</span>
        <span className="ml-2 font-mono text-xs text-muted-foreground">{row.original.roleKey}</span>
      </div>
    ),
  },
  {
    id: 'permissionCount',
    accessorKey: 'permissionCount',
    header: 'Permissions',
    cell: ({ row }) => (
      <Badge variant="subtle">{row.original.permissionCount ?? 0} permissions</Badge>
    ),
  },
]

export default function RolesPage({ params: { tenantId: _tenantId } }: RolesPageProps) {
  const [tableState, setTableState] = useState<FutureTableState>(defaultTableState)

  const {
    data: roles,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['admin', 'roles', 'list'],
    queryFn: () => adminRoles.list.query({}) as Promise<RoleSummary[]>,
  })

  return (
    <main className="p-8">
      <AdminPageHeader
        title="Role Permissions"
        description="View and manage permissions granted to each role within this tenant."
      />

      <div className="mt-6">
        {isError && (
          <Alert variant="destructive">
            <AlertDescription>Failed to load roles.</AlertDescription>
          </Alert>
        )}

        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {!isLoading && !isError && (
          <DataTable
            columns={COLUMNS}
            rows={roles ?? []}
            state={tableState}
            totalCount={roles?.length ?? 0}
            onStateChange={setTableState}
            isLoading={isLoading}
          />
        )}
      </div>
    </main>
  )
}
