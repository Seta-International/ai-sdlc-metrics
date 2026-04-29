import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { TabActivity } from './TabActivity'

afterEach(() => {
  cleanup()
})

describe('TabActivity', () => {
  it('renders 5 mock activity events', () => {
    render(<TabActivity employmentId="emp-1" />)
    const events = document.querySelectorAll('[data-testid="activity-event"]')
    expect(events.length).toBe(5)
  })

  it('renders a disabled Load more button', () => {
    render(<TabActivity employmentId="emp-1" />)
    const btn = screen.getByText('No more events')
    expect(btn).toBeTruthy()
    // It should be a disabled button
    const button = btn.closest('button')
    expect(button?.disabled).toBe(true)
  })

  it('renders event descriptions', () => {
    render(<TabActivity employmentId="emp-1" />)
    expect(screen.getByText(/Promoted to Staff Engineer/)).toBeTruthy()
  })
})
