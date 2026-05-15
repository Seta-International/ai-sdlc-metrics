import { Card, EmptyState } from '@seta/ui'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { CircleUser } from 'lucide-react'
import { meQueryOptions } from '../../api/queries'

export const Route = createFileRoute('/_authed/me')({
  component: MePage,
})

function MePage() {
  const { data: me } = useSuspenseQuery(meQueryOptions)
  if (!me) {
    return (
      <EmptyState
        icon={CircleUser}
        title="No session"
        description="Sign in to view your account."
      />
    )
  }
  return (
    <div className="space-y-4 p-6">
      <Card>
        <div className="space-y-2 p-6">
          <h1 className="text-2xl font-semibold text-ink">{me.user.name}</h1>
          <p className="text-ink-mute">{me.user.email}</p>
          <p className="font-mono text-xs text-ink-subtle">{me.user.id}</p>
        </div>
      </Card>
    </div>
  )
}
