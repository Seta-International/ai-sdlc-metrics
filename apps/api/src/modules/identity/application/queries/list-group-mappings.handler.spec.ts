import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListGroupMappingsQuery } from './list-group-mappings.query'
import { ListGroupMappingsHandler } from './list-group-mappings.handler'
import type { IIdpGroupMappingRepository } from '../../domain/repositories/idp-group-mapping.repository.port'
import type { IdpGroupMapping } from '../../domain/entities/idp-group-mapping.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

const fakeMappings: IdpGroupMapping[] = [
  {
    id: '01900000-0000-7000-8000-000000000020',
    tenantId: TENANT_ID,
    identityProviderId: '01900000-0000-7000-8000-000000000010',
    externalGroupId: 'group-001',
    externalGroupName: 'Engineering',
    roleKey: 'employee',
    scopeType: 'global',
    scopeId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: '01900000-0000-7000-8000-000000000021',
    tenantId: TENANT_ID,
    identityProviderId: '01900000-0000-7000-8000-000000000010',
    externalGroupId: 'group-002',
    externalGroupName: 'HR',
    roleKey: 'hr_ops',
    scopeType: 'global',
    scopeId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

describe('ListGroupMappingsHandler', () => {
  let handler: ListGroupMappingsHandler
  let mappingRepo: IIdpGroupMappingRepository

  beforeEach(() => {
    mappingRepo = {
      findById: vi.fn(),
      findByProviderId: vi.fn(),
      listByTenantId: vi.fn(),
      upsert: vi.fn(),
      remove: vi.fn(),
    }
    handler = new ListGroupMappingsHandler(mappingRepo)
  })

  it('returns all group mappings for the tenant', async () => {
    vi.mocked(mappingRepo.listByTenantId).mockResolvedValue(fakeMappings)

    const result = await handler.execute(new ListGroupMappingsQuery(TENANT_ID))

    expect(result).toEqual(fakeMappings)
    expect(mappingRepo.listByTenantId).toHaveBeenCalledWith(TENANT_ID)
  })

  it('returns empty array when no mappings exist', async () => {
    vi.mocked(mappingRepo.listByTenantId).mockResolvedValue([])

    const result = await handler.execute(new ListGroupMappingsQuery(TENANT_ID))

    expect(result).toEqual([])
  })
})
