import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RangePicker } from './RangePicker'

const mockReplace = vi.fn()
let mockSearch = new URLSearchParams('')

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockSearch,
  usePathname: () => '/plans/abc/charts',
}))

describe('RangePicker', () => {
  beforeEach(() => {
    mockReplace.mockClear()
    mockSearch = new URLSearchParams('')
    localStorage.clear()
  })

  it('defaults to "30 days" selected when trendRange is undefined in URL', () => {
    render(<RangePicker planId="abc" />)

    expect(screen.getByRole('radio', { name: '30 days' })).toHaveAttribute('data-state', 'on')
    expect(screen.getByRole('radio', { name: '7 days' })).toHaveAttribute('data-state', 'off')
    expect(screen.getByRole('radio', { name: '90 days' })).toHaveAttribute('data-state', 'off')
  })

  it('clicking "7 days" calls patch with trendRange "7d" and updates the URL', async () => {
    render(<RangePicker planId="abc" />)

    await userEvent.click(screen.getByRole('radio', { name: '7 days' }))

    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('trendRange=7d'),
      expect.any(Object),
    )
  })

  it('renders "90 days" as selected when URL contains trendRange=90d', () => {
    mockSearch = new URLSearchParams('trendRange=90d')

    render(<RangePicker planId="abc" />)

    expect(screen.getByRole('radio', { name: '90 days' })).toHaveAttribute('data-state', 'on')
    expect(screen.getByRole('radio', { name: '30 days' })).toHaveAttribute('data-state', 'off')
    expect(screen.getByRole('radio', { name: '7 days' })).toHaveAttribute('data-state', 'off')
  })
})
