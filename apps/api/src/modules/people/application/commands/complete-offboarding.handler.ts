import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  EmploymentProfileNotFoundException,
  OffboardingCaseNotFoundException,
  OffboardingNotInProcessingException,
} from '../../domain/exceptions/people.exceptions'
import {
  EMPLOYMENT_PROFILE_REPOSITORY,
  type IEmploymentProfileRepository,
} from '../../domain/repositories/employment-profile.repository'
import {
  OFFBOARDING_CASE_REPOSITORY,
  type IOffboardingCaseRepository,
} from '../../domain/repositories/offboarding-case.repository'
import {
  ACCOUNT_MEMBERSHIP_REPOSITORY,
  type IAccountMembershipRepository,
} from '../../domain/repositories/account-membership.repository'
import { KernelOutboxService } from '../../../kernel/application/facades/kernel-outbox.service'
import { KernelActorService } from '../../../kernel/application/facades/kernel-actor.service'
import { CompleteOffboardingCommand } from './complete-offboarding.command'

const EMPLOYEE_TERMINATED_EVENT = 'people.employee-terminated'

@CommandHandler(CompleteOffboardingCommand)
export class CompleteOffboardingHandler implements ICommandHandler<
  CompleteOffboardingCommand,
  void
> {
  constructor(
    @Inject(EMPLOYMENT_PROFILE_REPOSITORY)
    private readonly profileRepo: IEmploymentProfileRepository,
    @Inject(OFFBOARDING_CASE_REPOSITORY)
    private readonly caseRepo: IOffboardingCaseRepository,
    @Inject(ACCOUNT_MEMBERSHIP_REPOSITORY)
    private readonly accountMembershipRepo: IAccountMembershipRepository,
    private readonly outboxService: KernelOutboxService,
    private readonly actorService: KernelActorService,
  ) {}

  async execute(command: CompleteOffboardingCommand): Promise<void> {
    // 1. Find offboarding case
    const offboardingCase = await this.caseRepo.findById(
      command.offboardingCaseId,
      command.tenantId,
    )
    if (!offboardingCase) throw new OffboardingCaseNotFoundException(command.offboardingCaseId)

    // 2. Verify case is in processing state
    if (offboardingCase.status !== 'processing') {
      throw new OffboardingNotInProcessingException(command.offboardingCaseId)
    }

    // 3. Find employment profile
    const profile = await this.profileRepo.findById(offboardingCase.profileId, command.tenantId)
    if (!profile) throw new EmploymentProfileNotFoundException(offboardingCase.profileId)

    const now = new Date()

    // 4. Mark profile as terminated
    await this.profileRepo.updateStatus(profile.id, command.tenantId, 'terminated', now)

    // 5. Mark offboarding case as completed
    await this.caseRepo.updateStatus(command.offboardingCaseId, command.tenantId, 'completed')

    // 6. Close all account memberships
    await this.accountMembershipRepo.closeAllForActor(profile.actorId, command.tenantId, now)

    // 7. Deprovision via kernel actor service
    await this.actorService.updateActorStatus(command.tenantId, profile.actorId, 'inactive')
    await this.actorService.deprovisionUserIdentity(command.tenantId, profile.actorId)
    await this.actorService.revokeAllRoleGrants(command.tenantId, profile.actorId)

    // 8. Emit outbox event
    await this.outboxService.publish({
      tenantId: command.tenantId,
      eventName: EMPLOYEE_TERMINATED_EVENT,
      payload: {
        actorId: profile.actorId,
        tenantId: command.tenantId,
        terminationDate: now.toISOString(),
      },
    })
  }
}
