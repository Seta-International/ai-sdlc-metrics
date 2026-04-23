import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@future/api-client'
import React from 'react'

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports of mocked modules
// ---------------------------------------------------------------------------

vi.mock('../trpc', () => ({
  trpc: {
    planner: {
      personal: {
        listTasks: {
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
  })),
}))

const mockUseSearchParams = vi.fn(() => new URLSearchParams(''))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => mockUseSearchParams(),
  usePathname: () => '/personal/tasks/board',
}))

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { trpc } from '../trpc'
import { useSession } from '@future/auth'
import { usePersonalTasks } from './use-personal-tasks'
import type { TaskFlatWithPlan } from '@future/api-client/planner'

const mockListTasks = vi.mocked(
  (trpc.planner.personal.listTasks as { query: ReturnType<typeof vi.fn> }).query,
)
const mockUseSession = vi.mocked(useSession)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<TaskFlatWithPlan> = {}): TaskFlatWithPlan {
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

describe('usePersonalTasks', () => {
  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    vi.clearAllMocks()
    mockUseSearchParams.mockReturnValue(new URLSearchParams(''))
    mockUseSession.mockReturnValue({
      actorId: 'actor-1',
      tenantId: 'tenant-1',
    } as any)
  })

  afterEach(() => {
    queryClient.clear()
  })

  // -------------------------------------------------------------------------
  // Data flow
  // -------------------------------------------------------------------------

  it('returns processed tasks with rows and groups', async () => {
    const task = makeTask()
    mockListTasks.mockResolvedValue([task])

    const { result } = renderHook(() => usePersonalTasks({ includeCompleted: false }), {
      wrapper: Wrapper,
    })

    await waitFor(() => expect(result.current.processed).toBeDefined())

    expect(result.current.processed!.rows).toHaveLength(1)
    expect(result.current.processed!.groups.length).toBeGreaterThan(0)
  })

  it('forwards actorId, tenantId, and includeCompleted to tRPC', async () => {
    mockListTasks.mockResolvedValue([])

    renderHook(() => usePersonalTasks({ includeCompleted: true }), { wrapper: Wrapper })

    await waitFor(() =>
      expect(mockListTasks).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'actor-1',
          tenantId: 'tenant-1',
          includeCompleted: true,
        }),
      ),
    )
  })

  it('returns undefined processed and isLoading false when session is missing', () => {
    mockUseSession.mockReturnValue(null)

    const { result } = renderHook(() => usePersonalTasks({ includeCompleted: false }), {
      wrapper: Wrapper,
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.processed).toBeUndefined()
    expect(mockListTasks).not.toHaveBeenCalled()
  })

  it('returns undefined processed when query has not yet resolved', () => {
    mockListTasks.mockReturnValue(new Promise(() => {})) // never resolves

    const { result } = renderHook(() => usePersonalTasks({ includeCompleted: false }), {
      wrapper: Wrapper,
    })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.processed).toBeUndefined()
  })

  it('exposes raw data from the query alongside processed', async () => {
    const tasks = [makeTask({ id: 'task-1' }), makeTask({ id: 'task-2', title: 'Task 2' })]
    mockListTasks.mockResolvedValue(tasks)

    const { result } = renderHook(() => usePersonalTasks({ includeCompleted: false }), {
      wrapper: Wrapper,
    })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toEqual(tasks)
  })

  // -------------------------------------------------------------------------
  // includeCompleted filtering
  // -------------------------------------------------------------------------

  it('excludes completed tasks when includeCompleted is false', async () => {
    const tasks = [
      makeTask({ id: 't1', progress: 'in-progress' }),
      makeTask({ id: 't2', progress: 'completed' }),
    ]
    mockListTasks.mockResolvedValue(tasks)

    const { result } = renderHook(() => usePersonalTasks({ includeCompleted: false }), {
      wrapper: Wrapper,
    })

    await waitFor(() => expect(result.current.processed).toBeDefined())
    expect(result.current.processed!.rows).toHaveLength(1)
    expect(result.current.processed!.rows[0]!.id).toBe('t1')
  })

  it('includes completed tasks when includeCompleted is true', async () => {
    const tasks = [
      makeTask({ id: 't1', progress: 'in-progress' }),
      makeTask({ id: 't2', progress: 'completed' }),
    ]
    mockListTasks.mockResolvedValue(tasks)

    const { result } = renderHook(() => usePersonalTasks({ includeCompleted: true }), {
      wrapper: Wrapper,
    })

    await waitFor(() => expect(result.current.processed).toBeDefined())
    expect(result.current.processed!.rows).toHaveLength(2)
  })
})
