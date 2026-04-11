import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigureIdentityProviderCommand } from './configure-identity-provider.command'
import { ConfigureIdentityProviderHandler } from './configure-identity-provider.handler'
import {
  PrimaryProviderAlreadyExistsException,
  InvalidClientSecretRefException,
} from '../../domain/exceptions/identity.exceptions'
import type { IIdentityProviderRepository } from '../../domain/repositories/identity-provider.repository'
import type { KernelAuditService } from '../../../kernel/application/facades/kernel-audit.service'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const PROVIDER_ID = '01900000-0000-7000-8000-000000000003'

describe('ConfigureIdentityProviderHandler', () => {
  let handler: ConfigureIdentityProviderHandler
  let providerRepo: IIdentityProviderRepository
  let auditService: KernelAuditService

  beforeEach(() => {
    providerRepo = {
      findById: vi.fn(),
      findByTenantId: vi.fn(),
      findPrimary: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    auditService = { log: vi.fn() } as unknown as KernelAuditService
    handler = new ConfigureIdentityProviderHandler(providerRepo, auditService)
  })

  it('creates a new identity provider', async () => {
    vi.mocked(providerRepo.findPrimary).mockResolvedValue(null)
    vi.mocked(providerRepo.insert).mockResolvedValue({
      id: PROVIDER_ID,
      tenantId: TENANT_ID,
      providerType: 'microsoft',
      displayName: 'SETA Entra',
      clientId: 'client-123',
      clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123456789:secret:test',
      directoryId: 'dir-123',
      isPrimary: true,
      syncEnabled: false,
      lastSyncAt: null,
      syncStatus: 'idle',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const result = await handler.execute(
      new ConfigureIdentityProviderCommand(
        TENANT_ID,
        'microsoft',
        'SETA Entra',
        'client-123',
        'arn:aws:secretsmanager:ap-southeast-1:123456789:secret:test',
        'dir-123',
        true,
        false,
        ACTOR_ID,
      ),
    )

    expect(result.id).toBe(PROVIDER_ID)
    expect(providerRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        providerType: 'microsoft',
        isPrimary: true,
      }),
    )
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'identity_provider_configured',
        module: 'identity',
      }),
    )
  })

  it('throws PrimaryProviderAlreadyExistsException when a primary already exists', async () => {
    vi.mocked(providerRepo.findPrimary).mockResolvedValue({
      id: 'existing-primary',
      tenantId: TENANT_ID,
      providerType: 'microsoft',
      displayName: 'Existing',
      clientId: 'old',
      clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123456789:secret:old',
      directoryId: null,
      isPrimary: true,
      syncEnabled: false,
      lastSyncAt: null,
      syncStatus: 'idle',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await expect(
      handler.execute(
        new ConfigureIdentityProviderCommand(
          TENANT_ID,
          'google',
          'Google',
          'client-456',
          'arn:aws:secretsmanager:ap-southeast-1:123456789:secret:new',
          null,
          true,
          false,
          ACTOR_ID,
        ),
      ),
    ).rejects.toThrow(PrimaryProviderAlreadyExistsException)
  })

  it('allows non-primary provider even when primary exists', async () => {
    vi.mocked(providerRepo.findPrimary).mockResolvedValue({
      id: 'existing-primary',
      tenantId: TENANT_ID,
      providerType: 'microsoft',
      displayName: 'Existing',
      clientId: 'old',
      clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123456789:secret:old',
      directoryId: null,
      isPrimary: true,
      syncEnabled: false,
      lastSyncAt: null,
      syncStatus: 'idle',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    vi.mocked(providerRepo.insert).mockResolvedValue({
      id: PROVIDER_ID,
      tenantId: TENANT_ID,
      providerType: 'google',
      displayName: 'Secondary',
      clientId: 'client-456',
      clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123456789:secret:secondary',
      directoryId: null,
      isPrimary: false,
      syncEnabled: false,
      lastSyncAt: null,
      syncStatus: 'idle',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const result = await handler.execute(
      new ConfigureIdentityProviderCommand(
        TENANT_ID,
        'google',
        'Secondary',
        'client-456',
        'arn:aws:secretsmanager:ap-southeast-1:123456789:secret:secondary',
        null,
        false,
        false,
        ACTOR_ID,
      ),
    )

    expect(result.id).toBe(PROVIDER_ID)
  })

  it('throws InvalidClientSecretRefException for non-ARN secret ref', async () => {
    vi.mocked(providerRepo.findPrimary).mockResolvedValue(null)

    await expect(
      handler.execute(
        new ConfigureIdentityProviderCommand(
          TENANT_ID,
          'microsoft',
          'Bad Ref',
          'client-123',
          'not-an-arn',
          null,
          true,
          false,
          ACTOR_ID,
        ),
      ),
    ).rejects.toThrow(InvalidClientSecretRefException)
  })
})
