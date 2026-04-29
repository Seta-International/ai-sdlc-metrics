import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TabChangeRequests } from './TabChangeRequests'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('TabChangeRequests', () => {
  it('renders filter pills: Pending, Approved, Rejected, All', () => {
    render(<TabChangeRequests employmentId="emp-1" canApprove={false} />)
    expect(screen.getByText('Pending')).toBeTruthy()
    expect(screen.getByText('Approved')).toBeTruthy()
    expect(screen.getByText('Rejected')).toBeTruthy()
    expect(screen.getByText('All')).toBeTruthy()
  })

  it('renders mock change request rows', () => {
    render(<TabChangeRequests employmentId="emp-1" canApprove={false} />)
    // At least one row must be visible (from hardcoded data)
    expect(screen.getByText('Job title')).toBeTruthy()
  })

  it('shows detail panel on row click', async () => {
    render(<TabChangeRequests employmentId="emp-1" canApprove={false} />)
    const firstRow = document.querySelector('[data-testid="cr-row"]') as HTMLElement
    if (firstRow) await userEvent.click(firstRow)
    expect(screen.getByText('Request detail')).toBeTruthy()
  })

  it('shows Approve and Reject buttons when canApprove is true', () => {
    render(<TabChangeRequests employmentId="emp-1" canApprove={true} />)
    expect(screen.getByText('Approve')).toBeTruthy()
    expect(screen.getByText('Reject')).toBeTruthy()
  })

  it('hides Approve and Reject buttons when canApprove is false', () => {
    render(<TabChangeRequests employmentId="emp-1" canApprove={false} />)
    expect(screen.queryByText('Approve')).toBeNull()
    expect(screen.queryByText('Reject')).toBeNull()
  })
})
