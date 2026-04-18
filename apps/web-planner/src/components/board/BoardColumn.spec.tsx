import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { BoardColumn } from './BoardColumn'
import type { BoardBucketSnapshot, BoardSnapshot, PlanLabel } from '../../lib/board-types'

// Mock dnd-kit hooks to avoid needing a full DndContext
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>()
  return {
    ...actual,
    useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
    DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  }
})

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  verticalListSortingStrategy: {},
  sortableKeyboardCoordinates: {},
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: { toString: () => undefined },
  },
}))

// Mock trpc
vi.mock('../../lib/trpc', () => ({
  trpc: {
    planner: {
      buckets: {
        rename: { mutate: vi.fn() },
        delete: { mutate: vi.fn() },
      },
      tasks: {
        create: { mutate: vi.fn() },
        setPriority: { mutate: vi.fn() },
        setDates: { mutate: vi.fn() },
        assign: { mutate: vi.fn() },
        unassign: { mutate: vi.fn() },
        applyLabel: { mutate: vi.fn() },
        removeLabel: { mutate: vi.fn() },
      },
    },
  },
}))

// Mock @future/auth
vi.mock('@future/auth', () => ({
  useSession: () => ({ actorId: 'actor-1', tenantId: 'tenant-1' }),
}))

import { trpc } from '../../lib/trpc'
const mockRename = vi.mocked(
  (trpc.planner.buckets.rename as { mutate: ReturnType<typeof vi.fn> }).mutate,
)
const mockDelete = vi.mocked(
  (trpc.planner.buckets.delete as { mutate: ReturnType<typeof vi.fn> }).mutate,
)

const QUERY_KEY = ['tasks.getBoard', 'plan-1', 'actor-1', 'tenant-1'] as const

function makeEmptySnapshot(): BoardSnapshot {
  return {
    plan: { id: 'plan-1', name: 'Plan', labels: [], members: [] },
    buckets: [{ id: 'bucket-1', name: 'To Do', orderHint: 'a', tasks: [] }],
  }
}

const emptyLabels: PlanLabel[] = []

const PROPS = {
  planId: 'plan-1',
  actorId: 'actor-1',
  tenantId: 'tenant-1',
}

function makeBucket(overrides: Partial<BoardBucketSnapshot> = {}): BoardBucketSnapshot {
  return {
    id: 'bucket-1',
    name: 'To Do',
    orderHint: 'a0',
    tasks: [],
    ...overrides,
  }
}

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children)
  }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('BoardColumn', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    queryClient.setQueryData(QUERY_KEY, makeEmptySnapshot())
  })

  it('renders the column name', () => {
    render(
      <BoardColumn
        bucket={makeBucket({ name: 'In Review' })}
        planLabels={emptyLabels}
        {...PROPS}
      />,
      { wrapper: createWrapper(queryClient) },
    )
    expect(screen.getByText('In Review')).toBeDefined()
  })

  it('shows task count badge', () => {
    const tasks = [
      {
        id: 'task-1',
        title: 'Task 1',
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
        updatedAt: new Date(),
      },
      {
        id: 'task-2',
        title: 'Task 2',
        description: '',
        progress: 0,
        priority: 3,
        startDate: null,
        dueDate: null,
        orderHint: 'a1',
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
        updatedAt: new Date(),
      },
    ]

    render(<BoardColumn bucket={makeBucket({ tasks })} planLabels={emptyLabels} {...PROPS} />, {
      wrapper: createWrapper(queryClient),
    })
    expect(screen.getByText('2')).toBeDefined()
  })

  it('shows 0 count badge for empty column', () => {
    render(
      <BoardColumn
        bucket={makeBucket({ name: 'Empty Column', tasks: [] })}
        planLabels={emptyLabels}
        {...PROPS}
      />,
      { wrapper: createWrapper(queryClient) },
    )
    expect(screen.getAllByText('0').length).toBeGreaterThan(0)
  })

  it('renders task titles inside the column', () => {
    const tasks = [
      {
        id: 'task-1',
        title: 'Fix the bug',
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
        updatedAt: new Date(),
      },
    ]

    render(<BoardColumn bucket={makeBucket({ tasks })} planLabels={emptyLabels} {...PROPS} />, {
      wrapper: createWrapper(queryClient),
    })
    expect(screen.getByText('Fix the bug')).toBeDefined()
  })

  // Task 11: rename
  it('shows rename input on column name click, fires rename mutation on Enter', async () => {
    mockRename.mockResolvedValue(undefined)
    render(
      <BoardColumn bucket={makeBucket({ name: 'To Do' })} planLabels={emptyLabels} {...PROPS} />,
      { wrapper: createWrapper(queryClient) },
    )

    await userEvent.click(screen.getByTestId('column-name-btn'))
    expect(screen.getByTestId('column-rename-input')).toBeDefined()

    const input = screen.getByTestId('column-rename-input') as HTMLInputElement
    await userEvent.clear(input)
    await userEvent.type(input, 'New Name')
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(mockRename).toHaveBeenCalledOnce()
    })
    expect(mockRename).toHaveBeenCalledWith(
      expect.objectContaining({
        bucketId: 'bucket-1',
        name: 'New Name',
        planId: 'plan-1',
      }),
    )
  })

  it('cancels rename on Escape', async () => {
    render(
      <BoardColumn bucket={makeBucket({ name: 'To Do' })} planLabels={emptyLabels} {...PROPS} />,
      { wrapper: createWrapper(queryClient) },
    )

    await userEvent.click(screen.getByTestId('column-name-btn'))
    const input = screen.getByTestId('column-rename-input')
    expect(input).toBeDefined()

    fireEvent.keyDown(input, { key: 'Escape' })

    // Input should be gone, name button restored
    expect(screen.queryByTestId('column-rename-input')).toBeNull()
    expect(screen.getByText('To Do')).toBeDefined()
  })

  // Task 11: delete
  it('shows confirm dialog from three-dot menu → delete, fires delete mutation on confirm', async () => {
    mockDelete.mockResolvedValue(undefined)
    render(
      <BoardColumn
        bucket={makeBucket({ name: 'To Do', tasks: [] })}
        planLabels={emptyLabels}
        {...PROPS}
      />,
      { wrapper: createWrapper(queryClient) },
    )

    await userEvent.click(screen.getByTestId('column-menu-btn'))
    expect(screen.getByTestId('column-menu')).toBeDefined()

    await userEvent.click(screen.getByTestId('column-menu-delete'))
    expect(screen.getByTestId('delete-confirm-dialog')).toBeDefined()

    await userEvent.click(screen.getByTestId('delete-confirm-btn'))

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledOnce()
    })
    expect(mockDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        bucketId: 'bucket-1',
        planId: 'plan-1',
      }),
    )
  })

  it('cancels delete on Cancel button', async () => {
    render(
      <BoardColumn bucket={makeBucket({ name: 'To Do' })} planLabels={emptyLabels} {...PROPS} />,
      { wrapper: createWrapper(queryClient) },
    )

    await userEvent.click(screen.getByTestId('column-menu-btn'))
    await userEvent.click(screen.getByTestId('column-menu-delete'))
    expect(screen.getByTestId('delete-confirm-dialog')).toBeDefined()

    await userEvent.click(screen.getByTestId('delete-cancel-btn'))

    expect(screen.queryByTestId('delete-confirm-dialog')).toBeNull()
    expect(mockDelete).not.toHaveBeenCalled()
  })
})
