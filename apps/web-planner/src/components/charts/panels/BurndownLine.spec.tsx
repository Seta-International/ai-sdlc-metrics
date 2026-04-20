import { vi, describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { TaskTrends } from '@future/api-client/planner'

let capturedOption: Record<string, unknown> | undefined

vi.mock('@future/charts', () => ({
  EChart: ({ option }: { option: Record<string, unknown> }) => {
    capturedOption = option
    return <canvas data-testid="echart-canvas" />
  },
}))

import { BurndownLine } from './BurndownLine'

function mkTrends(overrides: Partial<TaskTrends> = {}): TaskTrends {
  return {
    rangeStart: '2026-04-01',
    rangeEnd: '2026-04-19',
    series: [],
    weeklyThroughput: [],
    ...overrides,
  }
}

describe('BurndownLine', () => {
  it('renders empty-state alert when series is empty', () => {
    render(<BurndownLine trends={mkTrends()} />)
    expect(screen.getByText('No trend data yet.')).toBeInTheDocument()
    expect(screen.queryByTestId('echart-canvas')).toBeNull()
  })

  it('renders EChart with burndown option when series has data', () => {
    capturedOption = undefined
    const trends = mkTrends({
      series: [
        { date: '2026-04-17', openCount: 10, completedCount: 0, completedInDay: 0 },
        { date: '2026-04-18', openCount: 9, completedCount: 1, completedInDay: 1 },
        { date: '2026-04-19', openCount: 8, completedCount: 2, completedInDay: 1 },
      ],
    })
    render(<BurndownLine trends={trends} />)
    expect(screen.getByTestId('echart-canvas')).toBeInTheDocument()
    expect(screen.getByText('Burndown')).toBeInTheDocument()
    expect(capturedOption).toBeDefined()
    expect(Array.isArray(capturedOption?.['series'])).toBe(true)
  })
})
