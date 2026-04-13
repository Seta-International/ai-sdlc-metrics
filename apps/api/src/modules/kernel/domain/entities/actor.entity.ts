import type { ActorType, ActorStatus } from '@future/core'
export type { ActorType, ActorStatus } from '@future/core'

export interface Actor {
  id: string
  tenantId: string
  type: ActorType
  displayName: string
  status: ActorStatus
  createdAt: Date
  updatedAt: Date
}

export function isActorActive(actor: Actor): boolean {
  return actor.status === 'active'
}

export function isActorArchived(actor: Actor): boolean {
  return actor.status === 'archived'
}
