import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { KindBadge, formatRelativeTime } from './conflict-row'

describe('KindBadge', () => {
  it('renders "Field overwrite" for field_lww', () => {
    render(<KindBadge kind="field_lww" />)
    expect(screen.getByText('Field overwrite')).toBeInTheDocument()
  })

  it('renders "Push retry exhausted" for push_412_exhausted', () => {
    render(<KindBadge kind="push_412_exhausted" />)
    expect(screen.getByText('Push retry exhausted')).toBeInTheDocument()
  })

  it('renders "Quota limit" for push_403_quota', () => {
    render(<KindBadge kind="push_403_quota" />)
    expect(screen.getByText('Quota limit')).toBeInTheDocument()
  })

  it('renders "Push failed" for push_failed', () => {
    render(<KindBadge kind="push_failed" />)
    expect(screen.getByText('Push failed')).toBeInTheDocument()
  })

  it('renders "Assignee pending" for pull_unresolved_assignee', () => {
    render(<KindBadge kind="pull_unresolved_assignee" />)
    expect(screen.getByText('Assignee pending')).toBeInTheDocument()
  })

  it('renders "Credential invalid" for credential_invalidated', () => {
    render(<KindBadge kind="credential_invalidated" />)
    expect(screen.getByText('Credential invalid')).toBeInTheDocument()
  })

  it('renders "Attachment upload failed" for attachment_upload_failed', () => {
    render(<KindBadge kind="attachment_upload_failed" />)
    expect(screen.getByText('Attachment upload failed')).toBeInTheDocument()
  })

  it('renders the raw kind for an unknown kind', () => {
    render(<KindBadge kind="unknown_kind_xyz" />)
    expect(screen.getByText('unknown_kind_xyz')).toBeInTheDocument()
  })
})

describe('formatRelativeTime', () => {
  it('returns "just now" for very recent timestamps', () => {
    const now = new Date().toISOString()
    expect(formatRelativeTime(now)).toBe('just now')
  })

  it('returns minutes ago for timestamps within an hour', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    expect(formatRelativeTime(fiveMinutesAgo)).toBe('5 minutes ago')
  })

  it('returns hours ago for timestamps within a day', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
    expect(formatRelativeTime(threeHoursAgo)).toBe('3 hours ago')
  })

  it('returns days ago for timestamps within a month', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    expect(formatRelativeTime(twoDaysAgo)).toBe('2 days ago')
  })

  it('returns "1 minute ago" for singular', () => {
    const oneMinuteAgo = new Date(Date.now() - 61 * 1000).toISOString()
    expect(formatRelativeTime(oneMinuteAgo)).toBe('1 minute ago')
  })

  it('returns "2 months ago" for timestamp 65 days ago', () => {
    const sixtyFiveDaysAgo = new Date(Date.now() - 65 * 24 * 60 * 60 * 1000).toISOString()
    expect(formatRelativeTime(sixtyFiveDaysAgo)).toBe('2 months ago')
  })

  it('returns "2 years ago" for timestamp 2 years ago', () => {
    const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString()
    expect(formatRelativeTime(twoYearsAgo)).toBe('2 years ago')
  })
})
