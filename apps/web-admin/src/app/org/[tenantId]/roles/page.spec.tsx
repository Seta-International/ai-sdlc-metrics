import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import RolesPage from './page'
import { useQuery } from '@future/api-client'

vi.mock('@future/api-client', () => ({
  useQuery: vi.fn(),
}))

vi.mock('@/components/admin-page-header', () => ({
  AdminPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      roles: {
        list: { query: vi.fn().mockResolvedValue([]) },
      },
    },
  },
}))

const mockedUseQuery = vi.mocked(useQuery)

describe('<RolesPage />', () => {
  it('renders roles heading', () => {
    mockedUseQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useQuery>)

    render(<RolesPage params={{ tenantId: 'tenant-1' }} />)
    expect(screen.getByRole('heading', { name: /Role Permissions/i })).toBeInTheDocument()
  })

  it('calls admin.roles router (uses useQuery)', () => {
    mockedUseQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useQuery>)

    render(<RolesPage params={{ tenantId: 'tenant-1' }} />)
    expect(mockedUseQuery).toHaveBeenCalled()
  })

  it('shows loading state', () => {
    mockedUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useQuery>)

    render(<RolesPage params={{ tenantId: 'tenant-1' }} />)
    expect(screen.getByText(/Loading/i)).toBeInTheDocument()
  })
})
