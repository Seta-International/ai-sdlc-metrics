import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { ApproveProfileChangeCommand } from './approve-profile-change.command'

// TODO: Plan 06 — rewrite for new domain model (EmploymentDetail instead of employment-profile-detail)
// Old implementation referenced deleted employment-profile-detail.repository

@CommandHandler(ApproveProfileChangeCommand)
export class ApproveProfileChangeHandler implements ICommandHandler<
  ApproveProfileChangeCommand,
  void
> {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor() {}

  async execute(_command: ApproveProfileChangeCommand): Promise<void> {
    // TODO: Plan 06 — implement using EmploymentDetail + ProfileChangeRequest repositories
    throw new Error('Not implemented: ApproveProfileChangeHandler needs Plan 06 rewrite')
  }
}
