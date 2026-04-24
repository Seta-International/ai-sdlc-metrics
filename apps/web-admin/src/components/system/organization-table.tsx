'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  DataTable,
  Button,
  Badge,
  Spinner,
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
  // Optional extended fields — populated when API returns them
  primaryIdp?: string | null
  verifiedDomainCount?: number | null
  enabledModuleCount?: number | null
  aiKeyConfigured?: boolean | null
  lastAdminActivityAt?: Date | null
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

function formatRelativeDate(date: Date | null | undefined): string {
  if (!date) return 'Never'
  const diffMs = Date.now() - new Date(date).getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 30) return `${diffDays}d ago`
  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) return `${diffMonths}mo ago`
  return `${Math.floor(diffMonths / 12)}y ago`
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
      id: 'primaryIdp',
      accessorKey: 'primaryIdp',
      header: 'Primary IdP',
      cell: ({ row }) => <span className="text-sm">{row.original.primaryIdp ?? 'None'}</span>,
    },
    {
      id: 'verifiedDomains',
      accessorKey: 'verifiedDomainCount',
      header: 'Verified Domains',
      cell: ({ row }) => <span className="text-sm">{row.original.verifiedDomainCount ?? 0}</span>,
    },
    {
      id: 'modules',
      accessorKey: 'enabledModuleCount',
      header: 'Modules',
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.enabledModuleCount != null ? row.original.enabledModuleCount : '—'}
        </span>
      ),
    },
    {
      id: 'aiKey',
      accessorKey: 'aiKeyConfigured',
      header: 'AI Key',
      cell: ({ row }) => {
        const configured = row.original.aiKeyConfigured
        if (configured == null) return <span className="text-sm text-muted-foreground">—</span>
        return (
          <Badge variant={configured ? 'success' : 'subtle'}>
            {configured ? 'Configured' : 'None'}
          </Badge>
        )
      },
    },
    {
      id: 'lastAdminActivity',
      accessorKey: 'lastAdminActivityAt',
      header: 'Last Admin Activity',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatRelativeDate(row.original.lastAdminActivityAt)}
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
              <Link href={`/org/${id}/overview`}>
                Enter <ChevronRight className="ml-1 size-3" aria-hidden="true" />
              </Link>
            </Button>
            {status === 'active' && (
              <Button
                variant="outline"
                size="sm"
                disabled={isUpdatingStatus}
                onClick={() => onUpdateStatus(id, 'suspended')}
              >
                {isUpdatingStatus && <Spinner className="size-4" />}
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
                {isUpdatingStatus && <Spinner className="size-4" />}
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
