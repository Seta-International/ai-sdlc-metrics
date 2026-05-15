import { meQueryOptions } from '@seta/identity-client'
import { AppShell } from '@seta/ui'
import { createFileRoute, Outlet, redirect, useRouterState } from '@tanstack/react-router'
import { superadminNav } from '../nav/consoleNav'

export const Route = createFileRoute('/_superadmin')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions)
    if (!me.isSuperadmin) throw redirect({ to: '/' })
  },
  component: SuperadminLayout,
})

function SuperadminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  return (
    <AppShell nav={superadminNav()} currentPath={pathname}>
      <Outlet />
    </AppShell>
  )
}
