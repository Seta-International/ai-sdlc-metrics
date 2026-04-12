import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RemoveGroupMappingCommand } from './remove-group-mapping.command'
import { RemoveGroupMappingHandler } from './remove-group-mapping.handler'
import type { IIdpGroupMappingRepository } from '../../domain/repositories/idp-group-mapping.repository.port'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'
import type { IdpGroupMapping } from '../../domain/entities/idp-group-mapping.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const MAPPING_ID = '01900000-0000-7000-8000-000000000020'
const ACTOR_ID = '01900000-0000-7000-8000-000000000005'

const fakeMapping: IdpGroupMapping = {
  id: MAPPING_ID,
  tenantId: TENANT_ID,
  identityProviderId: '01900000-0000-7000-8000-000000000010',
  externalGroupId: 'group-001',
  externalGroupName: 'Engineering',
  roleKey: 'employee',
  scopeType: 'global',
  scopeId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('RemoveGroupMappingHandler', () => {
  let handler: RemoveGroupMappingHandler
  let mappingRepo: IIdpGroupMappingRepository
  let auditRepo: IAuditEventRepository

  beforeEach(() => {
    mappingRepo = {
      findById: vi.fn(),
      findByProviderId: vi.fn(),
      listByTenantId: vi.fn(),
      upsert: vi.fn(),
      remove: vi.fn(),
    }
    auditRepo = {
      insert: vi.fn(),
    }
    handler = new RemoveGroupMappingHandler(mappingRepo, auditRepo)
  })

  it('removes a group mapping', async () => {
    vi.mocked(mappingRepo.findById).mockResolvedValue(fakeMapping)
    vi.mocked(mappingRepo.remove).mockResolvedValue(undefined)
    vi.mocked(auditRepo.insert).mockResolvedValue(undefined)

    await handler.execute(new RemoveGroupMappingCommand(TENANT_ID, MAPPING_ID, ACTOR_ID))

    expect(mappingRepo.remove).toHaveBeenCalledWith(MAPPING_ID, TENANT_ID)
    expect(auditRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      eventType: 'group_mapping.removed',
      module: 'identity',
      subjectId: MAPPING_ID,
      payload: { externalGroupId: 'group-001', roleKey: 'employee' },
    })
  })

  it('throws when mapping not found', async () => {
    vi.mocked(mappingRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new RemoveGroupMappingCommand(TENANT_ID, MAPPING_ID, ACTOR_ID)),
    ).rejects.toThrow('Group mapping not found')
  })
})
