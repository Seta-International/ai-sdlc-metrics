import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { ApproveOffboardingCommand } from './approve-offboarding.command'

// TODO: Plan 06 — rewrite for new domain model (Employment + PersonProfile)
// Old implementation referenced deleted employment-profile.repository

@CommandHandler(ApproveOffboardingCommand)
export class ApproveOffboardingHandler implements ICommandHandler<ApproveOffboardingCommand, void> {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor() {}

  async execute(_command: ApproveOffboardingCommand): Promise<void> {
    // TODO: Plan 06 — implement using Employment + OffboardingCase repositories
    throw new Error('Not implemented: ApproveOffboardingHandler needs Plan 06 rewrite')
  }
}
