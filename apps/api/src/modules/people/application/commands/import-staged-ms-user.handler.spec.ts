import { describe, it, expect, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { PersonHiredEvent } from '@future/event-contracts'
import { ImportStagedMsUserHandler } from './import-staged-ms-user.handler'
import { ImportStagedMsUserCommand } from './import-staged-ms-user.command'
import {
  StagedMsUserNotFoundException,
  StagedMsUserNotPendingException,
} from '../../domain/exceptions/people.exceptions'
import type { IMsStagedUserRepository } from '../../domain/repositories/ms-staged-user.repository'
import type { IPersonProfileRepository } from '../../domain/repositories/person-profile.repository'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { IEmploymentDetailRepository } from '../../domain/repositories/employment-detail.repository'
import type { IJobAssignmentRepository } from '../../domain/repositories/job-assignment.repository'
import type { KernelActorFacade } from '../../../kernel/application/facades/kernel-actor.facade'
import type { KernelUserIdentityFacade } from '../../../kernel/application/facades/kernel-user-identity.facade'
import type { IdentityQueryFacade } from '../../../identity/application/facades/identity-query.facade'
import type { MsStagedUser } from '../../domain/entities/ms-staged-user.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const STAGED_ID = '01900000-0000-7000-8000-000000000010'
const IMPORTED_BY = '01900000-0000-7000-8000-000000000005'
const NEW_ACTOR_ID = '01900000-0000-7000-8000-000000000020'
const NEW_EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000030'

function makeStagedUser(overrides: Partial<MsStagedUser> = {}): MsStagedUser {
  return {
    id: STAGED_ID,
    tenantId: TENANT_ID,
    msExternalId: 'aad-u1',
    displayName: 'Alice Nguyen',
    email: 'alice@co.com',
    jobTitle: 'Engineer',
    department: 'Eng',
    officeLocation: 'HCM',
    mobilePhone: '0901',
    workPhone: '0902',
    managerMsId: null,
    photoDocumentId: null,
    status: 'pending',
    importedEmploymentId: null,
    lastSeenAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  }
}

function makeMocks() {
  const stagedUserRepo: Partial<IMsStagedUserRepository> = {
    findById: vi.fn().mockResolvedValue(makeStagedUser()),
    updateStatus: vi.fn().mockResolvedValue(undefined),
  }
  const personProfileRepo: Partial<IPersonProfileRepository> = {
    findByActorId: vi
      .fn()
      .mockResolvedValue({ id: 'pp1', actorId: NEW_ACTOR_ID, tenantId: TENANT_ID }),
    insert: vi.fn().mockResolvedValue({ id: 'pp1', actorId: NEW_ACTOR_ID, tenantId: TENANT_ID }),
  }
  const employmentRepo: Partial<IEmploymentRepository> = {
    findActiveByActorId: vi.fn().mockResolvedValue(null),
    insert: vi.fn().mockResolvedValue({ id: NEW_EMPLOYMENT_ID, tenantId: TENANT_ID }),
  }
  const employmentDetailRepo: Partial<IEmploymentDetailRepository> = {
    insert: vi.fn().mockResolvedValue(undefined),
  }
  const jobAssignmentRepo: Partial<IJobAssignmentRepository> = {
    insert: vi.fn().mockResolvedValue({ id: 'ja1' }),
    updateManagerId: vi.fn().mockResolvedValue(undefined),
    findCurrent: vi.fn().mockResolvedValue(null),
  }
  const kernelActorFacade: Partial<KernelActorFacade> = {
    createActor: vi.fn().mockResolvedValue(NEW_ACTOR_ID),
  }
  const kernelUserIdentityFacade: Partial<KernelUserIdentityFacade> = {
    createUserIdentity: vi.fn().mockResolvedValue(undefined),
  }
  const identityFacade: Partial<IdentityQueryFacade> = {
    getActorIdByExternalUserId: vi.fn().mockResolvedValue(null),
  }
  const eventBus = { publish: vi.fn().mockResolvedValue(undefined) }

  return {
    stagedUserRepo,
    personProfileRepo,
    employmentRepo,
    employmentDetailRepo,
    jobAssignmentRepo,
    kernelActorFacade,
    kernelUserIdentityFacade,
    identityFacade,
    eventBus,
  }
}

function makeHandler(mocks: ReturnType<typeof makeMocks>) {
  return new ImportStagedMsUserHandler(
    mocks.stagedUserRepo as IMsStagedUserRepository,
    mocks.personProfileRepo as IPersonProfileRepository,
    mocks.employmentRepo as IEmploymentRepository,
    mocks.employmentDetailRepo as IEmploymentDetailRepository,
    mocks.jobAssignmentRepo as IJobAssignmentRepository,
    mocks.kernelActorFacade as KernelActorFacade,
    mocks.kernelUserIdentityFacade as KernelUserIdentityFacade,
    mocks.identityFacade as IdentityQueryFacade,
    mocks.eventBus as unknown as EventBus,
  )
}

describe('ImportStagedMsUserHandler', () => {
  it('throws StagedMsUserNotFoundException when staged user does not exist', async () => {
    const mocks = makeMocks()
    vi.mocked(mocks.stagedUserRepo.findById!).mockResolvedValue(null)

    await expect(
      makeHandler(mocks).execute(new ImportStagedMsUserCommand(TENANT_ID, STAGED_ID, IMPORTED_BY)),
    ).rejects.toThrow(StagedMsUserNotFoundException)
  })

  it('throws StagedMsUserNotPendingException when status is not pending', async () => {
    const mocks = makeMocks()
    vi.mocked(mocks.stagedUserRepo.findById!).mockResolvedValue(
      makeStagedUser({ status: 'imported' }),
    )

    await expect(
      makeHandler(mocks).execute(new ImportStagedMsUserCommand(TENANT_ID, STAGED_ID, IMPORTED_BY)),
    ).rejects.toThrow(StagedMsUserNotPendingException)
  })

  it('links existing employment when MS user already has active employment: marks staged imported, returns existing id, creates no new records', async () => {
    const mocks = makeMocks()
    vi.mocked(mocks.identityFacade.getActorIdByExternalUserId!).mockResolvedValue('existing-actor')
    vi.mocked(mocks.employmentRepo.findActiveByActorId!).mockResolvedValue({
      id: 'existing-emp',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const result = await makeHandler(mocks).execute(
      new ImportStagedMsUserCommand(TENANT_ID, STAGED_ID, IMPORTED_BY),
    )

    expect(result).toBe('existing-emp')
    expect(mocks.stagedUserRepo.updateStatus).toHaveBeenCalledWith(
      STAGED_ID,
      TENANT_ID,
      'imported',
      'existing-emp',
    )
    expect(mocks.kernelActorFacade.createActor).not.toHaveBeenCalled()
    expect(mocks.employmentRepo.insert).not.toHaveBeenCalled()
    expect(mocks.eventBus.publish).not.toHaveBeenCalled()
  })

  it('marks staged imported when identity exists but no active employment: creates no new actor or identity', async () => {
    const mocks = makeMocks()
    vi.mocked(mocks.identityFacade.getActorIdByExternalUserId!).mockResolvedValue('existing-actor')
    // findActiveByActorId returns null by default (no active employment)

    await makeHandler(mocks).execute(
      new ImportStagedMsUserCommand(TENANT_ID, STAGED_ID, IMPORTED_BY),
    )

    expect(mocks.stagedUserRepo.updateStatus).toHaveBeenCalledWith(
      STAGED_ID,
      TENANT_ID,
      'imported',
      undefined,
    )
    expect(mocks.kernelActorFacade.createActor).not.toHaveBeenCalled()
    expect(mocks.kernelUserIdentityFacade.createUserIdentity).not.toHaveBeenCalled()
    expect(mocks.eventBus.publish).not.toHaveBeenCalled()
  })

  it('happy path: creates actor, profile, employment, detail, assignment, marks imported', async () => {
    const mocks = makeMocks()

    await makeHandler(mocks).execute(
      new ImportStagedMsUserCommand(TENANT_ID, STAGED_ID, IMPORTED_BY),
    )

    expect(mocks.kernelActorFacade.createActor).toHaveBeenCalledWith(
      TENANT_ID,
      'person',
      'Alice Nguyen',
      IMPORTED_BY,
    )
    expect(mocks.kernelUserIdentityFacade.createUserIdentity).toHaveBeenCalledWith(
      TENANT_ID,
      NEW_ACTOR_ID,
      'alice@co.com',
      'aad-u1',
      'microsoft',
    )
    expect(mocks.personProfileRepo.insert).toHaveBeenCalled()
    expect(mocks.employmentRepo.insert).toHaveBeenCalled()
    expect(mocks.employmentDetailRepo.insert).toHaveBeenCalled()
    expect(mocks.jobAssignmentRepo.insert).toHaveBeenCalled()
    expect(mocks.stagedUserRepo.updateStatus).toHaveBeenCalledWith(
      STAGED_ID,
      TENANT_ID,
      'imported',
      NEW_EMPLOYMENT_ID,
    )
    expect(mocks.eventBus.publish).toHaveBeenCalledWith(expect.any(PersonHiredEvent))
  })

  it('skips createUserIdentity when email is null', async () => {
    const mocks = makeMocks()
    vi.mocked(mocks.stagedUserRepo.findById!).mockResolvedValue(makeStagedUser({ email: null }))

    await makeHandler(mocks).execute(
      new ImportStagedMsUserCommand(TENANT_ID, STAGED_ID, IMPORTED_BY),
    )

    expect(mocks.kernelUserIdentityFacade.createUserIdentity).not.toHaveBeenCalled()
  })
})
