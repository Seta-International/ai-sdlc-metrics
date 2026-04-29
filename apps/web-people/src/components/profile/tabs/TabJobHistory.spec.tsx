import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { TabJobHistory } from './TabJobHistory'

const { mockGetJobHistory } = vi.hoisted(() => ({
  mockGetJobHistory: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../../lib/trpc', () => ({
  trpc: { people: { getJobHistory: { query: mockGetJobHistory } } },
}))

vi.mock('../cards/SideCard', () => ({
  SideCard: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div data-testid={`side-card-${title.toLowerCase().replace(/\s+/g, '-')}`}>{children}</div>
  ),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const mockEvents = [
  {
    id: 'jh-1',
    eventType: 'promotion',
    effectiveDate: '2026-03-03',
    jobTitle: 'Staff Engineer',
    department: 'Engineering',
    manager: 'Mei Chen',
    reason: 'Annual review — exceeds expectations.',
    isCurrent: true,
    isFuture: false,
    before: { level: 'L5', title: 'Senior Engineer' },
    after: { level: 'L6', title: 'Staff Engineer' },
  },
  {
    id: 'jh-2',
    eventType: 'hire',
    effectiveDate: '2023-07-15',
    jobTitle: 'Engineer',
    department: 'Engineering',
    manager: 'Kai Tanaka',
    reason: 'Full-time hire.',
    isCurrent: false,
    isFuture: false,
    before: null,
    after: { title: 'Engineer' },
  },
]

describe('TabJobHistory', () => {
  it('calls people.getJobHistory with profileId', async () => {
    render(<TabJobHistory profileId="pp-1" canEdit={false} hireDate="2023-07-15" />)
    await waitFor(() => expect(mockGetJobHistory).toHaveBeenCalledWith({ profileId: 'pp-1' }))
  })

  it('shows skeleton while loading', () => {
    render(<TabJobHistory profileId="pp-1" canEdit={false} hireDate="2023-07-15" />)
    expect(document.querySelectorAll('[class*="animate-pulse"]').length).toBeGreaterThan(0)
  })

  it('renders event cards when loaded', async () => {
    mockGetJobHistory.mockResolvedValueOnce(mockEvents)
    render(<TabJobHistory profileId="pp-1" canEdit={false} hireDate="2023-07-15" />)
    await waitFor(() => expect(screen.getByText('Staff Engineer')).toBeTruthy())
  })

  it('renders promotion event type label', async () => {
    mockGetJobHistory.mockResolvedValueOnce(mockEvents)
    render(<TabJobHistory profileId="pp-1" canEdit={false} hireDate="2023-07-15" />)
    await waitFor(() => expect(screen.getByText('Promotion')).toBeTruthy())
  })

  it('renders "No job history recorded." when empty', async () => {
    mockGetJobHistory.mockResolvedValueOnce([])
    render(<TabJobHistory profileId="pp-1" canEdit={false} hireDate="2023-07-15" />)
    await waitFor(() => expect(screen.getByText('No job history recorded.')).toBeTruthy())
  })

  it('hides Add event button when canEdit is false', async () => {
    mockGetJobHistory.mockResolvedValueOnce(mockEvents)
    render(<TabJobHistory profileId="pp-1" canEdit={false} hireDate="2023-07-15" />)
    await waitFor(() => screen.getByText('Staff Engineer'))
    expect(screen.queryByText('Add event')).toBeNull()
  })

  it('shows Add event button when canEdit is true', async () => {
    mockGetJobHistory.mockResolvedValueOnce(mockEvents)
    render(<TabJobHistory profileId="pp-1" canEdit={true} hireDate="2023-07-15" />)
    await waitFor(() => expect(screen.getByText('Add event')).toBeTruthy())
  })

  it('renders Tenure side card', async () => {
    mockGetJobHistory.mockResolvedValueOnce(mockEvents)
    render(<TabJobHistory profileId="pp-1" canEdit={false} hireDate="2023-07-15" />)
    await waitFor(() => expect(screen.getByTestId('side-card-tenure')).toBeTruthy())
  })
})
