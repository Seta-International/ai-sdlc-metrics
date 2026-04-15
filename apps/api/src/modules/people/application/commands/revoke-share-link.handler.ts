import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  PROFILE_SHARE_LINK_REPOSITORY,
  type IProfileShareLinkRepository,
} from '../../domain/repositories/profile-share-link.repository'
import { ShareLinkNotFoundException } from '../../domain/exceptions/people.exceptions'
import { RevokeShareLinkCommand } from './revoke-share-link.command'

@CommandHandler(RevokeShareLinkCommand)
export class RevokeShareLinkHandler implements ICommandHandler<RevokeShareLinkCommand, void> {
  constructor(
    @Inject(PROFILE_SHARE_LINK_REPOSITORY)
    private readonly shareLinkRepo: IProfileShareLinkRepository,
  ) {}

  async execute(command: RevokeShareLinkCommand): Promise<void> {
    const link = await this.shareLinkRepo.findById(command.shareLinkId, command.tenantId)
    if (!link) {
      throw new ShareLinkNotFoundException(command.shareLinkId)
    }
    await this.shareLinkRepo.revoke(command.shareLinkId, command.tenantId)
  }
}
