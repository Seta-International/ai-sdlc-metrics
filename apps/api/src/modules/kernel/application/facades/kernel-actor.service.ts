import { Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import type { ActorStatus, ActorType } from '../../domain/entities/actor.entity'
import type {
  RoleGrantSourceValue,
  RoleKeyValue,
  ScopeTypeValue,
} from '../../domain/entities/role-grant.entity'
import type { IdentityProvider } from '../../domain/entities/user-identity.entity'
import { CreateActorCommand } from '../commands/create-actor.command'
import { CreateUserIdentityCommand } from '../commands/create-user-identity.command'
import { DeprovisionUserIdentityCommand } from '../commands/deprovision-user-identity.command'
import { GrantRoleCommand } from '../commands/grant-role.command'
import { RevokeAllRoleGrantsCommand } from '../commands/revoke-all-role-grants.command'
import { UpdateActorStatusCommand } from '../commands/update-actor-status.command'

@Injectable()
export class KernelActorService {
  constructor(private readonly commandBus: CommandBus) {}

  createActor(tenantId: string, type: ActorType, displayName: string): Promise<string> {
    return this.commandBus.execute(new CreateActorCommand(tenantId, type, displayName))
  }

  createUserIdentity(
    tenantId: string,
    actorId: string,
    email: string,
    ssoSubject: string,
    provider: IdentityProvider,
  ): Promise<string> {
    return this.commandBus.execute(
      new CreateUserIdentityCommand(tenantId, actorId, email, ssoSubject, provider),
    )
  }

  updateActorStatus(tenantId: string, actorId: string, status: ActorStatus): Promise<void> {
    return this.commandBus.execute(new UpdateActorStatusCommand(tenantId, actorId, status))
  }

  deprovisionUserIdentity(tenantId: string, actorId: string): Promise<void> {
    return this.commandBus.execute(new DeprovisionUserIdentityCommand(tenantId, actorId))
  }

  grantRole(
    tenantId: string,
    actorId: string,
    roleKey: RoleKeyValue,
    scopeType: ScopeTypeValue,
    scopeId: string | null,
    grantedBy: string,
    source: RoleGrantSourceValue = 'manual',
  ): Promise<void> {
    return this.commandBus.execute(
      new GrantRoleCommand(tenantId, actorId, roleKey, scopeType, scopeId, grantedBy, source),
    )
  }

  revokeAllRoleGrants(tenantId: string, actorId: string): Promise<void> {
    return this.commandBus.execute(new RevokeAllRoleGrantsCommand(tenantId, actorId))
  }
}
