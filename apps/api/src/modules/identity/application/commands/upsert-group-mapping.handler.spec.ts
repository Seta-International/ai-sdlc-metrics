import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UpsertGroupMappingCommand } from './upsert-group-mapping.command'
import { UpsertGroupMappingHandler } from './upsert-group-mapping.handler'
import type { IIdpGroupMappingRepository } from '../../domain/repositories/idp-group-mapping.repository'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'
import type { IdpGroupMapping } from '../../domain/entities/idp-group-mapping.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROVIDER_ID = '01900000-0000-7000-8000-000000000010'
const MAPPING_ID = '01900000-0000-7000-8000-000000000020'
const ACTOR_ID = '01900000-0000-7000-8000-000000000005'

const fakeMapping: IdpGroupMapping = {
  id: MAPPING_ID,
  tenantId: TENANT_ID,
  identityProviderId: PROVIDER_ID,
  externalGroupId: 'group-001',
  externalGroupName: 'Engineering',
  roleKey: 'employee',
  scopeType: 'global',
  scopeId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('UpsertGroupMappingHandler', () => {
  let handler: UpsertGroupMappingHandler
  let mappingRepo: IIdpGroupMappingRepository
  let auditRepo: IAuditEventRepository

  beforeEach(() => {
    mappingRepo = {
      findById: vi.fn(),
      findByProviderId: vi.fn(),
      findByTenantId: vi.fn(),
      listByTenantId: vi.fn(),
      upsert: vi.fn(),
      remove: vi.fn(),
    }
    auditRepo = {
      insert: vi.fn(),
    }
    handler = new UpsertGroupMappingHandler(mappingRepo, auditRepo)
  })

  it('upserts a group mapping and returns its id', async () => {
    vi.mocked(mappingRepo.upsert).mockResolvedValue(fakeMapping)
    vi.mocked(auditRepo.insert).mockResolvedValue(undefined)

    const result = await handler.execute(
      new UpsertGroupMappingCommand(
        TENANT_ID,
        PROVIDER_ID,
        'group-001',
        'Engineering',
        'employee',
        'global',
        null,
        ACTOR_ID,
      ),
    )

    expect(result).toBe(MAPPING_ID)
    expect(mappingRepo.upsert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      identityProviderId: PROVIDER_ID,
      externalGroupId: 'group-001',
      externalGroupName: 'Engineering',
      roleKey: 'employee',
      scopeType: 'global',
      scopeId: null,
    })
    expect(auditRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      eventType: 'group_mapping.upserted',
      module: 'identity',
      subjectId: MAPPING_ID,
      payload: { externalGroupId: 'group-001', roleKey: 'employee', scopeType: 'global' },
    })
  })

  it('requires scopeId when scopeType is not global', async () => {
    await expect(
      handler.execute(
        new UpsertGroupMappingCommand(
          TENANT_ID,
          PROVIDER_ID,
          'group-001',
          'Engineering',
          'line_manager',
          'department',
          null,
          ACTOR_ID,
        ),
      ),
    ).rejects.toThrow('scopeId is required')
  })
})
