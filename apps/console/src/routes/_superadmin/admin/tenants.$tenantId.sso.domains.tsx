import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { getSsoTenant, upsertSsoTenant } from '../../../api/sso-admin'
import { SsoDomainsTable } from '../../../pages/admin/SsoDomainsTable'

export const Route = createFileRoute('/_superadmin/admin/tenants/$tenantId/sso/domains')({
  component: SsoDomainsPage,
})

function SsoDomainsPage() {
  const { tenantId } = Route.useParams()
  const qc = useQueryClient()

  const q = useQuery({
    queryKey: ['admin', 'sso', tenantId],
    queryFn: () => getSsoTenant(tenantId),
    retry: false,
  })

  const m = useMutation({
    mutationFn: (domains: string[]) => {
      if (!q.data) throw new Error('config not loaded')
      return upsertSsoTenant(tenantId, {
        provider: 'entra',
        config: q.data.config,
        domains,
        enabled: q.data.enabled,
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'sso', tenantId] }),
  })

  if (q.isLoading) return <p className="p-6">Loading…</p>
  if (!q.data) return <p className="p-6">Configure SSO before adding domains.</p>

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-2 text-[14px]">
        <Link
          to="/admin/tenants/$tenantId/sso"
          params={{ tenantId }}
          className="text-ink-mute hover:text-ink"
        >
          ← SSO settings
        </Link>
        <span className="text-ink-mute">·</span>
        <span>Email domains</span>
      </div>
      <SsoDomainsTable
        domains={q.data.domains}
        onChange={async (next) => {
          await m.mutateAsync(next)
        }}
      />
    </div>
  )
}
