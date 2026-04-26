import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  MS_LINKED_GROUP_REPOSITORY,
  type IMsLinkedGroupRepository,
} from '../../../domain/repositories/ms-linked-group.repository'
import { UnlinkMsGroupCommand } from './unlink-ms-group.command'

@CommandHandler(UnlinkMsGroupCommand)
export class UnlinkMsGroupHandler implements ICommandHandler<UnlinkMsGroupCommand> {
  constructor(
    @Inject(MS_LINKED_GROUP_REPOSITORY)
    private readonly groupRepo: IMsLinkedGroupRepository,
  ) {}

  async execute(command: UnlinkMsGroupCommand): Promise<void> {
    const group = await this.groupRepo.findByTenantAndGroup(command.tenantId, command.msGroupId)
    if (!group) {
      throw new Error(`Linked group ${command.msGroupId} not found for tenant ${command.tenantId}`)
    }
    group.unlink()
    group.pauseSync()
    await this.groupRepo.upsert(group)
  }
}
