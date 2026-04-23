import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SyncIdpGroupsCommand } from './sync-idp-groups.command'
import { SyncIdpGroupsHandler } from './sync-idp-groups.handler'
import type { IIdentityProviderRepository } from '../../domain/repositories/identity-provider.repository'
import type { IDirectoryProvider, IdpGroup } from '../../domain/ports/directory-provider.port'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import type { IdentityProviderEntity } from '../../domain/entities/identity-provider.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROVIDER_ID = '01900000-0000-7000-8000-000000000010'
const ACTOR_ID = '01900000-0000-7000-8000-000000000005'

const fakeProvider: IdentityProviderEntity = {
  id: PROVIDER_ID,
  tenantId: TENANT_ID,
  providerType: 'microsoft',
  displayName: 'SETA Entra',
  clientId: 'client-id-123',
  clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123:secret:entra-client-secret',
  directoryId: 'directory-id-456',
  isPrimary: true,
  syncEnabled: true,
  lastSyncAt: null,
  syncStatus: 'idle',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const fakeGroups: IdpGroup[] = [
  { externalGroupId: 'group-001', displayName: 'Engineering', memberExternalIds: ['u1'] },
  { externalGroupId: 'group-002', displayName: 'HR', memberExternalIds: ['u2'] },
]

describe('SyncIdpGroupsHandler', () => {
  let handler: SyncIdpGroupsHandler
  let providerRepo: IIdentityProviderRepository
  let directoryProvider: IDirectoryProvider
  let directoryProviderFactory: { create: ReturnType<typeof vi.fn> }
  let memberRepo: {
    replaceForGroup: ReturnType<typeof vi.fn>
    listMembers: ReturnType<typeof vi.fn>
  }
  let auditFacade: KernelAuditFacade

  beforeEach(() => {
    providerRepo = {
      findById: vi.fn(),
      findByTenantId: vi.fn(),
      findPrimary: vi.fn(),
      findPrimaryByTenantId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    directoryProvider = {
      testConnection: vi.fn(),
      listGroupsWithMembers: vi.fn(),
      listUsers: vi.fn(),
    }
    directoryProviderFactory = { create: vi.fn().mockResolvedValue(directoryProvider) }
    memberRepo = { replaceForGroup: vi.fn(), listMembers: vi.fn() }
    auditFacade = {
      recordEvent: vi.fn(),
      publishOutboxEvent: vi.fn(),
    } as unknown as KernelAuditFacade
    handler = new SyncIdpGroupsHandler(
      providerRepo,
      directoryProviderFactory as never,
      auditFacade,
      memberRepo as never,
    )
  })

  it('fetches groups from IdP and returns them', async () => {
    vi.mocked(providerRepo.findPrimaryByTenantId).mockResolvedValue(fakeProvider)
    vi.mocked(directoryProvider.listGroupsWithMembers).mockResolvedValue(fakeGroups)
    vi.mocked(auditFacade.recordEvent).mockResolvedValue(undefined)

    const result = await handler.execute(new SyncIdpGroupsCommand(TENANT_ID, ACTOR_ID))

    expect(result).toEqual({
      providerId: PROVIDER_ID,
      groups: fakeGroups,
    })
    expect(directoryProviderFactory.create).toHaveBeenCalledWith(fakeProvider)
    expect(directoryProvider.listGroupsWithMembers).toHaveBeenCalledWith()
  })

  it('throws when no provider is configured for tenant', async () => {
    vi.mocked(providerRepo.findPrimaryByTenantId).mockResolvedValue(null)

    await expect(handler.execute(new SyncIdpGroupsCommand(TENANT_ID, ACTOR_ID))).rejects.toThrow(
      'No identity provider configured',
    )
  })

  it('replaces idp_group_member rows for each returned group', async () => {
    vi.mocked(providerRepo.findPrimaryByTenantId).mockResolvedValue(fakeProvider)
    vi.mocked(directoryProvider.listGroupsWithMembers).mockResolvedValue(fakeGroups)
    vi.mocked(auditFacade.recordEvent).mockResolvedValue(undefined)

    await handler.execute(new SyncIdpGroupsCommand(TENANT_ID, ACTOR_ID))

    expect(memberRepo.replaceForGroup).toHaveBeenCalledTimes(2)
    expect(memberRepo.replaceForGroup).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      externalGroupId: 'group-001',
      ssoSubjects: ['u1'],
    })
  })
})
