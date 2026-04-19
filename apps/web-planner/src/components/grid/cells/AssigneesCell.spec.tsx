import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AssigneesCell } from './AssigneesCell'
import type { TaskFlat } from '@future/api-client/planner'

const mockAssign = vi.fn()
const mockUnassign = vi.fn()

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
        assign: { mutate: (...args: unknown[]) => mockAssign(...args) },
        unassign: { mutate: (...args: unknown[]) => mockUnassign(...args) },
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

const planMembers = [
  { actorId: 'member-1', displayName: 'Alice Smith' },
  { actorId: 'member-2', displayName: 'Bob Jones' },
]

describe('AssigneesCell', () => {
  beforeEach(() => {
    mockAssign.mockReset()
    mockAssign.mockResolvedValue(undefined)
    mockUnassign.mockReset()
    mockUnassign.mockResolvedValue(undefined)
  })

  it('renders a dash when no assignees', () => {
    render(<AssigneesCell task={makeTask()} planMembers={planMembers} />)
    expect(screen.getByRole('button', { name: /change assignees/i })).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders avatar stack when task has assignees', () => {
    const task = makeTask({
      assignees: [{ actorId: 'member-1', displayName: 'Alice Smith', avatarUrl: null }],
    })
    render(<AssigneesCell task={task} planMembers={planMembers} />)
    // Avatar stack uses aria-label
    expect(screen.getByLabelText(/1 assignee/i)).toBeInTheDocument()
  })

  it('opens a popover with member list on click', async () => {
    const user = userEvent.setup()
    render(<AssigneesCell task={makeTask()} planMembers={planMembers} />)
    await user.click(screen.getByRole('button', { name: /change assignees/i }))
    expect(screen.getByTestId('assignees-popover')).toBeInTheDocument()
    expect(screen.getByTestId('assignee-option-member-1')).toBeInTheDocument()
    expect(screen.getByTestId('assignee-option-member-2')).toBeInTheDocument()
  })

  it('calls assign mutation when unassigned member is clicked', async () => {
    const user = userEvent.setup()
    render(<AssigneesCell task={makeTask()} planMembers={planMembers} />)
    await user.click(screen.getByRole('button', { name: /change assignees/i }))
    await user.click(screen.getByTestId('assignee-option-member-1'))
    expect(mockAssign).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      planId: 'plan-1',
      taskId: 'task-1',
      actorId: 'actor-1',
      expectedVersion: '2026-01-01T00:00:00.000Z',
      assigneeId: 'member-1',
    })
  })

  it('calls unassign mutation when assigned member is clicked', async () => {
    const user = userEvent.setup()
    const task = makeTask({
      assignees: [{ actorId: 'member-1', displayName: 'Alice Smith', avatarUrl: null }],
    })
    render(<AssigneesCell task={task} planMembers={planMembers} />)
    await user.click(screen.getByRole('button', { name: /change assignees/i }))
    await user.click(screen.getByTestId('assignee-option-member-1'))
    expect(mockUnassign).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      planId: 'plan-1',
      taskId: 'task-1',
      actorId: 'actor-1',
      expectedVersion: '2026-01-01T00:00:00.000Z',
      assigneeId: 'member-1',
    })
  })

  it('shows empty message when no plan members', async () => {
    const user = userEvent.setup()
    render(<AssigneesCell task={makeTask()} planMembers={[]} />)
    await user.click(screen.getByRole('button', { name: /change assignees/i }))
    expect(screen.getByText(/no members/i)).toBeInTheDocument()
  })
})
