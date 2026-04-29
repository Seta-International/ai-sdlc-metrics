import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DirectorySyncCard } from './directory-sync-card'

const { mockGetSyncStatus, mockTriggerSync } = vi.hoisted(() => ({
  mockGetSyncStatus: vi.fn(),
  mockTriggerSync: vi.fn(),
}))

vi.mock('../../../lib/trpc', () => ({
  trpc: {
    identity: {
      getSyncStatus: { query: mockGetSyncStatus },
      triggerSync: { mutate: mockTriggerSync },
    },
  },
}))

vi.mock('@future/auth', () => ({
  useSession: () => ({ tenantId: 'tenant-1', actorId: 'actor-1' }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('DirectorySyncCard', () => {
  it('shows last sync time when lastSyncAt is set', async () => {
    mockGetSyncStatus.mockResolvedValue({
      syncEnabled: true,
      syncStatus: 'idle',
      lastSyncAt: '2026-04-29T10:00:00.000Z',
      nextScheduledAt: null,
      lastSyncStats: null,
    })
    render(<DirectorySyncCard />)
    await waitFor(() => {
      expect(screen.getByText(/Last sync:/)).toBeTruthy()
    })
  })

  it('shows "Never" when lastSyncAt is null', async () => {
    mockGetSyncStatus.mockResolvedValue({
      syncEnabled: true,
      syncStatus: 'idle',
      lastSyncAt: null,
      nextScheduledAt: null,
      lastSyncStats: null,
    })
    render(<DirectorySyncCard />)
    await waitFor(() => {
      expect(screen.getByText(/Never/)).toBeTruthy()
    })
  })

  it('disables Sync Now button when syncStatus is running', async () => {
    mockGetSyncStatus.mockResolvedValue({
      syncEnabled: true,
      syncStatus: 'running',
      lastSyncAt: null,
      nextScheduledAt: null,
      lastSyncStats: null,
    })
    render(<DirectorySyncCard />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sync now/i })).toBeDisabled()
    })
  })

  it('calls identity.triggerSync.mutate when Sync Now is clicked', async () => {
    mockGetSyncStatus.mockResolvedValue({
      syncEnabled: true,
      syncStatus: 'idle',
      lastSyncAt: null,
      nextScheduledAt: null,
      lastSyncStats: null,
    })
    mockTriggerSync.mockResolvedValue({ jobId: 'job-1' })
    render(<DirectorySyncCard />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sync now/i })).not.toBeDisabled()
    })
    await userEvent.click(screen.getByRole('button', { name: /sync now/i }))
    expect(mockTriggerSync).toHaveBeenCalledWith({})
  })
})
