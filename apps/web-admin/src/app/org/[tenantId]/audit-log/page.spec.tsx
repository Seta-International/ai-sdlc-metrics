import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AuditLogPage from './page'
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
      auditLog: {
        query: { query: vi.fn().mockResolvedValue({ items: [], total: 0 }) },
      },
    },
  },
}))

const mockedUseQuery = vi.mocked(useQuery)

describe('<AuditLogPage />', () => {
  it('renders audit log heading', () => {
    mockedUseQuery.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useQuery>)

    render(<AuditLogPage params={{ tenantId: 'tenant-1' }} />)
    expect(screen.getByRole('heading', { name: /Audit Log/i })).toBeInTheDocument()
  })

  it('renders filter controls', () => {
    mockedUseQuery.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useQuery>)

    render(<AuditLogPage params={{ tenantId: 'tenant-1' }} />)
    const inputs = screen.getAllByPlaceholderText(/filter|search|actor|event/i)
    expect(inputs.length).toBeGreaterThan(0)
  })

  it('calls audit log query on mount', () => {
    mockedUseQuery.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useQuery>)

    render(<AuditLogPage params={{ tenantId: 'tenant-1' }} />)
    expect(mockedUseQuery).toHaveBeenCalled()
  })
})
