import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { LabelPicker } from './LabelPicker'
import type { BoardSnapshot, BoardTaskSnapshot } from '../../lib/board-types'

vi.mock('../../lib/trpc', () => ({
  trpc: {
    planner: {
      tasks: {
        applyLabel: { mutate: vi.fn() },
        removeLabel: { mutate: vi.fn() },
      },
    },
  },
}))

import { trpc } from '../../lib/trpc'
const mockApply = vi.mocked(
  (trpc.planner.tasks.applyLabel as { mutate: ReturnType<typeof vi.fn> }).mutate,
)
const mockRemove = vi.mocked(
  (trpc.planner.tasks.removeLabel as { mutate: ReturnType<typeof vi.fn> }).mutate,
)

const BASE_DATE = new Date('2026-01-01T00:00:00Z')
const QUERY_KEY = ['tasks.getBoard', 'plan-1', 'actor-1', 'tenant-1'] as const

function makeTask(overrides: Partial<BoardTaskSnapshot> = {}): BoardTaskSnapshot {
  return {
    id: 'task-1',
    title: 'Test Task',
    description: '',
    progress: 0,
    priority: 3,
    startDate: null,
    dueDate: null,
    orderHint: 'a0',
    completedAt: null,
    completedBy: null,
    checklistItemCount: 0,
    checklistCheckedCount: 0,
    attachmentCount: 0,
    commentCount: 0,
    evidenceCount: 0,
    coverAttachmentId: null,
    appliedLabels: [],
    assignees: [],
    updatedAt: BASE_DATE,
    ...overrides,
  }
}

function makeSnapshot(): BoardSnapshot {
  return {
    plan: {
      id: 'plan-1',
      name: 'Plan',
      labels: [
        { slot: 'category1', name: 'Urgent', color: '#ef4444' },
        { slot: 'category2', name: 'Design', color: '#5e6ad2' },
        { slot: 'category3', name: 'Backend', color: '#10b981' },
      ],
      members: [],
    },
    buckets: [
      {
        id: 'bucket-1',
        name: 'To Do',
        orderHint: 'a',
        tasks: [makeTask()],
      },
    ],
  }
}

let _queryClientRef: QueryClient

function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: _queryClientRef }, children)
}

const PROPS = {
  planId: 'plan-1',
  actorId: 'actor-1',
  tenantId: 'tenant-1',
  onClose: vi.fn(),
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('LabelPicker', () => {
  beforeEach(() => {
    _queryClientRef = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })

  it('renders all 25 label slots', () => {
    _queryClientRef.setQueryData(QUERY_KEY, makeSnapshot())
    render(<LabelPicker task={makeTask()} {...PROPS} />, { wrapper: Wrapper })

    // Named labels
    expect(screen.getByText('Urgent')).toBeDefined()
    expect(screen.getByText('Design')).toBeDefined()
    expect(screen.getByText('Backend')).toBeDefined()

    // Unnamed slots fall back to "Label N"
    expect(screen.getByText('Label 4')).toBeDefined()
    expect(screen.getByText('Label 25')).toBeDefined()

    // Total 25 items
    const items = screen
      .getAllByRole('button')
      .filter((b) => b.getAttribute('data-testid')?.startsWith('label-option-'))
    expect(items).toHaveLength(25)
  })

  it('calls applyLabel when toggling an unset label', async () => {
    mockApply.mockResolvedValue(undefined)
    _queryClientRef.setQueryData(QUERY_KEY, makeSnapshot())
    render(<LabelPicker task={makeTask()} {...PROPS} />, { wrapper: Wrapper })

    await userEvent.click(screen.getByTestId('label-option-category1'))

    await waitFor(() => {
      expect(mockApply).toHaveBeenCalledOnce()
    })
    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        slot: 'category1',
      }),
    )
  })

  it('calls removeLabel when toggling an already-set label', async () => {
    mockRemove.mockResolvedValue(undefined)
    const task = makeTask({ appliedLabels: ['category1'] })
    _queryClientRef.setQueryData(QUERY_KEY, makeSnapshot())
    render(<LabelPicker task={task} {...PROPS} />, { wrapper: Wrapper })

    await userEvent.click(screen.getByTestId('label-option-category1'))

    await waitFor(() => {
      expect(mockRemove).toHaveBeenCalledOnce()
    })
    expect(mockRemove).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        slot: 'category1',
      }),
    )
  })

  it('shows checkmark for applied labels', () => {
    const task = makeTask({ appliedLabels: ['category2'] })
    _queryClientRef.setQueryData(QUERY_KEY, makeSnapshot())
    render(<LabelPicker task={task} {...PROPS} />, { wrapper: Wrapper })

    const btn = screen.getByTestId('label-option-category2')
    expect(btn.getAttribute('aria-pressed')).toBe('true')

    // Non-applied labels should not show pressed
    const btn1 = screen.getByTestId('label-option-category1')
    expect(btn1.getAttribute('aria-pressed')).toBe('false')
  })
})
