import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@future/api-client'
import React from 'react'
import { TaskDetailTab } from './TaskDetailTab'
import type { TaskDetailSnapshot } from '@/lib/board-types'

vi.mock('@future/auth', () => ({
  useSession: () => ({ actorId: 'actor-1', tenantId: 'tenant-1', displayName: 'Test User' }),
}))

vi.mock('@/lib/trpc', () => ({
  trpc: {
    planner: {
      tasks: {
        setPriority: { mutate: vi.fn() },
        setProgress: { mutate: vi.fn() },
        setDates: { mutate: vi.fn() },
        move: { mutate: vi.fn() },
        update: { mutate: vi.fn() },
      },
      customFields: {
        setValue: { mutate: vi.fn() },
      },
    },
  },
}))

function makeTask(overrides: Partial<TaskDetailSnapshot> = {}): TaskDetailSnapshot {
  return {
    id: 'task-1',
    planId: 'plan-1',
    title: 'Test task',
    description: '<p>Hello</p>',
    progress: 0,
    priority: 3,
    startDate: null,
    dueDate: new Date('2026-07-15'),
    updatedAt: new Date('2026-05-01'),
    bucketId: 'bucket-1',
    bucketName: 'To Do',
    orderHint: 'a0',
    completedAt: null,
    completedBy: null,
    checklistItemCount: 2,
    checklistCheckedCount: 1,
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

let qc: QueryClient

function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

afterEach(() => cleanup())

describe('TaskDetailTab', () => {
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })

  it('renders priority field', () => {
    render(<TaskDetailTab taskId="task-1" planId="plan-1" task={makeTask()} />, {
      wrapper: Wrapper,
    })
    expect(screen.getByTestId('priority-field')).toBeDefined()
  })

  it('renders progress field', () => {
    render(<TaskDetailTab taskId="task-1" planId="plan-1" task={makeTask()} />, {
      wrapper: Wrapper,
    })
    expect(screen.getByTestId('progress-field')).toBeDefined()
  })

  it('renders start date field', () => {
    render(<TaskDetailTab taskId="task-1" planId="plan-1" task={makeTask()} />, {
      wrapper: Wrapper,
    })
    expect(screen.getByTestId('start-date-field')).toBeDefined()
  })

  it('renders due date field', () => {
    render(<TaskDetailTab taskId="task-1" planId="plan-1" task={makeTask()} />, {
      wrapper: Wrapper,
    })
    expect(screen.getByTestId('due-date-field')).toBeDefined()
  })

  it('renders bucket field with bucket name', () => {
    render(<TaskDetailTab taskId="task-1" planId="plan-1" task={makeTask()} />, {
      wrapper: Wrapper,
    })
    expect(screen.getByTestId('bucket-field')).toBeDefined()
    expect(screen.getByText('To Do')).toBeDefined()
  })

  it('renders assignees field', () => {
    render(<TaskDetailTab taskId="task-1" planId="plan-1" task={makeTask()} />, {
      wrapper: Wrapper,
    })
    expect(screen.getByTestId('assignees-field')).toBeDefined()
  })

  it('renders labels field', () => {
    render(<TaskDetailTab taskId="task-1" planId="plan-1" task={makeTask()} />, {
      wrapper: Wrapper,
    })
    expect(screen.getByTestId('labels-field')).toBeDefined()
  })

  it('renders rich text description', () => {
    render(
      <TaskDetailTab
        taskId="task-1"
        planId="plan-1"
        task={makeTask({ description: '<p>Desc</p>' })}
      />,
      { wrapper: Wrapper },
    )
    expect(screen.getByTestId('rich-text-description')).toBeDefined()
  })
})
