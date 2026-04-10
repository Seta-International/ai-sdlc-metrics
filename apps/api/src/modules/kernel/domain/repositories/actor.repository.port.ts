import type { Actor } from '../entities/actor.entity'

export const ACTOR_REPOSITORY = Symbol('IActorRepository')

export interface IActorRepository {
  findById(id: string, tenantId: string): Promise<Actor | null>
  insert(data: { tenantId: string; type: Actor['type']; displayName: string }): Promise<Actor>
}
