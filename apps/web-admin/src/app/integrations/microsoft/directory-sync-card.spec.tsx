import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useQuery, useMutation } from '@future/api-client'
import { DirectorySyncCard } from './directory-sync-card'

vi.mock('@future/api-client', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
}))

vi.mock('../../../lib/trpc', () => ({
  trpc: {
    identity: {
      admin: {
        getSyncStatus: { query: vi.fn() },
        triggerSync: { mutate: vi.fn() },
      },
    },
  },
}))

vi.mock('@future/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@future/ui')>()
  return {
    ...actual,
    toast: { success: vi.fn(), error: vi.fn() },
  }
})

const mockedUseQuery = vi.mocked(useQuery)
const mockedUseMutation = vi.mocked(useMutation)

const makeQueryResult = (overrides: object) =>
  ({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  }) as unknown as ReturnType<typeof useQuery>

const makeMutationResult = (overrides: object = {}) =>
  ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    ...overrides,
  }) as unknown as ReturnType<typeof useMutation>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('DirectorySyncCard', () => {
  it('shows last sync time when lastSyncAt is set', () => {
    mockedUseQuery.mockReturnValue(
      makeQueryResult({
        data: {
          syncEnabled: true,
          syncStatus: 'idle',
          lastSyncAt: '2026-04-29T10:00:00.000Z',
          nextScheduledAt: null,
          lastSyncStats: null,
        },
      }),
    )
    mockedUseMutation.mockReturnValue(makeMutationResult())

    render(<DirectorySyncCard />)

    expect(screen.getByText(/Last sync:/)).toBeInTheDocument()
  })

  it('shows "Never" when lastSyncAt is null', () => {
    mockedUseQuery.mockReturnValue(
      makeQueryResult({
        data: {
          syncEnabled: true,
          syncStatus: 'idle',
          lastSyncAt: null,
          nextScheduledAt: null,
          lastSyncStats: null,
        },
      }),
    )
    mockedUseMutation.mockReturnValue(makeMutationResult())

    render(<DirectorySyncCard />)

    expect(screen.getByText(/Never/)).toBeInTheDocument()
  })

  it('disables Sync Now button when syncStatus is running', () => {
    mockedUseQuery.mockReturnValue(
      makeQueryResult({
        data: {
          syncEnabled: true,
          syncStatus: 'running',
          lastSyncAt: null,
          nextScheduledAt: null,
          lastSyncStats: null,
        },
      }),
    )
    mockedUseMutation.mockReturnValue(makeMutationResult())

    render(<DirectorySyncCard />)

    expect(screen.getByRole('button', { name: /sync now/i })).toBeDisabled()
  })

  it('calls triggerMutation.mutate when Sync Now is clicked', async () => {
    const mutate = vi.fn()
    mockedUseQuery.mockReturnValue(
      makeQueryResult({
        data: {
          syncEnabled: true,
          syncStatus: 'idle',
          lastSyncAt: null,
          nextScheduledAt: null,
          lastSyncStats: null,
        },
      }),
    )
    mockedUseMutation.mockReturnValue(makeMutationResult({ mutate }))

    render(<DirectorySyncCard />)

    await userEvent.click(screen.getByRole('button', { name: /sync now/i }))

    expect(mutate).toHaveBeenCalledWith()
  })

  it('shows error alert when getSyncStatus rejects', () => {
    mockedUseQuery.mockReturnValue(
      makeQueryResult({
        data: undefined,
        isError: true,
        error: new Error('Network error'),
      }),
    )
    mockedUseMutation.mockReturnValue(makeMutationResult())

    render(<DirectorySyncCard />)

    expect(screen.getByText(/Failed to load sync status/)).toBeInTheDocument()
  })

  it('disables Sync Now button when mutation isPending', () => {
    mockedUseQuery.mockReturnValue(
      makeQueryResult({
        data: {
          syncEnabled: true,
          syncStatus: 'idle',
          lastSyncAt: null,
          nextScheduledAt: null,
          lastSyncStats: null,
        },
      }),
    )
    mockedUseMutation.mockReturnValue(makeMutationResult({ isPending: true }))

    render(<DirectorySyncCard />)

    expect(screen.getByRole('button', { name: /sync now/i })).toBeDisabled()
  })

  it('shows progress bar with processed/total count when syncStatus is running', () => {
    mockedUseQuery.mockReturnValue(
      makeQueryResult({
        data: {
          syncEnabled: true,
          syncStatus: 'running',
          lastSyncAt: null,
          nextScheduledAt: null,
          syncProcessed: 30,
          syncTotal: 100,
          lastSyncStats: null,
        },
      }),
    )
    mockedUseMutation.mockReturnValue(makeMutationResult())

    render(<DirectorySyncCard />)

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(screen.getByText(/30\s*\/\s*100/)).toBeInTheDocument()
  })

  it('does not show progress bar when syncStatus is idle', () => {
    mockedUseQuery.mockReturnValue(
      makeQueryResult({
        data: {
          syncEnabled: true,
          syncStatus: 'idle',
          lastSyncAt: null,
          nextScheduledAt: null,
          syncProcessed: 0,
          syncTotal: 0,
          lastSyncStats: null,
        },
      }),
    )
    mockedUseMutation.mockReturnValue(makeMutationResult())

    render(<DirectorySyncCard />)

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('calls refetch after mutation success to activate polling for the running state', async () => {
    // Regression: on second sync the onSuccess refetch could return 'idle' (job enqueued but
    // not yet picked up), causing refetchInterval to drop to false and progress to never show.
    // Fix: pollAfterTrigger keeps refetchInterval=2000 until job becomes visible as 'running'.
    // This test verifies refetch is called in onSuccess so the polling window opens.
    let capturedOnSuccess: (() => void) | undefined
    const mockRefetch = vi.fn()

    mockedUseQuery.mockReturnValue(
      makeQueryResult({
        data: {
          syncEnabled: true,
          syncStatus: 'idle',
          syncProcessed: 0,
          syncTotal: 0,
          lastSyncAt: '2026-04-29T10:00:00.000Z',
          nextScheduledAt: null,
          lastSyncStats: null,
        },
        refetch: mockRefetch,
      }),
    )

    mockedUseMutation.mockImplementation((options: { onSuccess?: () => void }) => {
      capturedOnSuccess = options.onSuccess
      return makeMutationResult()
    })

    render(<DirectorySyncCard />)

    await act(async () => {
      capturedOnSuccess?.()
    })

    expect(mockRefetch).toHaveBeenCalled()
  })

  it('shows lastSyncStats.errorMessage when present', () => {
    mockedUseQuery.mockReturnValue(
      makeQueryResult({
        data: {
          syncEnabled: true,
          syncStatus: 'failed',
          lastSyncAt: '2026-04-29T10:00:00.000Z',
          nextScheduledAt: null,
          lastSyncStats: {
            usersCreated: 0,
            usersDeactivated: 0,
            rolesChanged: 0,
            status: 'failed',
            errorMessage: 'Token expired',
          },
        },
      }),
    )
    mockedUseMutation.mockReturnValue(makeMutationResult())

    render(<DirectorySyncCard />)

    expect(screen.getByText('Token expired')).toBeInTheDocument()
  })
})
