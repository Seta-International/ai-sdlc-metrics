import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { Actor } from '../../domain/entities/actor.entity'
import {
  ACTOR_REPOSITORY,
  type IActorRepository,
} from '../../domain/repositories/actor.repository.port'
import { GetActorQuery } from './get-actor.query'

@QueryHandler(GetActorQuery)
export class GetActorHandler implements IQueryHandler<GetActorQuery, Actor | null> {
  constructor(@Inject(ACTOR_REPOSITORY) private readonly actorRepo: IActorRepository) {}

  execute(query: GetActorQuery): Promise<Actor | null> {
    return this.actorRepo.findById(query.actorId, query.tenantId)
  }
}
