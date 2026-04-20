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
          add: { mutate: vi.fn() },
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
import { useAddToMyDay } from './use-add-to-my-day'
import { myDayQueryKey } from './use-my-day'
import type { MyDayTask } from '@future/api-client/planner'

const mockMutate = vi.mocked(
  (trpc.planner.personal.myDay.add as unknown as { mutate: ReturnType<typeof vi.fn> }).mutate,
)
const mockUseSession = vi.mocked(useSession)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DATE = '2026-04-20'

function makeTaskStub(overrides: Partial<Omit<MyDayTask, 'myDay'>> = {}): Omit<MyDayTask, 'myDay'> {
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

describe('useAddToMyDay', () => {
  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    vi.clearAllMocks()
    mockUseSession.mockReturnValue({ actorId: 'actor-1', tenantId: 'tenant-1' } as any)
    mockMutate.mockResolvedValue(undefined)
  })

  afterEach(() => {
    queryClient.clear()
  })

  it('optimistically prepends the task to the cached my-day list, then resolves', async () => {
    const qk = myDayQueryKey('actor-1', 'tenant-1', DATE)
    queryClient.setQueryData(qk, [] as MyDayTask[])

    const taskStub = makeTaskStub({ id: 'task-1' })

    const { result } = renderHook(() => useAddToMyDay(DATE), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync({ taskId: 'task-1', taskStub })
    })

    const cached = queryClient.getQueryData<MyDayTask[]>(qk)
    expect(cached).toHaveLength(1)
    expect(cached![0]!.id).toBe('task-1')
    expect(cached![0]!.myDay.completedAt).toBeNull()
  })

  it('rolls back on error', async () => {
    const qk = myDayQueryKey('actor-1', 'tenant-1', DATE)
    queryClient.setQueryData(qk, [] as MyDayTask[])

    mockMutate.mockRejectedValue(new Error('Server error'))

    const taskStub = makeTaskStub({ id: 'task-1' })

    const { result } = renderHook(() => useAddToMyDay(DATE), { wrapper: Wrapper })

    await act(async () => {
      try {
        await result.current.mutateAsync({ taskId: 'task-1', taskStub })
      } catch {
        // expected
      }
    })

    const cached = queryClient.getQueryData<MyDayTask[]>(qk)
    expect(cached).toEqual([])
  })

  it('dispatches the mutate call with actor/tenant from the session + the configured date', async () => {
    const qk = myDayQueryKey('actor-1', 'tenant-1', DATE)
    queryClient.setQueryData(qk, [] as MyDayTask[])

    const taskStub = makeTaskStub({ id: 'task-42' })

    const { result } = renderHook(() => useAddToMyDay(DATE), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync({ taskId: 'task-42', taskStub })
    })

    expect(mockMutate).toHaveBeenCalledWith({
      actorId: 'actor-1',
      tenantId: 'tenant-1',
      taskId: 'task-42',
      date: DATE,
    })
  })
})
