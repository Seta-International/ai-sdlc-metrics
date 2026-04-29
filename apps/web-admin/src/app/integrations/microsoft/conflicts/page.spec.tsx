import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import ConflictsPage from './page'
import { useSession } from '@future/auth'
import { useMutation, useQuery } from '@future/api-client'

vi.mock('@future/auth', () => ({
  useSession: vi.fn(),
}))

vi.mock('@future/api-client', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
}))

vi.mock('../../../../lib/trpc', () => ({
  trpc: {
    planner: {
      msSync: {
        conflicts: {
          list: { query: vi.fn() },
          retry: { mutate: vi.fn() },
          acceptMsState: { mutate: vi.fn() },
        },
      },
    },
  },
}))

const mockedUseSession = vi.mocked(useSession)
const mockedUseQuery = vi.mocked(useQuery)
const mockedUseMutation = vi.mocked(useMutation)

function mockMutations() {
  mockedUseMutation.mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useMutation>)
}

function makeConflict(id: string) {
  return {
    id,
    kind: 'push_412_exhausted',
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    taskId: `task-${id}`,
    taskTitle: `Task ${id}`,
    planTitle: 'Sprint 1',
    field: null,
    mineValue: null,
    theirsValue: null,
    limitCode: null,
    resolution: null,
    resolvedAt: null,
    rawError: null,
  }
}

const defaultSession = {
  actorId: '01900000-0000-7000-8000-00000000aa01',
  tenantId: '01900000-0000-7000-8000-00000000bb01',
  roles: ['tenant_admin'],
  displayName: 'Admin',
  email: 'admin@example.com',
  provider: 'microsoft',
}

describe('<ConflictsPage />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseSession.mockReturnValue(defaultSession)
    mockMutations()
  })

  it('renders Open tab by default with ConflictTable', () => {
    const openData = {
      data: { conflicts: [makeConflict('c1'), makeConflict('c2')], nextCursor: null },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>

    const allData = {
      data: { conflicts: [], nextCursor: null },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>

    // useQuery order: openQuery, allQuery
    mockedUseQuery.mockReturnValueOnce(openData).mockReturnValue(allData)

    render(<ConflictsPage />)

    expect(screen.getByRole('tab', { name: /Open/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /History/i })).toBeInTheDocument()
    // The Open tab is active by default — its content (ConflictTable rows) is rendered
    expect(screen.getAllByText(/Task c[12]/)).toHaveLength(2)
  })

  it('switches to History tab when clicked and queries with resolved: all', async () => {
    const user = userEvent.setup()
    const allRefetch = vi.fn()

    const openData = {
      data: { conflicts: [makeConflict('c1')], nextCursor: null },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>

    const allData = {
      data: {
        conflicts: [makeConflict('c1'), makeConflict('c2'), makeConflict('c3')],
        nextCursor: null,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: allRefetch,
    } as unknown as ReturnType<typeof useQuery>

    mockedUseQuery.mockReturnValueOnce(openData).mockReturnValue(allData)

    render(<ConflictsPage />)

    await user.click(screen.getByRole('tab', { name: /History/i }))

    // After clicking History tab, the all conflicts should be visible
    expect(screen.getAllByText(/Task c[123]/)).toHaveLength(3)
  })

  it('shows loading skeleton when query is pending', () => {
    const loadingData = {
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>

    mockedUseQuery.mockReturnValue(loadingData)

    render(<ConflictsPage />)

    expect(screen.getByText(/Loading conflicts/i)).toBeInTheDocument()
  })

  it('shows error state when query fails', () => {
    const errorData = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network request failed'),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>

    mockedUseQuery.mockReturnValue(errorData)

    render(<ConflictsPage />)

    expect(screen.getByText(/Failed to load conflicts/i)).toBeInTheDocument()
    expect(screen.getByText(/Network request failed/i)).toBeInTheDocument()
  })
})
