// apps/web-people/src/components/settings/SettingsSidebar.spec.tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { SettingsSidebar } from './SettingsSidebar'

const { mockGetMsSyncStatus } = vi.hoisted(() => ({
  mockGetMsSyncStatus: vi.fn(),
}))

vi.mock('../../lib/trpc', () => ({
  trpc: { people: { getMsSyncStatus: { query: mockGetMsSyncStatus } } },
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/settings/custom-fields',
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SettingsSidebar — Microsoft Imports entry', () => {
  it('shows Microsoft Imports link when connected=true', async () => {
    mockGetMsSyncStatus.mockResolvedValue({
      connected: true,
      lastSyncedAt: null,
      pendingCount: 0,
      importedCount: 0,
    })
    render(<SettingsSidebar />)
    await waitFor(() => {
      expect(screen.getByText('Microsoft Imports')).toBeTruthy()
    })
  })

  it('hides Microsoft Imports link when connected=false', async () => {
    mockGetMsSyncStatus.mockResolvedValue({
      connected: false,
      lastSyncedAt: null,
      pendingCount: 0,
      importedCount: 0,
    })
    render(<SettingsSidebar />)
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText('Microsoft Imports')).toBeNull()
  })

  it('hides Microsoft Imports link when getMsSyncStatus rejects', async () => {
    mockGetMsSyncStatus.mockRejectedValue(new Error('network'))
    render(<SettingsSidebar />)
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText('Microsoft Imports')).toBeNull()
  })
})
