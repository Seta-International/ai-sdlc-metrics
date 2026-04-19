import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PriorityCell } from './PriorityCell'
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
        setPriority: {
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

describe('PriorityCell', () => {
  beforeEach(() => {
    mockMutate.mockReset()
    mockMutate.mockResolvedValue(undefined)
  })

  it('renders the current priority label', () => {
    render(<PriorityCell task={makeTask({ priority: 'medium' })} />)
    expect(screen.getByRole('button', { name: /change priority/i })).toBeInTheDocument()
    expect(screen.getByText('Medium')).toBeInTheDocument()
  })

  it('renders urgent label', () => {
    render(<PriorityCell task={makeTask({ priority: 'urgent' })} />)
    expect(screen.getByText('Urgent')).toBeInTheDocument()
  })

  it('opens a popover with all options on click', async () => {
    const user = userEvent.setup()
    render(<PriorityCell task={makeTask()} />)
    await user.click(screen.getByRole('button', { name: /change priority/i }))
    expect(screen.getByTestId('priority-popover')).toBeInTheDocument()
    expect(screen.getByTestId('priority-option-urgent')).toBeInTheDocument()
    expect(screen.getByTestId('priority-option-important')).toBeInTheDocument()
    expect(screen.getByTestId('priority-option-medium')).toBeInTheDocument()
    expect(screen.getByTestId('priority-option-low')).toBeInTheDocument()
  })

  it('calls setPriority mutation with numeric 1 for urgent', async () => {
    const user = userEvent.setup()
    const task = makeTask({ priority: 'medium' })
    render(<PriorityCell task={task} />)
    await user.click(screen.getByRole('button', { name: /change priority/i }))
    await user.click(screen.getByTestId('priority-option-urgent'))
    expect(mockMutate).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      planId: 'plan-1',
      taskId: 'task-1',
      actorId: 'actor-1',
      expectedVersion: '2026-01-01T00:00:00.000Z',
      priority: 1,
    })
  })

  it('calls setPriority with numeric 9 for low', async () => {
    const user = userEvent.setup()
    const task = makeTask({ priority: 'urgent' })
    render(<PriorityCell task={task} />)
    await user.click(screen.getByRole('button', { name: /change priority/i }))
    await user.click(screen.getByTestId('priority-option-low'))
    expect(mockMutate).toHaveBeenCalledWith(expect.objectContaining({ priority: 9 }))
  })

  it('calls setPriority with 3 for important', async () => {
    const user = userEvent.setup()
    render(<PriorityCell task={makeTask()} />)
    await user.click(screen.getByRole('button', { name: /change priority/i }))
    await user.click(screen.getByTestId('priority-option-important'))
    expect(mockMutate).toHaveBeenCalledWith(expect.objectContaining({ priority: 3 }))
  })
})
