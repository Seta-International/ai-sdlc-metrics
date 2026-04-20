import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import type { TaskFlatWithPlan } from '@future/api-client/planner'

vi.mock('../../lib/trpc', () => ({
  trpc: {
    planner: {
      personal: {
        myDay: {
          add: { mutate: vi.fn() },
          remove: { mutate: vi.fn() },
        },
      },
    },
  },
}))

vi.mock('@future/auth', () => ({
  useSession: vi.fn(() => ({ actorId: 'actor-1', tenantId: 'tenant-1' })),
}))

vi.mock('../../lib/hooks/useTenantTimezone', () => ({
  useTenantTimezone: () => ({ timezone: 'Asia/Ho_Chi_Minh', isLoading: false }),
}))

import { trpc } from '../../lib/trpc'
import { AddToMyDayButton } from './add-to-my-day-button'

const mockAdd = vi.mocked(
  (trpc.planner.personal.myDay as unknown as { add: { mutate: ReturnType<typeof vi.fn> } }).add
    .mutate,
)
const mockRemove = vi.mocked(
  (trpc.planner.personal.myDay as unknown as { remove: { mutate: ReturnType<typeof vi.fn> } })
    .remove.mutate,
)

function makeTask(): TaskFlatWithPlan {
  return {
    id: 'task-1',
    planId: 'plan-1',
    planName: 'Personal',
    planKind: 'personal',
    bucketId: 'b1',
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
    createdAt: '2026-04-20T00:00:00Z',
    updatedAt: '2026-04-20T00:00:00Z',
  }
}

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(React.createElement(QueryClientProvider, { client: qc }, ui as React.ReactNode))
}

describe('AddToMyDayButton', () => {
  beforeEach(() => {
    mockAdd.mockReset()
    mockRemove.mockReset()
  })

  it('renders "Focus today" when the task is not in My Day', () => {
    wrap(<AddToMyDayButton task={makeTask()} inMyDay={false} mode="button" />)
    expect(screen.getByRole('button', { name: /focus today/i })).toBeInTheDocument()
  })

  it('calls add.mutate when clicked and not in My Day', async () => {
    mockAdd.mockResolvedValue(undefined)
    wrap(<AddToMyDayButton task={makeTask()} inMyDay={false} mode="button" />)
    await userEvent.click(screen.getByRole('button', { name: /focus today/i }))
    await waitFor(() => expect(mockAdd).toHaveBeenCalled())
    const callArg = mockAdd.mock.calls[0]?.[0] as { taskId: string }
    expect(callArg.taskId).toBe('task-1')
  })

  it('renders "Remove from My Day" when the task is in My Day', () => {
    wrap(<AddToMyDayButton task={makeTask()} inMyDay mode="button" />)
    expect(screen.getByRole('button', { name: /remove from my day/i })).toBeInTheDocument()
  })

  it('calls remove.mutate when clicked and in My Day', async () => {
    mockRemove.mockResolvedValue(undefined)
    wrap(<AddToMyDayButton task={makeTask()} inMyDay mode="button" />)
    await userEvent.click(screen.getByRole('button', { name: /remove from my day/i }))
    await waitFor(() => expect(mockRemove).toHaveBeenCalled())
  })
})
