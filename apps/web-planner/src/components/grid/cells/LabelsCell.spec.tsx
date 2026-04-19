import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LabelsCell } from './LabelsCell'
import type { TaskFlat } from '@future/api-client/planner'

const mockApplyLabel = vi.fn()
const mockRemoveLabel = vi.fn()

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
        applyLabel: { mutate: (...args: unknown[]) => mockApplyLabel(...args) },
        removeLabel: { mutate: (...args: unknown[]) => mockRemoveLabel(...args) },
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

const planLabels = [
  { id: 'category1', name: 'Design', color: '#5e6ad2' },
  { id: 'category2', name: 'Backend', color: '#10b981' },
  { id: 'category3', name: 'Infra', color: '#8b5cf6' },
]

describe('LabelsCell', () => {
  beforeEach(() => {
    mockApplyLabel.mockReset()
    mockApplyLabel.mockResolvedValue(undefined)
    mockRemoveLabel.mockReset()
    mockRemoveLabel.mockResolvedValue(undefined)
  })

  it('renders a dash when no labels applied', () => {
    render(<LabelsCell task={makeTask()} planLabels={planLabels} />)
    expect(screen.getByRole('button', { name: /change labels/i })).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders label pills when task has labels', () => {
    const task = makeTask({
      labels: [{ id: 'category1', name: 'Design', color: '#5e6ad2' }],
    })
    render(<LabelsCell task={task} planLabels={planLabels} />)
    expect(screen.getByText('Design')).toBeInTheDocument()
  })

  it('opens a popover with all plan labels on click', async () => {
    const user = userEvent.setup()
    render(<LabelsCell task={makeTask()} planLabels={planLabels} />)
    await user.click(screen.getByRole('button', { name: /change labels/i }))
    expect(screen.getByTestId('labels-popover')).toBeInTheDocument()
    expect(screen.getByTestId('label-option-category1')).toBeInTheDocument()
    expect(screen.getByTestId('label-option-category2')).toBeInTheDocument()
    expect(screen.getByTestId('label-option-category3')).toBeInTheDocument()
  })

  it('calls applyLabel mutation when an unset label is clicked', async () => {
    const user = userEvent.setup()
    render(<LabelsCell task={makeTask()} planLabels={planLabels} />)
    await user.click(screen.getByRole('button', { name: /change labels/i }))
    await user.click(screen.getByTestId('label-option-category1'))
    expect(mockApplyLabel).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      planId: 'plan-1',
      taskId: 'task-1',
      actorId: 'actor-1',
      expectedVersion: '2026-01-01T00:00:00.000Z',
      slot: 'category1',
    })
  })

  it('calls removeLabel mutation when an applied label is clicked', async () => {
    const user = userEvent.setup()
    const task = makeTask({
      labels: [{ id: 'category1', name: 'Design', color: '#5e6ad2' }],
    })
    render(<LabelsCell task={task} planLabels={planLabels} />)
    await user.click(screen.getByRole('button', { name: /change labels/i }))
    await user.click(screen.getByTestId('label-option-category1'))
    expect(mockRemoveLabel).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      planId: 'plan-1',
      taskId: 'task-1',
      actorId: 'actor-1',
      expectedVersion: '2026-01-01T00:00:00.000Z',
      slot: 'category1',
    })
  })

  it('shows empty message when no plan labels defined', async () => {
    const user = userEvent.setup()
    render(<LabelsCell task={makeTask()} planLabels={[]} />)
    await user.click(screen.getByRole('button', { name: /change labels/i }))
    expect(screen.getByText(/no labels defined/i)).toBeInTheDocument()
  })
})
