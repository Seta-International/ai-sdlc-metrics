import { Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import type { ActorType, RoleKeyValue, ScopeTypeValue } from '@future/core'
import { CreateActorCommand } from '../commands/create-actor.command'
import { UpdateActorStatusCommand } from '../commands/update-actor-status.command'
import { GrantRoleCommand } from '../commands/grant-role.command'
import { RevokeAllRoleGrantsCommand } from '../commands/revoke-all-role-grants.command'

@Injectable()
export class KernelActorFacade {
  constructor(private readonly commandBus: CommandBus) {}

  createActor(
    tenantId: string,
    type: ActorType,
    displayName: string,
    _createdBy: string,
  ): Promise<string> {
    return this.commandBus.execute(new CreateActorCommand(tenantId, type, displayName))
  }

  deactivateActor(actorId: string, tenantId: string): Promise<void> {
    return this.commandBus.execute(new UpdateActorStatusCommand(tenantId, actorId, 'inactive'))
  }

  grantRole(
    actorId: string,
    roleKey: RoleKeyValue,
    scopeType: ScopeTypeValue,
    scopeId: string | null,
    tenantId: string,
    grantedBy: string,
  ): Promise<void> {
    return this.commandBus.execute(
      new GrantRoleCommand(tenantId, actorId, roleKey, scopeType, scopeId, grantedBy),
    )
  }

  revokeAllRoles(actorId: string, tenantId: string): Promise<void> {
    return this.commandBus.execute(new RevokeAllRoleGrantsCommand(tenantId, actorId))
  }
}
