import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useFlatTasks } from './useFlatTasks'
import type { TaskFlat } from '@future/api-client/planner'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../trpc', () => ({
  trpc: {
    planner: {
      tasks: {
        getFlat: {
          query: vi.fn(),
        },
      },
    },
  },
}))

vi.mock('@future/auth', () => ({
  useSession: vi.fn(() => ({
    actorId: 'actor-1',
    tenantId: 'tenant-1',
    roles: [],
    displayName: 'Test User',
    email: 'test@example.com',
    provider: 'test',
  })),
}))

const mockUseSearchParams = vi.fn(() => new URLSearchParams(''))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => mockUseSearchParams(),
  usePathname: () => '/plans/plan-1/grid',
}))

vi.mock('../task-filter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../task-filter')>()
  return { ...actual, applyTaskFilter: vi.fn(actual.applyTaskFilter) }
})

vi.mock('../task-sort', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../task-sort')>()
  return { ...actual, sortTasks: vi.fn(actual.sortTasks) }
})

vi.mock('../task-group', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../task-group')>()
  return { ...actual, groupTasks: vi.fn(actual.groupTasks) }
})

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { trpc } from '../trpc'
import { useSession } from '@future/auth'
import { applyTaskFilter } from '../task-filter'
import { sortTasks } from '../task-sort'
import { groupTasks } from '../task-group'

const mockGetFlat = vi.mocked(
  (trpc.planner.tasks.getFlat as { query: ReturnType<typeof vi.fn> }).query,
)
const mockUseSession = vi.mocked(useSession)
const mockApplyTaskFilter = vi.mocked(applyTaskFilter)
const mockSortTasks = vi.mocked(sortTasks)
const mockGroupTasks = vi.mocked(groupTasks)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<TaskFlat> = {}): TaskFlat {
  return {
    id: 'task-1',
    planId: 'plan-1',
    bucketId: 'bucket-1',
    bucketName: 'To Do',
    bucketOrderHint: 'a0',
    title: 'Task 1',
    progress: 'not-started',
    priority: 'medium',
    startDate: null,
    dueDate: null,
    assignees: [],
    labels: [],
    orderHint: 'a0',
    commentCount: 0,
    checklistCount: { total: 0, completed: 0 },
    attachmentCount: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

const QUERY_KEY = ['tasks.getFlat', 'plan-1', 'actor-1', 'tenant-1'] as const

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let queryClient: QueryClient

function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useFlatTasks', () => {
  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    vi.clearAllMocks()
    // Reset per-test overrides to defaults
    mockUseSearchParams.mockReturnValue(new URLSearchParams(''))
    mockUseSession.mockReturnValue({
      actorId: 'actor-1',
      tenantId: 'tenant-1',
      roles: [],
      displayName: 'Test User',
      email: 'test@example.com',
      provider: 'test',
    })
  })

  afterEach(() => {
    queryClient.clear()
  })

  // -------------------------------------------------------------------------
  // Basic data flow
  // -------------------------------------------------------------------------

  it('returns undefined processed when query has no data yet', () => {
    mockGetFlat.mockReturnValue(new Promise(() => {})) // never resolves

    const { result } = renderHook(() => useFlatTasks({ planId: 'plan-1' }), { wrapper: Wrapper })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.processed).toBeUndefined()
  })

  it('returns processed output when data is available in cache', () => {
    const tasks = [makeTask({ id: 'task-1' }), makeTask({ id: 'task-2', title: 'Task 2' })]
    queryClient.setQueryData(QUERY_KEY, tasks)

    const { result } = renderHook(() => useFlatTasks({ planId: 'plan-1' }), { wrapper: Wrapper })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toEqual(tasks)
    expect(result.current.processed).toBeDefined()
    expect(result.current.processed?.rows).toHaveLength(2)
  })

  it('exposes raw data from the query alongside processed', () => {
    const tasks = [makeTask()]
    queryClient.setQueryData(QUERY_KEY, tasks)

    const { result } = renderHook(() => useFlatTasks({ planId: 'plan-1' }), { wrapper: Wrapper })

    expect(result.current.data).toEqual(tasks)
  })

  // -------------------------------------------------------------------------
  // Pipeline: applyTaskFilter → sortTasks → groupTasks
  // -------------------------------------------------------------------------

  it('calls applyTaskFilter with tasks and current filter', () => {
    const tasks = [makeTask()]
    queryClient.setQueryData(QUERY_KEY, tasks)

    renderHook(() => useFlatTasks({ planId: 'plan-1' }), { wrapper: Wrapper })

    expect(mockApplyTaskFilter).toHaveBeenCalledOnce()
    expect(mockApplyTaskFilter).toHaveBeenCalledWith(
      tasks,
      expect.objectContaining({ priority: [], labels: [], buckets: [], assignees: [] }),
    )
  })

  it('calls groupTasks with sorted results and current groupBy', () => {
    const tasks = [makeTask()]
    queryClient.setQueryData(QUERY_KEY, tasks)

    renderHook(() => useFlatTasks({ planId: 'plan-1' }), { wrapper: Wrapper })

    // groupTasks should receive the (filtered, unsorted — no sort set) rows
    expect(mockGroupTasks).toHaveBeenCalledOnce()
    expect(mockGroupTasks).toHaveBeenCalledWith(tasks, 'bucket') // default groupBy
  })

  it('does not call sortTasks when state.sort is undefined', () => {
    const tasks = [makeTask()]
    queryClient.setQueryData(QUERY_KEY, tasks)

    renderHook(() => useFlatTasks({ planId: 'plan-1' }), { wrapper: Wrapper })

    expect(mockSortTasks).not.toHaveBeenCalled()
  })

  it('calls sortTasks when URL carries a sort param', () => {
    // Override useSearchParams to return a URL with a sort parameter
    mockUseSearchParams.mockReturnValue(new URLSearchParams('sort=title:asc'))

    const tasks = [makeTask({ id: 'a', title: 'Banana' }), makeTask({ id: 'b', title: 'Apple' })]
    queryClient.setQueryData(QUERY_KEY, tasks)

    const { result } = renderHook(() => useFlatTasks({ planId: 'plan-1' }), { wrapper: Wrapper })

    // sortTasks should be called because state.sort is set from the URL
    expect(mockSortTasks).toHaveBeenCalledOnce()
    expect(mockSortTasks).toHaveBeenCalledWith(tasks, { field: 'title', dir: 'asc' })
    // The real sortTasks (spy passes through) sorts alphabetically — Apple comes first
    expect(result.current.processed?.rows[0]?.title).toBe('Apple')
  })

  // -------------------------------------------------------------------------
  // Memoization
  // -------------------------------------------------------------------------

  it('does not re-run processing when re-rendered with same data and state', () => {
    const tasks = [makeTask()]
    queryClient.setQueryData(QUERY_KEY, tasks)

    const { result, rerender } = renderHook(() => useFlatTasks({ planId: 'plan-1' }), {
      wrapper: Wrapper,
    })

    const firstProcessed = result.current.processed

    // Re-render without any data/state change
    rerender()

    expect(result.current.processed).toBe(firstProcessed) // referential equality — useMemo hit
    // applyTaskFilter / groupTasks should only have been called once
    expect(mockApplyTaskFilter).toHaveBeenCalledTimes(1)
    expect(mockGroupTasks).toHaveBeenCalledTimes(1)
  })

  // -------------------------------------------------------------------------
  // Query parameters
  // -------------------------------------------------------------------------

  it('uses planId + actorId + tenantId as the query cache key', () => {
    queryClient.setQueryData(QUERY_KEY, [makeTask()])

    const { result } = renderHook(() => useFlatTasks({ planId: 'plan-1' }), { wrapper: Wrapper })

    // Data loaded from the scoped key confirms correct key construction
    expect(result.current.data).toHaveLength(1)
  })

  it('returns undefined processed and isLoading false when session is missing', () => {
    // Override session to simulate missing credentials — actorId/tenantId → '' → enabled = false
    mockUseSession.mockReturnValue(null)

    // With enabled: false the query never fires — isLoading stays false and processed is undefined
    const { result } = renderHook(() => useFlatTasks({ planId: 'plan-1' }), { wrapper: Wrapper })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.processed).toBeUndefined()
    // Confirm the query was never invoked
    expect(mockGetFlat).not.toHaveBeenCalled()
  })
})
