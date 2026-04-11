import type { RoleGrant, RoleGrantSourceValue } from '../entities/role-grant.entity'

export const ROLE_GRANT_REPOSITORY = Symbol('IRoleGrantRepository')

export interface IRoleGrantRepository {
  findByActorId(actorId: string, tenantId: string): Promise<RoleGrant[]>
  insert(data: {
    tenantId: string
    actorId: string
    roleKey: RoleGrant['roleKey']
    scopeType: RoleGrant['scopeType']
    scopeId: string | null
    grantedBy: string
    source?: RoleGrantSourceValue
  }): Promise<RoleGrant>
  revokeAllForActor(actorId: string, tenantId: string, revokedAt: Date): Promise<void>
  revokeBySource(
    actorId: string,
    tenantId: string,
    source: RoleGrantSourceValue,
    revokedAt: Date,
  ): Promise<void>
}
