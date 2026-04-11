import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UpsertGroupMappingCommand } from './upsert-group-mapping.command'
import { UpsertGroupMappingHandler } from './upsert-group-mapping.handler'
import { DomainException } from '../../../kernel/domain/exceptions/domain.exception'
import type { IIdpGroupMappingRepository } from '../../domain/repositories/idp-group-mapping.repository'
import type { KernelAuditService } from '../../../kernel/application/facades/kernel-audit.service'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROVIDER_ID = '01900000-0000-7000-8000-000000000002'
const ACTOR_ID = '01900000-0000-7000-8000-000000000003'
const MAPPING_ID = '01900000-0000-7000-8000-000000000004'

describe('UpsertGroupMappingHandler', () => {
  let handler: UpsertGroupMappingHandler
  let mappingRepo: IIdpGroupMappingRepository
  let auditService: KernelAuditService

  beforeEach(() => {
    mappingRepo = {
      findById: vi.fn(),
      findByProviderId: vi.fn(),
      findByTenantId: vi.fn(),
      listByTenantId: vi.fn(),
      upsert: vi.fn(),
      remove: vi.fn(),
    }
    auditService = { log: vi.fn() } as unknown as KernelAuditService

    handler = new UpsertGroupMappingHandler(mappingRepo, auditService)
  })

  it('upserts a group mapping and returns its id', async () => {
    vi.mocked(mappingRepo.upsert).mockResolvedValue({
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
    })

    const result = await handler.execute(
      new UpsertGroupMappingCommand(
        TENANT_ID,
        PROVIDER_ID,
        'aad-group-001',
        'Engineering',
        'employee',
        'global',
        null,
        ACTOR_ID,
      ),
    )

    expect(result).toBe(MAPPING_ID)
    expect(mappingRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        identityProviderId: PROVIDER_ID,
        externalGroupId: 'aad-group-001',
        roleKey: 'employee',
        scopeType: 'global',
      }),
    )
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'group_mapping.upserted',
        module: 'identity',
        subjectId: MAPPING_ID,
      }),
    )
  })

  it('throws DomainException when non-global scope has null scopeId', async () => {
    await expect(
      handler.execute(
        new UpsertGroupMappingCommand(
          TENANT_ID,
          PROVIDER_ID,
          'aad-group-001',
          'Engineering',
          'employee',
          'department',
          null,
          ACTOR_ID,
        ),
      ),
    ).rejects.toThrow(DomainException)

    expect(mappingRepo.upsert).not.toHaveBeenCalled()
  })

  it('throws with correct message when non-global scope has null scopeId', async () => {
    await expect(
      handler.execute(
        new UpsertGroupMappingCommand(
          TENANT_ID,
          PROVIDER_ID,
          'aad-group-001',
          'Engineering',
          'employee',
          'project',
          null,
          ACTOR_ID,
        ),
      ),
    ).rejects.toThrow('scopeId is required when scopeType is not global')
  })
})
