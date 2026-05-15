import { AppShell } from '@seta/ui'
import {
  createFileRoute,
  Outlet,
  redirect,
  useParams,
  useRouterState,
} from '@tanstack/react-router'
import { meQueryOptions } from '../api/queries'
import { studioNav } from '../nav/studioNav'

export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ context, location }) => {
    try {
      const me = await context.queryClient.ensureQueryData(meQueryOptions)
      if (!me) throw redirect({ to: '/login', search: { returnTo: location.href } })
    } catch {
      throw redirect({ to: '/login', search: { returnTo: location.href } })
    }
  },
  component: AuthedLayout,
})

function AuthedLayout() {
  const params = useParams({ strict: false }) as { id?: string }
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const nav = studioNav(params.id ?? null)
  return (
    <AppShell nav={nav} currentPath={pathname}>
      <Outlet />
    </AppShell>
  )
}
