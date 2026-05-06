import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { SprintPicker } from './SprintPicker'

const sprints = [
  { id: 'sprint-1', name: 'Sprint 1', startDate: '2026-06-01', endDate: '2026-06-14' },
  { id: 'sprint-2', name: 'Sprint 2', startDate: '2026-06-15', endDate: '2026-06-28' },
]

describe('SprintPicker', () => {
  it('renders sprint options', () => {
    const onSelect = vi.fn()
    render(<SprintPicker sprints={sprints} onSelect={onSelect} />)

    expect(screen.getByTestId('sprint-option-sprint-1')).toBeDefined()
    expect(screen.getByTestId('sprint-option-sprint-2')).toBeDefined()
    expect(screen.getByText('Sprint 1')).toBeDefined()
    expect(screen.getByText('Sprint 2')).toBeDefined()
  })

  it('calls onSelect with sprint id when sprint option is clicked', () => {
    const onSelect = vi.fn()
    render(<SprintPicker sprints={sprints} onSelect={onSelect} />)

    fireEvent.click(screen.getByTestId('sprint-option-sprint-1'))
    expect(onSelect).toHaveBeenCalledWith('sprint-1')
  })

  it('shows Clear button when a sprint is currently assigned', () => {
    const onSelect = vi.fn()
    const onClear = vi.fn()
    render(
      <SprintPicker
        sprints={sprints}
        currentSprintId="sprint-1"
        onSelect={onSelect}
        onClear={onClear}
      />,
    )

    expect(screen.getByTestId('sprint-clear')).toBeDefined()
    fireEvent.click(screen.getByTestId('sprint-clear'))
    expect(onClear).toHaveBeenCalled()
  })
})
