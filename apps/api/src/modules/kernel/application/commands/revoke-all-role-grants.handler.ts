import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  ROLE_GRANT_REPOSITORY,
  type IRoleGrantRepository,
} from '../../domain/repositories/role-grant.repository.port'
import { RevokeAllRoleGrantsCommand } from './revoke-all-role-grants.command'

@CommandHandler(RevokeAllRoleGrantsCommand)
export class RevokeAllRoleGrantsHandler implements ICommandHandler<
  RevokeAllRoleGrantsCommand,
  void
> {
  constructor(
    @Inject(ROLE_GRANT_REPOSITORY) private readonly roleGrantRepo: IRoleGrantRepository,
  ) {}

  async execute(command: RevokeAllRoleGrantsCommand): Promise<void> {
    await this.roleGrantRepo.revokeAllForActor(command.actorId, command.tenantId, new Date())
  }
}
