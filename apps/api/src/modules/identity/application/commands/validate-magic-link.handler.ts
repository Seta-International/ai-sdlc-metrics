import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { createHash } from 'node:crypto'
import { MagicLinkTokenNotFoundException } from '../../domain/exceptions/identity.exceptions'
import {
  MAGIC_LINK_TOKEN_REPOSITORY,
  type IMagicLinkTokenRepository,
} from '../../domain/repositories/magic-link-token.repository'
import { ValidateMagicLinkCommand } from './validate-magic-link.command'

export interface ValidateMagicLinkResult {
  email: string
  tenantId: string
}

@CommandHandler(ValidateMagicLinkCommand)
export class ValidateMagicLinkHandler implements ICommandHandler<
  ValidateMagicLinkCommand,
  ValidateMagicLinkResult
> {
  constructor(
    @Inject(MAGIC_LINK_TOKEN_REPOSITORY)
    private readonly tokenRepo: IMagicLinkTokenRepository,
  ) {}

  async execute(command: ValidateMagicLinkCommand): Promise<ValidateMagicLinkResult> {
    const tokenHash = createHash('sha256').update(command.plaintextToken).digest('hex')

    const token = await this.tokenRepo.findByTokenHash(tokenHash)
    if (!token) {
      throw new MagicLinkTokenNotFoundException()
    }

    await this.tokenRepo.markUsed(token.id, token.tenantId)

    return {
      email: token.email,
      tenantId: token.tenantId,
    }
  }
}
