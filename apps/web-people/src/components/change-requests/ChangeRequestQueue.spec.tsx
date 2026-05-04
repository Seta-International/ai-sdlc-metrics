import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ChangeRequestQueue } from './ChangeRequestQueue'

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

vi.mock('../../lib/hooks/use-hr-change-requests', () => ({
  useHrChangeRequests: () => ({
    rows: [],
    stats: { pending: 0, approvedToday: 0, rejectedToday: 0, oldestDays: 0 },
    isLoading: false,
    refetch: vi.fn(),
  }),
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
})
