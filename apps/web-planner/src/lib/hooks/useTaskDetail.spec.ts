import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@future/api-client'
import React from 'react'
import { useTaskDetail } from './useTaskDetail'
import type { TaskDetailSnapshot } from '../board-types'

vi.mock('../trpc', () => ({
  trpc: {
    planner: {
      tasks: {
        getDetail: {
          query: vi.fn(),
        },
        update: {
          mutate: vi.fn(),
        },
      },
    },
  },
}))

vi.mock('@future/auth', () => ({
  useSession: () => ({ actorId: 'actor-1', tenantId: 'tenant-1' }),
}))

import { trpc } from '../trpc'

const _mockQuery = vi.mocked(
  (trpc.planner.tasks.getDetail as { query: ReturnType<typeof vi.fn> }).query,
)
const mockMutate = vi.mocked(
  (trpc.planner.tasks.update as { mutate: ReturnType<typeof vi.fn> }).mutate,
)

const BASE_DATE = new Date('2026-01-01T00:00:00Z')

function makeTask(overrides: Partial<TaskDetailSnapshot> = {}): TaskDetailSnapshot {
  return {
    id: 'task-1',
    planId: 'plan-1',
    title: 'Original title',
    description: 'Original description',
    progress: 0,
    priority: 3,
    startDate: null,
    dueDate: null,
    updatedAt: BASE_DATE,
    bucketId: 'bucket-1',
    bucketName: 'To Do',
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
    checklist: [],
    attachments: [],
    ...overrides,
  }
}

let queryClient: QueryClient

function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, children)
}

const INPUT = { taskId: 'task-1', planId: 'plan-1' }
const QUERY_KEY = ['tasks.getDetail', 'task-1', 'actor-1', 'tenant-1'] as const

describe('useTaskDetail', () => {
  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    vi.clearAllMocks()
  })

  afterEach(() => {
    queryClient.clear()
  })

  it('returns task data from query', async () => {
    const fixture = makeTask()
    queryClient.setQueryData(QUERY_KEY, fixture)

    const { result } = renderHook(() => useTaskDetail(INPUT), { wrapper: Wrapper })

    expect(result.current.task).toEqual(fixture)
    expect(result.current.isLoading).toBe(false)
  })

  it('normalizes date fields from API strings to Date objects', async () => {
    _mockQuery.mockResolvedValue({
      ...makeTask(),
      startDate: '2026-01-03T00:00:00.000Z',
      dueDate: '2026-01-04T00:00:00.000Z',
      updatedAt: '2026-01-05T00:00:00.000Z',
      completedAt: '2026-01-06T00:00:00.000Z',
      attachments: [
        {
          kind: 'file',
          id: 'att-1',
          filename: 'doc.txt',
          contentType: 'text/plain',
          sizeBytes: 10,
          url: 'https://example.com/doc.txt',
          createdBy: 'actor-1',
          createdAt: '2026-01-07T00:00:00.000Z',
        },
      ],
    } as unknown as TaskDetailSnapshot)

    const { result } = renderHook(() => useTaskDetail(INPUT), { wrapper: Wrapper })

    await waitFor(() => {
      expect(result.current.task).toBeDefined()
    })

    expect(result.current.task?.startDate).toBeInstanceOf(Date)
    expect(result.current.task?.dueDate).toBeInstanceOf(Date)
    expect(result.current.task?.updatedAt).toBeInstanceOf(Date)
    expect(result.current.task?.completedAt).toBeInstanceOf(Date)
    expect(result.current.task?.attachments[0]?.createdAt).toBeInstanceOf(Date)
  })

  it('calls update mutation with correct args including expectedVersion', async () => {
    const fixture = makeTask()
    queryClient.setQueryData(QUERY_KEY, fixture)
    mockMutate.mockResolvedValue(undefined)

    const { result } = renderHook(() => useTaskDetail(INPUT), { wrapper: Wrapper })

    await act(async () => {
      result.current.update({ title: 'New title' })
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })

    expect(mockMutate).toHaveBeenCalledOnce()
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        planId: 'plan-1',
        actorId: 'actor-1',
        tenantId: 'tenant-1',
        title: 'New title',
        expectedVersion: BASE_DATE.toISOString(),
      }),
    )
  })

  it('sets saving true during mutation and false after success', async () => {
    const fixture = makeTask()
    queryClient.setQueryData(QUERY_KEY, fixture)

    let resolvePromise!: () => void
    const mutatePromise = new Promise<void>((r) => {
      resolvePromise = r
    })
    mockMutate.mockReturnValue(mutatePromise)

    const { result } = renderHook(() => useTaskDetail(INPUT), { wrapper: Wrapper })

    act(() => {
      result.current.update({ title: 'New title' })
    })

    expect(result.current.saving).toBe(true)

    await act(async () => {
      resolvePromise()
      await new Promise((r) => setTimeout(r, 0))
    })

    expect(result.current.saving).toBe(false)
  })

  it('sets conflict when 409 CONFLICT and server has a different value for patched field', async () => {
    const fixture = makeTask({ title: 'Original title' })
    queryClient.setQueryData(QUERY_KEY, fixture)

    const conflictError = { data: { code: 'CONFLICT' }, message: 'Conflict' }
    mockMutate.mockRejectedValue(conflictError)

    const serverTask = makeTask({
      title: 'Server title',
      updatedAt: new Date('2026-01-02T00:00:00Z'),
    })

    const refetchSpy = vi.spyOn(queryClient, 'refetchQueries').mockImplementation(async () => {
      queryClient.setQueryData(QUERY_KEY, serverTask)
    })

    const { result } = renderHook(() => useTaskDetail(INPUT), { wrapper: Wrapper })

    await act(async () => {
      result.current.update({ title: 'Mine' })
      await new Promise((r) => setTimeout(r, 20))
    })

    expect(refetchSpy).toHaveBeenCalledOnce()
    expect(result.current.conflict).toEqual(serverTask)
    expect(result.current.saving).toBe(false)
  })

  it('normalizes attachment msSyncState when a valid value is provided', async () => {
    _mockQuery.mockResolvedValue({
      ...makeTask(),
      attachments: [
        {
          kind: 'file',
          id: 'att-1',
          filename: 'doc.txt',
          contentType: 'text/plain',
          sizeBytes: 10,
          url: 'https://example.com/doc.txt',
          createdBy: 'actor-1',
          createdAt: '2026-01-07T00:00:00.000Z',
          msSyncState: 'pending_upload',
        },
      ],
    } as unknown as TaskDetailSnapshot)

    const { result } = renderHook(() => useTaskDetail(INPUT), { wrapper: Wrapper })

    await waitFor(() => {
      expect(result.current.task?.attachments[0]?.msSyncState).toBe('pending_upload')
    })
  })

  it('skips mutation when patch values match current cached task', async () => {
    const fixture = makeTask()
    queryClient.setQueryData(QUERY_KEY, fixture)
    mockMutate.mockResolvedValue(undefined)

    const { result } = renderHook(() => useTaskDetail(INPUT), { wrapper: Wrapper })

    await act(async () => {
      result.current.update({ description: 'Original description' })
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })

    expect(mockMutate).not.toHaveBeenCalled()
  })

  it('sets lastError and clears saving on non-conflict network error', async () => {
    const fixture = makeTask()
    queryClient.setQueryData(QUERY_KEY, fixture)
    mockMutate.mockRejectedValue(new Error('Network failure'))

    const { result } = renderHook(() => useTaskDetail(INPUT), { wrapper: Wrapper })

    await act(async () => {
      result.current.update({ title: 'New title' })
      await new Promise((r) => setTimeout(r, 20))
    })

    expect(result.current.lastError).toBeInstanceOf(Error)
    expect(result.current.lastError?.message).toBe('Network failure')
    expect(result.current.saving).toBe(false)
  })

  it('sets lastError on non-Error rejection', async () => {
    const fixture = makeTask()
    queryClient.setQueryData(QUERY_KEY, fixture)
    mockMutate.mockRejectedValue('string error')

    const { result } = renderHook(() => useTaskDetail(INPUT), { wrapper: Wrapper })

    await act(async () => {
      result.current.update({ title: 'New title' })
      await new Promise((r) => setTimeout(r, 20))
    })

    expect(result.current.lastError).toBeInstanceOf(Error)
    expect(result.current.saving).toBe(false)
  })

  it('sets lastError when retry fails after CONFLICT', async () => {
    const fixture = makeTask({ title: 'Original' })
    queryClient.setQueryData(QUERY_KEY, fixture)

    const conflictError = { data: { code: 'CONFLICT' }, message: 'Conflict' }
    // First call: CONFLICT, second call: network error
    mockMutate.mockRejectedValueOnce(conflictError).mockRejectedValueOnce(new Error('Retry failed'))

    const serverTask = makeTask({ title: 'Mine', updatedAt: new Date('2026-01-02T00:00:00Z') })
    vi.spyOn(queryClient, 'refetchQueries').mockImplementation(async () => {
      queryClient.setQueryData(QUERY_KEY, serverTask)
    })

    const { result } = renderHook(() => useTaskDetail(INPUT), { wrapper: Wrapper })

    await act(async () => {
      result.current.update({ title: 'Mine' })
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(result.current.lastError).toBeInstanceOf(Error)
    expect(result.current.saving).toBe(false)
  })

  it('silent merge when 409 CONFLICT but server value matches what we sent', async () => {
    const fixture = makeTask({ title: 'Original title' })
    queryClient.setQueryData(QUERY_KEY, fixture)

    const conflictError = { data: { code: 'CONFLICT' }, message: 'Conflict' }
    mockMutate.mockRejectedValueOnce(conflictError).mockResolvedValueOnce(undefined)

    const serverTask = makeTask({
      title: 'Mine',
      description: 'Server changed description',
      updatedAt: new Date('2026-01-02T00:00:00Z'),
    })

    const refetchSpy = vi.spyOn(queryClient, 'refetchQueries').mockImplementation(async () => {
      queryClient.setQueryData(QUERY_KEY, serverTask)
    })

    const { result } = renderHook(() => useTaskDetail(INPUT), { wrapper: Wrapper })

    await act(async () => {
      result.current.update({ title: 'Mine' })
      await new Promise((r) => setTimeout(r, 20))
    })

    expect(refetchSpy).toHaveBeenCalled()
    expect(result.current.conflict).toBeNull()
    expect(mockMutate).toHaveBeenCalledTimes(2)
    expect(mockMutate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: 'Mine',
        expectedVersion: serverTask.updatedAt.toISOString(),
      }),
    )
  })
})
