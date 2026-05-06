import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { TaskSearchPicker } from './TaskSearchPicker'

const tasks = [
  { id: 'tx-1', title: 'Task X' },
  { id: 'ty-2', title: 'Task Y' },
]

describe('TaskSearchPicker', () => {
  it('renders all tasks initially', () => {
    render(<TaskSearchPicker tasks={tasks} onSelect={vi.fn()} excludeId="other-id" />)
    expect(screen.getByText('Task X')).toBeInTheDocument()
    expect(screen.getByText('Task Y')).toBeInTheDocument()
  })

  it('filters tasks by search term', () => {
    render(<TaskSearchPicker tasks={tasks} onSelect={vi.fn()} excludeId="other-id" />)
    const input = screen.getByPlaceholderText(/search/i)
    fireEvent.change(input, { target: { value: 'Task X' } })
    expect(screen.getByText('Task X')).toBeInTheDocument()
    expect(screen.queryByText('Task Y')).not.toBeInTheDocument()
  })

  it('excludes the task with excludeId', () => {
    render(<TaskSearchPicker tasks={tasks} onSelect={vi.fn()} excludeId="tx-1" />)
    expect(screen.queryByText('Task X')).not.toBeInTheDocument()
    expect(screen.getByText('Task Y')).toBeInTheDocument()
  })

  it('calls onSelect when a task is clicked', () => {
    const onSelect = vi.fn()
    render(<TaskSearchPicker tasks={tasks} onSelect={onSelect} excludeId="other-id" />)
    fireEvent.click(screen.getByText('Task X'))
    expect(onSelect).toHaveBeenCalledWith('tx-1')
  })
})
