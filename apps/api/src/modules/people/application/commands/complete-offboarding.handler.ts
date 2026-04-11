import { Inject } from '@nestjs/common'
import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
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
import {
  OUTBOX_EVENT_REPOSITORY,
  type IOutboxEventRepository,
} from '../../../kernel/domain/repositories/outbox-event.repository.port'
import { UpdateActorStatusCommand } from '../../../kernel/application/commands/update-actor-status.command'
import { DeprovisionUserIdentityCommand } from '../../../kernel/application/commands/deprovision-user-identity.command'
import { RevokeAllRoleGrantsCommand } from '../../../kernel/application/commands/revoke-all-role-grants.command'
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
    @Inject(OUTBOX_EVENT_REPOSITORY)
    private readonly outboxRepo: IOutboxEventRepository,
    private readonly commandBus: CommandBus,
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

    // 7. Dispatch kernel commands
    await this.commandBus.execute(
      new UpdateActorStatusCommand(command.tenantId, profile.actorId, 'inactive'),
    )
    await this.commandBus.execute(
      new DeprovisionUserIdentityCommand(command.tenantId, profile.actorId),
    )
    await this.commandBus.execute(new RevokeAllRoleGrantsCommand(command.tenantId, profile.actorId))

    // 8. Emit outbox event
    await this.outboxRepo.insert({
      tenantId: command.tenantId,
      eventName: EMPLOYEE_TERMINATED_EVENT,
      payload: {
        actorId: profile!.actorId,
        tenantId: command.tenantId,
        terminationDate: now.toISOString(),
      },
    })
  }
}
