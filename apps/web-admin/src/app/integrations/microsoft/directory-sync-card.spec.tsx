import { render, screen } from '@testing-library/react'
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
      getSyncStatus: { query: vi.fn() },
      triggerSync: { mutate: vi.fn() },
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
