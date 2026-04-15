import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { randomUUID } from 'crypto'
import { EmploymentNotFoundException } from '../../domain/exceptions/people.exceptions'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import {
  PROFILE_SHARE_LINK_REPOSITORY,
  type IProfileShareLinkRepository,
} from '../../domain/repositories/profile-share-link.repository'
import type { ProfileShareLink } from '../../domain/entities/profile-share-link.entity'
import { GenerateShareLinkCommand } from './generate-share-link.command'

const MAX_EXPIRY_DAYS = 90

@CommandHandler(GenerateShareLinkCommand)
export class GenerateShareLinkHandler implements ICommandHandler<
  GenerateShareLinkCommand,
  ProfileShareLink
> {
  constructor(
    @Inject(PROFILE_SHARE_LINK_REPOSITORY)
    private readonly shareLinkRepo: IProfileShareLinkRepository,
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
  ) {}

  async execute(command: GenerateShareLinkCommand): Promise<ProfileShareLink> {
    const employment = await this.employmentRepo.findById(command.employmentId, command.tenantId)
    if (!employment) {
      throw new EmploymentNotFoundException(command.employmentId)
    }

    const expiryDays = Math.min(command.expiresInDays, MAX_EXPIRY_DAYS)
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000)

    const token = Buffer.from(
      JSON.stringify({
        shareId: randomUUID(),
        tenantId: command.tenantId,
        employmentId: command.employmentId,
        exp: Math.floor(expiresAt.getTime() / 1000),
      }),
    ).toString('base64url')

    return this.shareLinkRepo.insert({
      tenantId: command.tenantId,
      employmentId: command.employmentId,
      token,
      expiresAt,
      maxViews: command.maxViews ?? null,
      viewCount: 0,
      status: 'active',
      createdBy: command.createdBy,
      createdAt: new Date(),
      revokedAt: null,
    })
  }
}
