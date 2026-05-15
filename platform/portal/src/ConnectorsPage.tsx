import type { ConnectorStatus, ConnectorSummary } from '@seta/agent-sdk'
import { Button, type Column, DataTable, EmptyState, StatusBadge } from '@seta/ui'
import { Plug } from 'lucide-react'

export interface ConnectorsPageProps {
  connectors: readonly ConnectorSummary[]
  onGrantConsent: (connector: ConnectorSummary) => void
  title?: string
  emptyTitle?: string
  emptyDescription?: string
}

const statusVariant = (s: ConnectorStatus) =>
  s === 'consented' ? 'success' : s === 'pending' ? 'warning' : s === 'failed' ? 'error' : 'neutral'

export function ConnectorsPage({
  connectors,
  onGrantConsent,
  title = 'Connectors',
  emptyTitle = 'No connectors',
  emptyDescription = 'No connectors are registered for this workspace.',
}: ConnectorsPageProps) {
  if (connectors.length === 0) {
    return <EmptyState icon={Plug} title={emptyTitle} description={emptyDescription} />
  }

  const columns: Column<ConnectorSummary>[] = [
    {
      key: 'name',
      header: 'Connector',
      cell: (r) => (
        <div className="flex flex-col">
          <span className="font-medium text-ink">{r.displayName}</span>
          <span className="text-xs text-ink-mute">{r.description}</span>
        </div>
      ),
    },
    {
      key: 'scopes',
      header: 'Scopes',
      cell: (r) => {
        const all = [...r.requiredScopes.application, ...r.requiredScopes.delegated]
        const head = all.slice(0, 2).join(', ')
        return (
          <span className="font-mono text-xs text-ink-mute" title={all.join('\n')}>
            {head}
            {all.length > 2 ? ` +${all.length - 2}` : ''}
          </span>
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => <StatusBadge variant={statusVariant(r.status)}>{r.status}</StatusBadge>,
    },
    {
      key: 'last',
      header: 'Last consented',
      cell: (r) => (
        <span className="text-xs text-ink-mute">
          {r.lastConsentedAt ? new Date(r.lastConsentedAt).toLocaleString() : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (r) => (
        <Button variant="primary" size="sm" onClick={() => onGrantConsent(r)}>
          {r.status === 'consented' ? 'Re-consent' : 'Grant consent'}
        </Button>
      ),
    },
  ]

  return (
    <div className="p-6">
      <h1 className="mb-4 text-2xl font-semibold text-ink">{title}</h1>
      <DataTable<ConnectorSummary> rows={connectors} columns={columns} rowKey={(r) => r.id} />
    </div>
  )
}
