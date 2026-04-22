import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import type { MyDayTask } from '@future/api-client/planner'

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports of mocked modules
// ---------------------------------------------------------------------------

const mockUseMyDayCarryOverCandidates = vi.fn()
const mockMutateAsync = vi.fn()
const mockUseCarryOver = vi.fn()

vi.mock('../../lib/hooks/use-carry-over', () => ({
  useMyDayCarryOverCandidates: (...args: unknown[]) => mockUseMyDayCarryOverCandidates(...args),
  useCarryOver: (...args: unknown[]) => mockUseCarryOver(...args),
}))

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { CarryOverBanner } from './CarryOverBanner'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TODAY = '2026-04-20'
const YESTERDAY = '2026-04-19'

function makeMyDayTask(overrides: Partial<MyDayTask> = {}): MyDayTask {
  return {
    id: 'task-1',
    planId: 'plan-1',
    planName: 'My Plan',
    planKind: 'personal',
    bucketId: 'bucket-1',
    bucketName: 'To Do',
    bucketOrderHint: '0|a:',
    title: 'Task 1',
    progress: 'not-started',
    priority: 'medium',
    startDate: null,
    dueDate: null,
    assignees: [],
    labels: [],
    orderHint: '0|a:',
    commentCount: 0,
    checklistCount: { total: 0, completed: 0 },
    attachmentCount: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    myDay: { addedAt: '2026-04-19T00:00:00Z', completedAt: null },
    ...overrides,
  }
}

describe('CarryOverBanner', () => {
  beforeEach(() => {
    mockUseMyDayCarryOverCandidates.mockReset()
    mockUseCarryOver.mockReset()
    mockMutateAsync.mockReset()

    mockMutateAsync.mockResolvedValue({ carriedCount: 0 })
    mockUseCarryOver.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    })

    window.localStorage.clear()
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('renders "N tasks in My Day" copy when there are candidates', () => {
    mockUseMyDayCarryOverCandidates.mockReturnValue({
      data: [makeMyDayTask({ id: 't-1' }), makeMyDayTask({ id: 't-2' })],
      isLoading: false,
    })

    render(<CarryOverBanner today={TODAY} />)
    expect(
      screen.getByText(/Yesterday you had 2 tasks in My Day that weren't completed\./i),
    ).toBeInTheDocument()
  })

  it('renders nothing when there are no candidates', () => {
    mockUseMyDayCarryOverCandidates.mockReturnValue({ data: [], isLoading: false })

    const { container } = render(<CarryOverBanner today={TODAY} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when loading', () => {
    mockUseMyDayCarryOverCandidates.mockReturnValue({ data: undefined, isLoading: true })

    const { container } = render(<CarryOverBanner today={TODAY} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when dismissed in localStorage for this date', () => {
    window.localStorage.setItem(`myDay.carryOver.dismissed.${TODAY}`, '1')

    mockUseMyDayCarryOverCandidates.mockReturnValue({
      data: [makeMyDayTask({ id: 't-1' })],
      isLoading: false,
    })

    const { container } = render(<CarryOverBanner today={TODAY} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('calls mutateAsync with all task ids when "Carry over all" is clicked', async () => {
    mockUseMyDayCarryOverCandidates.mockReturnValue({
      data: [makeMyDayTask({ id: 't-1' }), makeMyDayTask({ id: 't-2' })],
      isLoading: false,
    })

    render(<CarryOverBanner today={TODAY} />)
    await userEvent.click(screen.getByRole('button', { name: /carry over all/i }))

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled())
    expect(mockMutateAsync).toHaveBeenCalledWith({
      fromDate: YESTERDAY,
      toDate: TODAY,
      taskIds: ['t-1', 't-2'],
    })
  })

  it('Dismiss sets the dismissed flag and hides the banner', async () => {
    mockUseMyDayCarryOverCandidates.mockReturnValue({
      data: [makeMyDayTask({ id: 't-1' })],
      isLoading: false,
    })

    const { container } = render(<CarryOverBanner today={TODAY} />)
    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }))

    expect(window.localStorage.getItem(`myDay.carryOver.dismissed.${TODAY}`)).toBe('1')
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('"Pick which" opens the picker dialog', async () => {
    mockUseMyDayCarryOverCandidates.mockReturnValue({
      data: [makeMyDayTask({ id: 't-1', title: 'Ship banner' })],
      isLoading: false,
    })

    render(<CarryOverBanner today={TODAY} />)
    await userEvent.click(screen.getByRole('button', { name: /pick which/i }))

    await waitFor(() => expect(screen.getByText(/carry over which tasks\?/i)).toBeInTheDocument())
    expect(screen.getByText('Ship banner')).toBeInTheDocument()
  })
})
