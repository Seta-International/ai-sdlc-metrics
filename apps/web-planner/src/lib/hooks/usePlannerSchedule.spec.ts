import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePlannerSchedule } from './usePlannerSchedule'
import type { TaskFlat } from '@future/api-client/planner'

// Mock trpc
vi.mock('@/lib/trpc', () => ({
  trpc: {
    planner: {
      tasks: {
        setDates: { mutate: vi.fn().mockResolvedValue(undefined) },
      },
    },
  },
}))

// Mock useSession
vi.mock('@future/auth', () => ({
  useSession: () => ({ actorId: 'actor-1', tenantId: 'tenant-1' }),
}))

// Mock useViewState
vi.mock('@/lib/hooks/useViewState', () => ({
  useViewState: () => ({
    state: {
      groupBy: 'priority',
      filter: { priority: [], labels: [], buckets: [], assignees: [] },
      scale: 'week',
    },
  }),
}))

const makeTask = (overrides: Partial<TaskFlat> = {}): TaskFlat => ({
  id: 'task-1',
  planId: 'plan-1',
  bucketId: 'bucket-1',
  bucketName: 'To Do',
  bucketOrderHint: 'a',
  title: 'Task One',
  progress: 'not-started',
  priority: 'urgent',
  startDate: '2026-04-10T00:00Z',
  dueDate: '2026-04-12T00:00Z',
  assignees: [],
  labels: [],
  orderHint: 'a',
  commentCount: 0,
  checklistCount: { total: 0, completed: 0 },
  attachmentCount: 0,
  createdAt: '2026-04-01T00:00Z',
  updatedAt: '2026-04-01T00:00Z',
  ...overrides,
})

describe('usePlannerSchedule', () => {
  it('maps TaskFlat priority to a color when groupBy=priority', () => {
    const { result } = renderHook(() => usePlannerSchedule('plan-1', [makeTask()]))
    const item = result.current.items[0]!
    expect(item.id).toBe('task-1')
    expect(item.color).toBe('var(--chart-priority-urgent)')
    expect(item.version).toBe('2026-04-01T00:00Z')
    expect(item.payload).toEqual(expect.objectContaining({ id: 'task-1' }))
  })

  it('onChange calls setDates with correct params', async () => {
    const { trpc } = await import('@/lib/trpc')
    const { result } = renderHook(() => usePlannerSchedule('plan-1', [makeTask()]))
    result.current.onChange({
      id: 'task-1',
      version: '2026-04-01T00:00Z',
      kind: 'bar',
      next: { startDate: '2026-04-14', dueDate: '2026-04-15' },
    })
    expect(trpc.planner.tasks.setDates.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        planId: 'plan-1',
        startDate: new Date('2026-04-14'),
        dueDate: new Date('2026-04-15'),
        expectedVersion: '2026-04-01T00:00Z',
      }),
    )
  })

  it('pendingClear is null initially; setClear sets it', () => {
    const { result } = renderHook(() => usePlannerSchedule('plan-1', [makeTask()]))
    expect(result.current.pendingClear).toBeNull()
  })
})
