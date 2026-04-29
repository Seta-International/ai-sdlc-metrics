// apps/web-people/src/app/settings/ms-imports/page.spec.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import MsImportsPage from './page'

vi.mock('../../../lib/trpc', () => ({
  trpc: {},
}))

const mockStatus = { lastSyncedAt: '2026-04-29T10:00:00Z', pendingCount: 2, importedCount: 1 }
const mockUsers = [
  {
    id: 'su1',
    displayName: 'Alice',
    email: 'alice@co.com',
    jobTitle: 'Eng',
    department: 'R&D',
    status: 'pending',
    msExternalId: 'aad-1',
    tenantId: 't1',
    officeLocation: null,
    mobilePhone: null,
    workPhone: null,
    managerMsId: null,
    photoDocumentId: null,
    importedEmploymentId: null,
    lastSeenAt: '2026-04-29T10:00:00Z',
    createdAt: '2026-04-29T10:00:00Z',
  },
]

describe('MsImportsPage', () => {
  beforeEach(() => {
    vi.stubGlobal('anyTrpcMock', {
      people: {
        getMsSyncStatus: { query: vi.fn().mockResolvedValue(mockStatus) },
        listStagedMsUsers: { query: vi.fn().mockResolvedValue({ items: mockUsers, total: 2 }) },
        importStagedMsUser: { mutate: vi.fn().mockResolvedValue('e1') },
        skipStagedMsUser: { mutate: vi.fn().mockResolvedValue(undefined) },
        bulkImportStagedMsUsers: {
          mutate: vi.fn().mockResolvedValue([{ id: 'su1', employmentId: 'e1' }]),
        },
        bulkSkipStagedMsUsers: { mutate: vi.fn().mockResolvedValue([{ id: 'su1' }]) },
      },
    })
  })

  it('renders the page heading', async () => {
    render(<MsImportsPage />)
    await waitFor(() => {
      expect(screen.getByText('Microsoft 365 Imports')).toBeTruthy()
    })
  })
})
