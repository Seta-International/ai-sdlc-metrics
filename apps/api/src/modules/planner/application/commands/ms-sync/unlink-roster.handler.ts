import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import {
  MS_LINKED_ROSTER_REPOSITORY,
  type IMsLinkedRosterRepository,
} from '../../../domain/repositories/ms-linked-roster.repository'
import { UnlinkRosterCommand } from './unlink-roster.command'

@CommandHandler(UnlinkRosterCommand)
export class UnlinkRosterHandler implements ICommandHandler<UnlinkRosterCommand> {
  constructor(
    @Inject(MS_LINKED_ROSTER_REPOSITORY)
    private readonly rosterRepo: IMsLinkedRosterRepository,
  ) {}

  async execute(command: UnlinkRosterCommand): Promise<void> {
    const { tenantId, msRosterId } = command

    const entity = await this.rosterRepo.findByTenantAndRoster(tenantId, msRosterId)
    if (!entity) throw new Error(`Roster ${msRosterId} is not linked`)

    entity.unlink()
    await this.rosterRepo.upsert(entity)
  }
}
