'use client'

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import React from 'react'
import PlanBoardPage from './page'

vi.mock('@future/auth', () => ({
  useSession: vi.fn(() => ({ actorId: 'a1', tenantId: 't1' })),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/plans/abc/board',
  useParams: () => ({ id: 'abc' }),
}))

const defaultBoardData = {
  plan: { id: 'abc', name: 'Test Plan', labels: [], members: [] },
  buckets: [
    {
      id: 'b1',
      name: 'Bucket 1',
      orderHint: 'a',
      tasks: [
        {
          id: 't1',
          title: 'Urgent Task',
          priority: 9,
          progress: 0,
          dueDate: null,
          startDate: null,
          orderHint: 'a',
          // null name/avatarUrl covers the `?? ''` and `?? null` fallback branches
          assignees: [
            { actorId: 'x', name: null as string | null, avatarUrl: null as string | null },
          ],
          appliedLabels: [],
          commentCount: 0,
          checklistItemCount: 0,
          checklistCheckedCount: 0,
          attachmentCount: 0,
          evidenceCount: 0,
          description: '',
          completedAt: null,
          completedBy: null,
          coverAttachmentId: null,
          updatedAt: new Date('2026-04-01'),
        },
        {
          id: 't2',
          title: 'Medium Task',
          priority: 3,
          progress: 0,
          dueDate: null,
          startDate: null,
          orderHint: 'b',
          // non-null name/avatarUrl covers the truthy branches of `?? ''` and `?? null`
          assignees: [{ actorId: 'y', name: 'Alice', avatarUrl: 'https://example.com/a.png' }],
          appliedLabels: [],
          commentCount: 0,
          checklistItemCount: 0,
          checklistCheckedCount: 0,
          attachmentCount: 0,
          evidenceCount: 0,
          description: '',
          completedAt: null,
          completedBy: null,
          coverAttachmentId: null,
          updatedAt: new Date('2026-04-01'),
        },
      ],
    },
    {
      id: 'b2',
      name: 'Bucket 2',
      orderHint: 'b',
      tasks: [],
    },
  ],
}

vi.mock('../../../../lib/hooks/useBoardSnapshot', () => ({
  useBoardSnapshot: vi.fn(),
}))

vi.mock('@future/api-client', () => ({
  useQuery: vi.fn(),
  useQueryClient: vi.fn(() => ({
    getQueryData: vi.fn(),
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock('../../../../lib/trpc', () => ({
  trpc: {
    planner: {
      tasks: {
        move: { mutate: vi.fn() },
        setProgress: { mutate: vi.fn().mockResolvedValue(undefined) },
      },
      buckets: { reorder: { mutate: vi.fn().mockResolvedValue(undefined) } },
    },
  },
}))

vi.mock('../../../../lib/hooks/useOptimisticMove', () => ({
  useOptimisticMove: () => ({ move: vi.fn() }),
}))

vi.mock('../../../../lib/hooks/useViewState', () => ({
  useViewState: vi.fn(),
}))

vi.mock('../../../../components/board/BoardDragContext', () => ({
  BoardDragContext: ({
    children,
    onMove,
    onReorderColumn,
  }: {
    children: React.ReactNode
    onMove?: (args: {
      taskId: string
      toBucketId: string
      hintAfter?: string
      hintBefore?: string
    }) => void
    onReorderColumn?: (args: { bucketId: string; hintAfter?: string; hintBefore?: string }) => void
  }) => (
    <div>
      {children}
      {onMove && (
        <button
          data-testid="trigger-move-task"
          onClick={() =>
            onMove({ taskId: 't1', toBucketId: 'b2', hintAfter: undefined, hintBefore: undefined })
          }
        >
          Move
        </button>
      )}
      {onReorderColumn && (
        <button
          data-testid="trigger-reorder-column"
          onClick={() => onReorderColumn({ bucketId: 'b1', hintAfter: undefined, hintBefore: 'b' })}
        >
          Reorder
        </button>
      )}
    </div>
  ),
}))

vi.mock('../../../../components/board/BoardColumn', () => ({
  BoardColumn: ({
    bucket,
    onToggleComplete,
  }: {
    bucket: { tasks: Array<{ id: string; title: string }> }
    onToggleComplete?: (taskId: string, nextProgress: number) => void
  }) => (
    <div data-testid="board-column">
      {bucket.tasks.map((t) => (
        <div key={t.id} data-testid="task-card">
          {t.title}
          {onToggleComplete && (
            <button data-testid={`toggle-${t.id}`} onClick={() => onToggleComplete(t.id, 100)}>
              Toggle
            </button>
          )}
        </div>
      ))}
    </div>
  ),
}))

vi.mock('../../../../components/board/AddBucketButton', () => ({
  AddBucketButton: () => <button>Add bucket</button>,
}))

import { useBoardSnapshot } from '../../../../lib/hooks/useBoardSnapshot'
import { useViewState } from '../../../../lib/hooks/useViewState'
import { useQueryClient } from '@future/api-client'
import { trpc } from '../../../../lib/trpc'

const mockSetProgress = vi.mocked(
  (trpc.planner.tasks.setProgress as { mutate: ReturnType<typeof vi.fn> }).mutate,
)
const mockReorder = vi.mocked(
  (trpc.planner.buckets.reorder as { mutate: ReturnType<typeof vi.fn> }).mutate,
)

const defaultViewState = {
  state: {
    view: 'board' as const,
    groupBy: 'bucket' as const,
    sort: undefined,
    filter: {
      priority: ['urgent' as const],
      labels: [],
      buckets: [],
      assignees: [],
      due: undefined,
    },
  },
  patch: vi.fn(),
  reset: vi.fn(),
  commit: vi.fn(),
}

const noFilterViewState = {
  ...defaultViewState,
  state: {
    ...defaultViewState.state,
    filter: { priority: [], labels: [], buckets: [], assignees: [], due: undefined },
  },
}

beforeEach(() => {
  vi.mocked(useBoardSnapshot).mockReturnValue({
    data: defaultBoardData,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })
  vi.mocked(useViewState).mockReturnValue(defaultViewState)
  vi.mocked(useQueryClient).mockReturnValue({
    getQueryData: vi.fn().mockReturnValue(defaultBoardData),
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
  })
})

describe('PlanBoardPage with view state', () => {
  it('renders only urgent tasks when priority filter is set', () => {
    render(<PlanBoardPage />)
    expect(screen.getByText('Urgent Task')).toBeInTheDocument()
    expect(screen.queryByText('Medium Task')).not.toBeInTheDocument()
  })

  it('shows loading skeleton while board is loading', () => {
    vi.mocked(useBoardSnapshot).mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    })
    render(<PlanBoardPage />)
    expect(screen.getByTestId('board-loading-skeleton')).toBeInTheDocument()
  })

  it('shows error state when board fails to load', () => {
    vi.mocked(useBoardSnapshot).mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      error: new Error('failed to fetch'),
      refetch: vi.fn(),
    })
    render(<PlanBoardPage />)
    expect(screen.getByText('Failed to load board.')).toBeInTheDocument()
  })

  it('shows empty state when plan has no buckets', () => {
    vi.mocked(useBoardSnapshot).mockReturnValueOnce({
      data: { plan: { id: 'abc', name: 'Empty Plan', labels: [], members: [] }, buckets: [] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    render(<PlanBoardPage />)
    expect(screen.getByText('No buckets yet. Add one to get started.')).toBeInTheDocument()
  })

  it('shows sort-active chip when a sort is active', () => {
    vi.mocked(useViewState).mockReturnValueOnce({
      ...defaultViewState,
      state: {
        ...defaultViewState.state,
        sort: { field: 'title' as const, dir: 'asc' as const },
        filter: { priority: [], labels: [], buckets: [], assignees: [], due: undefined },
      },
    })
    render(<PlanBoardPage />)
    expect(screen.getByTestId('sort-active-chip')).toBeInTheDocument()
  })

  it('renders board columns with all tasks when no filter is set', () => {
    vi.mocked(useViewState).mockReturnValueOnce(noFilterViewState)
    render(<PlanBoardPage />)
    expect(screen.getByTestId('board-columns')).toBeInTheDocument()
    expect(screen.getByText('Urgent Task')).toBeInTheDocument()
    expect(screen.getByText('Medium Task')).toBeInTheDocument()
  })

  it('calls setProgress mutation when task is toggled complete', async () => {
    const user = userEvent.setup()
    vi.mocked(useViewState).mockReturnValueOnce(noFilterViewState)
    mockSetProgress.mockResolvedValue(undefined)

    render(<PlanBoardPage />)

    await user.click(screen.getByTestId('toggle-t1'))

    await waitFor(() => expect(mockSetProgress).toHaveBeenCalledTimes(1))
    expect(mockSetProgress).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 't1', progress: 100 }),
    )
  })

  it('rolls back cache on setProgress mutation error', async () => {
    const user = userEvent.setup()
    vi.mocked(useViewState).mockReturnValueOnce(noFilterViewState)
    const mockSetQueryData = vi.fn()
    vi.mocked(useQueryClient).mockReturnValue({
      getQueryData: vi.fn().mockReturnValue(defaultBoardData),
      setQueryData: mockSetQueryData,
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
    })
    mockSetProgress.mockRejectedValue(new Error('server error'))

    render(<PlanBoardPage />)

    await user.click(screen.getByTestId('toggle-t1'))

    await waitFor(() => expect(mockSetQueryData).toHaveBeenCalledTimes(2))
    // Second call is the rollback to the original snapshot
    expect(mockSetQueryData.mock.calls[1]?.[1]).toEqual(defaultBoardData)
  })

  it('calls reorder mutation when column reorder is triggered', async () => {
    const user = userEvent.setup()
    vi.mocked(useViewState).mockReturnValueOnce(noFilterViewState)
    mockReorder.mockResolvedValue(undefined)

    render(<PlanBoardPage />)

    await user.click(screen.getByTestId('trigger-reorder-column'))

    await waitFor(() => expect(mockReorder).toHaveBeenCalledTimes(1))
    expect(mockReorder).toHaveBeenCalledWith(expect.objectContaining({ bucketId: 'b1' }))
  })

  it('rolls back cache on reorder mutation error', async () => {
    const user = userEvent.setup()
    vi.mocked(useViewState).mockReturnValueOnce(noFilterViewState)
    const mockSetQueryData = vi.fn()
    vi.mocked(useQueryClient).mockReturnValue({
      getQueryData: vi.fn().mockReturnValue(defaultBoardData),
      setQueryData: mockSetQueryData,
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
    })
    mockReorder.mockRejectedValue(new Error('server error'))

    render(<PlanBoardPage />)

    await user.click(screen.getByTestId('trigger-reorder-column'))

    await waitFor(() => expect(mockSetQueryData).toHaveBeenCalledTimes(2))
    // Second call is the rollback to the original snapshot
    expect(mockSetQueryData.mock.calls[1]?.[1]).toEqual(defaultBoardData)
  })
})
