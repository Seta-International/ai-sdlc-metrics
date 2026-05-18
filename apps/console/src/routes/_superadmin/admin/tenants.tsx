import { type Column, DataTable, EmptyState } from '@seta/ui'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Building2 } from 'lucide-react'

type Tenant = {
  id: string
  slug: string
  displayName: string | null
  status: string
  createdAt: string
}

export const Route = createFileRoute('/_superadmin/admin/tenants')({ component: TenantsPage })

const columns: Column<Tenant>[] = [
  {
    key: 'slug',
    header: 'Slug',
    cell: (t) => <span className="font-mono text-xs">{t.slug}</span>,
    sortable: true,
    compare: (a, b) => a.slug.localeCompare(b.slug),
  },
  {
    key: 'displayName',
    header: 'Name',
    cell: (t) => t.displayName ?? '—',
    sortable: true,
    compare: (a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? ''),
  },
  {
    key: 'status',
    header: 'Status',
    cell: (t) => t.status,
    sortable: true,
    compare: (a, b) => a.status.localeCompare(b.status),
  },
  {
    key: 'createdAt',
    header: 'Created',
    cell: (t) => (
      <span className="text-ink-mute">{new Date(t.createdAt).toLocaleDateString()}</span>
    ),
    sortable: true,
    compare: (a, b) => a.createdAt.localeCompare(b.createdAt),
  },
  {
    key: 'sso',
    header: 'SSO',
    cell: (t) => (
      <Link
        to="/admin/tenants/$tenantId/sso"
        params={{ tenantId: t.id }}
        className="text-primary hover:underline"
      >
        Configure
      </Link>
    ),
  },
]

function TenantsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'tenants'],
    queryFn: async () => {
      const res = await fetch('/admin/tenants', { credentials: 'include' })
      if (!res.ok) throw new Error(`admin/tenants ${res.status}`)
      return (await res.json()) as { tenants: Tenant[] }
    },
  })

  if (isLoading) return <div className="p-8">Loading…</div>

  const rows = data?.tenants ?? []

  return (
    <div className="max-w-4xl space-y-4 p-8">
      <h1 className="text-xl font-semibold text-ink">Tenants</h1>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(t) => t.id}
        empty={
          <EmptyState icon={Building2} title="No tenants" description="Tenants will appear here." />
        }
      />
    </div>
  )
}
