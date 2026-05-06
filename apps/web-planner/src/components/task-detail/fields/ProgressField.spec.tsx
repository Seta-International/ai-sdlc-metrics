import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@future/api-client'
import { ProgressField } from './ProgressField'
import type { TaskDetailSnapshot } from '@/lib/board-types'

vi.mock('@future/auth', () => ({
  useSession: () => ({ actorId: 'actor-1', tenantId: 'tenant-1' }),
}))

const mockSetProgressMutate = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    planner: {
      tasks: {
        setProgress: { mutate: (...args: unknown[]) => mockSetProgressMutate(...args) },
      },
    },
  },
}))

vi.mock('../../pickers/ProgressPicker', () => ({
  ProgressPicker: ({
    onSelect,
    onClose,
  }: {
    currentProgress: number
    onSelect: (p: number) => void
    onClose: () => void
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'progress-picker' },
      React.createElement('button', { onClick: () => onSelect(100) }, 'Pick Complete'),
      React.createElement('button', { onClick: onClose }, 'Close'),
    ),
}))

vi.mock('../../primitives/ProgressIcon', () => ({
  ProgressIcon: ({ progress }: { progress: number }) =>
    React.createElement('span', { 'data-testid': `progress-icon-${progress}` }),
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
  mockSetProgressMutate.mockResolvedValue(undefined)
})

afterEach(() => {
  queryClient.clear()
  cleanup()
})

describe('ProgressField', () => {
  it('renders progress-field with current progress label', () => {
    render(
      <Wrapper>
        <ProgressField taskId="task-1" planId="plan-1" task={makeTask({ progress: 0 })} />
      </Wrapper>,
    )
    expect(screen.getByTestId('progress-field')).toBeDefined()
    expect(screen.getByText('Not started')).toBeDefined()
  })

  it('does not show picker by default', () => {
    render(
      <Wrapper>
        <ProgressField taskId="task-1" planId="plan-1" task={makeTask()} />
      </Wrapper>,
    )
    expect(screen.queryByTestId('progress-picker')).toBeNull()
  })

  it('opens picker when button is clicked', async () => {
    render(
      <Wrapper>
        <ProgressField taskId="task-1" planId="plan-1" task={makeTask()} />
      </Wrapper>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Progress:/i }))
    expect(screen.getByTestId('progress-picker')).toBeDefined()
  })

  it('closes picker when onClose is called', async () => {
    render(
      <Wrapper>
        <ProgressField taskId="task-1" planId="plan-1" task={makeTask()} />
      </Wrapper>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Progress:/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByTestId('progress-picker')).toBeNull()
  })

  it('calls setProgress.mutate when a progress is selected', async () => {
    render(
      <Wrapper>
        <ProgressField taskId="task-1" planId="plan-1" task={makeTask()} />
      </Wrapper>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Progress:/i }))
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Pick Complete' }))
    })
    expect(mockSetProgressMutate).toHaveBeenCalledOnce()
    expect(mockSetProgressMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        planId: 'plan-1',
        actorId: 'actor-1',
        tenantId: 'tenant-1',
        progress: 100,
      }),
    )
  })

  it('closes picker on outside click', async () => {
    render(
      <Wrapper>
        <ProgressField taskId="task-1" planId="plan-1" task={makeTask()} />
      </Wrapper>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Progress:/i }))
    fireEvent.mouseDown(document.body)
    expect(screen.queryByTestId('progress-picker')).toBeNull()
  })

  it('renders correct labels for all progress values', () => {
    const { unmount } = render(
      <Wrapper>
        <ProgressField taskId="task-1" planId="plan-1" task={makeTask({ progress: 50 })} />
      </Wrapper>,
    )
    expect(screen.getByText('In progress')).toBeDefined()
    unmount()

    render(
      <Wrapper>
        <ProgressField taskId="task-1" planId="plan-1" task={makeTask({ progress: 100 })} />
      </Wrapper>,
    )
    expect(screen.getByText('Complete')).toBeDefined()
  })
})
