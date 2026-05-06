import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@future/api-client'
import { BucketField } from './BucketField'
import type { BoardSnapshot, TaskDetailSnapshot } from '@/lib/board-types'

vi.mock('@future/auth', () => ({
  useSession: () => ({ actorId: 'actor-1', tenantId: 'tenant-1' }),
}))

const mockMoveMutate = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    planner: {
      tasks: {
        move: { mutate: (...args: unknown[]) => mockMoveMutate(...args) },
      },
    },
  },
}))

vi.mock('../../pickers/BucketPicker', () => ({
  BucketPicker: ({
    onSelect,
    onClose,
  }: {
    buckets: { id: string; name: string }[]
    currentBucketId: string
    onSelect: (id: string) => void
    onClose: () => void
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'bucket-picker' },
      React.createElement('button', { onClick: () => onSelect('bucket-2') }, 'Pick bucket-2'),
      React.createElement('button', { onClick: onClose }, 'Close'),
    ),
}))

const BASE_DATE = new Date('2026-01-01T00:00:00Z')

function makeTask(overrides: Partial<TaskDetailSnapshot> = {}): TaskDetailSnapshot {
  return {
    id: 'task-1',
    planId: 'plan-1',
    title: 'My Task',
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
    attachments: [],
    ...overrides,
  }
}

let queryClient: QueryClient
const BOARD_QUERY_KEY = ['tasks.getBoard', 'plan-1', 'actor-1', 'tenant-1'] as const

function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, children)
}

function makeBoardSnapshot(): BoardSnapshot {
  return {
    plan: { id: 'plan-1', name: 'Plan 1', labels: [], members: [] },
    buckets: [
      { id: 'bucket-1', name: 'To Do', orderHint: 'a0', tasks: [] },
      { id: 'bucket-2', name: 'In Progress', orderHint: 'b0', tasks: [] },
    ],
  }
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.clearAllMocks()
  mockMoveMutate.mockResolvedValue(undefined)
})

afterEach(() => {
  queryClient.clear()
  cleanup()
})

describe('BucketField', () => {
  it('renders the field with the current bucket name', () => {
    render(
      <Wrapper>
        <BucketField taskId="task-1" planId="plan-1" task={makeTask()} />
      </Wrapper>,
    )
    expect(screen.getByText('To Do')).toBeDefined()
    expect(screen.getByTestId('bucket-field')).toBeDefined()
  })

  it('does not show picker by default', () => {
    render(
      <Wrapper>
        <BucketField taskId="task-1" planId="plan-1" task={makeTask()} />
      </Wrapper>,
    )
    expect(screen.queryByTestId('bucket-picker')).toBeNull()
  })

  it('opens picker when field button is clicked', async () => {
    render(
      <Wrapper>
        <BucketField taskId="task-1" planId="plan-1" task={makeTask()} />
      </Wrapper>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Bucket:/i }))
    expect(screen.getByTestId('bucket-picker')).toBeDefined()
  })

  it('closes picker when onClose is called', async () => {
    render(
      <Wrapper>
        <BucketField taskId="task-1" planId="plan-1" task={makeTask()} />
      </Wrapper>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Bucket:/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByTestId('bucket-picker')).toBeNull()
  })

  it('calls move.mutate when a different bucket is selected', async () => {
    queryClient.setQueryData(BOARD_QUERY_KEY, makeBoardSnapshot())
    render(
      <Wrapper>
        <BucketField taskId="task-1" planId="plan-1" task={makeTask()} />
      </Wrapper>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Bucket:/i }))
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Pick bucket-2' }))
    })
    expect(mockMoveMutate).toHaveBeenCalledOnce()
    expect(mockMoveMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        planId: 'plan-1',
        actorId: 'actor-1',
        tenantId: 'tenant-1',
        toBucketId: 'bucket-2',
      }),
    )
  })

  it('does not call move.mutate when same bucket is selected', async () => {
    render(
      <Wrapper>
        <BucketField
          taskId="task-1"
          planId="plan-1"
          task={makeTask({ bucketId: 'bucket-2', bucketName: 'In Progress' })}
        />
      </Wrapper>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Bucket:/i }))
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Pick bucket-2' }))
    })
    expect(mockMoveMutate).not.toHaveBeenCalled()
  })

  it('closes picker when clicking outside', async () => {
    render(
      <Wrapper>
        <BucketField taskId="task-1" planId="plan-1" task={makeTask()} />
      </Wrapper>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Bucket:/i }))
    expect(screen.getByTestId('bucket-picker')).toBeDefined()

    fireEvent.mouseDown(document.body)
    expect(screen.queryByTestId('bucket-picker')).toBeNull()
  })
})
