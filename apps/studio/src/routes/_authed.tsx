import { RequireSession, useMe } from '@seta/identity-client'
import { AppShell } from '@seta/ui'
import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router'
import { studioNav } from '../nav/studioNav'

export const Route = createFileRoute('/_authed')({ component: AuthedLayout })

function AuthedLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  return (
    <RequireSession
      fallback={
        <div className="flex min-h-screen items-center justify-center text-ink-muted">Loading…</div>
      }
    >
      <Inner pathname={pathname} />
    </RequireSession>
  )
}

function Inner({ pathname }: { pathname: string }) {
  const { data: me } = useMe()
  if (me && !me.tenant && !me.isSuperadmin) {
    if (typeof window !== 'undefined') window.location.href = '/console/no-workspace'
    return null
  }
  return (
    <AppShell nav={studioNav()} currentPath={pathname}>
      <Outlet />
    </AppShell>
  )
}
