import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandBus } from '@nestjs/cqrs'
import { CompleteOffboardingCommand } from './complete-offboarding.command'
import { CompleteOffboardingHandler } from './complete-offboarding.handler'
import {
  OffboardingCaseNotFoundException,
  OffboardingNotInProcessingException,
} from '../../domain/exceptions/people.exceptions'
import type { IEmploymentProfileRepository } from '../../domain/repositories/employment-profile.repository'
import type { IOffboardingCaseRepository } from '../../domain/repositories/offboarding-case.repository'
import type { IAccountMembershipRepository } from '../../domain/repositories/account-membership.repository'
import type { IOutboxEventRepository } from '../../../kernel/domain/repositories/outbox-event.repository.port'
import { UpdateActorStatusCommand } from '../../../kernel/application/commands/update-actor-status.command'
import { DeprovisionUserIdentityCommand } from '../../../kernel/application/commands/deprovision-user-identity.command'
import { RevokeAllRoleGrantsCommand } from '../../../kernel/application/commands/revoke-all-role-grants.command'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const CASE_ID = '01900000-0000-7000-8000-000000000030'
const PROFILE_ID = '01900000-0000-7000-8000-000000000003'
const COMPLETED_BY = '01900000-0000-7000-8000-000000000005'

describe('CompleteOffboardingHandler', () => {
  let handler: CompleteOffboardingHandler
  let profileRepo: IEmploymentProfileRepository
  let caseRepo: IOffboardingCaseRepository
  let accountMembershipRepo: IAccountMembershipRepository
  let outboxRepo: IOutboxEventRepository
  let commandBus: CommandBus

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

    outboxRepo = { insert: vi.fn() } as unknown as IOutboxEventRepository
    commandBus = { execute: vi.fn() } as unknown as CommandBus

    handler = new CompleteOffboardingHandler(
      profileRepo,
      caseRepo,
      accountMembershipRepo,
      outboxRepo,
      commandBus,
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

    expect(commandBus.execute).toHaveBeenCalledTimes(3)
    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'actor-1', status: 'inactive' }),
    )
    expect(commandBus.execute).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'actor-1' }))

    expect(outboxRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'people.employee-terminated' }),
    )
  })

  it('dispatches UpdateActorStatusCommand, DeprovisionUserIdentityCommand, RevokeAllRoleGrantsCommand', async () => {
    await handler.execute(new CompleteOffboardingCommand(TENANT_ID, CASE_ID, COMPLETED_BY))

    const calls = vi.mocked(commandBus.execute).mock.calls.map(([cmd]) => cmd)
    expect(calls.some((c) => c instanceof UpdateActorStatusCommand)).toBe(true)
    expect(calls.some((c) => c instanceof DeprovisionUserIdentityCommand)).toBe(true)
    expect(calls.some((c) => c instanceof RevokeAllRoleGrantsCommand)).toBe(true)
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
      createdAt: new Date(),
    } as any)

    await expect(
      handler.execute(new CompleteOffboardingCommand(TENANT_ID, CASE_ID, COMPLETED_BY)),
    ).rejects.toThrow(OffboardingNotInProcessingException)
  })
})
