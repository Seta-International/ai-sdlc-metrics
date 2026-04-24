import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OrganizationTable } from './organization-table'
import type { TenantRow } from './organization-table'

vi.mock('@future/ui', async () => {
  const actual = await vi.importActual<typeof import('@future/ui')>('@future/ui')
  return {
    ...actual,
    DataTable: ({ rows, isLoading }: { rows: unknown[]; isLoading?: boolean }) => (
      <div data-testid="data-table" data-loading={String(isLoading ?? false)}>
        {(rows as Array<{ id?: string }>).map((r, i) => (
          <div key={r.id ?? String(i)} data-testid="table-row">
            {JSON.stringify(r)}
          </div>
        ))}
      </div>
    ),
    Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
      <button type="button" onClick={onClick}>
        {children}
      </button>
    ),
  }
})

const tenants: TenantRow[] = [
  {
    id: 'tenant-1',
    name: 'Acme Corp',
    slug: 'acme',
    status: 'active',
    planTier: 'professional',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-06-01'),
  },
  {
    id: 'tenant-2',
    name: 'Suspended Co',
    slug: 'suspended',
    status: 'suspended',
    planTier: 'starter',
    createdAt: new Date('2025-02-01'),
    updatedAt: new Date('2025-07-01'),
  },
]

describe('<OrganizationTable />', () => {
  it('renders DataTable with tenant rows', () => {
    render(
      <OrganizationTable
        tenants={tenants}
        isLoading={false}
        onUpdateStatus={vi.fn()}
        isUpdatingStatus={false}
      />,
    )

    expect(screen.getByTestId('data-table')).toBeInTheDocument()
    expect(screen.getAllByTestId('table-row')).toHaveLength(2)
  })

  it('shows loading state when isLoading is true', () => {
    render(
      <OrganizationTable
        tenants={[]}
        isLoading={true}
        onUpdateStatus={vi.fn()}
        isUpdatingStatus={false}
      />,
    )

    const table = screen.getByTestId('data-table')
    expect(table).toHaveAttribute('data-loading', 'true')
  })

  it('does not render raw interactive HTML — uses DataTable and Button from @future/ui', () => {
    const { container } = render(
      <OrganizationTable
        tenants={tenants}
        isLoading={false}
        onUpdateStatus={vi.fn()}
        isUpdatingStatus={false}
      />,
    )

    // No raw <select> elements
    expect(container.querySelectorAll('select')).toHaveLength(0)
    // DataTable wrapper present
    expect(screen.getByTestId('data-table')).toBeInTheDocument()
  })
})
