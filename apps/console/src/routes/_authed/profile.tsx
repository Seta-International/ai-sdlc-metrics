import { useMe } from '@seta/identity-client'
import { Button } from '@seta/ui'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/profile')({ component: ProfilePage })

function ProfilePage() {
  const { data: me } = useMe()
  if (!me) return null

  async function onLogout() {
    await fetch('/sso/logout', { method: 'POST', credentials: 'include' })
    window.location.href = '/console/login'
  }

  return (
    <div className="max-w-md space-y-6 p-8">
      <h1 className="text-xl font-semibold text-ink">Profile</h1>
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-ink-muted">Name</dt>
          <dd className="text-ink">{me.user.name}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Email</dt>
          <dd className="text-ink">{me.user.email}</dd>
        </div>
      </dl>
      <Button onClick={onLogout} variant="secondary">
        Sign out
      </Button>
    </div>
  )
}
