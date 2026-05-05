import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DueFilter } from './DueFilter'
import type { ViewState } from '@/lib/view-state'

const mockPatch = vi.fn()
const mockState: ViewState = {
  view: 'board',
  groupBy: 'bucket',
  filter: {
    due: undefined,
    priority: [],
    labels: [],
    buckets: [],
    assignees: [],
  },
}

vi.mock('@/lib/hooks/useViewState', () => ({
  useViewState: () => ({ state: mockState, patch: mockPatch, reset: vi.fn(), commit: vi.fn() }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockState.filter.due = undefined
})

describe('DueFilter', () => {
  it('renders all due date options', () => {
    render(<DueFilter viewStateOpts={{ planId: 'plan-1' }} />)
    expect(screen.getByLabelText('Late')).toBeInTheDocument()
    expect(screen.getByLabelText('Today')).toBeInTheDocument()
    expect(screen.getByLabelText('Tomorrow')).toBeInTheDocument()
    expect(screen.getByLabelText('This week')).toBeInTheDocument()
    expect(screen.getByLabelText('Next week')).toBeInTheDocument()
    expect(screen.getByLabelText('Future')).toBeInTheDocument()
    expect(screen.getByLabelText('No date')).toBeInTheDocument()
  })

  it('no radio is checked when filter.due is undefined', () => {
    render(<DueFilter viewStateOpts={{ planId: 'plan-1' }} />)
    const radios = screen.getAllByRole('radio')
    radios.forEach((r) => expect(r).not.toBeChecked())
  })

  it('shows current due selection when filter.due is set', () => {
    mockState.filter.due = 'today'
    render(<DueFilter viewStateOpts={{ planId: 'plan-1' }} />)
    const todayRadio = screen.getByRole('radio', { name: 'Today' }) as HTMLInputElement
    expect(todayRadio.value).toBe('today')
  })

  it('calls patch with selected due value when a radio is clicked', () => {
    render(<DueFilter viewStateOpts={{ planId: 'plan-1' }} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Tomorrow' }))
    expect(mockPatch).toHaveBeenCalledWith(
      expect.objectContaining({ filter: expect.objectContaining({ due: 'tomorrow' }) }),
    )
  })

  it('calls patch with "this-week" when "This week" radio is clicked', () => {
    render(<DueFilter viewStateOpts={{ planId: 'plan-1' }} />)
    fireEvent.click(screen.getByRole('radio', { name: 'This week' }))
    expect(mockPatch).toHaveBeenCalledWith(
      expect.objectContaining({ filter: expect.objectContaining({ due: 'this-week' }) }),
    )
  })
})
