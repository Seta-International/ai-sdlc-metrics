import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TriggerDirectorySyncCommand } from './trigger-directory-sync.command'
import { TriggerDirectorySyncHandler } from './trigger-directory-sync.handler'
import type { IIdentityProviderRepository } from '../../domain/repositories/identity-provider.repository'
import type { IJobScheduler } from '../../domain/ports/job-scheduler.port'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import type { IdentityProviderEntity } from '../../domain/entities/identity-provider.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROVIDER_ID = '01900000-0000-7000-8000-000000000010'
const ACTOR_ID = '01900000-0000-7000-8000-000000000005'
const JOB_ID = 'job-12345'

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
  syncProcessed: 0,
  syncTotal: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('TriggerDirectorySyncHandler', () => {
  let handler: TriggerDirectorySyncHandler
  let providerRepo: IIdentityProviderRepository
  let jobScheduler: IJobScheduler
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
    jobScheduler = {
      enqueueDirectorySync: vi.fn(),
      getNextScheduledSync: vi.fn(),
    }
    auditFacade = {
      recordEvent: vi.fn(),
      publishOutboxEvent: vi.fn(),
    } as unknown as KernelAuditFacade
    handler = new TriggerDirectorySyncHandler(providerRepo, jobScheduler, auditFacade)
  })

  it('enqueues a sync job and returns job id', async () => {
    vi.mocked(providerRepo.findPrimaryByTenantId).mockResolvedValue(fakeProvider)
    vi.mocked(jobScheduler.enqueueDirectorySync).mockResolvedValue(JOB_ID)
    vi.mocked(auditFacade.recordEvent).mockResolvedValue(undefined)

    const result = await handler.execute(new TriggerDirectorySyncCommand(TENANT_ID, ACTOR_ID))

    expect(result).toEqual({ jobId: JOB_ID })
    expect(jobScheduler.enqueueDirectorySync).toHaveBeenCalledWith(TENANT_ID, PROVIDER_ID)
  })

  it('throws when no provider configured', async () => {
    vi.mocked(providerRepo.findPrimaryByTenantId).mockResolvedValue(null)

    await expect(
      handler.execute(new TriggerDirectorySyncCommand(TENANT_ID, ACTOR_ID)),
    ).rejects.toThrow('No identity provider configured')
  })

  it('throws when sync is already running', async () => {
    vi.mocked(providerRepo.findPrimaryByTenantId).mockResolvedValue({
      ...fakeProvider,
      syncStatus: 'running',
    })

    await expect(
      handler.execute(new TriggerDirectorySyncCommand(TENANT_ID, ACTOR_ID)),
    ).rejects.toThrow('Sync is already running')
  })
})
