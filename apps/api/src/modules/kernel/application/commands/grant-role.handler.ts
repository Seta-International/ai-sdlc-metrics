import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { ActorNotFoundException } from '../../domain/exceptions/actor.exceptions'
import { DomainException } from '../../domain/exceptions/domain.exception'
import {
  ACTOR_REPOSITORY,
  type IActorRepository,
} from '../../domain/repositories/actor.repository.port'
import {
  ROLE_GRANT_REPOSITORY,
  type IRoleGrantRepository,
} from '../../domain/repositories/role-grant.repository.port'
import { GrantRoleCommand } from './grant-role.command'

class MissingScopeIdException extends DomainException {
  readonly code = 'MISSING_SCOPE_ID'

  constructor() {
    super('scopeId is required when scopeType is not global')
  }
}

@CommandHandler(GrantRoleCommand)
export class GrantRoleHandler implements ICommandHandler<GrantRoleCommand, string> {
  constructor(
    @Inject(ACTOR_REPOSITORY) private readonly actorRepo: IActorRepository,
    @Inject(ROLE_GRANT_REPOSITORY) private readonly roleGrantRepo: IRoleGrantRepository,
  ) {}

  async execute(command: GrantRoleCommand): Promise<string> {
    const actor = await this.actorRepo.findById(command.actorId, command.tenantId)
    if (!actor) {
      throw new ActorNotFoundException(command.actorId)
    }

    if (command.scopeType !== 'global' && command.scopeId === null) {
      throw new MissingScopeIdException()
    }

    const grant = await this.roleGrantRepo.insert({
      tenantId: command.tenantId,
      actorId: command.actorId,
      roleKey: command.roleKey,
      scopeType: command.scopeType,
      scopeId: command.scopeId,
      grantedBy: command.grantedBy,
    })

    return grant.id
  }
}
