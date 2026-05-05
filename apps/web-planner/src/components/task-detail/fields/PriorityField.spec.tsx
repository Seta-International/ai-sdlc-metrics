import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@future/api-client'
import { PriorityField } from './PriorityField'
import type { TaskDetailSnapshot } from '@/lib/board-types'

vi.mock('@future/auth', () => ({
  useSession: () => ({ actorId: 'actor-1', tenantId: 'tenant-1' }),
}))

const mockSetPriorityMutate = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    planner: {
      tasks: {
        setPriority: { mutate: (...args: unknown[]) => mockSetPriorityMutate(...args) },
      },
    },
  },
}))

vi.mock('../../pickers/PriorityPicker', () => ({
  PriorityPicker: ({
    onSelect,
    onClose,
  }: {
    currentPriority: number
    onSelect: (p: number) => void
    onClose: () => void
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'priority-picker' },
      React.createElement('button', { onClick: () => onSelect(9) }, 'Pick Urgent'),
      React.createElement('button', { onClick: onClose }, 'Close'),
    ),
}))

vi.mock('../../primitives/PriorityIcon', () => ({
  PriorityIcon: ({ priority }: { priority: number }) =>
    React.createElement('span', { 'data-testid': `priority-icon-${priority}` }),
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

function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, children)
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.clearAllMocks()
  mockSetPriorityMutate.mockResolvedValue(undefined)
})

afterEach(() => {
  queryClient.clear()
  cleanup()
})

describe('PriorityField', () => {
  it('renders priority-field with current priority label', () => {
    render(
      <Wrapper>
        <PriorityField taskId="task-1" planId="plan-1" task={makeTask({ priority: 3 })} />
      </Wrapper>,
    )
    expect(screen.getByTestId('priority-field')).toBeDefined()
    expect(screen.getByText('Normal')).toBeDefined()
  })

  it('does not show picker by default', () => {
    render(
      <Wrapper>
        <PriorityField taskId="task-1" planId="plan-1" task={makeTask()} />
      </Wrapper>,
    )
    expect(screen.queryByTestId('priority-picker')).toBeNull()
  })

  it('opens picker when button is clicked', async () => {
    render(
      <Wrapper>
        <PriorityField taskId="task-1" planId="plan-1" task={makeTask()} />
      </Wrapper>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Priority:/i }))
    expect(screen.getByTestId('priority-picker')).toBeDefined()
  })

  it('closes picker when onClose is called', async () => {
    render(
      <Wrapper>
        <PriorityField taskId="task-1" planId="plan-1" task={makeTask()} />
      </Wrapper>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Priority:/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByTestId('priority-picker')).toBeNull()
  })

  it('calls setPriority.mutate when a priority is selected', async () => {
    render(
      <Wrapper>
        <PriorityField taskId="task-1" planId="plan-1" task={makeTask()} />
      </Wrapper>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Priority:/i }))
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Pick Urgent' }))
    })
    expect(mockSetPriorityMutate).toHaveBeenCalledOnce()
    expect(mockSetPriorityMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        planId: 'plan-1',
        actorId: 'actor-1',
        tenantId: 'tenant-1',
        priority: 9,
      }),
    )
  })

  it('closes picker on outside click', async () => {
    render(
      <Wrapper>
        <PriorityField taskId="task-1" planId="plan-1" task={makeTask()} />
      </Wrapper>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Priority:/i }))
    fireEvent.mouseDown(document.body)
    expect(screen.queryByTestId('priority-picker')).toBeNull()
  })

  it('renders different label for each priority value', () => {
    const { unmount } = render(
      <Wrapper>
        <PriorityField taskId="task-1" planId="plan-1" task={makeTask({ priority: 1 })} />
      </Wrapper>,
    )
    expect(screen.getByText('Low')).toBeDefined()
    unmount()

    render(
      <Wrapper>
        <PriorityField taskId="task-1" planId="plan-1" task={makeTask({ priority: 9 })} />
      </Wrapper>,
    )
    expect(screen.getByText('Urgent')).toBeDefined()
  })
})
