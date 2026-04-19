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

import { PriorityBar } from './PriorityBar'

describe('PriorityBar', () => {
  beforeEach(() => {
    capturedOnEvents = undefined
  })

  it('renders the title', () => {
    const onDrill = vi.fn()
    render(
      <PriorityBar counts={{ urgent: 1, important: 2, medium: 3, low: 4 }} onDrill={onDrill} />,
    )
    expect(screen.getByText('By Priority')).toBeInTheDocument()
  })

  it('invokes onDrill with urgent when "Urgent" bar is clicked', () => {
    const onDrill = vi.fn()
    render(
      <PriorityBar counts={{ urgent: 5, important: 2, medium: 1, low: 0 }} onDrill={onDrill} />,
    )
    capturedOnEvents?.click?.({ name: 'Urgent' })
    expect(onDrill).toHaveBeenCalledWith({ field: 'priority', value: 'urgent' })
  })

  it('invokes onDrill with important when "Important" bar is clicked', () => {
    const onDrill = vi.fn()
    render(
      <PriorityBar counts={{ urgent: 1, important: 3, medium: 2, low: 0 }} onDrill={onDrill} />,
    )
    capturedOnEvents?.click?.({ name: 'Important' })
    expect(onDrill).toHaveBeenCalledWith({ field: 'priority', value: 'important' })
  })

  it('invokes onDrill with medium when "Medium" bar is clicked', () => {
    const onDrill = vi.fn()
    render(
      <PriorityBar counts={{ urgent: 0, important: 1, medium: 4, low: 2 }} onDrill={onDrill} />,
    )
    capturedOnEvents?.click?.({ name: 'Medium' })
    expect(onDrill).toHaveBeenCalledWith({ field: 'priority', value: 'medium' })
  })

  it('invokes onDrill with low when "Low" bar is clicked', () => {
    const onDrill = vi.fn()
    render(
      <PriorityBar counts={{ urgent: 0, important: 0, medium: 1, low: 7 }} onDrill={onDrill} />,
    )
    capturedOnEvents?.click?.({ name: 'Low' })
    expect(onDrill).toHaveBeenCalledWith({ field: 'priority', value: 'low' })
  })

  it('does not invoke onDrill for unknown bar names', () => {
    const onDrill = vi.fn()
    render(
      <PriorityBar counts={{ urgent: 1, important: 2, medium: 3, low: 4 }} onDrill={onDrill} />,
    )
    capturedOnEvents?.click?.({ name: 'Unknown' })
    expect(onDrill).not.toHaveBeenCalled()
  })
})
