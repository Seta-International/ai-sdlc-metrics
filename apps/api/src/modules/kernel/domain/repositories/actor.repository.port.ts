import type { Actor } from '../entities/actor.entity'

export const ACTOR_REPOSITORY = Symbol('IActorRepository')

export interface IActorRepository {
  findById(id: string, tenantId: string): Promise<Actor | null>
  findManyByIds(ids: string[], tenantId: string): Promise<Actor[]>
  insert(data: {
    tenantId: string
    type: Actor['type']
    displayName: string
    status?: Actor['status']
  }): Promise<Actor>
  updateStatus(id: string, tenantId: string, status: Actor['status']): Promise<void>
}
