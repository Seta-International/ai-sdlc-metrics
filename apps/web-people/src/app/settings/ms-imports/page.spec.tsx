// apps/web-people/src/app/settings/ms-imports/page.spec.tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import MsImportsPage from './page'

const {
  mockGetMsSyncStatus,
  mockListStagedMsUsers,
  mockImportStagedMsUser,
  mockSkipStagedMsUser,
  mockBulkImportStagedMsUsers,
  mockBulkSkipStagedMsUsers,
  mockResetStagedMsUser,
} = vi.hoisted(() => ({
  mockGetMsSyncStatus: vi.fn(),
  mockListStagedMsUsers: vi.fn(),
  mockImportStagedMsUser: vi.fn(),
  mockSkipStagedMsUser: vi.fn(),
  mockBulkImportStagedMsUsers: vi.fn(),
  mockBulkSkipStagedMsUsers: vi.fn(),
  mockResetStagedMsUser: vi.fn(),
}))

vi.mock('../../../lib/trpc', () => ({
  trpc: {
    people: {
      getMsSyncStatus: { query: mockGetMsSyncStatus },
      listStagedMsUsers: { query: mockListStagedMsUsers },
      importStagedMsUser: { mutate: mockImportStagedMsUser },
      skipStagedMsUser: { mutate: mockSkipStagedMsUser },
      bulkImportStagedMsUsers: { mutate: mockBulkImportStagedMsUsers },
      bulkSkipStagedMsUsers: { mutate: mockBulkSkipStagedMsUsers },
      resetStagedMsUser: { mutate: mockResetStagedMsUser },
    },
  },
}))

vi.mock('../../../components/settings/MsImportsTable', () => ({
  MsImportsTable: () => <div data-testid="ms-imports-table" />,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const mockStatus = { lastSyncedAt: '2026-04-29T10:00:00Z', pendingCount: 2, importedCount: 1 }
const emptyList = { items: [], total: 0 }

describe('MsImportsPage', () => {
  it('renders the page heading', async () => {
    mockGetMsSyncStatus.mockResolvedValue(mockStatus)
    mockListStagedMsUsers.mockResolvedValue(emptyList)
    render(<MsImportsPage />)
    await waitFor(() => {
      expect(screen.getByText('Microsoft 365 Imports')).toBeTruthy()
    })
  })

  it('shows sync status after loading', async () => {
    mockGetMsSyncStatus.mockResolvedValue(mockStatus)
    mockListStagedMsUsers.mockResolvedValue(emptyList)
    render(<MsImportsPage />)
    await waitFor(() => {
      expect(screen.getByText(/2 pending/)).toBeTruthy()
    })
  })

  it('shows not-connected alert when getMsSyncStatus rejects', async () => {
    mockGetMsSyncStatus.mockRejectedValue(new Error('no connection'))
    mockListStagedMsUsers.mockRejectedValue(new Error('no connection'))
    render(<MsImportsPage />)
    await waitFor(() => {
      expect(screen.getByText(/Microsoft 365 is not connected/)).toBeTruthy()
    })
  })
})
