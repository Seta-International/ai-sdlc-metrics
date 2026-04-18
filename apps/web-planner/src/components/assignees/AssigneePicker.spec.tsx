import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { AssigneePicker } from './AssigneePicker'
import type { BoardSnapshot, BoardTaskSnapshot } from '../../lib/board-types'

vi.mock('../../lib/trpc', () => ({
  trpc: {
    planner: {
      tasks: {
        assign: { mutate: vi.fn() },
        unassign: { mutate: vi.fn() },
      },
    },
  },
}))

import { trpc } from '../../lib/trpc'
const mockAssign = vi.mocked(
  (trpc.planner.tasks.assign as { mutate: ReturnType<typeof vi.fn> }).mutate,
)
const mockUnassign = vi.mocked(
  (trpc.planner.tasks.unassign as { mutate: ReturnType<typeof vi.fn> }).mutate,
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

function makeSnapshot(members = true): BoardSnapshot {
  return {
    plan: {
      id: 'plan-1',
      name: 'Plan',
      labels: [],
      members: members
        ? [
            {
              actorId: 'member-1',
              role: 'editor',
              person: { name: 'Alice Smith', avatarUrl: undefined },
            },
            {
              actorId: 'member-2',
              role: 'viewer',
              person: { name: 'Bob Jones', avatarUrl: undefined },
            },
          ]
        : [],
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

describe('AssigneePicker', () => {
  beforeEach(() => {
    _queryClientRef = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })

  it('renders plan members', () => {
    _queryClientRef.setQueryData(QUERY_KEY, makeSnapshot())
    render(<AssigneePicker task={makeTask()} {...PROPS} />, { wrapper: Wrapper })

    expect(screen.getByText('Alice Smith')).toBeDefined()
    expect(screen.getByText('Bob Jones')).toBeDefined()
  })

  it('shows "No members" when plan has no members', () => {
    _queryClientRef.setQueryData(QUERY_KEY, makeSnapshot(false))
    render(<AssigneePicker task={makeTask()} {...PROPS} />, { wrapper: Wrapper })

    expect(screen.getByText('No members')).toBeDefined()
  })

  it('calls assign mutation when clicking unassigned member', async () => {
    mockAssign.mockResolvedValue(undefined)
    _queryClientRef.setQueryData(QUERY_KEY, makeSnapshot())
    render(<AssigneePicker task={makeTask()} {...PROPS} />, { wrapper: Wrapper })

    await userEvent.click(screen.getByTestId('assignee-option-member-1'))

    await waitFor(() => {
      expect(mockAssign).toHaveBeenCalledOnce()
    })
    expect(mockAssign).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        assigneeId: 'member-1',
      }),
    )
  })

  it('calls unassign mutation when clicking already assigned member', async () => {
    mockUnassign.mockResolvedValue(undefined)
    const task = makeTask({ assignees: [{ actorId: 'member-1', name: 'Alice Smith' }] })
    _queryClientRef.setQueryData(QUERY_KEY, makeSnapshot())
    render(<AssigneePicker task={task} {...PROPS} />, { wrapper: Wrapper })

    await userEvent.click(screen.getByTestId('assignee-option-member-1'))

    await waitFor(() => {
      expect(mockUnassign).toHaveBeenCalledOnce()
    })
    expect(mockUnassign).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        assigneeId: 'member-1',
      }),
    )
  })

  it('shows checkmark for assigned members', () => {
    const task = makeTask({ assignees: [{ actorId: 'member-1', name: 'Alice Smith' }] })
    _queryClientRef.setQueryData(QUERY_KEY, makeSnapshot())
    render(<AssigneePicker task={task} {...PROPS} />, { wrapper: Wrapper })

    const btn = screen.getByTestId('assignee-option-member-1')
    expect(btn.getAttribute('aria-pressed')).toBe('true')
  })
})
