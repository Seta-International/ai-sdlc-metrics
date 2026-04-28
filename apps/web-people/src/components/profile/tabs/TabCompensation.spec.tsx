import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { TabCompensation } from './TabCompensation'
import type { ContractVersion } from '../../../lib/types'

const { mockListContracts } = vi.hoisted(() => ({
  mockListContracts: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../../lib/trpc', () => ({
  trpc: { people: { listContractVersions: { query: mockListContracts } } },
}))

vi.mock('../cards/ProfileCard', () => ({
  ProfileCard: ({
    title,
    locked,
    children,
  }: {
    title: string
    locked?: boolean
    children: React.ReactNode
  }) => (
    <div data-testid={`card-${title.toLowerCase()}`}>
      {locked && <span data-testid="locked" />}
      {children}
    </div>
  ),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const activeContract: ContractVersion = {
  id: 'cv-1',
  contractType: 'indefinite',
  status: 'active',
  startDate: '2023-07-15',
  endDate: null,
  baseSalary: 168000,
  currency: 'USD',
  signedDate: '2023-07-10',
  documentId: null,
}

describe('TabCompensation', () => {
  it('shows lock placeholder when canViewSalary is false', async () => {
    mockListContracts.mockResolvedValueOnce([activeContract])
    render(
      <TabCompensation
        employmentId="emp-1"
        canViewSalary={false}
        canCreateContract={false}
        canEdit={false}
      />,
    )
    await waitFor(() => expect(screen.getByTestId('locked')).toBeTruthy())
  })

  it('shows salary amount when canViewSalary is true', async () => {
    mockListContracts.mockResolvedValueOnce([activeContract])
    render(
      <TabCompensation
        employmentId="emp-1"
        canViewSalary={true}
        canCreateContract={false}
        canEdit={false}
      />,
    )
    await waitFor(() => expect(screen.getAllByText('168,000').length).toBeGreaterThan(0))
  })

  it('renders contract history section', async () => {
    mockListContracts.mockResolvedValueOnce([activeContract])
    render(
      <TabCompensation
        employmentId="emp-1"
        canViewSalary={false}
        canCreateContract={false}
        canEdit={false}
      />,
    )
    await waitFor(() => expect(screen.getByTestId('card-history')).toBeTruthy())
  })

  it('shows Add contract button when canCreateContract is true', async () => {
    mockListContracts.mockResolvedValueOnce([])
    render(
      <TabCompensation
        employmentId="emp-1"
        canViewSalary={false}
        canCreateContract={true}
        canEdit={false}
      />,
    )
    await waitFor(() => expect(screen.getByText('Add contract')).toBeTruthy())
  })

  it('hides Add contract button when canCreateContract is false', async () => {
    mockListContracts.mockResolvedValueOnce([])
    render(
      <TabCompensation
        employmentId="emp-1"
        canViewSalary={false}
        canCreateContract={false}
        canEdit={false}
      />,
    )
    await waitFor(() => expect(screen.queryByText('Add contract')).toBeNull())
  })
})
