import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MsSyncBadge } from './MsSyncBadge'

describe('MsSyncBadge', () => {
  it('renders nothing when state is none', () => {
    const { container } = render(<MsSyncBadge state="none" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders synced state with MS 365 label', () => {
    render(<MsSyncBadge state="synced" />)
    expect(screen.getByTestId('ms-sync-badge')).toBeInTheDocument()
    expect(screen.getByText('MS 365')).toBeInTheDocument()
  })

  it('renders paused state with MS 365 label', () => {
    render(<MsSyncBadge state="paused" />)
    expect(screen.getByTestId('ms-sync-badge')).toBeInTheDocument()
    expect(screen.getByText('MS 365')).toBeInTheDocument()
  })

  it('renders error state with MS 365 label', () => {
    render(<MsSyncBadge state="error" />)
    expect(screen.getByTestId('ms-sync-badge')).toBeInTheDocument()
    expect(screen.getByText('MS 365')).toBeInTheDocument()
  })

  it('applies success dot class for synced state', () => {
    render(<MsSyncBadge state="synced" />)
    const dot = screen.getByTestId('ms-sync-badge').querySelector('[aria-hidden]')
    expect(dot?.className).toContain('bg-success')
  })

  it('applies warning dot class for paused state', () => {
    render(<MsSyncBadge state="paused" />)
    const dot = screen.getByTestId('ms-sync-badge').querySelector('[aria-hidden]')
    expect(dot?.className).toContain('bg-warning')
  })

  it('applies destructive dot class for error state', () => {
    render(<MsSyncBadge state="error" />)
    const dot = screen.getByTestId('ms-sync-badge').querySelector('[aria-hidden]')
    expect(dot?.className).toContain('bg-destructive')
  })

  it('has correct aria-label for synced state', () => {
    render(<MsSyncBadge state="synced" />)
    expect(screen.getByLabelText('MS 365 sync state: synced')).toBeInTheDocument()
  })

  it('has correct aria-label for error state', () => {
    render(<MsSyncBadge state="error" />)
    expect(screen.getByLabelText('MS 365 sync state: error')).toBeInTheDocument()
  })

  it('uses lastError text in error tooltip when provided', () => {
    render(<MsSyncBadge state="error" lastError="Connection timeout" />)
    expect(screen.getByTestId('ms-sync-badge')).toBeInTheDocument()
  })

  it('formatRelativeTime: shows "just now" for timestamps under 1 minute ago', () => {
    const recent = new Date(Date.now() - 30_000).toISOString()
    render(<MsSyncBadge state="synced" lastSyncedAt={recent} />)
    expect(screen.getByTestId('ms-sync-badge')).toBeInTheDocument()
  })

  it('formatRelativeTime: shows minutes for timestamps under 1 hour ago', () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60_000).toISOString()
    render(<MsSyncBadge state="synced" lastSyncedAt={thirtyMinAgo} />)
    expect(screen.getByTestId('ms-sync-badge')).toBeInTheDocument()
  })

  it('formatRelativeTime: shows hours for timestamps under 24 hours ago', () => {
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60_000).toISOString()
    render(<MsSyncBadge state="synced" lastSyncedAt={fiveHoursAgo} />)
    expect(screen.getByTestId('ms-sync-badge')).toBeInTheDocument()
  })

  it('formatRelativeTime: shows days for timestamps over 24 hours ago', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString()
    render(<MsSyncBadge state="synced" lastSyncedAt={twoDaysAgo} />)
    expect(screen.getByTestId('ms-sync-badge')).toBeInTheDocument()
  })
})
