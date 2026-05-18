import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { getMailerConfig, upsertMailerConfig } from '../../../api/mailer-admin'
import { MailerConfigForm } from '../../../pages/admin/MailerConfigForm'

export const Route = createFileRoute('/_superadmin/admin/tenants/$tenantId/mailer')({
  component: MailerSettingsPage,
})

function MailerSettingsPage() {
  const { tenantId } = Route.useParams()
  const qc = useQueryClient()

  const detailQ = useQuery({
    queryKey: ['admin', 'mailer', tenantId],
    queryFn: () => getMailerConfig(tenantId).catch(() => null),
    retry: false,
  })

  const upsertM = useMutation({
    mutationFn: (input: Parameters<typeof upsertMailerConfig>[1]) =>
      upsertMailerConfig(tenantId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'mailer', tenantId] }),
  })

  if (detailQ.isLoading) return <p className="p-6">Loading…</p>
  const detail = detailQ.data ?? undefined

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
        <span>Mailer configuration</span>
      </div>
      {detail ? null : (
        <p className="text-[13px] text-ink-mute">
          No mailer configured for this tenant — save below to enable. The platform connector Entra
          app must have admin-consented <code>Mail.Send</code> in the customer's M365 directory.
        </p>
      )}
      <MailerConfigForm
        {...(detail ? { detail } : {})}
        onSave={async (input) => {
          await upsertM.mutateAsync(input)
        }}
      />
    </div>
  )
}
