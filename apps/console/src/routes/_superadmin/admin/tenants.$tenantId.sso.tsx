import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { getSsoTenant, testSsoTenant, upsertSsoTenant } from '../../../api/sso-admin'
import { SsoConfigForm } from '../../../pages/admin/SsoConfigForm'

const REDIRECT_URI_SUFFIX = '/sso/callback/entra'

export const Route = createFileRoute('/_superadmin/admin/tenants/$tenantId/sso')({
  component: SsoSettingsPage,
})

function SsoSettingsPage() {
  const { tenantId } = Route.useParams()
  const qc = useQueryClient()
  const [testResult, setTestResult] = useState<string | null>(null)

  const detailQ = useQuery({
    queryKey: ['admin', 'sso', tenantId],
    queryFn: () => getSsoTenant(tenantId),
    retry: false,
  })

  const upsertM = useMutation({
    mutationFn: (input: Parameters<typeof upsertSsoTenant>[1]) => upsertSsoTenant(tenantId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'sso', tenantId] }),
  })

  const testM = useMutation({
    mutationFn: () => testSsoTenant(tenantId),
    onSuccess: (r) => {
      setTestResult(`${r.result}${r.message ? `: ${r.message}` : ''}`)
      qc.invalidateQueries({ queryKey: ['admin', 'sso', tenantId] })
    },
    onError: (err: unknown) => {
      setTestResult(`failed: ${(err as Error).message}`)
    },
  })

  if (detailQ.isLoading) return <p className="p-6">Loading…</p>
  const detail = detailQ.data

  const redirectUri =
    typeof window !== 'undefined' ? `${window.location.origin}${REDIRECT_URI_SUFFIX}` : undefined

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-2 text-[14px]">
        <Link to="/admin/tenants" className="text-ink-mute hover:text-ink">
          ← Tenants
        </Link>
        <span className="text-ink-mute">·</span>
        <span>SSO configuration</span>
      </div>
      {detail ? (
        <Link
          to="/admin/tenants/$tenantId/sso/domains"
          params={{ tenantId }}
          className="inline-block text-[14px] text-primary hover:underline"
        >
          Manage email domains →
        </Link>
      ) : (
        <p className="text-[13px] text-ink-mute">
          No SSO configured yet — save credentials below to enable.
        </p>
      )}
      <SsoConfigForm
        {...(detail ? { detail } : {})}
        {...(redirectUri ? { redirectUri } : {})}
        onSave={async (input) => {
          await upsertM.mutateAsync({ ...input, domains: detail?.domains ?? [] })
        }}
        onTest={async () => {
          await testM.mutateAsync()
        }}
      />
      {testResult ? <p className="text-[13px] text-ink-mute">Test result: {testResult}</p> : null}
    </div>
  )
}
