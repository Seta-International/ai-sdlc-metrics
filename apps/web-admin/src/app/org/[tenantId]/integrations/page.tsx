'use client'

import { Badge } from '@future/ui'
import { AdminPageHeader } from '@/components/admin-page-header'

interface IntegrationsPageProps {
  params: { tenantId: string }
}

const IDP_INTEGRATIONS = [
  {
    id: 'microsoft-entra',
    name: 'Microsoft Entra ID',
    description: 'SSO and directory sync via Microsoft Entra (formerly Azure AD)',
    status: 'Not configured' as const,
    secretLastFour: null as string | null,
  },
  {
    id: 'google-workspace',
    name: 'Google Workspace',
    description: 'SSO and directory sync via Google Workspace',
    status: 'Not configured' as const,
    secretLastFour: null as string | null,
  },
]

export default function IntegrationsPage({
  params: { tenantId: _tenantId },
}: IntegrationsPageProps) {
  return (
    <main className="p-8">
      <AdminPageHeader
        title="Integrations"
        description="Manage identity provider connections and third-party integrations."
      />

      <div className="mt-8 space-y-6">
        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Identity Provider
          </h2>
          <div className="divide-y rounded-lg border">
            {IDP_INTEGRATIONS.map((idp) => (
              <div key={idp.id} className="flex items-center justify-between px-4 py-4">
                <div>
                  <p className="font-medium">{idp.name}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{idp.description}</p>
                  {idp.secretLastFour && (
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      Client secret: <span className="select-none">••••{idp.secretLastFour}</span>
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge
                    variant={
                      idp.status === 'Not configured'
                        ? 'subtle'
                        : idp.status === 'active'
                          ? 'success'
                          : 'destructive'
                    }
                  >
                    {idp.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Configure IdP via{' '}
            <a href="/integrations/microsoft" className="underline underline-offset-2">
              Microsoft Entra
            </a>{' '}
            settings. Secrets are stored in AWS Secrets Manager — only the last{' '}
            <span className="font-mono">••••</span> 4 characters are shown.
          </p>
        </section>
      </div>
    </main>
  )
}
