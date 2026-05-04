import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@future/api-client'
import React from 'react'
import { TaskCard } from './TaskCard'
import type { BoardTaskSnapshot, PlanLabel } from '../../lib/board-types'

// dnd-kit requires a full DndContext to use useSortable.
// We mock useSortable to avoid the need for a DndContext in unit tests.
vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
  verticalListSortingStrategy: {},
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => undefined,
    },
  },
}))

// Mock trpc for picker mutations (unused in these tests but needed for import)
vi.mock('../../lib/trpc', () => ({
  trpc: {
    planner: {
      tasks: {
        setPriority: { mutate: vi.fn() },
        setDates: { mutate: vi.fn() },
        assign: { mutate: vi.fn() },
        unassign: { mutate: vi.fn() },
        applyLabel: { mutate: vi.fn() },
        removeLabel: { mutate: vi.fn() },
      },
      personal: {
        myDay: {
          add: { mutate: vi.fn() },
          remove: { mutate: vi.fn() },
        },
      },
      admin: {
        getTenantTimezone: { query: vi.fn() },
      },
    },
  },
}))

vi.mock('@future/auth', () => ({
  useSession: () => ({ actorId: 'actor-1', tenantId: 'tenant-1' }),
}))

vi.mock('../../lib/hooks/useTenantTimezone', () => ({
  useTenantTimezone: () => ({ timezone: 'Asia/Ho_Chi_Minh', isLoading: false }),
}))

vi.mock('../../lib/hooks/use-add-to-my-day', () => ({
  useAddToMyDay: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('../../lib/hooks/use-remove-from-my-day', () => ({
  useRemoveFromMyDay: () => ({ mutate: vi.fn(), isPending: false }),
}))

import { trpc } from '../../lib/trpc'
const mockSetPriority = vi.mocked(
  (trpc.planner.tasks.setPriority as { mutate: ReturnType<typeof vi.fn> }).mutate,
)
const mockSetDates = vi.mocked(
  (trpc.planner.tasks.setDates as { mutate: ReturnType<typeof vi.fn> }).mutate,
)

function makeTask(overrides: Partial<BoardTaskSnapshot> = {}): BoardTaskSnapshot {
  return {
    id: 'task-1',
    title: 'Default task title',
    description: '',
    progress: 0,
    priority: 3,
    startDate: null,
    dueDate: null,
    orderHint: 'a0',
    completedAt: null,
    completedBy: null,
    checklistItemCount: 0,
    checklistCheckedCount: 0,
    attachmentCount: 0,
    commentCount: 0,
    evidenceCount: 0,
    hasPendingAttachment: false,
    coverAttachmentId: null,
    appliedLabels: [],
    assignees: [],
    updatedAt: new Date(),
    ...overrides,
  }
}

const emptyLabels: PlanLabel[] = []

const planLabels: PlanLabel[] = [
  { slot: 'category1', name: 'Urgent', color: '#ef4444' },
  { slot: 'category2', name: 'Design', color: '#5e6ad2' },
  { slot: 'category3', name: 'Backend', color: '#10b981' },
  { slot: 'category4', name: 'Frontend', color: '#f59e0b' },
  { slot: 'category5', name: 'Infra', color: '#8b5cf6' },
]

const TASK_PROPS = {
  planId: 'plan-1',
  actorId: 'actor-1',
  tenantId: 'tenant-1',
}

let _queryClientRef = new QueryClient({ defaultOptions: { queries: { retry: false } } })

function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: _queryClientRef }, children)
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  _queryClientRef = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

describe('TaskCard', () => {
  it('renders task title', () => {
    render(
      <TaskCard
        task={makeTask({ title: 'My feature task' })}
        planLabels={emptyLabels}
        {...TASK_PROPS}
      />,
      { wrapper: Wrapper },
    )
    expect(screen.getByText('My feature task')).toBeDefined()
  })

  it('shows overdue DueBadge when dueDate is yesterday', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)

    render(
      <TaskCard task={makeTask({ dueDate: yesterday })} planLabels={emptyLabels} {...TASK_PROPS} />,
      { wrapper: Wrapper },
    )

    // DueBadge renders with an aria-label containing "(overdue)"
    const badge = screen.getByLabelText(/overdue/i)
    expect(badge).toBeDefined()
  })

  it('shows priority icon when priority is 9 (urgent)', () => {
    render(<TaskCard task={makeTask({ priority: 9 })} planLabels={emptyLabels} {...TASK_PROPS} />, {
      wrapper: Wrapper,
    })

    // PriorityIcon renders with aria-label "Urgent"
    const icon = screen.getByRole('img', { name: /urgent/i })
    expect(icon).toBeDefined()
  })

  it('does NOT show priority icon when priority is not 9', () => {
    render(<TaskCard task={makeTask({ priority: 5 })} planLabels={emptyLabels} {...TASK_PROPS} />, {
      wrapper: Wrapper,
    })
    expect(screen.queryByRole('img', { name: /priority/i })).toBeNull()
  })

  it('shows checklist badge when checklistItemCount > 0', () => {
    render(
      <TaskCard
        task={makeTask({ checklistItemCount: 5, checklistCheckedCount: 2 })}
        planLabels={emptyLabels}
        {...TASK_PROPS}
      />,
      { wrapper: Wrapper },
    )

    // aria-label is "2 of 5 checklist items done"
    const badge = screen.getByLabelText(/2 of 5 checklist items done/i)
    expect(badge).toBeDefined()
  })

  it('does NOT show checklist badge when checklistItemCount is 0', () => {
    render(
      <TaskCard
        task={makeTask({ checklistItemCount: 0 })}
        planLabels={emptyLabels}
        {...TASK_PROPS}
      />,
      { wrapper: Wrapper },
    )
    // The "N/M" text should not appear
    expect(screen.queryByLabelText(/checklist items done/i)).toBeNull()
  })

  it('shows +N label overflow when more than 4 labels are applied', () => {
    const task = makeTask({
      appliedLabels: ['category1', 'category2', 'category3', 'category4', 'category5'],
    })

    render(<TaskCard task={task} planLabels={planLabels} {...TASK_PROPS} />, {
      wrapper: Wrapper,
    })

    // 4 pills visible + "+1" overflow
    expect(screen.getByText('+1')).toBeDefined()
    expect(screen.getByText('Urgent')).toBeDefined()
    expect(screen.getByText('Design')).toBeDefined()
    expect(screen.getByText('Backend')).toBeDefined()
    expect(screen.getByText('Frontend')).toBeDefined()
    // 'Infra' (5th) should NOT be visible
    expect(screen.queryByText('Infra')).toBeNull()
  })

  it('calls onToggleComplete with next progress when checkmark is clicked', async () => {
    const onToggleComplete = vi.fn()
    const { container } = render(
      <TaskCard
        task={makeTask({ progress: 0 })}
        planLabels={emptyLabels}
        onToggleComplete={onToggleComplete}
        {...TASK_PROPS}
      />,
      { wrapper: Wrapper },
    )

    const btn = container.querySelector('button[aria-label="Mark complete"]') as HTMLButtonElement
    btn.click()

    expect(onToggleComplete).toHaveBeenCalledWith('task-1', 100)
  })

  it('renders the PersonalPlanBadge when task.planName is present', () => {
    const taskWithPlan = { ...makeTask(), planName: 'Alpha', planKind: 'team' } as BoardTaskSnapshot
    render(<TaskCard task={taskWithPlan} planLabels={emptyLabels} {...TASK_PROPS} />, {
      wrapper: Wrapper,
    })
    expect(screen.getByText('Alpha')).toBeDefined()
  })

  it('does NOT render a badge when planName is absent (single-plan page)', () => {
    render(<TaskCard task={makeTask()} planLabels={emptyLabels} {...TASK_PROPS} />, {
      wrapper: Wrapper,
    })
    expect(screen.queryByLabelText(/team plan|personal plan/i)).toBeNull()
  })

  it('renders the Focus today menu item in the kebab', async () => {
    const user = userEvent.setup()

    render(<TaskCard task={makeTask()} planLabels={emptyLabels} {...TASK_PROPS} />, {
      wrapper: Wrapper,
    })

    await user.click(screen.getByTestId('task-card-menu-btn'))

    expect(screen.getByText('Focus today')).toBeDefined()
  })

  it('shows "Attachment pending upload" badge when hasPendingAttachment is true', () => {
    render(
      <TaskCard
        task={makeTask({ hasPendingAttachment: true })}
        planLabels={emptyLabels}
        {...TASK_PROPS}
      />,
      { wrapper: Wrapper },
    )
    expect(screen.getByTestId('pending-upload-badge')).toBeDefined()
  })

  it('does NOT show pending upload badge when hasPendingAttachment is false', () => {
    render(
      <TaskCard
        task={makeTask({ hasPendingAttachment: false })}
        planLabels={emptyLabels}
        {...TASK_PROPS}
      />,
      { wrapper: Wrapper },
    )
    expect(screen.queryByTestId('pending-upload-badge')).toBeNull()
  })

  it('progress toggle button is always visible (no opacity-0 class)', () => {
    render(<TaskCard task={makeTask({ progress: 0 })} planLabels={emptyLabels} {...TASK_PROPS} />, {
      wrapper: Wrapper,
    })
    const toggleBtn = screen.getByRole('button', { name: 'Mark complete' })
    expect(toggleBtn.className).not.toContain('opacity-0')
  })

  it('writes server updatedAt to cache after setPriority mutation', async () => {
    const serverUpdatedAt = new Date('2026-06-01T12:00:00Z')
    mockSetPriority.mockResolvedValue({ updatedAt: serverUpdatedAt })

    const task = makeTask({ priority: 3, updatedAt: new Date('2026-01-01') })
    const snapshot = {
      plan: { id: 'plan-1', name: 'Plan', labels: [], members: [] },
      buckets: [{ id: 'bucket-1', name: 'To Do', orderHint: 'a', tasks: [task] }],
    }
    _queryClientRef.setQueryData(['tasks.getBoard', 'plan-1', 'actor-1', 'tenant-1'], snapshot)

    render(<TaskCard task={task} planLabels={emptyLabels} {...TASK_PROPS} />, { wrapper: Wrapper })

    await userEvent.click(screen.getByTestId('task-card-menu-btn'))
    await userEvent.click(screen.getByTestId('task-menu-priority'))
    await userEvent.click(screen.getByTestId('priority-option-9'))

    await waitFor(() => expect(mockSetPriority).toHaveBeenCalledTimes(1))

    const cached = _queryClientRef.getQueryData<typeof snapshot>([
      'tasks.getBoard',
      'plan-1',
      'actor-1',
      'tenant-1',
    ])
    const cachedTask = cached?.buckets[0]?.tasks[0]
    expect(cachedTask?.updatedAt).toEqual(serverUpdatedAt)
  })

  describe('due date input', () => {
    it('does NOT fire mutation on onChange (only updates local state)', async () => {
      mockSetDates.mockResolvedValue({ updatedAt: new Date() })

      const task = makeTask()
      render(<TaskCard task={task} planLabels={emptyLabels} {...TASK_PROPS} />, {
        wrapper: Wrapper,
      })

      await userEvent.click(screen.getByTestId('task-card-menu-btn'))
      await userEvent.click(screen.getByTestId('task-menu-due-date'))

      const dateInput = screen.getByLabelText('Due date input')
      fireEvent.change(dateInput, { target: { value: '2026-12-31' } })

      expect(mockSetDates).not.toHaveBeenCalled()
    })

    it('fires mutation on onBlur', async () => {
      const serverDate = new Date('2026-07-01T00:00:00Z')
      mockSetDates.mockResolvedValue({ updatedAt: serverDate })

      const task = makeTask()
      const snapshot = {
        plan: { id: 'plan-1', name: 'Plan', labels: [], members: [] },
        buckets: [{ id: 'bucket-1', name: 'To Do', orderHint: 'a', tasks: [task] }],
      }
      _queryClientRef.setQueryData(['tasks.getBoard', 'plan-1', 'actor-1', 'tenant-1'], snapshot)

      render(<TaskCard task={task} planLabels={emptyLabels} {...TASK_PROPS} />, {
        wrapper: Wrapper,
      })

      await userEvent.click(screen.getByTestId('task-card-menu-btn'))
      await userEvent.click(screen.getByTestId('task-menu-due-date'))

      const dateInput = screen.getByLabelText('Due date input')
      fireEvent.change(dateInput, { target: { value: '2026-12-31' } })
      fireEvent.blur(dateInput)

      await waitFor(() => expect(mockSetDates).toHaveBeenCalledTimes(1))
    })
  })
})
