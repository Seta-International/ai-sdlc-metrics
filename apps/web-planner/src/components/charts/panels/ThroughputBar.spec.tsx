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

import { ThroughputBar } from './ThroughputBar'

function mkTrends(overrides: Partial<TaskTrends> = {}): TaskTrends {
  return {
    rangeStart: '2026-04-01',
    rangeEnd: '2026-04-19',
    series: [],
    weeklyThroughput: [],
    ...overrides,
  }
}

describe('ThroughputBar', () => {
  it('renders empty-state alert when weeklyThroughput is empty', () => {
    render(<ThroughputBar trends={mkTrends()} />)
    expect(screen.getByText('No completed tasks in this range.')).toBeInTheDocument()
    expect(screen.queryByTestId('echart-canvas')).toBeNull()
  })

  it('renders EChart with throughput option when weeklyThroughput has data', () => {
    capturedOption = undefined
    const trends = mkTrends({
      weeklyThroughput: [
        { weekStart: '2026-03-30', completedCount: 3 },
        { weekStart: '2026-04-06', completedCount: 5 },
        { weekStart: '2026-04-13', completedCount: 4 },
      ],
    })
    render(<ThroughputBar trends={trends} />)
    expect(screen.getByTestId('echart-canvas')).toBeInTheDocument()
    expect(screen.getByText('Throughput per week')).toBeInTheDocument()
    expect(capturedOption).toBeDefined()
    expect(Array.isArray(capturedOption?.['series'])).toBe(true)
  })
})
