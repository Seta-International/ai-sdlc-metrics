import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { TaskTrends } from '@future/api-client/planner'

const mockReplace = vi.fn()
let mockSearch = new URLSearchParams('')

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockSearch,
  usePathname: () => '/plans/abc/charts',
}))

let mockUseTaskTrendsReturn: {
  data: TaskTrends | undefined
  isLoading: boolean
  error: Error | null
  refetch: () => void
} = {
  data: undefined,
  isLoading: false,
  error: null,
  refetch: () => {},
}

vi.mock('@/lib/hooks/useTaskTrends', () => ({
  useTaskTrends: () => mockUseTaskTrendsReturn,
}))

vi.mock('@future/charts', () => ({
  EChart: () => <canvas data-testid="echart-canvas" />,
}))

import { TrendsSection } from './TrendsSection'

function mkTrends(overrides: Partial<TaskTrends> = {}): TaskTrends {
  return {
    rangeStart: '2026-04-01',
    rangeEnd: '2026-04-19',
    series: [],
    weeklyThroughput: [],
    ...overrides,
  }
}

describe('TrendsSection', () => {
  beforeEach(() => {
    mockReplace.mockClear()
    mockSearch = new URLSearchParams('')
    mockUseTaskTrendsReturn = {
      data: undefined,
      isLoading: false,
      error: null,
      refetch: () => {},
    }
  })

  it('returns null when enabled=false', () => {
    const { container } = render(<TrendsSection planId="abc" enabled={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders section header + RangePicker when enabled', () => {
    mockUseTaskTrendsReturn = {
      data: mkTrends({
        series: [
          { date: '2026-04-17', openCount: 5, completedCount: 0, completedInDay: 0 },
          { date: '2026-04-18', openCount: 4, completedCount: 1, completedInDay: 1 },
        ],
        weeklyThroughput: [{ weekStart: '2026-04-13', completedCount: 1 }],
      }),
      isLoading: false,
      error: null,
      refetch: () => {},
    }
    render(<TrendsSection planId="abc" enabled={true} />)
    expect(screen.getByText('Trends')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '30 days' })).toBeInTheDocument()
  })

  it('shows empty-state Alert when data has no series', () => {
    mockUseTaskTrendsReturn = {
      data: mkTrends(),
      isLoading: false,
      error: null,
      refetch: () => {},
    }
    render(<TrendsSection planId="abc" enabled={true} />)
    expect(screen.getByText(/Trend data begins on 2026-04-01/)).toBeInTheDocument()
  })

  it('renders both burndown and throughput panels when series has data', () => {
    mockUseTaskTrendsReturn = {
      data: mkTrends({
        series: [
          { date: '2026-04-17', openCount: 5, completedCount: 0, completedInDay: 0 },
          { date: '2026-04-18', openCount: 4, completedCount: 1, completedInDay: 1 },
        ],
        weeklyThroughput: [{ weekStart: '2026-04-13', completedCount: 1 }],
      }),
      isLoading: false,
      error: null,
      refetch: () => {},
    }
    render(<TrendsSection planId="abc" enabled={true} />)
    expect(screen.getByText('Burndown')).toBeInTheDocument()
    expect(screen.getByText('Throughput per week')).toBeInTheDocument()
  })
})
