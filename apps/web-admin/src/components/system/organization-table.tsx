'use client'

import { useState } from 'react'
import {
  DataTable,
  Button,
  Badge,
  defaultTableState,
  type ColumnDef,
  type FutureTableState,
} from '@future/ui'
import { Building2, ChevronRight } from '@future/ui/icons'
import type { TenantStatus } from '@/lib/admin-api'

export interface TenantRow {
  id: string
  name: string
  slug: string
  status: TenantStatus
  planTier: 'starter' | 'professional' | 'enterprise'
  createdAt: Date
  updatedAt: Date
}

interface OrganizationTableProps {
  tenants: TenantRow[]
  isLoading: boolean
  onUpdateStatus: (tenantId: string, status: TenantStatus) => void
  isUpdatingStatus: boolean
}

const STATUS_VARIANT: Record<
  TenantStatus,
  'default' | 'destructive' | 'subtle' | 'info' | 'warning' | 'success'
> = {
  active: 'success',
  suspended: 'destructive',
  cancelled: 'subtle',
}

const PLAN_LABEL: Record<TenantRow['planTier'], string> = {
  starter: 'Starter',
  professional: 'Professional',
  enterprise: 'Enterprise',
}

function buildColumns(
  onUpdateStatus: (tenantId: string, status: TenantStatus) => void,
  isUpdatingStatus: boolean,
): ColumnDef<TenantRow>[] {
  return [
    {
      id: 'name',
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="font-medium">{row.original.name}</span>
          <span className="text-xs text-muted-foreground">/{row.original.slug}</span>
        </div>
      ),
    },
    {
      id: 'status',
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANT[row.original.status]}>
          {row.original.status.charAt(0).toUpperCase() + row.original.status.slice(1)}
        </Badge>
      ),
    },
    {
      id: 'planTier',
      accessorKey: 'planTier',
      header: 'Plan',
      cell: ({ row }) => <span>{PLAN_LABEL[row.original.planTier]}</span>,
    },
    {
      id: 'updatedAt',
      accessorKey: 'updatedAt',
      header: 'Last Updated',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.original.updatedAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      cell: ({ row }) => {
        const { id, status } = row.original
        return (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <a href={`/org/${id}/overview`}>
                Enter <ChevronRight className="ml-1 size-3" aria-hidden="true" />
              </a>
            </Button>
            {status === 'active' && (
              <Button
                variant="outline"
                size="sm"
                disabled={isUpdatingStatus}
                onClick={() => onUpdateStatus(id, 'suspended')}
              >
                Suspend
              </Button>
            )}
            {status === 'suspended' && (
              <Button
                variant="outline"
                size="sm"
                disabled={isUpdatingStatus}
                onClick={() => onUpdateStatus(id, 'active')}
              >
                Reactivate
              </Button>
            )}
          </div>
        )
      },
    },
  ]
}

export function OrganizationTable({
  tenants,
  isLoading,
  onUpdateStatus,
  isUpdatingStatus,
}: OrganizationTableProps) {
  const [tableState, setTableState] = useState<FutureTableState>(defaultTableState)

  const columns = buildColumns(onUpdateStatus, isUpdatingStatus)

  return (
    <DataTable
      columns={columns}
      rows={tenants}
      state={tableState}
      totalCount={tenants.length}
      onStateChange={setTableState}
      isLoading={isLoading}
    />
  )
}
