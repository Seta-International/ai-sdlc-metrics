import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@future/api-client'
import { AssigneesField } from './AssigneesField'
import type { BoardSnapshot, TaskDetailSnapshot } from '@/lib/board-types'

vi.mock('@future/auth', () => ({
  useSession: () => ({ actorId: 'actor-1', tenantId: 'tenant-1' }),
}))

vi.mock('../../assignees/AssigneePicker', () => ({
  AssigneePicker: ({ onClose }: { onClose: () => void }) =>
    React.createElement(
      'div',
      { 'data-testid': 'assignee-picker' },
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

function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, children)
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.clearAllMocks()
})

afterEach(() => {
  queryClient.clear()
  cleanup()
})

describe('AssigneesField', () => {
  it('renders assignees-field container', () => {
    render(
      <Wrapper>
        <AssigneesField taskId="task-1" planId="plan-1" task={makeTask()} />
      </Wrapper>,
    )
    expect(screen.getByTestId('assignees-field')).toBeDefined()
  })

  it('shows "No assignees" when task has no assignees', () => {
    render(
      <Wrapper>
        <AssigneesField taskId="task-1" planId="plan-1" task={makeTask({ assignees: [] })} />
      </Wrapper>,
    )
    expect(screen.getByText('No assignees')).toBeDefined()
  })

  it('shows assignee avatars when task has assignees', () => {
    render(
      <Wrapper>
        <AssigneesField
          taskId="task-1"
          planId="plan-1"
          task={makeTask({
            assignees: [
              { actorId: 'actor-2', name: 'Bob Smith', avatarUrl: undefined },
              { actorId: 'actor-3', name: 'Carol Jones', avatarUrl: undefined },
            ],
          })}
        />
      </Wrapper>,
    )
    expect(screen.queryByText('No assignees')).toBeNull()
  })

  it('does not show picker by default', () => {
    render(
      <Wrapper>
        <AssigneesField taskId="task-1" planId="plan-1" task={makeTask()} />
      </Wrapper>,
    )
    expect(screen.queryByTestId('assignee-picker')).toBeNull()
  })

  it('opens picker when manage assignees button is clicked', async () => {
    render(
      <Wrapper>
        <AssigneesField taskId="task-1" planId="plan-1" task={makeTask()} />
      </Wrapper>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Manage assignees/i }))
    expect(screen.getByTestId('assignee-picker')).toBeDefined()
  })

  it('closes picker when onClose is called', async () => {
    render(
      <Wrapper>
        <AssigneesField taskId="task-1" planId="plan-1" task={makeTask()} />
      </Wrapper>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Manage assignees/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByTestId('assignee-picker')).toBeNull()
  })

  it('closes picker on outside click', async () => {
    render(
      <Wrapper>
        <AssigneesField taskId="task-1" planId="plan-1" task={makeTask()} />
      </Wrapper>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Manage assignees/i }))
    fireEvent.mouseDown(document.body)
    expect(screen.queryByTestId('assignee-picker')).toBeNull()
  })

  it('seeds empty board snapshot in cache when not present', () => {
    render(
      <Wrapper>
        <AssigneesField taskId="task-1" planId="plan-1" task={makeTask()} />
      </Wrapper>,
    )
    const cached = queryClient.getQueryData<BoardSnapshot>([
      'tasks.getBoard',
      'plan-1',
      'actor-1',
      'tenant-1',
    ])
    expect(cached).toBeDefined()
    expect(cached?.plan.members).toEqual([])
  })
})
