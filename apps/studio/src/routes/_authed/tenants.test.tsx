import type { TenantSummary } from '@seta/agent-sdk'
import { SetaProvider } from '@seta/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { Suspense } from 'react'
import { describe, expect, it } from 'vitest'
import { client } from '../../api/client'
import { server } from '../../test/msw-server'
import { Route as TenantsRoute } from './tenants'

const tenantsFixture: TenantSummary[] = [
  { id: 'tnt_01', name: 'Acme Inc', role: 'admin' },
  { id: 'tnt_02', name: 'Beta Co', role: 'member' },
]

function mount(qc: QueryClient) {
  const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({
    component: () => <Outlet />,
  })
  const TenantsComponent = TenantsRoute.options.component
  if (!TenantsComponent) throw new Error('TenantsRoute missing component')
  const tenants = createRoute({
    getParentRoute: () => root,
    path: '/tenants',
    component: TenantsComponent,
    loader: TenantsRoute.options.loader,
  })
  const router = createRouter({
    routeTree: root.addChildren([tenants]),
    history: createMemoryHistory({ initialEntries: ['/tenants'] }),
    context: { queryClient: qc },
  })
  return render(
    <SetaProvider client={client} queryClient={qc}>
      <QueryClientProvider client={qc}>
        <Suspense fallback={<div>loading</div>}>
          <RouterProvider router={router} />
        </Suspense>
      </QueryClientProvider>
    </SetaProvider>,
  )
}

describe('/tenants route', () => {
  it('renders a link per tenant from /tenants', async () => {
    server.use(http.get('*/tenants', () => HttpResponse.json(tenantsFixture)))
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mount(qc)

    await waitFor(() => {
      expect(screen.getByText('Acme Inc')).toBeInTheDocument()
      expect(screen.getByText('Beta Co')).toBeInTheDocument()
    })
  })

  it('renders EmptyState when tenants list is empty', async () => {
    server.use(http.get('*/tenants', () => HttpResponse.json([])))
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mount(qc)

    await waitFor(() => {
      expect(screen.getByText(/no tenants yet/i)).toBeInTheDocument()
    })
  })
})
