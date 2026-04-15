import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import type { ProfileChangeRequest } from '../../domain/entities/profile-change-request.entity'
import { RequestProfileChangeCommand } from './request-profile-change.command'

// TODO: Plan 06 — rewrite for new domain model
// Old implementation referenced deleted employment-profile.repository

@CommandHandler(RequestProfileChangeCommand)
export class RequestProfileChangeHandler implements ICommandHandler<
  RequestProfileChangeCommand,
  ProfileChangeRequest
> {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor() {}

  async execute(_command: RequestProfileChangeCommand): Promise<ProfileChangeRequest> {
    // TODO: Plan 06 — implement using Employment + ProfileChangeRequest repositories
    throw new Error('Not implemented: RequestProfileChangeHandler needs Plan 06 rewrite')
  }
}
