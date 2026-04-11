import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListGroupMappingsQuery } from './list-group-mappings.query'
import { ListGroupMappingsHandler } from './list-group-mappings.handler'
import type { IIdpGroupMappingRepository } from '../../domain/repositories/idp-group-mapping.repository'
import type { IdpGroupMapping } from '../../domain/entities/idp-group-mapping.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROVIDER_ID = '01900000-0000-7000-8000-000000000002'

const makeMapping = (id: string, overrides?: Partial<IdpGroupMapping>): IdpGroupMapping => ({
  id,
  tenantId: TENANT_ID,
  identityProviderId: PROVIDER_ID,
  externalGroupId: `aad-group-${id}`,
  externalGroupName: `Group ${id}`,
  roleKey: 'employee',
  scopeType: 'global',
  scopeId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

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

  it('returns all mappings for a tenant', async () => {
    const mappings = [
      makeMapping('01900000-0000-7000-8000-000000000010'),
      makeMapping('01900000-0000-7000-8000-000000000011'),
    ]
    vi.mocked(mappingRepo.listByTenantId).mockResolvedValue(mappings)

    const result = await handler.execute(new ListGroupMappingsQuery(TENANT_ID))

    expect(result).toHaveLength(2)
    expect(result).toEqual(mappings)
    expect(mappingRepo.listByTenantId).toHaveBeenCalledWith(TENANT_ID)
  })

  it('returns empty array when no mappings exist', async () => {
    vi.mocked(mappingRepo.listByTenantId).mockResolvedValue([])

    const result = await handler.execute(new ListGroupMappingsQuery(TENANT_ID))

    expect(result).toEqual([])
    expect(mappingRepo.listByTenantId).toHaveBeenCalledWith(TENANT_ID)
  })
})
