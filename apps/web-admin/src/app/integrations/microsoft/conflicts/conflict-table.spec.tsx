import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ConflictTable } from './conflict-table'
import type { ConflictDto } from './conflict-row'
import { useSession } from '@future/auth'
import { useMutation } from '@future/api-client'

vi.mock('@future/auth', () => ({
  useSession: vi.fn(),
}))

vi.mock('@future/api-client', () => ({
  useMutation: vi.fn(),
}))

vi.mock('../../../../lib/trpc', () => ({
  trpc: {
    planner: {
      msSync: {
        conflicts: {
          retry: { mutate: vi.fn() },
          acceptMsState: { mutate: vi.fn() },
        },
      },
    },
  },
}))

const mockedUseSession = vi.mocked(useSession)
const mockedUseMutation = vi.mocked(useMutation)

function makeConflict(overrides: Partial<ConflictDto> = {}): ConflictDto {
  return {
    id: '01900000-0000-7000-8000-000000000001',
    kind: 'push_412_exhausted',
    createdAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2 minutes ago
    taskId: 'task-1',
    taskTitle: 'Fix login bug',
    planTitle: 'Sprint 1',
    field: null,
    mineValue: null,
    theirsValue: null,
    limitCode: null,
    resolution: null,
    resolvedAt: null,
    rawError: null,
    ...overrides,
  }
}

describe('<ConflictTable />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseSession.mockReturnValue({
      actorId: '01900000-0000-7000-8000-00000000aa01',
      tenantId: '01900000-0000-7000-8000-00000000bb01',
      roles: ['tenant_admin'],
      displayName: 'Admin',
      email: 'admin@example.com',
      provider: 'microsoft',
    })
    mockedUseMutation.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useMutation>)
  })

  it('renders task title and kind badge', () => {
    render(
      <ConflictTable conflicts={[makeConflict()]} isLoading={false} onActionSuccess={vi.fn()} />,
    )

    expect(screen.getByText('Fix login bug')).toBeInTheDocument()
    expect(screen.getByText('Push retry exhausted')).toBeInTheDocument()
  })

  it('renders relative time for createdAt', () => {
    render(
      <ConflictTable conflicts={[makeConflict()]} isLoading={false} onActionSuccess={vi.fn()} />,
    )

    expect(screen.getByText(/minutes ago/i)).toBeInTheDocument()
  })

  it('renders "—" for tasks with no taskId', () => {
    render(
      <ConflictTable
        conflicts={[makeConflict({ taskId: null, taskTitle: null })]}
        isLoading={false}
        onActionSuccess={vi.fn()}
      />,
    )

    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders empty state when no conflicts', () => {
    render(<ConflictTable conflicts={[]} isLoading={false} onActionSuccess={vi.fn()} />)

    // DataTable renders empty state
    expect(screen.queryByText('Fix login bug')).not.toBeInTheDocument()
  })

  it('opens drawer on View button click', async () => {
    const user = userEvent.setup()

    render(
      <ConflictTable conflicts={[makeConflict()]} isLoading={false} onActionSuccess={vi.fn()} />,
    )

    await user.click(screen.getByRole('button', { name: /View conflict details/i }))
    expect(screen.getByText('Conflict detail')).toBeInTheDocument()
  })

  it('passes error prop to DataTable for display', () => {
    render(
      <ConflictTable
        conflicts={[]}
        isLoading={false}
        error="Failed to load conflicts"
        onRetry={vi.fn()}
        onActionSuccess={vi.fn()}
      />,
    )

    expect(screen.getByText('Failed to load conflicts')).toBeInTheDocument()
  })
})
