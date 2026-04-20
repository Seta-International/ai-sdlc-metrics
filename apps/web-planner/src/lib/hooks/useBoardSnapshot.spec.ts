import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('../trpc', () => ({
  trpc: {
    planner: {
      tasks: {
        getBoard: {
          query: vi.fn(),
        },
      },
    },
  },
}))

import { trpc } from '../trpc'
import { useBoardSnapshot } from './useBoardSnapshot'

const mockQuery = vi.mocked(
  (trpc.planner.tasks.getBoard as { query: ReturnType<typeof vi.fn> }).query,
)

let queryClient: QueryClient

function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useBoardSnapshot', () => {
  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    vi.clearAllMocks()
  })

  afterEach(() => {
    queryClient.clear()
  })

  it('normalizes date fields from API strings to Date objects', async () => {
    mockQuery.mockResolvedValue({
      plan: { id: 'plan-1', name: 'Plan', labels: [], members: [] },
      buckets: [
        {
          id: 'bucket-1',
          name: 'Todo',
          orderHint: 'a',
          tasks: [
            {
              id: 'task-1',
              title: 'Task',
              description: '',
              progress: 0,
              priority: 3,
              startDate: '2026-04-20T01:00:00.000Z',
              dueDate: '2026-04-20T02:00:00.000Z',
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
              updatedAt: '2026-04-20T03:00:00.000Z',
            },
          ],
        },
      ],
    })

    const { result } = renderHook(
      () => useBoardSnapshot({ planId: 'plan-1', actorId: 'actor-1', tenantId: 'tenant-1' }),
      { wrapper: Wrapper },
    )

    await waitFor(() => {
      expect(result.current.data).toBeDefined()
    })

    const task = result.current.data!.buckets[0]!.tasks[0]!
    expect(task.startDate).toBeInstanceOf(Date)
    expect(task.dueDate).toBeInstanceOf(Date)
    expect(task.updatedAt).toBeInstanceOf(Date)
  })
})
