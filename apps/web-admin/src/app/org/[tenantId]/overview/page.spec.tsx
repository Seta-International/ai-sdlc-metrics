import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import OrgOverviewPage from './page'
import { useQuery } from '@future/api-client'

vi.mock('@future/api-client', () => ({
  useQuery: vi.fn(),
}))

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      platform: {
        listTenants: { query: vi.fn() },
      },
    },
  },
}))

vi.mock('@/components/admin-page-header', () => ({
  AdminPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

vi.mock('@/components/system/org-context-switcher', () => ({
  OrgContextSwitcher: ({
    activeOrgName,
  }: {
    activeOrgName: string | null
    activeOrgSlug: string | null
  }) => (activeOrgName ? <div data-testid="org-context-switcher">{activeOrgName}</div> : null),
}))

vi.mock('@/lib/admin-api', () => ({
  listPlatformTenantsQueryKey: ['admin', 'platform', 'listTenants'],
}))

const mockedUseQuery = vi.mocked(useQuery)

const acmeTenant = {
  id: 'tenant-1',
  name: 'Acme Corp',
  slug: 'acme',
  status: 'active' as const,
  planTier: 'professional' as const,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-06-01'),
}

describe('<OrgOverviewPage />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders org overview heading', () => {
    mockedUseQuery.mockReturnValue({
      data: [acmeTenant],
      isLoading: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useQuery>)

    render(<OrgOverviewPage params={{ tenantId: 'tenant-1' }} />)

    expect(screen.getByRole('heading', { name: /Organization Overview/i })).toBeInTheDocument()
  })

  it('shows active org name when data loaded', () => {
    mockedUseQuery.mockReturnValue({
      data: [acmeTenant],
      isLoading: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useQuery>)

    render(<OrgOverviewPage params={{ tenantId: 'tenant-1' }} />)

    // OrgContextSwitcher shows the org name (via mocked component)
    expect(screen.getByTestId('org-context-switcher')).toHaveTextContent('Acme Corp')
    // Org name also shown in the detail heading
    expect(screen.getByRole('heading', { name: 'Acme Corp' })).toBeInTheDocument()
  })

  it('renders heading while loading', () => {
    mockedUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useQuery>)

    render(<OrgOverviewPage params={{ tenantId: 'tenant-1' }} />)

    // Header always rendered regardless of load state
    expect(screen.getByRole('heading', { name: /Organization Overview/i })).toBeInTheDocument()
  })
})
