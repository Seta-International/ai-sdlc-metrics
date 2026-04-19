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

import { ProgressDonut } from './ProgressDonut'

describe('ProgressDonut', () => {
  beforeEach(() => {
    capturedOnEvents = undefined
  })

  it('renders the title', () => {
    const onDrill = vi.fn()
    render(
      <ProgressDonut
        counts={{ 'not-started': 1, 'in-progress': 2, completed: 0 }}
        onDrill={onDrill}
      />,
    )
    expect(screen.getByText('By Progress')).toBeDefined()
  })

  it('invokes onDrill with not-started when "Not started" slice is clicked', () => {
    const onDrill = vi.fn()
    render(
      <ProgressDonut
        counts={{ 'not-started': 3, 'in-progress': 1, completed: 0 }}
        onDrill={onDrill}
      />,
    )
    capturedOnEvents?.click?.({ name: 'Not started' })
    expect(onDrill).toHaveBeenCalledWith({ field: 'progress', value: 'not-started' })
  })

  it('invokes onDrill with in-progress when "In progress" slice is clicked', () => {
    const onDrill = vi.fn()
    render(
      <ProgressDonut
        counts={{ 'not-started': 1, 'in-progress': 2, completed: 0 }}
        onDrill={onDrill}
      />,
    )
    capturedOnEvents?.click?.({ name: 'In progress' })
    expect(onDrill).toHaveBeenCalledWith({ field: 'progress', value: 'in-progress' })
  })

  it('invokes onDrill with completed when "Completed" slice is clicked', () => {
    const onDrill = vi.fn()
    render(
      <ProgressDonut
        counts={{ 'not-started': 0, 'in-progress': 1, completed: 5 }}
        onDrill={onDrill}
      />,
    )
    capturedOnEvents?.click?.({ name: 'Completed' })
    expect(onDrill).toHaveBeenCalledWith({ field: 'progress', value: 'completed' })
  })

  it('does not invoke onDrill for unknown slice names', () => {
    const onDrill = vi.fn()
    render(
      <ProgressDonut
        counts={{ 'not-started': 1, 'in-progress': 2, completed: 0 }}
        onDrill={onDrill}
      />,
    )
    capturedOnEvents?.click?.({ name: 'Unknown' })
    expect(onDrill).not.toHaveBeenCalled()
  })
})
