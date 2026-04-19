import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import type { TaskFlat } from '@future/api-client/planner'

import { LateUpcomingList } from './LateUpcomingList'

function makeTask(overrides: Partial<TaskFlat>): TaskFlat {
  return {
    id: 'task-1',
    planId: 'plan-1',
    bucketId: 'bucket-1',
    bucketName: 'Bucket',
    bucketOrderHint: 'a',
    title: 'Task',
    progress: 'not-started',
    priority: 'medium',
    startDate: null,
    dueDate: null,
    assignees: [],
    labels: [],
    orderHint: 'a',
    commentCount: 0,
    checklistCount: { total: 0, completed: 0 },
    attachmentCount: 0,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

// Fixed reference date: 2025-06-15 UTC
const NOW = new Date('2025-06-15T00:00:00Z')

// A task that is overdue (due 2 days ago)
const lateTask = makeTask({
  id: 'late-task',
  title: 'Overdue Task',
  dueDate: '2025-06-13T00:00:00Z',
  progress: 'not-started',
})

// A task due tomorrow (within next 7 days)
const upcomingTask = makeTask({
  id: 'upcoming-task',
  title: 'Upcoming Task',
  dueDate: '2025-06-16T00:00:00Z',
  progress: 'in-progress',
})

// A completed task that should not appear even if overdue
const completedOverdue = makeTask({
  id: 'completed-late',
  title: 'Completed Overdue',
  dueDate: '2025-06-10T00:00:00Z',
  progress: 'completed',
})

// A task with no due date — should not appear in either section
const noDueDate = makeTask({
  id: 'no-due',
  title: 'No Due Date',
  dueDate: null,
  progress: 'not-started',
})

describe('LateUpcomingList', () => {
  // Mock Date so reduceLateUpcoming uses our fixed reference
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders "Late" section title when there are late tasks', () => {
    const onOpen = vi.fn()
    render(<LateUpcomingList tasks={[lateTask]} onOpen={onOpen} />)
    expect(screen.getByText('Late')).toBeDefined()
  })

  it('renders "Upcoming (next 7 days)" section title when there are upcoming tasks', () => {
    const onOpen = vi.fn()
    render(<LateUpcomingList tasks={[upcomingTask]} onOpen={onOpen} />)
    expect(screen.getByText('Upcoming (next 7 days)')).toBeDefined()
  })

  it('renders late task title', () => {
    const onOpen = vi.fn()
    render(<LateUpcomingList tasks={[lateTask]} onOpen={onOpen} />)
    expect(screen.getByText('Overdue Task')).toBeDefined()
  })

  it('renders upcoming task title', () => {
    const onOpen = vi.fn()
    render(<LateUpcomingList tasks={[upcomingTask]} onOpen={onOpen} />)
    expect(screen.getByText('Upcoming Task')).toBeDefined()
  })

  it('calls onOpen with the correct task id when a late task is clicked', () => {
    const onOpen = vi.fn()
    render(<LateUpcomingList tasks={[lateTask]} onOpen={onOpen} />)
    fireEvent.click(screen.getByText('Overdue Task'))
    expect(onOpen).toHaveBeenCalledWith('late-task')
  })

  it('calls onOpen with the correct task id when an upcoming task is clicked', () => {
    const onOpen = vi.fn()
    render(<LateUpcomingList tasks={[upcomingTask]} onOpen={onOpen} />)
    fireEvent.click(screen.getByText('Upcoming Task'))
    expect(onOpen).toHaveBeenCalledWith('upcoming-task')
  })

  it('does not render Late section when there are no late tasks', () => {
    const onOpen = vi.fn()
    render(<LateUpcomingList tasks={[upcomingTask]} onOpen={onOpen} />)
    expect(screen.queryByText('Late')).toBeNull()
  })

  it('does not render Upcoming section when there are no upcoming tasks', () => {
    const onOpen = vi.fn()
    render(<LateUpcomingList tasks={[lateTask]} onOpen={onOpen} />)
    expect(screen.queryByText('Upcoming (next 7 days)')).toBeNull()
  })

  it('excludes completed tasks from Late section', () => {
    const onOpen = vi.fn()
    render(<LateUpcomingList tasks={[completedOverdue]} onOpen={onOpen} />)
    expect(screen.queryByText('Late')).toBeNull()
    expect(screen.queryByText('Completed Overdue')).toBeNull()
  })

  it('excludes tasks with no due date', () => {
    const onOpen = vi.fn()
    render(<LateUpcomingList tasks={[noDueDate]} onOpen={onOpen} />)
    expect(screen.queryByText('Late')).toBeNull()
    expect(screen.queryByText('Upcoming (next 7 days)')).toBeNull()
  })

  it('renders both sections when both late and upcoming tasks exist', () => {
    const onOpen = vi.fn()
    render(<LateUpcomingList tasks={[lateTask, upcomingTask]} onOpen={onOpen} />)
    expect(screen.getByText('Late')).toBeDefined()
    expect(screen.getByText('Upcoming (next 7 days)')).toBeDefined()
    expect(screen.getByText('Overdue Task')).toBeDefined()
    expect(screen.getByText('Upcoming Task')).toBeDefined()
  })
})
