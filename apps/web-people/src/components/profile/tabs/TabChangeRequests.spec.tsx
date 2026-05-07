import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { TabChangeRequests } from './TabChangeRequests'
import type { ChangeRequestSummary } from '../../../lib/hooks/use-change-requests'

vi.mock('../../../lib/trpc', () => ({ trpc: {} }))

let mockItems: ChangeRequestSummary[] = []
vi.mock('../../../lib/hooks/use-change-requests', () => ({
  useChangeRequests: () => ({ items: mockItems, isLoading: false }),
  usePendingFieldPaths: () => new Set(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('TabChangeRequests', () => {
  beforeEach(() => {
    mockItems = []
  })

  it('shows empty state when no requests', () => {
    render(<TabChangeRequests employmentId="emp-1" canApprove={false} />)
    expect(screen.getByText(/no change requests/i)).toBeTruthy()
  })

  it('renders a pending request with Pending badge', () => {
    mockItems = [
      {
        id: 'cr-1',
        fieldPath: 'person_profile.preferred_name',
        batchId: 'batch-1',
        status: 'pending',
        reason: 'Post-promotion',
        reviewNote: null,
        oldValue: 'Old',
        newValue: 'New',
        createdAt: new Date('2026-05-01'),
      },
    ]
    render(<TabChangeRequests employmentId="emp-1" canApprove={false} />)
    expect(screen.getByText('Pending')).toBeTruthy()
  })

  it('shows rejection note for rejected requests', () => {
    mockItems = [
      {
        id: 'cr-2',
        fieldPath: 'person_profile.preferred_name',
        batchId: 'batch-2',
        status: 'rejected',
        reason: null,
        reviewNote: 'Not approved per policy',
        oldValue: 'Old',
        newValue: 'New',
        createdAt: new Date('2026-05-01'),
      },
    ]
    render(<TabChangeRequests employmentId="emp-1" canApprove={false} />)
    expect(screen.getByText(/not approved per policy/i)).toBeTruthy()
  })
})
