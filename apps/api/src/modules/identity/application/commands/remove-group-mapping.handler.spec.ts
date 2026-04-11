import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RemoveGroupMappingCommand } from './remove-group-mapping.command'
import { RemoveGroupMappingHandler } from './remove-group-mapping.handler'
import { DomainException } from '../../../kernel/domain/exceptions/domain.exception'
import type { IIdpGroupMappingRepository } from '../../domain/repositories/idp-group-mapping.repository'
import type { KernelAuditService } from '../../../kernel/application/facades/kernel-audit.service'
import type { IdpGroupMapping } from '../../domain/entities/idp-group-mapping.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROVIDER_ID = '01900000-0000-7000-8000-000000000002'
const ACTOR_ID = '01900000-0000-7000-8000-000000000003'
const MAPPING_ID = '01900000-0000-7000-8000-000000000004'

const makeMapping = (overrides?: Partial<IdpGroupMapping>): IdpGroupMapping => ({
  id: MAPPING_ID,
  tenantId: TENANT_ID,
  identityProviderId: PROVIDER_ID,
  externalGroupId: 'aad-group-001',
  externalGroupName: 'Engineering',
  roleKey: 'employee',
  scopeType: 'global',
  scopeId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

describe('RemoveGroupMappingHandler', () => {
  let handler: RemoveGroupMappingHandler
  let mappingRepo: IIdpGroupMappingRepository
  let auditService: KernelAuditService

  beforeEach(() => {
    mappingRepo = {
      findById: vi.fn(),
      findByProviderId: vi.fn(),
      listByTenantId: vi.fn(),
      upsert: vi.fn(),
      remove: vi.fn(),
    }
    auditService = { log: vi.fn() } as unknown as KernelAuditService

    handler = new RemoveGroupMappingHandler(mappingRepo, auditService)
  })

  it('removes a group mapping and logs an audit event', async () => {
    vi.mocked(mappingRepo.findById).mockResolvedValue(makeMapping())
    vi.mocked(mappingRepo.remove).mockResolvedValue(undefined)

    await handler.execute(new RemoveGroupMappingCommand(TENANT_ID, MAPPING_ID, ACTOR_ID))

    expect(mappingRepo.findById).toHaveBeenCalledWith(MAPPING_ID, TENANT_ID)
    expect(mappingRepo.remove).toHaveBeenCalledWith(MAPPING_ID, TENANT_ID)
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'group_mapping.removed',
        module: 'identity',
        subjectId: MAPPING_ID,
        actorId: ACTOR_ID,
      }),
    )
  })

  it('throws DomainException with "Group mapping not found" when not found', async () => {
    vi.mocked(mappingRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new RemoveGroupMappingCommand(TENANT_ID, MAPPING_ID, ACTOR_ID)),
    ).rejects.toThrow(DomainException)

    await expect(
      handler.execute(new RemoveGroupMappingCommand(TENANT_ID, MAPPING_ID, ACTOR_ID)),
    ).rejects.toThrow('Group mapping not found')

    expect(mappingRepo.remove).not.toHaveBeenCalled()
  })
})
