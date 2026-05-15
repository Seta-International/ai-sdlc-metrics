import { RequireSession, useMe } from '@seta/identity-client'
import { AppShell } from '@seta/ui'
import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router'
import { consoleNav } from '../nav/consoleNav'

export const Route = createFileRoute('/_authed')({ component: AuthedLayout })

function AuthedLayout() {
  return (
    <RequireSession
      fallback={
        <div className="flex min-h-screen items-center justify-center text-ink-muted">Loading…</div>
      }
    >
      <Inner />
    </RequireSession>
  )
}

function Inner() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const { data: me } = useMe()
  const isAdmin = me?.tenant?.isAdmin ?? false
  return (
    <AppShell nav={consoleNav(isAdmin)} currentPath={pathname}>
      <Outlet />
    </AppShell>
  )
}
