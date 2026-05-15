import { AppShell } from '@seta/ui'
import { useSuspenseQuery } from '@tanstack/react-query'
import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
  useParams,
  useRouterState,
} from '@tanstack/react-router'
import { meQueryOptions, tenantsQueryOptions } from '../api/queries'
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
  loader: ({ context }) => context.queryClient.ensureQueryData(tenantsQueryOptions),
  component: AuthedLayout,
})

function AuthedLayout() {
  const params = useParams({ strict: false }) as { id?: string }
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const navigate = useNavigate()
  const { data: tenants } = useSuspenseQuery(tenantsQueryOptions)
  const currentTenantId = params.id ?? tenants[0]?.id ?? null
  const nav = studioNav(currentTenantId)

  const switchTo = (nextId: string) => {
    // Preserve sub-path under /tenants/:id/* when present; otherwise land on connectors.
    const match = pathname.match(/^\/tenants\/[^/]+(\/.*)?$/)
    const suffix = match?.[1] ?? '/connectors'
    // biome-ignore lint/suspicious/noExplicitAny: TanStack Router union narrowing — `to` is a discriminated string template that the type-checker can't track once built from `${suffix}`.
    navigate({ to: `/tenants/$id${suffix}` as any, params: { id: nextId } } as any)
  }

  const tenantSwitcher =
    currentTenantId && tenants.length > 0
      ? {
          tenants,
          currentTenantId,
          onTenantSelect: switchTo,
        }
      : {}

  return (
    <AppShell nav={nav} currentPath={pathname} {...tenantSwitcher}>
      <Outlet />
    </AppShell>
  )
}
