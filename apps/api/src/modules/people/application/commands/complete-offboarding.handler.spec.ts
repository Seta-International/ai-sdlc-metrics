import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CompleteOffboardingCommand } from './complete-offboarding.command'
import { CompleteOffboardingHandler } from './complete-offboarding.handler'
import {
  OffboardingCaseNotFoundException,
  OffboardingNotInProcessingException,
} from '../../domain/exceptions/people.exceptions'
import type { IEmploymentProfileRepository } from '../../domain/repositories/employment-profile.repository'
import type { IOffboardingCaseRepository } from '../../domain/repositories/offboarding-case.repository'
import type { IAccountMembershipRepository } from '../../domain/repositories/account-membership.repository'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { KernelActorFacade } from '../../../kernel/application/facades/kernel-actor.facade'
import { KernelUserIdentityFacade } from '../../../kernel/application/facades/kernel-user-identity.facade'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const CASE_ID = '01900000-0000-7000-8000-000000000030'
const PROFILE_ID = '01900000-0000-7000-8000-000000000003'
const COMPLETED_BY = '01900000-0000-7000-8000-000000000005'

describe('CompleteOffboardingHandler', () => {
  let handler: CompleteOffboardingHandler
  let profileRepo: IEmploymentProfileRepository
  let caseRepo: IOffboardingCaseRepository
  let accountMembershipRepo: IAccountMembershipRepository
  let auditFacade: KernelAuditFacade
  let actorFacade: KernelActorFacade
  let userIdentityFacade: KernelUserIdentityFacade

  beforeEach(() => {
    profileRepo = {
      findById: vi.fn().mockResolvedValue({
        id: PROFILE_ID,
        tenantId: TENANT_ID,
        actorId: 'actor-1',
        employmentType: 'permanent',
        employmentStatus: 'offboarding',
      }),
      findByActorId: vi.fn(),
      findByEmployeeCode: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      update: vi.fn(),
      listByTenant: vi.fn(),
    } as unknown as IEmploymentProfileRepository

    caseRepo = {
      findById: vi.fn().mockResolvedValue({
        id: CASE_ID,
        tenantId: TENANT_ID,
        profileId: PROFILE_ID,
        status: 'processing',
        reason: 'Resignation',
        reasonCategory: 'voluntary',
        decisionCaseId: null,
        createdAt: new Date(),
      }),
      findActiveByProfileId: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      update: vi.fn(),
      insertTask: vi.fn(),
      getRequiredTasks: vi.fn(),
      updateTaskStatus: vi.fn(),
      findTaskById: vi.fn(),
    } as unknown as IOffboardingCaseRepository

    accountMembershipRepo = {
      findActiveByActorId: vi.fn(),
      closeAllForActor: vi.fn(),
      insert: vi.fn(),
      remove: vi.fn(),
    } as unknown as IAccountMembershipRepository

    auditFacade = {
      recordEvent: vi.fn(),
      publishOutboxEvent: vi.fn(),
    } as unknown as KernelAuditFacade
    actorFacade = {
      deactivateActor: vi.fn(),
      revokeAllRoles: vi.fn(),
    } as unknown as KernelActorFacade
    userIdentityFacade = {
      createUserIdentity: vi.fn(),
      deprovisionUserIdentity: vi.fn(),
    } as unknown as KernelUserIdentityFacade

    handler = new CompleteOffboardingHandler(
      profileRepo,
      caseRepo,
      accountMembershipRepo,
      auditFacade,
      actorFacade,
      userIdentityFacade,
    )
  })

  it('terminates profile, completes case, closes memberships, dispatches kernel commands, emits event', async () => {
    await handler.execute(new CompleteOffboardingCommand(TENANT_ID, CASE_ID, COMPLETED_BY))

    expect(profileRepo.updateStatus).toHaveBeenCalledWith(
      PROFILE_ID,
      TENANT_ID,
      'terminated',
      expect.any(Date),
    )
    expect(caseRepo.updateStatus).toHaveBeenCalledWith(CASE_ID, TENANT_ID, 'completed')
    expect(accountMembershipRepo.closeAllForActor).toHaveBeenCalledWith(
      'actor-1',
      TENANT_ID,
      expect.any(Date),
    )

    expect(actorFacade.deactivateActor).toHaveBeenCalledWith('actor-1', TENANT_ID)
    expect(actorFacade.revokeAllRoles).toHaveBeenCalledWith('actor-1', TENANT_ID)
    expect(userIdentityFacade.deprovisionUserIdentity).toHaveBeenCalledWith(TENANT_ID, 'actor-1')

    expect(auditFacade.publishOutboxEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'people.employee-terminated' }),
    )
  })

  it('deactivates actor via facade, deprovisions identity via facade, revokes roles via facade', async () => {
    await handler.execute(new CompleteOffboardingCommand(TENANT_ID, CASE_ID, COMPLETED_BY))

    expect(actorFacade.deactivateActor).toHaveBeenCalledWith('actor-1', TENANT_ID)
    expect(actorFacade.revokeAllRoles).toHaveBeenCalledWith('actor-1', TENANT_ID)
    expect(userIdentityFacade.deprovisionUserIdentity).toHaveBeenCalledWith(TENANT_ID, 'actor-1')
  })

  it('throws OffboardingCaseNotFoundException when case not found', async () => {
    vi.mocked(caseRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new CompleteOffboardingCommand(TENANT_ID, CASE_ID, COMPLETED_BY)),
    ).rejects.toThrow(OffboardingCaseNotFoundException)
  })

  it('throws OffboardingNotInProcessingException when case status is not processing', async () => {
    vi.mocked(caseRepo.findById).mockResolvedValue({
      id: CASE_ID,
      tenantId: TENANT_ID,
      profileId: PROFILE_ID,
      status: 'approved',
      reason: 'Resignation',
      reasonCategory: 'voluntary',
      decisionCaseId: null,
      templateId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await expect(
      handler.execute(new CompleteOffboardingCommand(TENANT_ID, CASE_ID, COMPLETED_BY)),
    ).rejects.toThrow(OffboardingNotInProcessingException)
  })
})
