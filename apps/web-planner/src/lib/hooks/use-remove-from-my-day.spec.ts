import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports of mocked modules
// ---------------------------------------------------------------------------

vi.mock('../trpc', () => ({
  trpc: {
    planner: {
      personal: {
        myDay: {
          remove: { mutate: vi.fn() },
        },
      },
    },
  },
}))

vi.mock('@future/auth', () => ({
  useSession: vi.fn(() => ({ actorId: 'actor-1', tenantId: 'tenant-1' })),
}))

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { trpc } from '../trpc'
import { useSession } from '@future/auth'
import { useRemoveFromMyDay } from './use-remove-from-my-day'
import { myDayQueryKey } from './use-my-day'
import type { MyDayTask } from '@future/api-client/planner'

const mockMutate = vi.mocked(
  (trpc.planner.personal.myDay.remove as unknown as { mutate: ReturnType<typeof vi.fn> }).mutate,
)
const mockUseSession = vi.mocked(useSession)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DATE = '2026-04-20'

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
    myDay: { addedAt: '2026-04-20T08:00:00Z', completedAt: null },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let queryClient: QueryClient

function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useRemoveFromMyDay', () => {
  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    vi.clearAllMocks()
    mockUseSession.mockReturnValue({ actorId: 'actor-1', tenantId: 'tenant-1' } as any)
    mockMutate.mockResolvedValue(undefined)
  })

  afterEach(() => {
    queryClient.clear()
  })

  it('optimistically removes the row from the cached list', async () => {
    const qk = myDayQueryKey('actor-1', 'tenant-1', DATE)
    const t1 = makeMyDayTask({ id: 't1', title: 'Task 1' })
    const t2 = makeMyDayTask({ id: 't2', title: 'Task 2' })
    queryClient.setQueryData(qk, [t1, t2] as MyDayTask[])

    const { result } = renderHook(() => useRemoveFromMyDay(DATE), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync({ taskId: 't1' })
    })

    const cached = queryClient.getQueryData<MyDayTask[]>(qk)
    expect(cached).toHaveLength(1)
    expect(cached![0]!.id).toBe('t2')
  })

  it('rolls back on error', async () => {
    const qk = myDayQueryKey('actor-1', 'tenant-1', DATE)
    const t1 = makeMyDayTask({ id: 't1' })
    queryClient.setQueryData(qk, [t1] as MyDayTask[])

    mockMutate.mockRejectedValue(new Error('Server error'))

    const { result } = renderHook(() => useRemoveFromMyDay(DATE), { wrapper: Wrapper })

    await act(async () => {
      try {
        await result.current.mutateAsync({ taskId: 't1' })
      } catch {
        // expected
      }
    })

    const cached = queryClient.getQueryData<MyDayTask[]>(qk)
    expect(cached).toHaveLength(1)
    expect(cached![0]!.id).toBe('t1')
  })

  it('dispatches the mutate call with actor/tenant/taskId/date', async () => {
    const qk = myDayQueryKey('actor-1', 'tenant-1', DATE)
    const t1 = makeMyDayTask({ id: 'task-99' })
    queryClient.setQueryData(qk, [t1] as MyDayTask[])

    const { result } = renderHook(() => useRemoveFromMyDay(DATE), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync({ taskId: 'task-99' })
    })

    expect(mockMutate).toHaveBeenCalledWith({
      actorId: 'actor-1',
      tenantId: 'tenant-1',
      taskId: 'task-99',
      date: DATE,
    })
  })
})
