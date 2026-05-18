import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

type Tenant = {
  id: string
  slug: string
  displayName: string | null
  status: string
  createdAt: string
}

export const Route = createFileRoute('/_superadmin/admin/tenants')({ component: TenantsPage })

function TenantsPage() {
  const { data } = useQuery({
    queryKey: ['admin', 'tenants'],
    queryFn: async () => {
      const res = await fetch('/admin/tenants', { credentials: 'include' })
      if (!res.ok) throw new Error(`admin/tenants ${res.status}`)
      return (await res.json()) as { tenants: Tenant[] }
    },
  })

  if (!data) return <div className="p-8">Loading…</div>

  return (
    <div className="max-w-4xl p-8">
      <h1 className="mb-4 text-xl font-semibold text-ink">Tenants</h1>
      <table className="w-full text-sm">
        <thead className="text-ink-muted">
          <tr>
            <th className="p-2 text-left">Slug</th>
            <th className="p-2 text-left">Name</th>
            <th className="p-2 text-left">Status</th>
            <th className="p-2 text-left">Created</th>
          </tr>
        </thead>
        <tbody>
          {data.tenants.map((t) => (
            <tr key={t.id} className="border-t border-hairline">
              <td className="p-2 font-mono text-xs">{t.slug}</td>
              <td className="p-2">{t.displayName ?? '—'}</td>
              <td className="p-2">{t.status}</td>
              <td className="p-2 text-ink-muted">{new Date(t.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
