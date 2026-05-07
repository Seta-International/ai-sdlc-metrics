import { describe, it, expect, vi } from 'vitest'
import { CommandBus } from '@nestjs/cqrs'
import { BulkSyncMsProfilesHandler } from './bulk-sync-ms-profiles.handler'
import { BulkSyncMsProfilesCommand } from './bulk-sync-ms-profiles.command'
import { SyncMicrosoftProfileCommand } from './sync-microsoft-profile.command'
import type { IdentityQueryFacade } from '../../../identity/application/facades/identity-query.facade'
import type { IMsProfileSyncStateRepository } from '../../domain/repositories/ms-profile-sync-state.repository'
import type { IMsStagedUserRepository } from '../../domain/repositories/ms-staged-user.repository'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { IJobAssignmentRepository } from '../../domain/repositories/job-assignment.repository'
import type { UsersDeltaResult } from '../../../identity/application/queries/get-users-delta.handler'
import { Logger } from '@nestjs/common'

vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000003'

const DELTA_RESULT: UsersDeltaResult = {
  users: [
    {
      externalId: 'ms-u1',
      email: 'u@co.com',
      displayName: 'User One',
      isActive: true,
      jobTitle: 'Eng',
      department: 'R&D',
      officeLocation: 'HCM',
      mobilePhone: '0901',
      businessPhone: '0902',
      managerMsId: null,
    },
  ],
  deletedIds: [],
  nextDeltaToken: 'https://graph.microsoft.com/v1.0/users/delta?$deltaToken=tok',
}

function makeMocks() {
  const syncStateRepo: Partial<IMsProfileSyncStateRepository> = {
    findByTenantId: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue(undefined),
    clearDeltaToken: vi.fn().mockResolvedValue(undefined),
  }
  const stagedUserRepo: Partial<IMsStagedUserRepository> = {
    findByMsExternalId: vi.fn().mockResolvedValue(null),
    upsertFromSync: vi.fn().mockResolvedValue({ id: 'su1', status: 'pending' }),
    updateStatus: vi.fn().mockResolvedValue(undefined),
  }
  const employmentRepo: Partial<IEmploymentRepository> = {
    findActiveByActorId: vi.fn().mockResolvedValue(null),
  }
  const jobAssignmentRepo: Partial<IJobAssignmentRepository> = {
    updateManagerId: vi.fn().mockResolvedValue(undefined),
  }
  const identityFacade: Partial<IdentityQueryFacade> = {
    listUsersDelta: vi.fn().mockResolvedValue(DELTA_RESULT),
    getActorIdByExternalUserId: vi.fn().mockResolvedValue(null),
  }
  const commandBus = { execute: vi.fn().mockResolvedValue(undefined) }

  return {
    syncStateRepo,
    stagedUserRepo,
    employmentRepo,
    jobAssignmentRepo,
    identityFacade,
    commandBus,
  }
}

describe('BulkSyncMsProfilesHandler', () => {
  it('exits cleanly when MS365 is not connected (listUsersDelta returns null)', async () => {
    const mocks = makeMocks()
    vi.mocked(mocks.identityFacade.listUsersDelta!).mockResolvedValue(null)

    const handler = new BulkSyncMsProfilesHandler(
      mocks.syncStateRepo as IMsProfileSyncStateRepository,
      mocks.stagedUserRepo as IMsStagedUserRepository,
      mocks.employmentRepo as IEmploymentRepository,
      mocks.jobAssignmentRepo as IJobAssignmentRepository,
      mocks.identityFacade as IdentityQueryFacade,
      mocks.commandBus as unknown as CommandBus,
    )

    await handler.execute(new BulkSyncMsProfilesCommand(TENANT_ID))

    expect(mocks.syncStateRepo.upsert).not.toHaveBeenCalled()
  })

  it('stages unknown users (no actorId found)', async () => {
    const mocks = makeMocks()
    vi.mocked(mocks.identityFacade.getActorIdByExternalUserId!).mockResolvedValue(null)

    const handler = new BulkSyncMsProfilesHandler(
      mocks.syncStateRepo as IMsProfileSyncStateRepository,
      mocks.stagedUserRepo as IMsStagedUserRepository,
      mocks.employmentRepo as IEmploymentRepository,
      mocks.jobAssignmentRepo as IJobAssignmentRepository,
      mocks.identityFacade as IdentityQueryFacade,
      mocks.commandBus as unknown as CommandBus,
    )

    await handler.execute(new BulkSyncMsProfilesCommand(TENANT_ID))

    expect(mocks.stagedUserRepo.upsertFromSync).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ msExternalId: 'ms-u1' }),
    )
    expect(mocks.commandBus.execute).not.toHaveBeenCalledWith(
      expect.any(SyncMicrosoftProfileCommand),
    )
  })

  it('dispatches SyncMicrosoftProfileCommand for known employees', async () => {
    const mocks = makeMocks()
    vi.mocked(mocks.identityFacade.getActorIdByExternalUserId!).mockResolvedValue(ACTOR_ID)
    vi.mocked(mocks.employmentRepo.findActiveByActorId!).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
      personProfileId: 'pp1',
      employmentStatus: 'active',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const handler = new BulkSyncMsProfilesHandler(
      mocks.syncStateRepo as IMsProfileSyncStateRepository,
      mocks.stagedUserRepo as IMsStagedUserRepository,
      mocks.employmentRepo as IEmploymentRepository,
      mocks.jobAssignmentRepo as IJobAssignmentRepository,
      mocks.identityFacade as IdentityQueryFacade,
      mocks.commandBus as unknown as CommandBus,
    )

    await handler.execute(new BulkSyncMsProfilesCommand(TENANT_ID))

    expect(mocks.commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({ employmentId: EMPLOYMENT_ID }),
    )
    expect(mocks.stagedUserRepo.upsertFromSync).not.toHaveBeenCalled()
  })

  it('persists the new delta token after processing', async () => {
    const mocks = makeMocks()

    const handler = new BulkSyncMsProfilesHandler(
      mocks.syncStateRepo as IMsProfileSyncStateRepository,
      mocks.stagedUserRepo as IMsStagedUserRepository,
      mocks.employmentRepo as IEmploymentRepository,
      mocks.jobAssignmentRepo as IJobAssignmentRepository,
      mocks.identityFacade as IdentityQueryFacade,
      mocks.commandBus as unknown as CommandBus,
    )

    await handler.execute(new BulkSyncMsProfilesCommand(TENANT_ID))

    expect(mocks.syncStateRepo.upsert).toHaveBeenCalledWith(
      TENANT_ID,
      DELTA_RESULT.nextDeltaToken,
      expect.any(Date),
    )
  })

  it('marks staged user as skipped when ms user is deleted', async () => {
    const mocks = makeMocks()
    vi.mocked(mocks.identityFacade.listUsersDelta!).mockResolvedValue({
      users: [],
      deletedIds: ['ms-del-1'],
      nextDeltaToken: 'tok2',
    })
    vi.mocked(mocks.stagedUserRepo.findByMsExternalId!).mockResolvedValue({
      id: 'su-del-1',
      tenantId: TENANT_ID,
      msExternalId: 'ms-del-1',
      status: 'pending',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const handler = new BulkSyncMsProfilesHandler(
      mocks.syncStateRepo as IMsProfileSyncStateRepository,
      mocks.stagedUserRepo as IMsStagedUserRepository,
      mocks.employmentRepo as IEmploymentRepository,
      mocks.jobAssignmentRepo as IJobAssignmentRepository,
      mocks.identityFacade as IdentityQueryFacade,
      mocks.commandBus as unknown as CommandBus,
    )

    await handler.execute(new BulkSyncMsProfilesCommand(TENANT_ID))

    expect(mocks.stagedUserRepo.updateStatus).toHaveBeenCalledWith('su-del-1', TENANT_ID, 'skipped')
  })

  it('continues processing other users when one user throws', async () => {
    const mocks = makeMocks()
    const deltaWithTwo: UsersDeltaResult = {
      users: [
        {
          externalId: 'u-err',
          email: 'e@co.com',
          displayName: 'Error User',
          isActive: true,
          jobTitle: null,
          department: null,
          officeLocation: null,
          mobilePhone: null,
          businessPhone: null,
          managerMsId: null,
        },
        {
          externalId: 'u-ok',
          email: 'ok@co.com',
          displayName: 'OK User',
          isActive: true,
          jobTitle: null,
          department: null,
          officeLocation: null,
          mobilePhone: null,
          businessPhone: null,
          managerMsId: null,
        },
      ],
      deletedIds: [],
      nextDeltaToken: 'tok3',
    }
    vi.mocked(mocks.identityFacade.listUsersDelta!).mockResolvedValue(deltaWithTwo)
    vi.mocked(mocks.identityFacade.getActorIdByExternalUserId!)
      .mockResolvedValueOnce(ACTOR_ID) // u-err → found
      .mockResolvedValueOnce(null) // u-ok → not found → stage
    vi.mocked(mocks.employmentRepo.findActiveByActorId!).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    vi.mocked(mocks.commandBus.execute).mockRejectedValueOnce(new Error('sync failed'))

    const handler = new BulkSyncMsProfilesHandler(
      mocks.syncStateRepo as IMsProfileSyncStateRepository,
      mocks.stagedUserRepo as IMsStagedUserRepository,
      mocks.employmentRepo as IEmploymentRepository,
      mocks.jobAssignmentRepo as IJobAssignmentRepository,
      mocks.identityFacade as IdentityQueryFacade,
      mocks.commandBus as unknown as CommandBus,
    )

    await handler.execute(new BulkSyncMsProfilesCommand(TENANT_ID))

    // Should still have staged the second user despite first failing
    expect(mocks.stagedUserRepo.upsertFromSync).toHaveBeenCalledOnce()
  })
})
