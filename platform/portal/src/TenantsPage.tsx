import type { TenantSummary } from '@seta/agent-sdk'
import { type Column, DataTable, EmptyState } from '@seta/ui'
import { Building2 } from 'lucide-react'
import type { ReactNode } from 'react'

export interface TenantsPageProps {
  tenants: readonly TenantSummary[]
  /** Render the per-tenant link (each consumer chooses its own destination). */
  renderTenantLink: (tenant: TenantSummary) => ReactNode
  title?: string
  emptyTitle?: string
  emptyDescription?: string
}

export function TenantsPage({
  tenants,
  renderTenantLink,
  title = 'Tenants',
  emptyTitle = 'No tenants yet',
  emptyDescription = "You don't have access to any tenant. Ask an admin to grant access.",
}: TenantsPageProps) {
  if (tenants.length === 0) {
    return <EmptyState icon={Building2} title={emptyTitle} description={emptyDescription} />
  }

  const columns: Column<TenantSummary>[] = [
    { key: 'name', header: 'Name', cell: (t) => renderTenantLink(t) },
    { key: 'role', header: 'Role', cell: (t) => t.role },
  ]

  return (
    <div className="p-6">
      <h1 className="mb-4 text-2xl font-semibold text-ink">{title}</h1>
      <DataTable<TenantSummary> rows={tenants} columns={columns} rowKey={(t) => t.id} />
    </div>
  )
}
