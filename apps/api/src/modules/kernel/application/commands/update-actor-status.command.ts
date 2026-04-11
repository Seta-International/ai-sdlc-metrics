import type { ActorStatus } from '../../domain/entities/actor.entity'

export class UpdateActorStatusCommand {
  constructor(
    readonly tenantId: string,
    readonly actorId: string,
    readonly status: ActorStatus,
  ) {}
}
