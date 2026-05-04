import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      platform: {
        listTenants: { query: vi.fn() },
        updateTenantStatus: { mutate: vi.fn() },
      },
    },
    planner: {
      msSync: {
        tenantSyncHealth: { query: vi.fn() },
      },
    },
  },
}))

// Import after mocks are set up
import { listPlatformTenants, updateTenantStatus } from './admin-api'
import { trpc } from './trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminPlatform = (trpc.admin as any).platform
const mockListTenantsQuery = vi.mocked(adminPlatform.listTenants.query)
const mockUpdateTenantStatusMutate = vi.mocked(adminPlatform.updateTenantStatus.mutate)

describe('listPlatformTenants()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls the correct tRPC procedure and returns the result', async () => {
    const mockTenants = [
      {
        id: 'tenant-1',
        slug: 'acme',
        name: 'Acme Corp',
        status: 'active' as const,
        planTier: 'professional' as const,
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-06-01'),
      },
    ]
    mockListTenantsQuery.mockResolvedValue(mockTenants)

    const result = await listPlatformTenants()

    expect(mockListTenantsQuery).toHaveBeenCalledWith({})
    expect(result).toEqual(mockTenants)
  })

  it('returns an empty array when the API returns no tenants', async () => {
    mockListTenantsQuery.mockResolvedValue([])

    const result = await listPlatformTenants()

    expect(result).toEqual([])
  })
})

describe('updateTenantStatus()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls the correct tRPC procedure with the given input', async () => {
    mockUpdateTenantStatusMutate.mockResolvedValue(undefined)

    await updateTenantStatus({ tenantId: 'tenant-1', status: 'suspended' })

    expect(mockUpdateTenantStatusMutate).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      status: 'suspended',
    })
  })

  it('calls the procedure with active status when reactivating', async () => {
    mockUpdateTenantStatusMutate.mockResolvedValue(undefined)

    await updateTenantStatus({ tenantId: 'tenant-2', status: 'active' })

    expect(mockUpdateTenantStatusMutate).toHaveBeenCalledWith({
      tenantId: 'tenant-2',
      status: 'active',
    })
  })
})
