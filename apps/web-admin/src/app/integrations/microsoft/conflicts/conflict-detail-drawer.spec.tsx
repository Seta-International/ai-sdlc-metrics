import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ConflictDetailDrawer } from './conflict-detail-drawer'
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

function makeMutations() {
  mockedUseMutation.mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useMutation>)
}

function makeConflict(overrides: Partial<ConflictDto> = {}): ConflictDto {
  return {
    id: '01900000-0000-7000-8000-000000000001',
    kind: 'push_412_exhausted',
    createdAt: '2026-04-29T10:00:00.000Z',
    taskId: 'task-1',
    taskTitle: 'Fix login bug',
    planTitle: 'Sprint 1',
    field: null,
    mineValue: null,
    theirsValue: null,
    limitCode: null,
    resolution: null,
    resolvedAt: null,
    rawError: { code: 'ETagMismatch' },
    ...overrides,
  }
}

describe('<ConflictDetailDrawer />', () => {
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
    makeMutations()
  })

  it('renders nothing when conflict is null', () => {
    const { container } = render(
      <ConflictDetailDrawer
        conflict={null}
        open={false}
        onOpenChange={vi.fn()}
        onActionSuccess={vi.fn()}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows Retry and Accept MS state buttons for push_412_exhausted', () => {
    render(
      <ConflictDetailDrawer
        conflict={makeConflict({ kind: 'push_412_exhausted' })}
        open={true}
        onOpenChange={vi.fn()}
        onActionSuccess={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Accept MS state/i })).toBeInTheDocument()
  })

  it('shows Retry and Accept MS state buttons for push_failed', () => {
    render(
      <ConflictDetailDrawer
        conflict={makeConflict({ kind: 'push_failed' })}
        open={true}
        onOpenChange={vi.fn()}
        onActionSuccess={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Accept MS state/i })).toBeInTheDocument()
  })

  it('calls retry mutation on Retry click for push_412_exhausted', async () => {
    const user = userEvent.setup()
    const retryMutate = vi.fn()
    mockedUseMutation
      .mockReturnValueOnce({
        mutate: retryMutate,
        mutateAsync: vi.fn(),
        isPending: false,
      } as unknown as ReturnType<typeof useMutation>)
      .mockReturnValue({
        mutate: vi.fn(),
        mutateAsync: vi.fn(),
        isPending: false,
      } as unknown as ReturnType<typeof useMutation>)

    render(
      <ConflictDetailDrawer
        conflict={makeConflict({ kind: 'push_412_exhausted', id: 'conflict-abc' })}
        open={true}
        onOpenChange={vi.fn()}
        onActionSuccess={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Retry/i }))
    expect(retryMutate).toHaveBeenCalledWith('conflict-abc')
  })

  it('shows Retry upload button for attachment_upload_failed', () => {
    render(
      <ConflictDetailDrawer
        conflict={makeConflict({ kind: 'attachment_upload_failed' })}
        open={true}
        onOpenChange={vi.fn()}
        onActionSuccess={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /Retry upload/i })).toBeInTheDocument()
  })

  it('shows side-by-side values for field_lww kind', () => {
    render(
      <ConflictDetailDrawer
        conflict={makeConflict({
          kind: 'field_lww',
          field: 'title',
          mineValue: 'My title',
          theirsValue: 'MS title',
        })}
        open={true}
        onOpenChange={vi.fn()}
        onActionSuccess={vi.fn()}
      />,
    )

    expect(screen.getByText('Your change')).toBeInTheDocument()
    expect(screen.getByText('Microsoft 365 change')).toBeInTheDocument()
    expect(screen.getByText('My title')).toBeInTheDocument()
    expect(screen.getByText('MS title')).toBeInTheDocument()
  })

  it('shows auto-resolve note for pull_unresolved_assignee', () => {
    render(
      <ConflictDetailDrawer
        conflict={makeConflict({ kind: 'pull_unresolved_assignee' })}
        open={true}
        onOpenChange={vi.fn()}
        onActionSuccess={vi.fn()}
      />,
    )

    expect(screen.getByText(/Resolves automatically on next identity sync/i)).toBeInTheDocument()
  })

  it('shows Reconnect link for credential_invalidated', () => {
    render(
      <ConflictDetailDrawer
        conflict={makeConflict({ kind: 'credential_invalidated' })}
        open={true}
        onOpenChange={vi.fn()}
        onActionSuccess={vi.fn()}
      />,
    )

    const link = screen.getByRole('link', { name: /Reconnect/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/integrations/microsoft')
  })

  it('shows disabled Retry button for push_403_quota', () => {
    render(
      <ConflictDetailDrawer
        conflict={makeConflict({ kind: 'push_403_quota' })}
        open={true}
        onOpenChange={vi.fn()}
        onActionSuccess={vi.fn()}
      />,
    )

    const retryBtn = screen.getByRole('button', { name: /Retry/i })
    expect(retryBtn).toBeDisabled()
  })
})
