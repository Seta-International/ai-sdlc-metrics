import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { CompleteTaskCommand } from './complete-task.command'

// TODO: Plan 06 — rewrite for new domain model
// Old implementation referenced deleted employment-profile.repository

@CommandHandler(CompleteTaskCommand)
export class CompleteTaskHandler implements ICommandHandler<CompleteTaskCommand, void> {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor() {}

  async execute(_command: CompleteTaskCommand): Promise<void> {
    // TODO: Plan 06 — implement using Employment + OnboardingCase/OffboardingCase repositories
    throw new Error('Not implemented: CompleteTaskHandler needs Plan 06 rewrite')
  }
}
