import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigureIdentityProviderCommand } from './configure-identity-provider.command'
import { ConfigureIdentityProviderHandler } from './configure-identity-provider.handler'
import type { IIdentityProviderRepository } from '../../domain/repositories/identity-provider.repository'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'
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

describe('ConfigureIdentityProviderHandler', () => {
  let handler: ConfigureIdentityProviderHandler
  let providerRepo: IIdentityProviderRepository
  let auditRepo: IAuditEventRepository

  beforeEach(() => {
    providerRepo = {
      findById: vi.fn(),
      findByTenantId: vi.fn(),
      findPrimary: vi.fn(),
      findPrimaryByTenantId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    auditRepo = {
      insert: vi.fn(),
    }
    handler = new ConfigureIdentityProviderHandler(providerRepo, auditRepo)
  })

  it('creates a new identity provider when no existingProviderId', async () => {
    vi.mocked(providerRepo.insert).mockResolvedValue(fakeProvider)
    vi.mocked(auditRepo.insert).mockResolvedValue(undefined)

    const result = await handler.execute(
      new ConfigureIdentityProviderCommand(
        TENANT_ID,
        'microsoft',
        'SETA Entra',
        'client-id-123',
        'arn:aws:secretsmanager:ap-southeast-1:123:secret:entra-client-secret',
        'directory-id-456',
        true,
        ACTOR_ID,
      ),
    )

    expect(result).toBe(PROVIDER_ID)
    expect(providerRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      providerType: 'microsoft',
      displayName: 'SETA Entra',
      clientId: 'client-id-123',
      clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123:secret:entra-client-secret',
      directoryId: 'directory-id-456',
      isPrimary: true,
      syncEnabled: true,
    })
    expect(auditRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      eventType: 'identity_provider.configured',
      module: 'identity',
      subjectId: PROVIDER_ID,
      payload: { action: 'create', providerType: 'microsoft' },
    })
  })

  it('updates an existing identity provider when existingProviderId is set', async () => {
    vi.mocked(providerRepo.findById).mockResolvedValue(fakeProvider)
    vi.mocked(providerRepo.update).mockResolvedValue(undefined)
    vi.mocked(auditRepo.insert).mockResolvedValue(undefined)

    const result = await handler.execute(
      new ConfigureIdentityProviderCommand(
        TENANT_ID,
        'microsoft',
        'SETA Entra Updated',
        'new-client-id',
        'arn:aws:secretsmanager:ap-southeast-1:123:secret:new-secret',
        'directory-id-456',
        false,
        ACTOR_ID,
        PROVIDER_ID,
      ),
    )

    expect(result).toBe(PROVIDER_ID)
    expect(providerRepo.update).toHaveBeenCalledWith(PROVIDER_ID, TENANT_ID, {
      displayName: 'SETA Entra Updated',
      clientId: 'new-client-id',
      clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123:secret:new-secret',
      directoryId: 'directory-id-456',
      syncEnabled: false,
    })
  })

  it('throws when updating a non-existent provider', async () => {
    vi.mocked(providerRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(
        new ConfigureIdentityProviderCommand(
          TENANT_ID,
          'microsoft',
          'SETA Entra',
          'client-id',
          'arn:aws:secretsmanager:ap-southeast-1:123:secret:s',
          'dir-id',
          true,
          ACTOR_ID,
          'non-existent-id',
        ),
      ),
    ).rejects.toThrow('Identity provider not found')
  })
})
