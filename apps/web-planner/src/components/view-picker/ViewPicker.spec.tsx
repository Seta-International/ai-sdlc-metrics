import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ViewPicker } from './ViewPicker'

const mockReplace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => '/plans/abc/board',
  useSearchParams: () => new URLSearchParams('group=priority'),
}))

describe('ViewPicker', () => {
  beforeEach(() => {
    mockReplace.mockClear()
  })

  it('renders all four tabs and marks Board active', () => {
    render(
      <ViewPicker
        planId="abc"
        currentView="board"
        flags={{ views: true, grid: true, schedule: true, charts: true }}
      />,
    )
    expect(screen.getByRole('tab', { name: /board/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /grid/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /schedule/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /charts/i })).toBeInTheDocument()
  })

  it('navigates with searchParams preserved', async () => {
    render(
      <ViewPicker
        planId="abc"
        currentView="board"
        flags={{ views: true, grid: true, schedule: true, charts: true }}
      />,
    )
    await userEvent.click(screen.getByRole('tab', { name: /grid/i }))
    expect(mockReplace).toHaveBeenCalledWith('/plans/abc/grid?group=priority', { scroll: false })
  })

  it('disables a view tab whose flag is false', () => {
    render(
      <ViewPicker
        planId="abc"
        currentView="board"
        flags={{ views: true, grid: false, schedule: true, charts: true }}
      />,
    )
    expect(screen.getByRole('tab', { name: /grid/i })).toBeDisabled()
  })
})
