import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
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
          getCarryOverCandidates: { query: vi.fn() },
          carryOver: { mutate: vi.fn() },
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
import {
  useMyDayCarryOverCandidates,
  useCarryOver,
  carryOverCandidatesQueryKey,
} from './use-carry-over'
import { myDayQueryKey } from './use-my-day'
import type { MyDayTask } from '@future/api-client/planner'

const mockCandidatesQuery = vi.mocked(
  (
    trpc.planner.personal.myDay.getCarryOverCandidates as unknown as {
      query: ReturnType<typeof vi.fn>
    }
  ).query,
)
const mockCarryOverMutate = vi.mocked(
  (trpc.planner.personal.myDay.carryOver as unknown as { mutate: ReturnType<typeof vi.fn> }).mutate,
)
const mockUseSession = vi.mocked(useSession)

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

let queryClient: QueryClient

function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useMyDayCarryOverCandidates', () => {
  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    vi.clearAllMocks()
    mockUseSession.mockReturnValue({ actorId: 'actor-1', tenantId: 'tenant-1' } as any)
  })

  afterEach(() => {
    queryClient.clear()
  })

  it('calls trpc with actor/tenant/date from the session', async () => {
    mockCandidatesQuery.mockResolvedValue([makeMyDayTask({ id: 't-1' })])

    const { result } = renderHook(() => useMyDayCarryOverCandidates(TODAY), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockCandidatesQuery).toHaveBeenCalledWith({
      actorId: 'actor-1',
      tenantId: 'tenant-1',
      date: TODAY,
    })
    expect(result.current.data).toHaveLength(1)
    expect(result.current.data?.[0]?.id).toBe('t-1')
  })

  it('exposes a stable queryKey shape via carryOverCandidatesQueryKey()', () => {
    expect(carryOverCandidatesQueryKey('actor-1', 'tenant-1', TODAY)).toEqual([
      'personal.myDay.carryOverCandidates',
      'actor-1',
      'tenant-1',
      TODAY,
    ])
  })

  it('is disabled when the session is missing (no fetch)', async () => {
    mockUseSession.mockReturnValue(null as any)

    const { result } = renderHook(() => useMyDayCarryOverCandidates(TODAY), { wrapper: Wrapper })

    // Give React Query a tick; the query should remain disabled/idle.
    await new Promise((r) => setTimeout(r, 10))

    expect(mockCandidatesQuery).not.toHaveBeenCalled()
    expect(result.current.fetchStatus).toBe('idle')
  })
})

describe('useCarryOver', () => {
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    vi.clearAllMocks()
    mockUseSession.mockReturnValue({ actorId: 'actor-1', tenantId: 'tenant-1' } as any)
  })

  afterEach(() => {
    queryClient.clear()
  })

  it('mutateAsync invokes trpc with vars and returns carriedCount', async () => {
    mockCarryOverMutate.mockResolvedValue({ carriedCount: 3 })

    const { result } = renderHook(() => useCarryOver(), { wrapper: Wrapper })

    let res: { carriedCount: number } | undefined
    await act(async () => {
      res = await result.current.mutateAsync({
        fromDate: YESTERDAY,
        toDate: TODAY,
        taskIds: ['t-1', 't-2', 't-3'],
      })
    })

    expect(mockCarryOverMutate).toHaveBeenCalledWith({
      actorId: 'actor-1',
      tenantId: 'tenant-1',
      fromDate: YESTERDAY,
      toDate: TODAY,
      taskIds: ['t-1', 't-2', 't-3'],
    })
    expect(res).toEqual({ carriedCount: 3 })
  })

  it('invalidates both myDay and carryOverCandidates caches for toDate on success', async () => {
    mockCarryOverMutate.mockResolvedValue({ carriedCount: 1 })

    // Seed cache so invalidateQueries has something to mark stale.
    queryClient.setQueryData(myDayQueryKey('actor-1', 'tenant-1', TODAY), [])
    queryClient.setQueryData(
      carryOverCandidatesQueryKey('actor-1', 'tenant-1', TODAY),
      [] as MyDayTask[],
    )
    queryClient.setQueryData(
      carryOverCandidatesQueryKey('actor-1', 'tenant-1', YESTERDAY),
      [] as MyDayTask[],
    )

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useCarryOver(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        fromDate: YESTERDAY,
        toDate: TODAY,
        taskIds: ['t-1'],
      })
    })

    const keys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey)
    expect(keys).toEqual(
      expect.arrayContaining([
        myDayQueryKey('actor-1', 'tenant-1', TODAY),
        carryOverCandidatesQueryKey('actor-1', 'tenant-1', TODAY),
        carryOverCandidatesQueryKey('actor-1', 'tenant-1', YESTERDAY),
      ]),
    )
  })
})
