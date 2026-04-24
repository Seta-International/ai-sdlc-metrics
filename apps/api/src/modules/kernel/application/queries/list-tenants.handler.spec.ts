import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListTenantsQuery } from './list-tenants.query'
import { ListTenantsHandler } from './list-tenants.handler'
import type { Tenant } from '../../domain/entities/tenant.entity'
import type { ITenantRepository } from '../../domain/repositories/tenant.repository.port'

const SYSTEM_TENANT_ID = '01900000-0000-7000-8000-aaaaaaaaaaaa'

const fakeSystemTenant: Tenant = {
  id: SYSTEM_TENANT_ID,
  name: 'Future System',
  slug: 'future-system',
  status: 'active',
  planTier: 'enterprise',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const fakeTenants: Tenant[] = [
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
    id: '01900000-0000-7000-8000-000000000003',
    name: 'OldCo',
    slug: 'oldco',
    status: 'cancelled',
    planTier: 'starter',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  fakeSystemTenant,
]

describe('ListTenantsHandler', () => {
  let handler: ListTenantsHandler
  let tenantRepo: ITenantRepository

  beforeEach(() => {
    tenantRepo = {
      findById: vi.fn(),
      findBySlug: vi.fn(),
      findAll: vi.fn(),
      insert: vi.fn(),
      upsertSystemTenant: vi.fn(),
    } as unknown as ITenantRepository

    handler = new ListTenantsHandler(tenantRepo)
  })

  it('returns all tenants including active, suspended, and cancelled', async () => {
    vi.mocked(tenantRepo.findAll).mockResolvedValue(fakeTenants)

    const result = await handler.execute(new ListTenantsQuery())

    expect(result).toHaveLength(4)
    expect(result.map((t) => t.status)).toEqual(
      expect.arrayContaining(['active', 'suspended', 'cancelled']),
    )
  })

  it('includes system tenant in the results', async () => {
    vi.mocked(tenantRepo.findAll).mockResolvedValue(fakeTenants)

    const result = await handler.execute(new ListTenantsQuery())

    expect(result.some((t) => t.slug === 'future-system')).toBe(true)
  })

  it('returns empty array when no tenants exist', async () => {
    vi.mocked(tenantRepo.findAll).mockResolvedValue([])

    const result = await handler.execute(new ListTenantsQuery())

    expect(result).toEqual([])
  })

  it('exposes id, name, slug, status, planTier, createdAt, updatedAt fields', async () => {
    vi.mocked(tenantRepo.findAll).mockResolvedValue([fakeTenants[0]!])

    const result = await handler.execute(new ListTenantsQuery())

    const t = result[0]!
    expect(t).toHaveProperty('id')
    expect(t).toHaveProperty('name')
    expect(t).toHaveProperty('slug')
    expect(t).toHaveProperty('status')
    expect(t).toHaveProperty('planTier')
    expect(t).toHaveProperty('createdAt')
    expect(t).toHaveProperty('updatedAt')
  })
})
