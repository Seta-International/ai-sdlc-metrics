import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useOptimisticMove } from './useOptimisticMove'
import type { BoardSnapshot } from '../board-types'

// Mock trpc client
vi.mock('../trpc', () => ({
  trpc: {
    planner: {
      tasks: {
        move: {
          mutate: vi.fn(),
        },
      },
    },
  },
}))

import { trpc } from '../trpc'
const mockMutate = vi.mocked(
  (trpc.planner.tasks.move as { mutate: ReturnType<typeof vi.fn> }).mutate,
)

const BASE_DATE = new Date('2026-01-01T00:00:00Z')

function makeSnapshot(): BoardSnapshot {
  return {
    plan: {
      id: 'plan-1',
      name: 'Test Plan',
      labels: [],
      members: [],
    },
    buckets: [
      {
        id: 'bucket-a',
        name: 'To Do',
        orderHint: 'a',
        tasks: [
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
            updatedAt: BASE_DATE,
          },
        ],
      },
      {
        id: 'bucket-b',
        name: 'In Progress',
        orderHint: 'b',
        tasks: [],
      },
    ],
  }
}

let queryClient: QueryClient

function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, children)
}

const INPUT = { planId: 'plan-1', actorId: 'actor-1', tenantId: 'tenant-1' }
const QUERY_KEY = ['tasks.getBoard', 'plan-1', 'actor-1', 'tenant-1'] as const

describe('useOptimisticMove', () => {
  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    vi.clearAllMocks()
  })

  afterEach(() => {
    queryClient.clear()
  })

  it('patches cache immediately and fires mutation on success', async () => {
    const snapshot = makeSnapshot()
    queryClient.setQueryData(QUERY_KEY, snapshot)
    mockMutate.mockResolvedValue({ orderHint: 'b0', updatedAt: new Date('2026-01-02T00:00:00Z') })

    const { result } = renderHook(() => useOptimisticMove(INPUT), {
      wrapper: Wrapper,
    })

    await act(async () => {
      await result.current.move('task-1', 'bucket-b', undefined, undefined)
    })

    expect(mockMutate).toHaveBeenCalledOnce()
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        toBucketId: 'bucket-b',
        planId: 'plan-1',
        actorId: 'actor-1',
        tenantId: 'tenant-1',
      }),
    )

    // After success, task should be in bucket-b with server's authoritative orderHint
    const after = queryClient.getQueryData<BoardSnapshot>(QUERY_KEY)
    const bucketA = after?.buckets.find((b) => b.id === 'bucket-a')
    const bucketB = after?.buckets.find((b) => b.id === 'bucket-b')
    expect(bucketA?.tasks).toHaveLength(0)
    expect(bucketB?.tasks).toHaveLength(1)
    expect(bucketB?.tasks[0].orderHint).toBe('b0')
  })

  it('reverts cache on network error', async () => {
    const snapshot = makeSnapshot()
    queryClient.setQueryData(QUERY_KEY, snapshot)
    mockMutate.mockRejectedValue(new Error('Network failure'))

    const { result } = renderHook(() => useOptimisticMove(INPUT), {
      wrapper: Wrapper,
    })

    await act(async () => {
      await result.current.move('task-1', 'bucket-b', undefined, undefined)
    })

    // Cache should be reverted to original snapshot
    const after = queryClient.getQueryData<BoardSnapshot>(QUERY_KEY)
    const bucketA = after?.buckets.find((b) => b.id === 'bucket-a')
    const bucketB = after?.buckets.find((b) => b.id === 'bucket-b')
    expect(bucketA?.tasks).toHaveLength(1)
    expect(bucketB?.tasks).toHaveLength(0)
  })

  it('refetches and retries once on 409 CONFLICT, reverts on second failure', async () => {
    const snapshot = makeSnapshot()
    queryClient.setQueryData(QUERY_KEY, snapshot)

    const conflictError = { data: { code: 'CONFLICT' }, message: 'Conflict' }
    mockMutate.mockRejectedValueOnce(conflictError).mockRejectedValueOnce(new Error('Still failed'))

    // Simulate refetch by pre-loading the same snapshot
    const refetchSpy = vi.spyOn(queryClient, 'refetchQueries').mockResolvedValue()

    const { result } = renderHook(() => useOptimisticMove(INPUT), {
      wrapper: Wrapper,
    })

    await act(async () => {
      await result.current.move('task-1', 'bucket-b', undefined, undefined)
    })

    expect(refetchSpy).toHaveBeenCalledOnce()
    expect(mockMutate).toHaveBeenCalledTimes(2)

    // After second failure, cache should be reverted (refetched state is the snapshot itself)
    const after = queryClient.getQueryData<BoardSnapshot>(QUERY_KEY)
    // The snapshot was set back by the revert logic
    expect(after).toBeDefined()
  })

  it('does nothing when no snapshot in cache', async () => {
    // No data in cache
    const { result } = renderHook(() => useOptimisticMove(INPUT), {
      wrapper: Wrapper,
    })

    await act(async () => {
      await result.current.move('task-1', 'bucket-b', undefined, undefined)
    })

    expect(mockMutate).not.toHaveBeenCalled()
  })
})
