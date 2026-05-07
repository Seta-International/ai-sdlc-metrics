import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@future/api-client'
import { LabelsField } from './LabelsField'
import type { BoardSnapshot, TaskDetailSnapshot } from '@/lib/board-types'

vi.mock('@future/auth', () => ({
  useSession: () => ({ actorId: 'actor-1', tenantId: 'tenant-1' }),
}))

vi.mock('../../labels/LabelPicker', () => ({
  LabelPicker: ({ onClose }: { onClose: () => void }) =>
    React.createElement(
      'div',
      { 'data-testid': 'label-picker' },
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

function makeBoardSnapshot(): BoardSnapshot {
  return {
    plan: {
      id: 'plan-1',
      name: 'Plan 1',
      labels: [
        { slot: '0', name: 'Bug', color: '#e53e3e' },
        { slot: '1', name: 'Feature', color: '#38a169' },
      ],
      members: [],
    },
    buckets: [],
  }
}

let queryClient: QueryClient
const BOARD_QUERY_KEY = ['tasks.getBoard', 'plan-1', 'actor-1', 'tenant-1'] as const

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

describe('LabelsField', () => {
  it('renders labels-field container', () => {
    render(
      <Wrapper>
        <LabelsField taskId="task-1" planId="plan-1" task={makeTask()} />
      </Wrapper>,
    )
    expect(screen.getByTestId('labels-field')).toBeDefined()
  })

  it('shows "No labels" when task has no applied labels', () => {
    render(
      <Wrapper>
        <LabelsField taskId="task-1" planId="plan-1" task={makeTask({ appliedLabels: [] })} />
      </Wrapper>,
    )
    expect(screen.getByText('No labels')).toBeDefined()
  })

  it('shows label chips when labels are applied', () => {
    queryClient.setQueryData(BOARD_QUERY_KEY, makeBoardSnapshot())
    render(
      <Wrapper>
        <LabelsField
          taskId="task-1"
          planId="plan-1"
          task={makeTask({ appliedLabels: ['0', '1'] })}
        />
      </Wrapper>,
    )
    expect(screen.getByText('Bug')).toBeDefined()
    expect(screen.getByText('Feature')).toBeDefined()
  })

  it('does not show picker by default', () => {
    render(
      <Wrapper>
        <LabelsField taskId="task-1" planId="plan-1" task={makeTask()} />
      </Wrapper>,
    )
    expect(screen.queryByTestId('label-picker')).toBeNull()
  })

  it('opens picker when manage labels button is clicked', async () => {
    render(
      <Wrapper>
        <LabelsField taskId="task-1" planId="plan-1" task={makeTask()} />
      </Wrapper>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Manage labels/i }))
    expect(screen.getByTestId('label-picker')).toBeDefined()
  })

  it('closes picker when onClose is called from picker', async () => {
    render(
      <Wrapper>
        <LabelsField taskId="task-1" planId="plan-1" task={makeTask()} />
      </Wrapper>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Manage labels/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByTestId('label-picker')).toBeNull()
  })

  it('closes picker on outside click', async () => {
    render(
      <Wrapper>
        <LabelsField taskId="task-1" planId="plan-1" task={makeTask()} />
      </Wrapper>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Manage labels/i }))
    expect(screen.getByTestId('label-picker')).toBeDefined()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByTestId('label-picker')).toBeNull()
  })

  it('seeds empty board snapshot when no board data in cache', () => {
    render(
      <Wrapper>
        <LabelsField taskId="task-1" planId="plan-1" task={makeTask()} />
      </Wrapper>,
    )
    const cached = queryClient.getQueryData<BoardSnapshot>(BOARD_QUERY_KEY)
    expect(cached).toBeDefined()
    expect(cached?.plan.labels).toEqual([])
  })
})
