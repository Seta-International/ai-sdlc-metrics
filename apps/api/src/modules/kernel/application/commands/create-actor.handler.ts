import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { TenantNotFoundException } from '../../domain/exceptions/tenant.exceptions'
import {
  ACTOR_REPOSITORY,
  type IActorRepository,
} from '../../domain/repositories/actor.repository.port'
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../domain/repositories/tenant.repository.port'
import { CreateActorCommand } from './create-actor.command'

@CommandHandler(CreateActorCommand)
export class CreateActorHandler implements ICommandHandler<CreateActorCommand, string> {
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository,
    @Inject(ACTOR_REPOSITORY) private readonly actorRepo: IActorRepository,
  ) {}

  async execute(command: CreateActorCommand): Promise<string> {
    const tenant = await this.tenantRepo.findById(command.tenantId)
    if (!tenant) {
      throw new TenantNotFoundException(command.tenantId)
    }

    const actor = await this.actorRepo.insert({
      tenantId: command.tenantId,
      type: command.type,
      displayName: command.displayName,
    })

    return actor.id
  }
}
