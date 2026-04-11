import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UpdateIdpGroupMappingCommand } from './update-idp-group-mapping.command'
import { UpdateIdpGroupMappingHandler } from './update-idp-group-mapping.handler'
import { IdentityProviderNotFoundException } from '../../domain/exceptions/identity.exceptions'
import type { IIdentityProviderRepository } from '../../domain/repositories/identity-provider.repository'
import type { IIdpGroupMappingRepository } from '../../domain/repositories/idp-group-mapping.repository'
import type { KernelAuditService } from '../../../kernel/application/facades/kernel-audit.service'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROVIDER_ID = '01900000-0000-7000-8000-000000000002'
const ACTOR_ID = '01900000-0000-7000-8000-000000000003'
const MAPPING_ID = '01900000-0000-7000-8000-000000000004'

describe('UpdateIdpGroupMappingHandler', () => {
  let handler: UpdateIdpGroupMappingHandler
  let providerRepo: IIdentityProviderRepository
  let mappingRepo: IIdpGroupMappingRepository
  let auditService: KernelAuditService

  beforeEach(() => {
    providerRepo = {
      findById: vi.fn(),
      findPrimary: vi.fn(),
      findByTenantId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    mappingRepo = {
      findById: vi.fn(),
      findByProviderId: vi.fn(),
      listByTenantId: vi.fn(),
      upsert: vi.fn(),
      remove: vi.fn(),
    }
    auditService = { log: vi.fn() } as unknown as KernelAuditService
    handler = new UpdateIdpGroupMappingHandler(providerRepo, mappingRepo, auditService)
  })

  it('upserts a group mapping when provider exists', async () => {
    vi.mocked(providerRepo.findById).mockResolvedValue({
      id: PROVIDER_ID,
      tenantId: TENANT_ID,
      providerType: 'microsoft',
      displayName: 'Test',
      clientId: 'c',
      clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123456789:secret:test',
      directoryId: null,
      isPrimary: true,
      syncEnabled: false,
      lastSyncAt: null,
      syncStatus: 'idle',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    vi.mocked(mappingRepo.upsert).mockResolvedValue({
      id: MAPPING_ID,
      tenantId: TENANT_ID,
      identityProviderId: PROVIDER_ID,
      externalGroupId: 'aad-group-123',
      externalGroupName: 'Engineering',
      roleKey: 'employee',
      scopeType: 'global',
      scopeId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const result = await handler.execute(
      new UpdateIdpGroupMappingCommand(
        TENANT_ID,
        PROVIDER_ID,
        'aad-group-123',
        'Engineering',
        'employee',
        'global',
        null,
        ACTOR_ID,
      ),
    )

    expect(result.id).toBe(MAPPING_ID)
    expect(mappingRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        externalGroupId: 'aad-group-123',
        roleKey: 'employee',
      }),
    )
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'idp_group_mapping_updated',
        module: 'identity',
      }),
    )
  })

  it('throws IdentityProviderNotFoundException when provider does not exist', async () => {
    vi.mocked(providerRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(
        new UpdateIdpGroupMappingCommand(
          TENANT_ID,
          PROVIDER_ID,
          'aad-group-123',
          'Engineering',
          'employee',
          'global',
          null,
          ACTOR_ID,
        ),
      ),
    ).rejects.toThrow(IdentityProviderNotFoundException)

    expect(mappingRepo.upsert).not.toHaveBeenCalled()
  })
})
