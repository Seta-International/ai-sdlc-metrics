import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TaskChecklist } from './TaskChecklist'
import type { ChecklistItemSnapshot, TaskDetailSnapshot } from '@/lib/board-types'

vi.mock('@future/auth', () => ({
  useSession: () => ({ actorId: 'actor-1', tenantId: 'tenant-1' }),
}))

const mockToggleMutate = vi.fn()
const mockRemoveMutate = vi.fn()
const mockAddMutate = vi.fn()
const mockUpdateMutate = vi.fn()
const mockReorderMutate = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    planner: {
      checklist: {
        toggle: { mutate: (...args: unknown[]) => mockToggleMutate(...args) },
        remove: { mutate: (...args: unknown[]) => mockRemoveMutate(...args) },
        add: { mutate: (...args: unknown[]) => mockAddMutate(...args) },
        update: { mutate: (...args: unknown[]) => mockUpdateMutate(...args) },
        reorder: { mutate: (...args: unknown[]) => mockReorderMutate(...args) },
      },
    },
  },
}))

const BASE_DATE = new Date('2026-01-01T00:00:00Z')

function makeItem(overrides: Partial<ChecklistItemSnapshot> = {}): ChecklistItemSnapshot {
  return {
    id: 'item-1',
    title: 'Item One',
    isChecked: false,
    orderHint: 'a0',
    ...overrides,
  }
}

function makeTask(overrides: Partial<TaskDetailSnapshot> = {}): TaskDetailSnapshot {
  return {
    id: 'task-1',
    planId: 'plan-1',
    title: 'Task title',
    description: '',
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
    ...overrides,
  }
}

let queryClient: QueryClient

function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, children)
}

const QUERY_KEY = ['tasks.getDetail', 'task-1', 'actor-1', 'tenant-1'] as const

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.clearAllMocks()
  mockToggleMutate.mockResolvedValue(undefined)
  mockRemoveMutate.mockResolvedValue(undefined)
  mockAddMutate.mockResolvedValue(undefined)
  mockUpdateMutate.mockResolvedValue(undefined)
  mockReorderMutate.mockResolvedValue(undefined)
})

afterEach(() => {
  queryClient.clear()
  cleanup()
})

describe('TaskChecklist', () => {
  it('renders item titles from query cache', () => {
    const item1 = makeItem({ id: 'item-1', title: 'First item', orderHint: 'a0' })
    const item2 = makeItem({ id: 'item-2', title: 'Second item', orderHint: 'b0' })
    const task = makeTask({
      checklistItemCount: 2,
      checklistCheckedCount: 0,
      checklist: [item1, item2],
    })
    queryClient.setQueryData(QUERY_KEY, task)

    render(
      <Wrapper>
        <TaskChecklist taskId="task-1" planId="plan-1" />
      </Wrapper>,
    )

    expect(screen.getByText('First item')).toBeDefined()
    expect(screen.getByText('Second item')).toBeDefined()
  })

  it('disables add input at 20 items and shows hint text', () => {
    const task = makeTask({
      checklistItemCount: 20,
      checklistCheckedCount: 0,
      checklist: [],
    })
    queryClient.setQueryData(QUERY_KEY, task)

    render(
      <Wrapper>
        <TaskChecklist taskId="task-1" planId="plan-1" />
      </Wrapper>,
    )

    const input = screen.getByPlaceholderText('Add an item…')
    expect((input as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByText('Maximum 20 items reached')).toBeDefined()
  })

  it('optimistic toggle flips isChecked in cache before mutation resolves', async () => {
    const item1 = makeItem({ id: 'item-1', title: 'Toggle me', isChecked: false, orderHint: 'a0' })
    const task = makeTask({
      checklistItemCount: 1,
      checklistCheckedCount: 0,
      checklist: [item1],
    })
    queryClient.setQueryData(QUERY_KEY, task)

    let resolveToggle!: () => void
    mockToggleMutate.mockReturnValue(
      new Promise<void>((r) => {
        resolveToggle = r
      }),
    )

    render(
      <Wrapper>
        <TaskChecklist taskId="task-1" planId="plan-1" />
      </Wrapper>,
    )

    const checkbox = screen.getByRole('checkbox')
    await act(async () => {
      await userEvent.click(checkbox)
    })

    const cached = queryClient.getQueryData<TaskDetailSnapshot>(QUERY_KEY)
    expect(cached?.checklist[0]?.isChecked).toBe(true)
    expect(cached?.checklistCheckedCount).toBe(1)

    resolveToggle()
  })

  it('remove calls checklist.remove.mutate with correct itemId', async () => {
    const item1 = makeItem({ id: 'item-1', title: 'Delete me', orderHint: 'a0' })
    const task = makeTask({
      checklistItemCount: 1,
      checklistCheckedCount: 0,
      checklist: [item1],
    })
    queryClient.setQueryData(QUERY_KEY, task)

    render(
      <Wrapper>
        <TaskChecklist taskId="task-1" planId="plan-1" />
      </Wrapper>,
    )

    const deleteBtn = screen.getByRole('button', { name: 'Delete item' })
    await act(async () => {
      await userEvent.click(deleteBtn)
    })

    expect(mockRemoveMutate).toHaveBeenCalledOnce()
    expect(mockRemoveMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'item-1',
        taskId: 'task-1',
        planId: 'plan-1',
        actorId: 'actor-1',
        tenantId: 'tenant-1',
      }),
    )
  })
})
