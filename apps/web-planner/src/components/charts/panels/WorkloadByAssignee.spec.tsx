import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

let capturedOnEvents: Record<string, (params: unknown) => void> | undefined

vi.mock('@future/charts', () => ({
  EChart: ({ onEvents }: any) => {
    capturedOnEvents = onEvents
    return <canvas data-testid="echart-canvas" />
  },
}))

import { WorkloadByAssignee } from './WorkloadByAssignee'
import type { WorkloadRow } from '@/lib/charts-data'

const rows: WorkloadRow[] = [
  {
    actorId: 'actor-1',
    displayName: 'Alice',
    avatarUrl: null,
    total: 5,
    perPriority: { urgent: 2, important: 1, medium: 1, low: 1 },
  },
  {
    actorId: 'actor-2',
    displayName: 'Bob',
    avatarUrl: null,
    total: 3,
    perPriority: { urgent: 0, important: 2, medium: 1, low: 0 },
  },
]

describe('WorkloadByAssignee', () => {
  beforeEach(() => {
    capturedOnEvents = undefined
  })

  it('renders the title', () => {
    const onDrill = vi.fn()
    render(<WorkloadByAssignee rows={rows} onDrill={onDrill} />)
    expect(screen.getByText('Workload by Assignee')).toBeDefined()
  })

  it('invokes onDrill with assigneeId and priority when a stacked bar segment is clicked', () => {
    const onDrill = vi.fn()
    render(<WorkloadByAssignee rows={rows} onDrill={onDrill} />)
    capturedOnEvents?.click?.({ name: 'Alice', seriesName: 'Urgent' })
    expect(onDrill).toHaveBeenCalledWith({
      field: 'workload',
      assigneeId: 'actor-1',
      priority: 'urgent',
    })
  })

  it('resolves correct actorId for second assignee', () => {
    const onDrill = vi.fn()
    render(<WorkloadByAssignee rows={rows} onDrill={onDrill} />)
    capturedOnEvents?.click?.({ name: 'Bob', seriesName: 'Important' })
    expect(onDrill).toHaveBeenCalledWith({
      field: 'workload',
      assigneeId: 'actor-2',
      priority: 'important',
    })
  })

  it('maps all priority series names correctly', () => {
    const onDrill = vi.fn()
    render(<WorkloadByAssignee rows={rows} onDrill={onDrill} />)

    capturedOnEvents?.click?.({ name: 'Alice', seriesName: 'Medium' })
    expect(onDrill).toHaveBeenCalledWith({
      field: 'workload',
      assigneeId: 'actor-1',
      priority: 'medium',
    })

    capturedOnEvents?.click?.({ name: 'Alice', seriesName: 'Low' })
    expect(onDrill).toHaveBeenCalledWith({
      field: 'workload',
      assigneeId: 'actor-1',
      priority: 'low',
    })
  })

  it('does not invoke onDrill for unknown series or assignee', () => {
    const onDrill = vi.fn()
    render(<WorkloadByAssignee rows={rows} onDrill={onDrill} />)
    capturedOnEvents?.click?.({ name: 'Unknown', seriesName: 'Urgent' })
    expect(onDrill).not.toHaveBeenCalled()

    capturedOnEvents?.click?.({ name: 'Alice', seriesName: 'UnknownPriority' })
    expect(onDrill).not.toHaveBeenCalled()
  })
})
