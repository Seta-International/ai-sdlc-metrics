import type { ActorType } from '../../domain/entities/actor.entity'

export class CreateActorCommand {
  constructor(
    readonly tenantId: string,
    readonly type: ActorType,
    readonly displayName: string,
  ) {}
}
