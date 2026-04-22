import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import type { MyDayTask } from '@future/api-client/planner'

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports of mocked modules
// ---------------------------------------------------------------------------

const mockMutateAsync = vi.fn()
const mockUseCarryOver = vi.fn()

vi.mock('../../lib/hooks/use-carry-over', () => ({
  useCarryOver: (...args: unknown[]) => mockUseCarryOver(...args),
}))

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { CarryOverPickerDialog } from './CarryOverPickerDialog'

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

describe('CarryOverPickerDialog', () => {
  beforeEach(() => {
    mockMutateAsync.mockReset()
    mockUseCarryOver.mockReset()
    mockMutateAsync.mockResolvedValue({ carriedCount: 0 })
    mockUseCarryOver.mockReturnValue({ mutateAsync: mockMutateAsync, isPending: false })
  })

  it('renders all candidates pre-selected with a correct count on the submit button', () => {
    const candidates = [
      makeMyDayTask({ id: 't-1', title: 'One' }),
      makeMyDayTask({ id: 't-2', title: 'Two' }),
    ]
    render(
      <CarryOverPickerDialog
        open
        onOpenChange={() => {}}
        candidates={candidates}
        fromDate={YESTERDAY}
        toDate={TODAY}
      />,
    )

    expect(screen.getByText('One')).toBeInTheDocument()
    expect(screen.getByText('Two')).toBeInTheDocument()

    // Pre-selected: submit reflects count = 2
    expect(screen.getByRole('button', { name: /carry over 2/i })).toBeInTheDocument()
  })

  it('unchecking a candidate excludes it from the submit payload', async () => {
    const candidates = [
      makeMyDayTask({ id: 't-1', title: 'One' }),
      makeMyDayTask({ id: 't-2', title: 'Two' }),
    ]
    render(
      <CarryOverPickerDialog
        open
        onOpenChange={() => {}}
        candidates={candidates}
        fromDate={YESTERDAY}
        toDate={TODAY}
      />,
    )

    const checkboxes = screen.getAllByRole('checkbox')
    await userEvent.click(checkboxes[0]!)

    await userEvent.click(screen.getByRole('button', { name: /carry over 1/i }))

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled())
    const args = mockMutateAsync.mock.calls[0]![0] as {
      fromDate: string
      toDate: string
      taskIds: string[]
    }
    expect(args.fromDate).toBe(YESTERDAY)
    expect(args.toDate).toBe(TODAY)
    expect(args.taskIds).toEqual(['t-2'])
  })

  it('calls onOpenChange(false) after a successful submit', async () => {
    const candidates = [makeMyDayTask({ id: 't-1', title: 'One' })]
    const onOpenChange = vi.fn()

    render(
      <CarryOverPickerDialog
        open
        onOpenChange={onOpenChange}
        candidates={candidates}
        fromDate={YESTERDAY}
        toDate={TODAY}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /carry over 1/i }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('submit is disabled when zero candidates selected', async () => {
    const candidates = [makeMyDayTask({ id: 't-1', title: 'One' })]

    render(
      <CarryOverPickerDialog
        open
        onOpenChange={() => {}}
        candidates={candidates}
        fromDate={YESTERDAY}
        toDate={TODAY}
      />,
    )

    // Uncheck the one candidate
    await userEvent.click(screen.getAllByRole('checkbox')[0]!)

    const submit = screen.getByRole('button', { name: /carry over 0/i })
    expect(submit).toBeDisabled()
  })
})
