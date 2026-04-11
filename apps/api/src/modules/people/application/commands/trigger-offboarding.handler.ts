import { Inject } from '@nestjs/common'
import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  EmploymentProfileNotFoundException,
  InvalidEmploymentStatusTransitionException,
  OffboardingCaseAlreadyActiveException,
} from '../../domain/exceptions/people.exceptions'
import {
  EMPLOYMENT_PROFILE_REPOSITORY,
  type IEmploymentProfileRepository,
} from '../../domain/repositories/employment-profile.repository'
import {
  OFFBOARDING_CASE_REPOSITORY,
  type IOffboardingCaseRepository,
} from '../../domain/repositories/offboarding-case.repository'
import { CreateDecisionCaseCommand } from '../../../kernel/application/commands/create-decision-case.command'
import { TriggerOffboardingCommand } from './trigger-offboarding.command'

const OFFBOARDABLE_STATUSES = ['active', 'on_leave'] as const

@CommandHandler(TriggerOffboardingCommand)
export class TriggerOffboardingHandler implements ICommandHandler<TriggerOffboardingCommand, void> {
  constructor(
    @Inject(EMPLOYMENT_PROFILE_REPOSITORY)
    private readonly profileRepo: IEmploymentProfileRepository,
    @Inject(OFFBOARDING_CASE_REPOSITORY)
    private readonly offboardingCaseRepo: IOffboardingCaseRepository,
    private readonly commandBus: CommandBus,
  ) {}

  async execute(command: TriggerOffboardingCommand): Promise<void> {
    const { tenantId, profileId, reason, reasonCategory, requestedBy } = command

    // 1. Find employment profile
    const profile = await this.profileRepo.findById(profileId, tenantId)
    if (!profile) throw new EmploymentProfileNotFoundException(profileId)

    // 2. Validate status transition
    if (!(OFFBOARDABLE_STATUSES as ReadonlyArray<string>).includes(profile.employmentStatus)) {
      throw new InvalidEmploymentStatusTransitionException(profile.employmentStatus, 'offboarding')
    }

    // 3. Check for existing active offboarding case
    const existing = await this.offboardingCaseRepo.findActiveByProfileId(profileId, tenantId)
    if (existing) throw new OffboardingCaseAlreadyActiveException(profileId)

    // 4. Create decision case via commandBus
    const decisionCaseId = await this.commandBus.execute(
      new CreateDecisionCaseCommand(tenantId, 'people', profileId, requestedBy),
    )

    // 5. Insert offboarding case
    await this.offboardingCaseRepo.insert({
      tenantId,
      profileId,
      templateId: null,
      reason,
      reasonCategory,
      decisionCaseId,
      status: 'pending',
    })

    // 6. Update employment profile status to offboarding
    await this.profileRepo.updateStatus(profileId, tenantId, 'offboarding')
  }
}
