import { useMe } from '@seta/identity-client'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/')({ component: ConsoleHome })

const APP_LABELS: Record<string, string> = {
  studio: 'Studio',
  finance: 'Finance',
  pmo: 'PMO',
  timesheet: 'Timesheet',
}

function ConsoleHome() {
  const { data: me } = useMe()
  if (!me) return null
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-semibold text-ink">{me.tenant?.name ?? 'Welcome'}</h1>
        {me.tenant && <p className="text-sm text-ink-muted">/{me.tenant.slug}</p>}
      </header>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {me.apps.map((app) => (
          <a
            key={app}
            href={`/${app}/`}
            className="rounded-lg border border-hairline bg-canvas-soft p-6 text-center shadow-card hover:bg-canvas"
          >
            <div className="text-lg font-medium text-ink">{APP_LABELS[app] ?? app}</div>
          </a>
        ))}
      </div>
    </div>
  )
}
