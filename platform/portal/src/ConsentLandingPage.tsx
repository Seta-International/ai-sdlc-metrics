import { Card, StatusBadge } from '@seta/ui'
import type { ReactNode } from 'react'

export interface ConsentLandingPageProps {
  tenantId: string
  connectorId: string
  ok: boolean
  error?: string
  renderBackLink: (args: { tenantId: string }) => ReactNode
  title?: string
}

export function ConsentLandingPage({
  connectorId,
  ok,
  error,
  renderBackLink,
  tenantId,
  title = 'Connector consent',
}: ConsentLandingPageProps) {
  return (
    <div className="p-6">
      <Card>
        <div className="flex flex-col gap-4 p-6">
          <h1 className="text-lg font-medium text-ink">{title}</h1>
          <div className="flex items-center gap-3">
            <StatusBadge variant={ok ? 'success' : 'error'}>
              {ok ? 'consented' : 'failed'}
            </StatusBadge>
            <span className="font-mono text-sm text-ink-mute">{connectorId}</span>
          </div>
          {!ok && error ? <p className="text-sm text-error">{error}</p> : null}
          {renderBackLink({ tenantId })}
        </div>
      </Card>
    </div>
  )
}
