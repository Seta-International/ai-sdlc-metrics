import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DueCell } from './DueCell'
import type { TaskFlat } from '@future/api-client/planner'

const mockMutate = vi.fn()

vi.mock('@future/auth', () => ({
  useSession: () => ({
    actorId: 'actor-1',
    tenantId: 'tenant-1',
    roles: [],
    displayName: 'Test User',
    email: 'test@example.com',
    provider: 'google',
  }),
}))

vi.mock('../../../lib/trpc', () => ({
  trpc: {
    planner: {
      tasks: {
        setDates: {
          mutate: (...args: unknown[]) => mockMutate(...args),
        },
      },
    },
  },
}))

function makeTask(overrides: Partial<TaskFlat> = {}): TaskFlat {
  return {
    id: 'task-1',
    planId: 'plan-1',
    bucketId: 'bucket-1',
    bucketName: 'Bucket',
    bucketOrderHint: 'a',
    title: 'Test task',
    progress: 'not-started',
    priority: 'medium',
    startDate: null,
    dueDate: null,
    assignees: [],
    labels: [],
    orderHint: 'a',
    commentCount: 0,
    checklistCount: { total: 0, completed: 0 },
    attachmentCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('DueCell', () => {
  beforeEach(() => {
    mockMutate.mockReset()
    mockMutate.mockResolvedValue(undefined)
  })

  it('renders a dash when no due date', () => {
    render(<DueCell task={makeTask({ dueDate: null })} />)
    expect(screen.getByRole('button', { name: /change due date/i })).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders a due badge when due date is set', () => {
    render(<DueCell task={makeTask({ dueDate: '2099-12-31T00:00:00.000Z' })} />)
    // DueBadge renders formatted date — just check button is present and no dash
    const btn = screen.getByRole('button', { name: /change due date/i })
    expect(btn).toBeInTheDocument()
    expect(screen.queryByText('—')).toBeNull()
  })

  it('opens a popover with a date input on click', async () => {
    const user = userEvent.setup()
    render(<DueCell task={makeTask()} />)
    await user.click(screen.getByRole('button', { name: /change due date/i }))
    expect(screen.getByTestId('due-date-popover')).toBeInTheDocument()
    expect(screen.getByTestId('due-date-input')).toBeInTheDocument()
  })

  it('calls setDates mutation when a date is entered', async () => {
    const user = userEvent.setup()
    const task = makeTask({ startDate: null, dueDate: null })
    render(<DueCell task={task} />)
    await user.click(screen.getByRole('button', { name: /change due date/i }))
    const input = screen.getByTestId('due-date-input')
    await user.type(input, '2027-06-15')
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        planId: 'plan-1',
        taskId: 'task-1',
        actorId: 'actor-1',
        expectedVersion: '2026-01-01T00:00:00.000Z',
        startDate: null,
      }),
    )
  })

  it('shows a clear button when due date is set', async () => {
    const user = userEvent.setup()
    const task = makeTask({ dueDate: '2099-12-31T00:00:00.000Z' })
    render(<DueCell task={task} />)
    await user.click(screen.getByRole('button', { name: /change due date/i }))
    expect(screen.getByTestId('due-date-clear')).toBeInTheDocument()
  })

  it('calls setDates with null dueDate when clear is clicked', async () => {
    const user = userEvent.setup()
    const task = makeTask({ dueDate: '2099-12-31T00:00:00.000Z' })
    render(<DueCell task={task} />)
    await user.click(screen.getByRole('button', { name: /change due date/i }))
    await user.click(screen.getByTestId('due-date-clear'))
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ dueDate: null, expectedVersion: '2026-01-01T00:00:00.000Z' }),
    )
  })
})
