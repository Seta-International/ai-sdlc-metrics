import { Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import type { IdentityProvider } from '../../domain/entities/user-identity.entity'
import { CreateUserIdentityCommand } from '../commands/create-user-identity.command'
import { DeprovisionUserIdentityCommand } from '../commands/deprovision-user-identity.command'

@Injectable()
export class KernelUserIdentityFacade {
  constructor(private readonly commandBus: CommandBus) {}

  createUserIdentity(
    tenantId: string,
    actorId: string,
    email: string,
    ssoSubject: string,
    provider: IdentityProvider,
  ): Promise<void> {
    return this.commandBus.execute(
      new CreateUserIdentityCommand(tenantId, actorId, email, ssoSubject, provider),
    )
  }

  deprovisionUserIdentity(tenantId: string, actorId: string): Promise<void> {
    return this.commandBus.execute(new DeprovisionUserIdentityCommand(tenantId, actorId))
  }
}
