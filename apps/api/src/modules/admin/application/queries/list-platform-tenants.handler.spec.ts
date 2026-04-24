import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListPlatformTenantsQuery } from './list-platform-tenants.query'
import { ListPlatformTenantsHandler } from './list-platform-tenants.handler'
import type { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import type { TenantSummaryDto } from '../../../kernel/application/queries/list-tenants.handler'

const SYSTEM_TENANT_ID = '01900000-0000-7000-8000-aaaaaaaaaaaa'

const fakeTenants: TenantSummaryDto[] = [
  {
    id: '01900000-0000-7000-8000-000000000001',
    name: 'SETA International',
    slug: 'seta',
    status: 'active',
    planTier: 'enterprise',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: '01900000-0000-7000-8000-000000000002',
    name: 'BlueOC',
    slug: 'blueoc',
    status: 'suspended',
    planTier: 'professional',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: SYSTEM_TENANT_ID,
    name: 'Future System',
    slug: 'future-system',
    status: 'active',
    planTier: 'enterprise',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

describe('ListPlatformTenantsHandler', () => {
  let handler: ListPlatformTenantsHandler
  let kernelQuery: Pick<KernelQueryFacade, 'listTenants'>

  beforeEach(() => {
    kernelQuery = {
      listTenants: vi.fn(),
    }
    handler = new ListPlatformTenantsHandler(kernelQuery as unknown as KernelQueryFacade)
  })

  it('returns safe org summary for all tenants', async () => {
    vi.mocked(kernelQuery.listTenants).mockResolvedValue(fakeTenants)

    const result = await handler.execute(new ListPlatformTenantsQuery())

    expect(result).toHaveLength(3)
    expect(result[0]).toMatchObject({
      id: '01900000-0000-7000-8000-000000000001',
      name: 'SETA International',
      slug: 'seta',
      status: 'active',
      planTier: 'enterprise',
    })
  })

  it('includes id, name, slug, status, planTier, createdAt, updatedAt fields', async () => {
    vi.mocked(kernelQuery.listTenants).mockResolvedValue([fakeTenants[0]!])

    const result = await handler.execute(new ListPlatformTenantsQuery())

    const t = result[0]!
    expect(t).toHaveProperty('id')
    expect(t).toHaveProperty('name')
    expect(t).toHaveProperty('slug')
    expect(t).toHaveProperty('status')
    expect(t).toHaveProperty('planTier')
    expect(t).toHaveProperty('createdAt')
    expect(t).toHaveProperty('updatedAt')
  })

  it('does not expose any secrets or unrelated tenant data', async () => {
    vi.mocked(kernelQuery.listTenants).mockResolvedValue(fakeTenants)

    const result = await handler.execute(new ListPlatformTenantsQuery())

    for (const t of result) {
      expect(t).not.toHaveProperty('clientSecret')
      expect(t).not.toHaveProperty('secretRef')
      expect(Object.keys(t)).toEqual(
        expect.arrayContaining([
          'id',
          'name',
          'slug',
          'status',
          'planTier',
          'createdAt',
          'updatedAt',
        ]),
      )
    }
  })

  it('returns empty array when no tenants exist', async () => {
    vi.mocked(kernelQuery.listTenants).mockResolvedValue([])

    const result = await handler.execute(new ListPlatformTenantsQuery())

    expect(result).toEqual([])
  })

  it('calls kernelQuery.listTenants with no arguments', async () => {
    vi.mocked(kernelQuery.listTenants).mockResolvedValue(fakeTenants)

    await handler.execute(new ListPlatformTenantsQuery())

    expect(kernelQuery.listTenants).toHaveBeenCalledOnce()
    expect(kernelQuery.listTenants).toHaveBeenCalledWith()
  })
})
