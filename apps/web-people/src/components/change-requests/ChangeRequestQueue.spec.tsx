import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChangeRequestQueue } from './ChangeRequestQueue'
import type { ChangeRequestRow } from '../../lib/types-workflows'

vi.mock('../../lib/trpc', () => ({ trpc: {} }))

vi.mock('@future/auth', () => ({
  useSession: () => ({
    actorId: '01900000-0000-7000-8000-000000000001',
    tenantId: '01900000-0000-7000-8000-000000000002',
    roles: ['hr_admin'],
    displayName: 'HR Reviewer',
    email: 'hr@example.com',
    provider: 'entra',
  }),
}))

const pendingRow: ChangeRequestRow = {
  id: 'batch-1',
  employmentId: 'emp-1',
  employeeName: 'Alice Johnson',
  avatarUrl: null,
  fieldPath: 'employment_detail.personal_phone',
  fieldLabel: 'Personal phone',
  oldValue: '0901',
  newValue: '0902',
  requestedBy: 'actor-1',
  requestedByName: 'Alice Johnson',
  requestedAt: '2026-05-05T00:00:00.000Z',
  effectiveDate: null,
  status: 'pending',
  reviewedBy: null,
  reviewedByName: null,
  reviewedAt: null,
  reviewNote: null,
  editPolicyLabel: 'HR approval',
}

const decidedRow: ChangeRequestRow = {
  ...pendingRow,
  id: 'batch-2',
  status: 'approved',
  reviewedBy: 'reviewer-1',
  reviewedByName: 'HR Reviewer',
  reviewedAt: '2026-05-05T01:00:00.000Z',
}

const mockUseHrChangeRequests = vi.fn((filter: 'all_pending' | 'recent') => ({
  rows: filter === 'all_pending' ? [pendingRow] : [decidedRow],
  stats: { pending: 1, approvedToday: 1, rejectedToday: 0, oldestDays: 0 },
  isLoading: false,
  refetch: vi.fn(),
}))

vi.mock('../../lib/hooks/use-hr-change-requests', () => ({
  useHrChangeRequests: (filter: 'all_pending' | 'recent') => mockUseHrChangeRequests(filter),
}))

afterEach(() => {
  cleanup()
})

describe('ChangeRequestQueue', () => {
  it('renders the stats bar with four cards', () => {
    render(<ChangeRequestQueue />)
    expect(screen.getByText('Pending')).toBeTruthy()
    expect(screen.getByText('Approved Today')).toBeTruthy()
    expect(screen.getByText('Rejected Today')).toBeTruthy()
    expect(screen.getByText('Oldest Pending')).toBeTruthy()
  })

  it('renders the All Pending filter tab', () => {
    render(<ChangeRequestQueue />)
    expect(screen.getByRole('tab', { name: /all pending/i })).toBeTruthy()
  })

  it('renders the Recently Decided filter tab', () => {
    render(<ChangeRequestQueue />)
    expect(screen.getByRole('tab', { name: /recently decided/i })).toBeTruthy()
  })

  it('shows only one checkbox column in the All Pending tab', () => {
    render(<ChangeRequestQueue />)
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
  })

  it('does not show any checkbox column in the Recently Decided tab', async () => {
    const user = userEvent.setup()
    render(<ChangeRequestQueue />)

    await user.click(screen.getByRole('tab', { name: /recently decided/i }))

    expect(screen.queryByRole('checkbox')).toBeNull()
  })
})
