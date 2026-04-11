import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { randomBytes, createHash } from 'node:crypto'
import {
  MAGIC_LINK_TOKEN_REPOSITORY,
  type IMagicLinkTokenRepository,
} from '../../domain/repositories/magic-link-token.repository'
import { RequestMagicLinkCommand } from './request-magic-link.command'

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000

export interface RequestMagicLinkResult {
  plaintextToken: string
}

@CommandHandler(RequestMagicLinkCommand)
export class RequestMagicLinkHandler implements ICommandHandler<
  RequestMagicLinkCommand,
  RequestMagicLinkResult
> {
  constructor(
    @Inject(MAGIC_LINK_TOKEN_REPOSITORY)
    private readonly tokenRepo: IMagicLinkTokenRepository,
  ) {}

  async execute(command: RequestMagicLinkCommand): Promise<RequestMagicLinkResult> {
    const plaintextToken = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(plaintextToken).digest('hex')
    const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS)

    await this.tokenRepo.insert({
      tenantId: command.tenantId,
      email: command.email,
      tokenHash,
      expiresAt,
    })

    return { plaintextToken }
  }
}
