import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { CompleteOffboardingCommand } from './complete-offboarding.command'

// TODO: Plan 06 — rewrite for new domain model
// Old implementation referenced deleted employment-profile.repository and account-membership.repository

@CommandHandler(CompleteOffboardingCommand)
export class CompleteOffboardingHandler implements ICommandHandler<
  CompleteOffboardingCommand,
  void
> {
  constructor() {}

  async execute(_command: CompleteOffboardingCommand): Promise<void> {
    // TODO: Plan 06 — implement using Employment + OffboardingCase repositories
    throw new Error('Not implemented: CompleteOffboardingHandler needs Plan 06 rewrite')
  }
}
