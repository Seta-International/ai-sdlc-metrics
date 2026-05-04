import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import PlatformAdminsPage from './page'
import { useQuery, useMutation } from '@future/api-client'

vi.mock('@future/api-client', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
  })),
}))

vi.mock('@/lib/admin-api', () => ({
  listPlatformTenantsQueryKey: ['admin', 'platform', 'listTenants'],
  tenantSyncHealthQueryKey: ['planner', 'msSync', 'tenantSyncHealth'],
  listPlatformTenants: vi.fn(),
  listTenantSyncHealth: vi.fn(),
  updateTenantStatus: vi.fn(),
}))

vi.mock('@/components/system/organization-table', () => ({
  OrganizationTable: ({ tenants, isLoading }: { tenants: unknown[]; isLoading: boolean }) => (
    <div data-testid="organization-table" data-loading={String(isLoading)}>
      {(tenants as Array<{ id?: string }>).map((t, i) => (
        <div key={t.id ?? String(i)} data-testid="org-row" />
      ))}
    </div>
  ),
}))

vi.mock('@/components/admin-page-header', () => ({
  AdminPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

const mockedUseQuery = vi.mocked(useQuery)
const mockedUseMutation = vi.mocked(useMutation)

describe('<PlatformAdminsPage />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseMutation.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useMutation>)
  })

  it('renders organization table with tenant list', () => {
    mockedUseQuery.mockReturnValue({
      data: [
        {
          id: 'tenant-1',
          name: 'Acme Corp',
          slug: 'acme',
          status: 'active',
          planTier: 'professional',
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-06-01'),
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useQuery>)

    render(<PlatformAdminsPage />)

    expect(screen.getByTestId('organization-table')).toBeInTheDocument()
    expect(screen.getAllByTestId('org-row')).toHaveLength(1)
  })

  it('renders page title', () => {
    mockedUseQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useQuery>)

    render(<PlatformAdminsPage />)

    expect(screen.getByRole('heading', { name: /Platform Organizations/i })).toBeInTheDocument()
  })

  it('passes isLoading to OrganizationTable', () => {
    mockedUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useQuery>)

    render(<PlatformAdminsPage />)

    expect(screen.getByTestId('organization-table')).toHaveAttribute('data-loading', 'true')
  })

  it('does not render an org context switcher (platform admin dashboard, not impersonating)', () => {
    mockedUseQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useQuery>)

    render(<PlatformAdminsPage />)

    // The page-level platform admin list does not show org switcher
    expect(screen.queryByTestId('org-context-switcher')).toBeNull()
  })
})
