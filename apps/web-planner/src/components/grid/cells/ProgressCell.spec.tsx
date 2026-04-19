import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProgressCell } from './ProgressCell'
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
        setProgress: {
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

describe('ProgressCell', () => {
  beforeEach(() => {
    mockMutate.mockReset()
    mockMutate.mockResolvedValue(undefined)
  })

  it('renders the current progress label', () => {
    render(<ProgressCell task={makeTask({ progress: 'not-started' })} />)
    expect(screen.getByRole('button', { name: /change progress/i })).toBeInTheDocument()
    expect(screen.getByText(/not started/i)).toBeInTheDocument()
  })

  it('renders in-progress label', () => {
    render(<ProgressCell task={makeTask({ progress: 'in-progress' })} />)
    expect(screen.getByText(/in progress/i)).toBeInTheDocument()
  })

  it('renders completed label', () => {
    render(<ProgressCell task={makeTask({ progress: 'completed' })} />)
    expect(screen.getByText(/completed/i)).toBeInTheDocument()
  })

  it('opens a popover with options on click', async () => {
    const user = userEvent.setup()
    render(<ProgressCell task={makeTask()} />)
    await user.click(screen.getByRole('button', { name: /change progress/i }))
    expect(screen.getByTestId('progress-popover')).toBeInTheDocument()
    expect(screen.getByTestId('progress-option-not-started')).toBeInTheDocument()
    expect(screen.getByTestId('progress-option-in-progress')).toBeInTheDocument()
    expect(screen.getByTestId('progress-option-completed')).toBeInTheDocument()
  })

  it('calls setProgress mutation with correct args when option is selected', async () => {
    const user = userEvent.setup()
    const task = makeTask({ progress: 'not-started' })
    render(<ProgressCell task={task} />)
    await user.click(screen.getByRole('button', { name: /change progress/i }))
    await user.click(screen.getByTestId('progress-option-in-progress'))
    expect(mockMutate).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      planId: 'plan-1',
      taskId: 'task-1',
      actorId: 'actor-1',
      expectedVersion: '2026-01-01T00:00:00.000Z',
      progress: 50,
    })
  })

  it('calls setProgress with 100 for completed', async () => {
    const user = userEvent.setup()
    const task = makeTask({ progress: 'not-started' })
    render(<ProgressCell task={task} />)
    await user.click(screen.getByRole('button', { name: /change progress/i }))
    await user.click(screen.getByTestId('progress-option-completed'))
    expect(mockMutate).toHaveBeenCalledWith(expect.objectContaining({ progress: 100 }))
  })

  it('calls setProgress with 0 for not-started', async () => {
    const user = userEvent.setup()
    const task = makeTask({ progress: 'in-progress' })
    render(<ProgressCell task={task} />)
    await user.click(screen.getByRole('button', { name: /change progress/i }))
    await user.click(screen.getByTestId('progress-option-not-started'))
    expect(mockMutate).toHaveBeenCalledWith(expect.objectContaining({ progress: 0 }))
  })
})
