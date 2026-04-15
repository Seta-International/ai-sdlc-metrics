import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { TriggerOffboardingCommand } from './trigger-offboarding.command'

// TODO: Plan 06 — rewrite for new domain model
// Old implementation referenced deleted employment-profile.repository

@CommandHandler(TriggerOffboardingCommand)
export class TriggerOffboardingHandler implements ICommandHandler<TriggerOffboardingCommand, void> {
  constructor() {}

  async execute(_command: TriggerOffboardingCommand): Promise<void> {
    // TODO: Plan 06 — implement using Employment + OffboardingCase repositories
    throw new Error('Not implemented: TriggerOffboardingHandler needs Plan 06 rewrite')
  }
}
